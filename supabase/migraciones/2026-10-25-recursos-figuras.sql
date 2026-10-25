-- Figuras de los recursos, 2026-10-25.
--
-- Con el texto del recurso ya final, el agente dibuja con el kit de la marca la
-- portada, una figura por cada cifra o idea central (1600x900) y, si encaja, una
-- foto de la biblioteca. Las imagenes van al bucket publico "carousels" (ruta
-- recursos/<cuenta>/<angulo>/<version>/) y aqui queda donde va cada una en el
-- recurso, su pie y su texto alternativo. Ver src/engine/recursos/figuras.ts.
--
-- - content_recursos.figuras: {lista, foto, avisos, puntaje, rondas}.
--
-- Solo estructura, no cambia datos. Idempotente.

alter table public.content_recursos add column if not exists figuras jsonb not null default '{}'::jsonb;
