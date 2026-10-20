-- Ejemplos de la marca (1D-7), 2026-10-20.
--
-- Piezas de la marca que salieron bien, para que el agente vea como suena y
-- avanza una pieza suya y no solo sus reglas. En cada pieza entran hasta dos
-- de su red: los que mas se parecen (mismo pilar, luego mismo tipo de CTA,
-- luego mismo objetivo), rotando entre empates para no repetir una receta.
--
-- `texto` es la pieza tal cual la lee el agente; `por_que` es lo que tiene que
-- aprender de ella. `pilar_id`, `cta_tipo` y `objetivo` dicen de que es, para
-- elegirla. `origen` dice de donde salio ("kit 008", "pieza de Hancel").
--
-- Solo estructura, vacia. El codigo desplegado no la lee. Idempotente.

create table if not exists public.brand_ejemplos (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  red         text not null,
  nombre      text not null,
  texto       text not null default '',
  por_que     text not null default '',
  pilar_id    uuid references public.content_pillars (id) on delete set null,
  cta_tipo    text,
  objetivo    text,
  origen      text not null default '',
  activo      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint brand_ejemplos_red_check    check (red in ('instagram', 'linkedin')),
  constraint brand_ejemplos_nombre_len   check (char_length(nombre) between 1 and 120),
  constraint brand_ejemplos_texto_len    check (char_length(texto) <= 12000),
  constraint brand_ejemplos_por_que_len  check (char_length(por_que) <= 600),
  constraint brand_ejemplos_origen_len   check (char_length(origen) <= 120),
  constraint brand_ejemplos_cta_check    check (cta_tipo is null or cta_tipo in ('seguir', 'comentar', 'palabra', 'dm', 'comercial')),
  constraint brand_ejemplos_obj_check    check (objetivo is null or objetivo in ('alcance', 'comunidad', 'autoridad', 'conversion'))
);
create index if not exists brand_ejemplos_account_idx on public.brand_ejemplos (account_id, red, position);
alter table public.brand_ejemplos enable row level security;
