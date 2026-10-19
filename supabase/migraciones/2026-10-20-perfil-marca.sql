-- Perfil de marca (2026-10-20).
--
-- Solo estructura: tablas y columnas nuevas, vacias. No inserta datos de
-- ninguna cuenta; el perfil nace la primera vez que alguien lo guarda desde
-- Configuracion > Marca, y mientras no exista la app usa valores generales.
--
-- Solo anade: el codigo desplegado no lee nada de esto, asi que se puede
-- aplicar antes del merge sin afectarlo. Idempotente.

-- --------------------------------------------------------- perfil de marca
-- Quien es la marca y como escribe. Una fila por cuenta. Los topes existen
-- porque todo esto entra en cada prompt: un perfil sin limite encarece cada
-- llamada a Claude.
create table if not exists public.brand_profile (
  account_id        uuid primary key references public.accounts (id) on delete cascade,
  nombre            text not null default '',
  handle            text not null default '',
  que_hace          text not null default '',
  mensaje_central   text not null default '',
  idioma            text not null default 'es',
  pais              text,
  voz_si            text not null default '',
  voz_no            text not null default '',
  reglas            text not null default '',
  frases_prohibidas text[] not null default '{}',
  temas_vetados     text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint brand_profile_nombre_len     check (char_length(nombre) <= 60),
  constraint brand_profile_handle_len     check (char_length(handle) <= 40),
  constraint brand_profile_que_hace_len   check (char_length(que_hace) <= 600),
  constraint brand_profile_mensaje_len    check (char_length(mensaje_central) <= 300),
  constraint brand_profile_voz_si_len     check (char_length(voz_si) <= 1200),
  constraint brand_profile_voz_no_len     check (char_length(voz_no) <= 1200),
  constraint brand_profile_reglas_len     check (char_length(reglas) <= 2000),
  constraint brand_profile_vetados_len    check (char_length(temas_vetados) <= 1200),
  constraint brand_profile_frases_tope    check (cardinality(frases_prohibidas) <= 50),
  constraint brand_profile_idioma_check   check (idioma in ('es', 'en')),
  constraint brand_profile_pais_check     check (pais is null or pais ~ '^[A-Z]{2}$')
);
alter table public.brand_profile enable row level security;

-- ----------------------------------------------------------------- pilares
-- La pregunta que responde cada pilar ("¿Que creemos?"): es lo que deja al
-- modelo clasificar una pieza por su valor dominante y no por palabras sueltas.
alter table public.content_pillars add column if not exists pregunta text;

-- ------------------------------------------------- audiencias y verticales
-- La misma forma que los pilares, para editarlas con el mismo componente.
create table if not exists public.content_audiences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null, description text, position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.content_verticals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null, description text, position integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists content_audiences_account_idx on public.content_audiences (account_id);
create index if not exists content_verticals_account_idx on public.content_verticals (account_id);
alter table public.content_audiences enable row level security;
alter table public.content_verticals enable row level security;

-- --------------------------------------------------------------------- CTA
-- Que pide cada CTA. Si `requiere_recurso`, el agente no lo usa hasta que
-- `recurso_listo`: no se ofrece por DM algo que nadie va a mandar.
alter table public.content_ctas add column if not exists tipo text not null default 'seguir';
alter table public.content_ctas add column if not exists requiere_recurso boolean not null default false;
alter table public.content_ctas add column if not exists recurso_listo boolean not null default false;
alter table public.content_ctas add column if not exists activo boolean not null default true;
alter table public.content_ctas drop constraint if exists content_ctas_tipo_check;
alter table public.content_ctas
  add constraint content_ctas_tipo_check check (tipo in ('seguir', 'comentar', 'palabra', 'dm', 'comercial'));
