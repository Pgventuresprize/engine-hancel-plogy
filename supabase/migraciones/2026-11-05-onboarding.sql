-- Onboarding (2026-11-05): lo primero que hace una marca nueva.
--
-- Solo agrega. Idempotente. Con estos valores por defecto las cuentas que ya
-- existen no notan nada: solo las nuevas nacen con onboarding pendiente, y lo
-- pone el codigo al crearlas (ver empresas.ts), no un update aqui, que al
-- repetirse marcaria cuentas por error.

alter table public.accounts add column if not exists onboarding text not null default 'listo';
alter table public.accounts drop constraint if exists accounts_onboarding_check;
alter table public.accounts add constraint accounts_onboarding_check
  check (onboarding in ('pendiente', 'en_curso', 'listo', 'omitido'));

-- Mientras no tenga token propio, la cuenta usa la clave de la plataforma, con tope.
alter table public.accounts add column if not exists clave_plataforma boolean not null default false;

create table if not exists public.marca_analisis (
  account_id  uuid primary key references public.accounts (id) on delete cascade,
  tipo        text,
  permiso     jsonb,
  fuentes     jsonb not null default '{}'::jsonb,
  corpus      text not null default '',
  datos       jsonb not null default '{}'::jsonb,
  omitidos    text[] not null default '{}',
  mensajes    jsonb not null default '[]'::jsonb,
  pendiente   text,
  opciones    jsonb not null default '[]'::jsonb,
  temas       jsonb not null default '[]'::jsonb,
  tema        jsonb,
  preguntas   integer not null default 0,
  brief       jsonb,
  conversacion_id uuid,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint marca_analisis_tipo_check
    check (tipo is null or tipo in ('persona', 'servicios', 'producto', 'alto_valor', 'local'))
);
-- Como las demas: RLS activo y sin politicas, solo la alcanza la service role.
alter table public.marca_analisis enable row level security;

-- Por donde entro la marca y lo que ya se trabajo de fondo.
alter table public.marca_analisis add column if not exists modo text not null default 'traer';
alter table public.marca_analisis add column if not exists archivos jsonb not null default '[]'::jsonb;
alter table public.marca_analisis add column if not exists caminos jsonb not null default '[]'::jsonb;
alter table public.marca_analisis add column if not exists kit jsonb;
