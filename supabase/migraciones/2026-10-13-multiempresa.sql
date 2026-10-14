-- Multiempresa: tipo de cuenta, roles de miembro y conexiones por cuenta.
--
-- - accounts.plan: 'basic' (solo noticias y sus agentes) o 'advance' (todo:
--   capas, carruseles, publicacion, videos). Hancel queda basic y Agro advance.
-- - account_members.role: 'owner' (gestiona la empresa y sus miembros) o
--   'member'. Los miembros que ya existian quedan como owner.
-- - account_secrets: las conexiones y ajustes que antes eran globales
--   (engine_secrets) pasan a ser de cada empresa. Agro hereda todo lo actual,
--   incluido el usuario de Composio donde vive su conexion de Canva; las demas
--   empiezan sin conexiones, solo con los modelos por defecto.
--
-- No borra ni modifica engine_secrets. Es idempotente: se puede correr dos veces.

alter table public.accounts add column if not exists plan text not null default 'basic';
alter table public.accounts drop constraint if exists accounts_plan_check;
alter table public.accounts add constraint accounts_plan_check check (plan in ('basic', 'advance'));
update public.accounts set plan = 'advance' where slug = 'agro';
update public.accounts set plan = 'basic' where slug = 'hancel';

alter table public.account_members add column if not exists role text not null default 'member';
alter table public.account_members drop constraint if exists account_members_role_check;
alter table public.account_members add constraint account_members_role_check check (role in ('owner', 'member'));
update public.account_members set role = 'owner';

create table if not exists public.account_secrets (
  account_id              uuid primary key references public.accounts (id) on delete cascade,
  claude_oauth_token      text,
  claude_token_updated_at timestamptz,
  serper_api_key          text,
  gemini_api_key          text,
  composio_user_id        text,
  model_analisis          text not null default 'claude-haiku-4-5-20251001',
  model_angulo            text not null default 'claude-sonnet-5',
  model_linkedin          text not null default 'claude-sonnet-5',
  model_instagram         text not null default 'claude-sonnet-5',
  model_ideas             text not null default 'claude-sonnet-5',
  model_contenido         text not null default 'claude-sonnet-5',
  facebook_page_id        text,
  facebook_page_name      text,
  instagram_user_id       text,
  instagram_username      text,
  updated_at              timestamptz not null default now()
);
alter table public.account_secrets enable row level security;

insert into public.account_secrets (account_id, claude_oauth_token, claude_token_updated_at, serper_api_key, composio_user_id,
  model_analisis, model_angulo, model_linkedin, model_instagram, model_ideas, model_contenido)
select a.id, s.claude_oauth_token, s.claude_token_updated_at, s.serper_api_key, 'engine-hancel',
  s.model_analisis, s.model_angulo, s.model_linkedin, s.model_instagram, s.model_ideas, s.model_contenido
from public.accounts a cross join public.engine_secrets s
where a.slug = 'agro'
on conflict (account_id) do nothing;

insert into public.account_secrets (account_id, model_analisis, model_angulo, model_linkedin, model_instagram, model_ideas, model_contenido)
select a.id, s.model_analisis, s.model_angulo, s.model_linkedin, s.model_instagram, s.model_ideas, s.model_contenido
from public.accounts a cross join public.engine_secrets s
where a.slug <> 'agro'
on conflict (account_id) do nothing;
