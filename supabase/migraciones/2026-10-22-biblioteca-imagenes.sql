-- Biblioteca de imagenes de la marca (Paso 3), 2026-10-22.
--
-- Las fotos de la marca, para que el carrusel las elija en vez de tirar de un
-- banco generico. Lo que se sube se asume con licencia y propiedad de la marca.
--
-- Las imagenes NO van en la base: van al storage, ya comprimidas en el
-- navegador (WebP de 1600 px de lado largo, y una miniatura de 400 px). Aqui
-- queda solo la ficha de cada una, unos 2 KB, y el historial de usos. El
-- original se queda en el equipo de quien lo subio.
--
-- Solo estructura, vacia. El codigo desplegado no la lee. Idempotente.

-- --------------------------------------------------------------- imagenes
create table if not exists public.brand_imagenes (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  -- Rutas dentro del bucket marca-imagenes: <account_id>/<id>.webp y su mini.
  ruta             text not null,
  ruta_mini        text not null,
  ancho            integer not null,
  alto             integer not null,
  orientacion      text not null,
  bytes            integer not null,
  -- SHA-256 del original: la misma foto subida dos veces se salta.
  huella           text not null,
  nombre_original  text not null default '',
  activa           boolean not null default true,

  -- Lo que anota Claude al mirarla. Hasta que termine, 'pendiente';
  -- 'procesando' mientras la mira, para que dos pasadas no paguen la misma.
  etiquetado       text not null default 'pendiente',
  etiquetado_con   text,
  descripcion      text not null default '',
  etiquetas        text[] not null default '{}',
  -- Para que sirve: portada, fondo, cierre (la tarjeta de vidrio va encima).
  usos_sugeridos   text[] not null default '{}',
  -- Donde queda sitio para el texto sin tapar lo importante.
  espacio_texto    text,
  personas         boolean,
  calidad          smallint,
  -- Descripcion y etiquetas juntas, en minuscula: lo que se busca. Lo arma el
  -- codigo porque array_to_string no se puede usar en una columna generada.
  -- 'simple' y no 'spanish': las etiquetas van en español y en ingles, porque
  -- las busquedas de foto del escritor salen en ingles.
  texto_busqueda   text not null default '',
  busqueda         tsvector generated always as (to_tsvector('simple'::regconfig, texto_busqueda)) stored,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint brand_imagenes_orientacion_check check (orientacion in ('vertical', 'apaisada', 'cuadrada')),
  constraint brand_imagenes_etiquetado_check  check (etiquetado in ('pendiente', 'procesando', 'hecho', 'fallido')),
  constraint brand_imagenes_espacio_check     check (espacio_texto is null or espacio_texto in ('arriba', 'abajo', 'centro', 'ninguno')),
  constraint brand_imagenes_calidad_check     check (calidad is null or calidad between 1 and 5),
  constraint brand_imagenes_usos_check        check (usos_sugeridos <@ array['portada', 'fondo', 'cierre']::text[]),
  constraint brand_imagenes_bytes_check       check (bytes > 0 and bytes <= 5242880),
  constraint brand_imagenes_descripcion_len   check (char_length(descripcion) <= 600),
  constraint brand_imagenes_nombre_len        check (char_length(nombre_original) <= 255)
);
create unique index if not exists brand_imagenes_huella_idx on public.brand_imagenes (account_id, huella);
create index if not exists brand_imagenes_account_idx on public.brand_imagenes (account_id, activa, created_at desc);
create index if not exists brand_imagenes_pendientes_idx on public.brand_imagenes (account_id) where etiquetado = 'pendiente';
create index if not exists brand_imagenes_busqueda_idx on public.brand_imagenes using gin (busqueda);
create index if not exists brand_imagenes_etiquetas_idx on public.brand_imagenes using gin (etiquetas);
alter table public.brand_imagenes enable row level security;

-- Recorte no destructivo: la zona de la imagen que se usa, en fracciones de 0 a
-- 1 ({"x","y","w","h"}). La imagen completa se conserva y el recorte se puede
-- quitar. La miniatura recortada es la que ven la galeria y quien elige.
alter table public.brand_imagenes add column if not exists recorte jsonb;
alter table public.brand_imagenes add column if not exists ruta_mini_recorte text;

-- ------------------------------------------------------------------ usos
-- Una fila por lamina que uso la imagen. Es lo que impide repetir: una imagen
-- usada en los ultimos dias de la marca no se vuelve a elegir. Si la pieza se
-- borra, su uso se va con ella; si se descarta, el codigo deja de contarlo; si
-- se redibuja, los usos anteriores quedan con vigente = false (no se borran).
-- Solo cuenta lo vigente.
create table if not exists public.brand_imagenes_usos (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  imagen_id   uuid not null references public.brand_imagenes (id) on delete cascade,
  piece_id    uuid references public.content_pieces (id) on delete cascade,
  red         text not null,
  lamina      smallint not null,
  -- Por que la eligio el agente, para verlo en la ficha.
  motivo      text not null default '',
  vigente     boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint brand_imagenes_usos_lamina_check check (lamina between 1 and 20),
  constraint brand_imagenes_usos_motivo_len   check (char_length(motivo) <= 300)
);
create index if not exists brand_imagenes_usos_imagen_idx on public.brand_imagenes_usos (account_id, imagen_id, created_at desc);
create index if not exists brand_imagenes_usos_pieza_idx on public.brand_imagenes_usos (piece_id);
alter table public.brand_imagenes_usos enable row level security;

-- ------------------------------------------------- dias sin repetir, por marca
alter table public.brand_profile add column if not exists dias_sin_repetir_imagen integer not null default 30;
alter table public.brand_profile drop constraint if exists brand_profile_dias_imagen_check;
alter table public.brand_profile add constraint brand_profile_dias_imagen_check
  check (dias_sin_repetir_imagen between 0 and 365);

-- ---------------------------------------------------------------- storage
-- Privado: son las fotos de la marca, no contenido ya publicado. El motor las
-- lee con la clave de servicio y la galeria las ve con URLs firmadas. El
-- navegador sube con una URL de subida firmada que da el servidor, asi que no
-- hace falta abrir el bucket con politicas. Tope de 5 MB por archivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marca-imagenes', 'marca-imagenes', false, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
