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
