-- Pipeline de redaccion (aplicada el 2026-10-14).
--
-- Las noticias traidas y analizadas son las mismas del pipeline de redes; este
-- pipeline agrega su propio umbral, las fuentes investigadas de cada noticia y
-- la noticia redactada por el agente de redaccion.

-- Las fuentes de una noticia: la que la origino, lo que cito la busqueda web
-- del analisis (antes se descartaba) y, con el texto de cada pagina, lo que el
-- agente de redaccion cita.
create table if not exists public.news_sources (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  raw_news_id  uuid not null references public.raw_news (id) on delete cascade,
  url          text not null,
  origen       text not null default 'busqueda',
  medio        text,
  titulo       text,
  autor        text,
  fecha        text,
  tipo         text not null default 'medio',
  extracto     text,
  contenido    text,
  imagen       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (raw_news_id, url),
  constraint news_sources_origen_check check (origen in ('noticia', 'busqueda', 'cobertura')),
  constraint news_sources_tipo_check check (tipo in ('primaria', 'parte_interesada', 'medio'))
);
create index if not exists news_sources_news_idx on public.news_sources (raw_news_id);
alter table public.news_sources enable row level security;

-- Una redaccion por noticia: pendiente -> redactando -> redactada |
-- material_insuficiente | error. `descartada` la saca de este pipeline sin
-- tocar la noticia en el de redes.
create table if not exists public.news_redacciones (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  raw_news_id      uuid not null unique references public.raw_news (id) on delete cascade,
  status           text not null default 'pendiente',
  titular          text,
  payload          jsonb,
  fuentes          jsonb,
  imagen_url       text,
  word_count       integer,
  model            text,
  error            text,
  intentos         integer not null default 0,
  promovida_a_mano boolean not null default false,
  redactada_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint news_redacciones_status_check
    check (status in ('pendiente', 'redactando', 'redactada', 'material_insuficiente', 'error', 'descartada'))
);
create index if not exists news_redacciones_account_idx on public.news_redacciones (account_id, status);
alter table public.news_redacciones enable row level security;

-- El umbral propio del pipeline de redaccion.
alter table public.generation_config
  add column if not exists redaccion_score_threshold integer,
  add column if not exists redaccion_threshold_updated_at timestamptz not null default now();

-- El agente de redaccion.
alter table public.agent_settings drop constraint if exists agent_settings_agent_check;
alter table public.agent_settings add constraint agent_settings_agent_check
  check (agent in ('extraccion', 'analisis', 'angulo', 'instagram', 'linkedin', 'publicacion', 'redaccion'));

-- El nicho (tema del portal) de cada noticia redactada.
alter table public.news_redacciones
  add column if not exists nicho_slug text,
  add column if not exists nicho_nombre text;

-- El portal de noticias de cada empresa (aplicada el 2026-10-15): la URL del
-- webhook y el secreto con que se firman los envios, el switch de envio
-- automatico, el estado del envio de cada redaccion y el registro de entregas.
alter table public.account_secrets
  add column if not exists web_webhook_url text,
  add column if not exists web_webhook_secret text;

alter table public.generation_config
  add column if not exists web_envio_auto boolean not null default true,
  add column if not exists web_auto_desde timestamptz not null default now();

alter table public.news_redacciones
  add column if not exists version integer not null default 1,
  add column if not exists slug text,
  add column if not exists imagen_credito jsonb,
  add column if not exists imagen_ancho integer,
  add column if not exists imagen_alto integer,
  add column if not exists web_status text,
  add column if not exists web_version integer not null default 0,
  add column if not exists web_url text,
  add column if not exists web_id_externo text,
  add column if not exists web_publicada_at timestamptz,
  add column if not exists web_enviada_at timestamptz,
  add column if not exists web_error text,
  add column if not exists web_intentos integer not null default 0,
  add column if not exists web_proximo_at timestamptz,
  add column if not exists web_evento_id text;

alter table public.news_redacciones drop constraint if exists news_redacciones_web_status_check;
alter table public.news_redacciones add constraint news_redacciones_web_status_check
  check (web_status is null or web_status in ('pendiente', 'enviando', 'enviada', 'error', 'retirada'));

create unique index if not exists news_redacciones_slug_idx on public.news_redacciones (account_id, slug) where slug is not null;
create index if not exists news_redacciones_web_idx on public.news_redacciones (account_id, web_status);

create table if not exists public.web_entregas (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  redaccion_id uuid references public.news_redacciones (id) on delete set null,
  evento_id    text not null,
  tipo         text not null,
  intento      integer not null default 1,
  status_code  integer,
  respuesta    text,
  error        text,
  ms           integer,
  created_at   timestamptz not null default now()
);
create index if not exists web_entregas_account_idx on public.web_entregas (account_id, created_at desc);
alter table public.web_entregas enable row level security;
