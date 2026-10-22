-- Kits de diseño de cada marca (Paso 4.1), 2026-10-22.
--
-- Cada marca sube su kit (HTML, imagenes, PDF, fuentes, logos) y el importador
-- lo convierte en esto: el sistema visual de la marca y una plantilla HTML por
-- tipo de lamina, con huecos donde va el texto de cada pieza. El motor no sabe
-- nada de ninguna marca; todo lo de la marca vive aqui, como datos.
--
-- Las laminas se dibujan con un navegador (Chromium) a partir de estas
-- plantillas: render/navegador.ts. Lo que se sube se asume con licencia de la
-- marca, como las imagenes.
--
-- Solo estructura, vacia. El codigo desplegado no la lee. Idempotente.

-- ------------------------------------------------------------------- kits
-- Un kit por version. Editarlo crea una version nueva: las piezas guardan con
-- que kit y version se dibujaron, y no cambian si el kit cambia.
create table if not exists public.brand_kits (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  version      integer not null,
  -- borrador: se esta armando; revision: listo para que la persona apruebe
  -- cada plantilla; activo: el que usan los carruseles (uno por marca);
  -- archivado: una version anterior.
  estado       text not null default 'borrador',
  nombre       text not null default '',
  -- Que se subio y de donde salio, para entender el kit meses despues.
  origen       text not null default '',
  -- El sistema visual: colores con su papel, fuentes por papel, logos por
  -- fondo, ritmo de fondos y reglas del kit (letra minima, que va sobre que).
  sistema      jsonb not null default '{}'::jsonb,
  -- El CSS comun a todas las plantillas (tokens, clases, marco).
  css          text not null default '',
  -- Trozos de HTML que repiten todas las plantillas, por nombre (el marco con
  -- logo, contador y puntos). Una plantilla los usa con {{p:nombre}}.
  parciales    jsonb not null default '{}'::jsonb,
  activado_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint brand_kits_estado_check  check (estado in ('borrador', 'revision', 'activo', 'archivado')),
  constraint brand_kits_version_check check (version >= 1),
  constraint brand_kits_nombre_len    check (char_length(nombre) <= 120),
  constraint brand_kits_origen_len    check (char_length(origen) <= 2000),
  constraint brand_kits_css_len       check (char_length(css) <= 200000)
);
create unique index if not exists brand_kits_version_idx on public.brand_kits (account_id, version);
-- Un solo kit activo por marca.
create unique index if not exists brand_kits_activo_idx on public.brand_kits (account_id) where estado = 'activo';
alter table public.brand_kits enable row level security;

-- ---------------------------------------------------------------- archivos
-- Fuentes, logos, imagenes fijas y las laminas de referencia del kit (para
-- comparar lo generado con el original). Del kit no se guarda nada mas. Cada
-- archivo tiene un papel unico dentro del kit: la plantilla lo usa con {{a:papel}}.
create table if not exists public.brand_kit_archivos (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  kit_id           uuid not null references public.brand_kits (id) on delete cascade,
  papel            text not null,
  tipo             text not null,
  -- <account_id>/<kit_id>/<papel>.<ext> dentro del bucket marca-kits.
  ruta             text not null,
  mime             text not null,
  bytes            integer not null,
  nombre_original  text not null default '',
  -- Fuentes: {"familia","peso","estilo"}. Referencias: {"tipo","n"} de la
  -- lamina del kit que muestran.
  meta             jsonb not null default '{}'::jsonb,
  descripcion      text not null default '',
  created_at       timestamptz not null default now(),

  constraint brand_kit_archivos_tipo_check  check (tipo in ('fuente', 'logo', 'imagen', 'referencia')),
  constraint brand_kit_archivos_papel_check check (papel ~ '^[a-z0-9_]{2,60}$'),
  constraint brand_kit_archivos_bytes_check check (bytes > 0 and bytes <= 10485760),
  constraint brand_kit_archivos_desc_len    check (char_length(descripcion) <= 300)
);
create unique index if not exists brand_kit_archivos_papel_idx on public.brand_kit_archivos (kit_id, papel);
alter table public.brand_kit_archivos enable row level security;

-- -------------------------------------------------------------- plantillas
-- Una por tipo de lamina, o varias del mismo tipo si el kit las tiene (portada
-- con foto y tipografica, un cierre por tipo de CTA). El agente elige el tipo
-- de cada lamina y el codigo la variante.
create table if not exists public.brand_kit_plantillas (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null references public.accounts (id) on delete cascade,
  kit_id                 uuid not null references public.brand_kits (id) on delete cascade,
  -- portada, idea, dato, lista, comparacion, cita, tesis, criterio, cierre...
  -- o uno propio del kit, con su descripcion en cuando_usar.
  tipo                   text not null,
  nombre                 text not null default '',
  -- Una linea para el agente: cuando conviene esta lamina.
  cuando_usar            text not null default '',
  formato                text not null default 'carrusel_4x5',
  -- La lamina: HTML con su <style> propio y huecos {{t:titulo}}, {{#items}}...
  html                   text not null,
  -- [{"nombre","tipo","max","min_items","max_items","obligatorio","resaltado","descripcion"}]
  huecos                 jsonb not null default '[]'::jsonb,
  -- Que foto acepta: {"usa","uso","tono","espacio","orientacion"}.
  foto                   jsonb not null default '{}'::jsonb,
  -- El fondo de la lamina, para el ritmo: claro, oscuro, acento o foto.
  fondo                  text not null default 'claro',
  -- Solo cierres: los tipos de CTA que sirve (vacio = cualquiera).
  cta_tipos              text[] not null default '{}',
  referencia_archivo_id  uuid references public.brand_kit_archivos (id) on delete set null,
  -- pendiente: sin revisar; aprobada: la usan los carruseles; rehacer: la
  -- persona pidio cambios (en notas).
  estado                 text not null default 'pendiente',
  notas                  text not null default '',
  -- Lo que salio al probarla (textos cortos y largos, con y sin foto) y la
  -- comparacion con su lamina de referencia.
  prueba                 jsonb not null default '{}'::jsonb,
  orden                  smallint not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint brand_kit_plantillas_tipo_check    check (tipo ~ '^[a-z0-9_]{2,40}$'),
  constraint brand_kit_plantillas_formato_check check (formato in ('carrusel_4x5')),
  constraint brand_kit_plantillas_fondo_check   check (fondo in ('claro', 'oscuro', 'acento', 'foto')),
  constraint brand_kit_plantillas_estado_check  check (estado in ('pendiente', 'aprobada', 'rehacer')),
  constraint brand_kit_plantillas_html_len      check (char_length(html) <= 100000),
  constraint brand_kit_plantillas_cuando_len    check (char_length(cuando_usar) <= 400),
  constraint brand_kit_plantillas_notas_len     check (char_length(notas) <= 2000)
);
create index if not exists brand_kit_plantillas_kit_idx on public.brand_kit_plantillas (kit_id, tipo, orden);
alter table public.brand_kit_plantillas enable row level security;

-- ---------------------------------------------------- luminosidad de fotos
-- Lo clara que es cada foto de la biblioteca (0 negra, 100 blanca), para que
-- una plantilla que pide foto oscura no reciba una clara. La calcula el codigo.
alter table public.brand_imagenes add column if not exists luminosidad smallint;
alter table public.brand_imagenes drop constraint if exists brand_imagenes_luminosidad_check;
alter table public.brand_imagenes add constraint brand_imagenes_luminosidad_check
  check (luminosidad is null or luminosidad between 0 and 100);

-- ---------------------------------------------------------------- storage
-- Privado: lo lee el motor con la clave de servicio. Tope de 10 MB por archivo
-- (una fuente o una lamina de referencia).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marca-kits', 'marca-kits', false, 10485760, array[
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'
])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
