-- Revisor automatico (1D-5), 2026-10-20.
--
-- Las reglas de formato que fija la marca y que el codigo comprueba en cada
-- pieza: cuantos hashtags y cuantas laminas, y si se permiten emojis en cada
-- red. Los valores por defecto son lo que hoy pide la fabrica, asi que una
-- cuenta que no los toque no nota nada.
--
-- Las laminas se cuentan sin el cierre: con el, el carrusel llega a siete.
--
-- `content_pieces.revision` guarda lo que encontro el revisor en la pieza:
-- lo que frena, los avisos, lo que arreglo solo y si se mando a corregir.
-- Null = pieza anterior al revisor.
--
-- Solo estructura, no cambia datos. El codigo desplegado no lo lee. Idempotente.

alter table public.brand_profile
  add column if not exists hashtags_min     integer not null default 3,
  add column if not exists hashtags_max     integer not null default 6,
  add column if not exists laminas_min      integer not null default 3,
  add column if not exists laminas_max      integer not null default 5,
  add column if not exists emojis_instagram boolean not null default false,
  add column if not exists emojis_linkedin  boolean not null default false;

alter table public.brand_profile drop constraint if exists brand_profile_hashtags_rango;
alter table public.brand_profile add constraint brand_profile_hashtags_rango
  check (hashtags_min between 0 and 30 and hashtags_max between hashtags_min and 30);

alter table public.brand_profile drop constraint if exists brand_profile_laminas_rango;
alter table public.brand_profile add constraint brand_profile_laminas_rango
  check (laminas_min between 3 and 6 and laminas_max between laminas_min and 6);

alter table public.content_pieces add column if not exists revision jsonb;
