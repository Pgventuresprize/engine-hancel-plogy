-- Agente revisor (revisor con Claude), 2026-10-21.
--
-- El revisor con Claude es un agente mas: tiene su fila en agent_settings
-- (encendido, oficio editado, modelo) y puede recibir skills de la marca, como
-- la rubrica editorial. Las dos listas cerradas de agentes lo anaden.
--
-- Solo estructura, no cambia datos. El codigo desplegado funciona sin esto
-- (lee los ajustes por defecto); solo guardar los del revisor necesita la
-- migracion. Idempotente.

alter table public.agent_settings drop constraint if exists agent_settings_agent_check;
alter table public.agent_settings add constraint agent_settings_agent_check
  check (agent in ('extraccion', 'analisis', 'angulo', 'instagram', 'linkedin', 'revisor', 'publicacion', 'redaccion'));

alter table public.brand_skills drop constraint if exists brand_skills_agentes_check;
alter table public.brand_skills add constraint brand_skills_agentes_check check (
  agentes <@ array['analisis', 'angulo', 'instagram', 'linkedin', 'revisor', 'redaccion', 'ideas', 'contenido', 'guion']::text[]
);
