-- Cimientos para varias marcas (2026-10-20).
--
-- Aplicar DESPUES de desplegar el codigo de la rama perfil-marca: hasta ese
-- despliegue, la pagina de noticias lee raw_news y pipeline_runs con la clave
-- publicable, y con RLS activo dejaria de ver filas.
--
-- Idempotente: se puede correr dos veces sin efecto.

-- 1. Las tres tablas que quedaban abiertas a la clave publicable. anon y
--    authenticated tenian lectura, escritura y borrado sobre las noticias, las
--    ejecuciones y los prompts de todas las cuentas. Con RLS activo y sin
--    politicas solo las alcanza la service role, como al resto.
alter table public.raw_news       enable row level security;
alter table public.pipeline_runs  enable row level security;
alter table public.agent_settings enable row level security;

-- 2. Las filas de configuracion que toda cuenta necesita. Las pantallas que
--    solo actualizaban no guardaban nada en una cuenta sin fila. Desde ahora
--    las crea `asegurarConfiguracion` al crear la empresa; esto cubre las que
--    ya existen.
insert into public.generation_config (account_id)
select id from public.accounts
on conflict (account_id) do nothing;

insert into public.engine_settings (account_id)
select id from public.accounts
on conflict (account_id) do nothing;

insert into public.publish_schedule (account_id, network)
select a.id, n.network
from public.accounts a
cross join (values ('linkedin'), ('instagram'), ('facebook')) as n (network)
on conflict (account_id, network) do nothing;
