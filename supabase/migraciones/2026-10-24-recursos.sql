-- Recursos por pieza (reportes y guias), 2026-10-24.
--
-- Cuando el CTA de un angulo pide comentar una palabra a cambio de un recurso,
-- el agente "recursos" escribe ese recurso (un reporte o una guia) antes que el
-- carrusel, con la palabra y los dos mensajes del DM. El carrusel recibe el
-- recurso ya escrito y su cierre solo promete lo que hay. Una persona lo aprueba
-- y se envia al portal de la marca por el mismo webhook que la redaccion; el
-- portal devuelve la URL y con ella sale el enlace del DM. Ver src/engine/recursos.
--
-- - content_ctas.recurso_por_pieza: el CTA no promete un recurso fijo sino el
--   que Hancel escribe para cada pieza. No necesita "recurso listo".
-- - jobs_recurso: buzon del agente, igual que jobs_instagram.
-- - content_recursos: el recurso de cada angulo, con su envio a la web.
-- - web_entregas.recurso_id: el registro de envios sirve para los dos.
-- - brand_ejemplos: los ejemplos pueden ser recursos, mas largos que un post.
-- - "recursos" en las dos listas cerradas de agentes.
--
-- Solo estructura, no cambia datos. Idempotente.

alter table public.content_ctas add column if not exists recurso_por_pieza boolean not null default false;

-- ------------------------------------------------------------------ el buzon

create table if not exists public.jobs_recurso (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  content_angle_id uuid not null references public.content_angles (id) on delete cascade,
  input            jsonb not null,
  status           text not null default 'pending',
  respuesta        jsonb,
  receta           jsonb,
  error            text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  consumed_at      timestamptz,
  constraint jobs_recurso_status_check check (status in ('pending', 'processing', 'done', 'failed'))
);
create index if not exists jobs_recurso_status_idx on public.jobs_recurso (status, created_at);
create index if not exists jobs_recurso_angle_id_idx on public.jobs_recurso (content_angle_id);
create index if not exists jobs_recurso_account_idx on public.jobs_recurso (account_id);
create index if not exists jobs_recurso_por_drenar_idx on public.jobs_recurso (created_at)
  where consumed_at is null and status in ('done', 'failed');
alter table public.jobs_recurso enable row level security;

-- ---------------------------------------------------------------- el recurso

create table if not exists public.content_recursos (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  content_angle_id uuid not null references public.content_angles (id) on delete cascade,
  raw_news_id      uuid references public.raw_news (id) on delete set null,
  tipo             text not null,
  titular          text not null default '',
  palabra          text not null,
  -- Hasta cuando la palabra esta ocupada: otra pieza no puede usarla antes.
  palabra_hasta    timestamptz,
  status           text not null default 'listo',
  payload          jsonb not null,
  dm               jsonb,
  registro         jsonb,
  revision         jsonb,
  fuentes          jsonb,
  word_count       integer,
  version          integer not null default 1,
  aprobado_at      timestamptz,
  -- El envio al portal, como en news_redacciones.
  slug             text,
  web_status       text,
  web_version      integer not null default 0,
  web_intentos     integer not null default 0,
  web_proximo_at   timestamptz,
  web_error        text,
  web_evento_id    text,
  web_url          text,
  web_publicada_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint content_recursos_angulo_unico unique (content_angle_id),
  constraint content_recursos_tipo_check check (tipo in ('reporte', 'guia')),
  constraint content_recursos_status_check check (status in ('listo', 'aprobado', 'descartado')),
  constraint content_recursos_web_check check (web_status is null or web_status in ('pendiente', 'enviando', 'enviada', 'error', 'retirada'))
);
create index if not exists content_recursos_account_idx on public.content_recursos (account_id, created_at desc);
create index if not exists content_recursos_palabra_idx on public.content_recursos (account_id, upper(palabra));
create index if not exists content_recursos_web_idx on public.content_recursos (account_id, web_status);
alter table public.content_recursos enable row level security;

alter table public.web_entregas add column if not exists recurso_id uuid references public.content_recursos (id) on delete set null;

-- ---------------------------------------------------------------- ejemplos

alter table public.brand_ejemplos drop constraint if exists brand_ejemplos_red_check;
alter table public.brand_ejemplos add constraint brand_ejemplos_red_check check (red in ('instagram', 'linkedin', 'recurso'));
alter table public.brand_ejemplos drop constraint if exists brand_ejemplos_texto_len;
alter table public.brand_ejemplos add constraint brand_ejemplos_texto_len check (char_length(texto) <= 40000);

-- ----------------------------------------------------------------- agentes

alter table public.agent_settings drop constraint if exists agent_settings_agent_check;
alter table public.agent_settings add constraint agent_settings_agent_check
  check (agent in ('extraccion', 'analisis', 'angulo', 'recursos', 'instagram', 'linkedin', 'criterio', 'revisor', 'publicacion', 'redaccion'));

alter table public.brand_skills drop constraint if exists brand_skills_agentes_check;
alter table public.brand_skills add constraint brand_skills_agentes_check check (
  agentes <@ array['analisis', 'angulo', 'recursos', 'instagram', 'linkedin', 'criterio', 'revisor', 'redaccion', 'ideas', 'contenido', 'guion']::text[]
);
