-- Skills de marca (2026-10-20).
--
-- Las instrucciones propias de una marca para sus agentes: como escribe sus
-- captions, como arma sus CTA, como cuenta una noticia. Cada skill dice a que
-- agentes se aplica y entra en su prompt despues del bloque de marca y antes
-- del formato de respuesta.
--
-- `texto` es lo que entra al prompt; `original` es el documento tal cual llego
-- (pegado o importado), para poder volver a el o comparar. Solo `texto` se
-- paga en cada llamada, por eso tiene tope y `original` uno mucho mayor.
--
-- Solo estructura, vacia: no inserta nada de ninguna cuenta. El codigo
-- desplegado no la lee. Idempotente.

create table if not exists public.brand_skills (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  nombre      text not null,
  descripcion text not null default '',
  texto       text not null default '',
  original    text not null default '',
  agentes     text[] not null default '{}',
  activo      boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint brand_skills_nombre_len      check (char_length(nombre) between 1 and 80),
  constraint brand_skills_descripcion_len check (char_length(descripcion) <= 300),
  constraint brand_skills_texto_len       check (char_length(texto) <= 8000),
  constraint brand_skills_original_len    check (char_length(original) <= 200000),
  constraint brand_skills_agentes_check   check (
    agentes <@ array['analisis', 'angulo', 'instagram', 'linkedin', 'redaccion', 'ideas', 'contenido', 'guion']::text[]
  )
);
create index if not exists brand_skills_account_idx on public.brand_skills (account_id, position);
alter table public.brand_skills enable row level security;
