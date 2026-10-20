-- Prompt por piezas (1D-6b), 2026-10-20.
--
-- `brand_skills.cuando` dice con que piezas entra cada skill: por pilar,
-- objetivo, tipo de CTA, formato o red. Vacio = siempre, que es lo que hacen
-- hoy todas las skills, asi que nada cambia hasta que la marca lo elija.
--
-- `receta` guarda en cada trabajo como se armo su prompt: que entro, que no
-- entro y por que. Null = trabajo anterior al armador por piezas.
--
-- Solo estructura, no cambia datos. El codigo desplegado no lo lee. Idempotente.

alter table public.brand_skills
  add column if not exists cuando jsonb not null default '{}'::jsonb;

alter table public.jobs_angle     add column if not exists receta jsonb;
alter table public.jobs_linkedin  add column if not exists receta jsonb;
alter table public.jobs_instagram add column if not exists receta jsonb;
