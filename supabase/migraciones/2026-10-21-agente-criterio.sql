-- Agente de criterio, 2026-10-21.
--
-- Antes de escribir, el agente de criterio anota lo que el material ya
-- recomienda y decide lo que la marca haria o miraria primero. Se guarda en el
-- angulo: el post y el carrusel de la misma noticia usan el mismo, y la ficha
-- lo enseña. Ver src/engine/content/criterio.ts.
--
-- Una columna nueva (vacia en los angulos de antes: se decide al escribir) y el
-- agente "criterio" en las dos listas cerradas de agentes. Solo estructura, no
-- cambia datos. Idempotente.

alter table public.content_angles add column if not exists criterio jsonb;

alter table public.agent_settings drop constraint if exists agent_settings_agent_check;
alter table public.agent_settings add constraint agent_settings_agent_check
  check (agent in ('extraccion', 'analisis', 'angulo', 'instagram', 'linkedin', 'criterio', 'revisor', 'publicacion', 'redaccion'));

alter table public.brand_skills drop constraint if exists brand_skills_agentes_check;
alter table public.brand_skills add constraint brand_skills_agentes_check check (
  agentes <@ array['analisis', 'angulo', 'instagram', 'linkedin', 'criterio', 'revisor', 'redaccion', 'ideas', 'contenido', 'guion']::text[]
);
