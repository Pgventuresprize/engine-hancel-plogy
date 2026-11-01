-- El chat con los agentes, 2026-10-31.
--
-- La pantalla de inicio pasa a ser una conversacion con el equipo de agentes:
-- el coordinador reparte, Instagram y LinkedIn crean o cambian sus piezas y el
-- revisor dictamina. Ver MARCAS.md ("Equipo de agentes conversacionales") y el
-- plan del chat.
--
-- - conversaciones: una por hilo y por marca. `titulo_auto` dice si el nombre lo
--   sigue poniendo Hancel (renombrar a mano lo apaga). `borrada_at` es la
--   papelera: lo borrado se recupera durante 15 dias y despues lo vacia el cron
--   de abajo. `resumen` es la memoria de las conversaciones largas.
-- - mensajes: lo que dice cada uno. `selecciones` son los componentes marcados
--   en la pieza; `referencias`, las piezas y versiones que salen del mensaje.
-- - chat_trabajos: lo que se ve como tarjeta de trabajo (crear, editar o
--   revisar una pieza) y el trabajo de la cola que sigue (`buzon`, `job_id`).
-- - conversacion_piezas: las piezas abiertas en el panel de cada conversacion.
-- - pieza_versiones: cada version de una pieza (el guion con su diseño y lo que
--   se publica), venga del chat, de "Corregir" o de regenerar.
-- - content_pieces.conversacion_id: de que conversacion nacio la pieza.
-- - jobs_*.cancelado_at: "Detener" desde el chat. Detener marca el trabajo como
--   consumido y la cola ya lo salta en todos sus pasos; esta columna dice que
--   fue a pedido y no por terminar, y es lo que mira "que siga".
--
-- Como el resto del esquema: RLS activado y sin politicas, se entra con
-- service role y el codigo filtra por cuenta. Idempotente.

-- ------------------------------------------------------------ conversaciones

create table if not exists public.conversaciones (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid        not null references public.accounts (id) on delete cascade,
  -- auth.users sin clave foranea, como account_members.
  creada_por    uuid,
  titulo        text        not null default 'Nueva conversación',
  titulo_auto   boolean     not null default true,
  guardada      boolean     not null default false,
  agentes       text[]      not null default '{}',
  resumen       text,
  resumen_hasta timestamptz,
  borrada_at    timestamptz,
  borrada_por   uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists conversaciones_cuenta_idx
  on public.conversaciones (account_id, updated_at desc)
  where borrada_at is null;
create index if not exists conversaciones_papelera_idx
  on public.conversaciones (borrada_at)
  where borrada_at is not null;

alter table public.conversaciones enable row level security;

-- ------------------------------------------------------------------ mensajes

create table if not exists public.mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid        not null references public.conversaciones (id) on delete cascade,
  account_id      uuid        not null references public.accounts (id) on delete cascade,
  rol             text        not null,
  -- La clave del agente que habla (coordinador, instagram, linkedin, revisor...).
  agente          text,
  -- Quien escribio, si fue una persona.
  autor           uuid,
  contenido       text        not null default '',
  noticia         jsonb,
  agentes_pedidos text[],
  selecciones     jsonb       not null default '[]'::jsonb,
  referencias     jsonb       not null default '[]'::jsonb,
  uso             jsonb,
  created_at      timestamptz not null default now(),

  constraint mensajes_rol_check check (rol in ('usuario', 'agente', 'ruta'))
);

create index if not exists mensajes_conversacion_idx on public.mensajes (conversacion_id, created_at);

alter table public.mensajes enable row level security;

-- ------------------------------------------------------------- chat_trabajos

create table if not exists public.chat_trabajos (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid        not null references public.accounts (id) on delete cascade,
  conversacion_id uuid        not null references public.conversaciones (id) on delete cascade,
  mensaje_id      uuid        references public.mensajes (id) on delete set null,
  agente          text        not null,
  tipo            text        not null,
  estado          text        not null default 'espera',
  -- El trabajo al que espera ("LinkedIn espera a que Instagram termine").
  despues_de      uuid        references public.chat_trabajos (id) on delete set null,
  buzon           text,
  job_id          uuid,
  angle_id        uuid        references public.content_angles (id) on delete set null,
  piece_id        uuid        references public.content_pieces (id) on delete set null,
  paso            integer     not null default 0,
  total           integer     not null default 0,
  etiqueta        text,
  unidad          text,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chat_trabajos_tipo_check   check (tipo in ('crear', 'editar', 'revisar')),
  constraint chat_trabajos_estado_check check (estado in ('espera', 'trabajando', 'listo', 'detenido', 'fallo')),
  constraint chat_trabajos_buzon_check  check (buzon is null or buzon in ('jobs_angle', 'jobs_recurso', 'jobs_linkedin', 'jobs_instagram'))
);

create index if not exists chat_trabajos_conversacion_idx on public.chat_trabajos (conversacion_id, created_at);
create index if not exists chat_trabajos_activos_idx
  on public.chat_trabajos (account_id)
  where estado in ('espera', 'trabajando');
create index if not exists chat_trabajos_job_idx on public.chat_trabajos (buzon, job_id);

alter table public.chat_trabajos enable row level security;

-- ------------------------------------------------------ conversacion_piezas

create table if not exists public.conversacion_piezas (
  conversacion_id uuid        not null references public.conversaciones (id) on delete cascade,
  piece_id        uuid        not null references public.content_pieces (id) on delete cascade,
  agregada_at     timestamptz not null default now(),

  primary key (conversacion_id, piece_id)
);

create index if not exists conversacion_piezas_piece_idx on public.conversacion_piezas (piece_id);

alter table public.conversacion_piezas enable row level security;

-- ---------------------------------------------------------- pieza_versiones

create table if not exists public.pieza_versiones (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid        not null references public.accounts (id) on delete cascade,
  piece_id      uuid        not null references public.content_pieces (id) on delete cascade,
  n             integer     not null,
  -- Quien la hizo: un agente (su clave) o una persona (autor_usuario).
  autor_agente  text,
  autor_usuario uuid,
  motivo        text,
  -- La respuesta del buzon (guion y, si lo hay, diseno_libre con su fuente).
  guion         jsonb,
  payload       jsonb       not null,
  mensaje_id    uuid        references public.mensajes (id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint pieza_versiones_n_key unique (piece_id, n)
);

alter table public.pieza_versiones enable row level security;

-- ------------------------------------------------- columnas en tablas viejas

alter table public.content_pieces add column if not exists conversacion_id uuid
  references public.conversaciones (id) on delete set null;

alter table public.jobs_angle     add column if not exists cancelado_at timestamptz;
alter table public.jobs_recurso   add column if not exists cancelado_at timestamptz;
alter table public.jobs_linkedin  add column if not exists cancelado_at timestamptz;
alter table public.jobs_instagram add column if not exists cancelado_at timestamptz;

-- ---------------------------------------------------------------- papelera
--
-- Lo que lleva 15 dias en la papelera se borra para siempre, cada dia a las
-- 03:17 de Bogota. Los mensajes y trabajos se van en cascada; las piezas
-- quedan (su conversacion_id pasa a null). Solo SQL, sin llamar a la app.
-- El mismo bloque esta en scheduler.sql, que es donde viven todos los crons.

create extension if not exists pg_cron;

create or replace function public.vaciar_papelera_chat()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borradas integer;
begin
  delete from public.conversaciones
  where borrada_at < now() - interval '15 days';
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function public.vaciar_papelera_chat() from public, anon, authenticated;
grant execute on function public.vaciar_papelera_chat() to service_role;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'engine_hancel_papelera_chat';
  perform cron.schedule('engine_hancel_papelera_chat', '17 8 * * *', 'select public.vaciar_papelera_chat();');
end
$$;
