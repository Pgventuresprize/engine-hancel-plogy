-- ---------------------------------------------------------------------------
-- El planificador del motor, dentro de Postgres.
--
-- Ejecutar DESPUES de schema.sql. Idempotente.
--
-- Por que aqui y no en Vercel: un cron de Vercel es una expresion fija en
-- vercel.json, asi que la unica forma de tener horarios editables era llamar
-- cada hora y descartar 23 de cada 24 llamadas. Ademas el plan Hobby no admite
-- crons horarios. pg_cron dispara a la hora exacta y se reprograma solo.
--
-- Quien manda sigue siendo `/engine/schedule`: el trigger de abajo reescribe el
-- job cada vez que se guarda el horario. La app no sabe que pg_cron existe.
--
-- Puesta en marcha, una sola vez y con la URL del despliegue:
--
--   select public.configure_ingest(
--     'https://<host>/api/ingest',
--     '<INGEST_SECRET>'
--   );
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Endpoint y secreto viven en Vault, cifrados: el job los lee al disparar.
create or replace function public.configure_ingest(url text, secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where name in ('ingest_url', 'ingest_secret');
  perform vault.create_secret(url, 'ingest_url', 'Endpoint /api/ingest de engine-hancel');
  perform vault.create_secret(secret, 'ingest_secret', 'INGEST_SECRET de engine-hancel');
  return public.sync_ingest_schedule();
end;
$$;

/**
 * Llama a /api/ingest. Es lo que ejecuta el job de pg_cron.
 *
 * Va con ?force=1 a proposito: el cron ya dispara a la hora correcta, no hace
 * falta que la app vuelva a comprobarla. El http_post de pg_net es asincrono,
 * asi que la corrida no bloquea al planificador.
 */
create or replace function public.fire_ingest()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'ingest_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ingest_secret';

  if v_url is null or v_secret is null then
    raise warning 'engine-hancel: falta configurar ingest_url/ingest_secret (usa configure_ingest)';
    return null;
  end if;

  select net.http_post(
    url := v_url || '?force=1',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

/**
 * Reescribe el job de pg_cron a partir de engine_settings.
 *
 * pg_cron corre en UTC, asi que las horas locales se traducen aqui: 11:30 y
 * 18:30 en America/Bogota salen como `30 16,23 * * *`. El desfase de una zona
 * es constante, asi que el minuto UTC es el mismo para todas las horas y basta
 * calcularlo una vez; se toma del calculo y no del valor local para que las
 * zonas con offset de media hora (India, Nepal) salgan bien.
 *
 * La traduccion se hace al guardar, no en cada disparo: en una zona con horario
 * de verano habria que resincronizar en cada cambio. Colombia no lo tiene.
 */
create or replace function public.sync_ingest_schedule()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours   text;
  v_minutes text;
  v_expr    text;
begin
  -- Un job viejo con otro horario tiene que morir antes de programar el nuevo.
  perform cron.unschedule(jobid) from cron.job where jobname = 'engine_hancel_ingest';

  -- Con varias cuentas el cron ya no puede ser el horario de una: es la union de
  -- todos. Como una expresion cron combina minutos y horas en producto
  -- cartesiano, puede disparar a ratos que no le tocan a nadie; eso es barato y
  -- deliberado, porque quien decide si a una cuenta le toca ahora es el endpoint,
  -- que si conoce el horario de cada una. El cron solo dice "ve a mirar".
  select string_agg(distinct utc_hour::text,   ',' order by utc_hour::text),
         string_agg(distinct utc_minute::text, ',' order by utc_minute::text)
  into v_hours, v_minutes
  from (
    select extract(hour   from momento_utc)::int as utc_hour,
           extract(minute from momento_utc)::int as utc_minute
    from (
      select ((current_date + make_interval(hours => h, mins => s.run_minute))
              at time zone s.timezone) at time zone 'UTC' as momento_utc
      from public.engine_settings s
      cross join lateral unnest(s.run_hours) as h
      where s.enabled and coalesce(array_length(s.run_hours, 1), 0) > 0
    ) as convertidas
  ) as horas;

  if v_hours is null then
    return 'programacion desactivada';
  end if;

  v_expr := v_minutes || ' ' || v_hours || ' * * *';
  perform cron.schedule('engine_hancel_ingest', v_expr, 'select public.fire_ingest();');

  return v_expr;
end;
$$;

-- El enlace entre la pantalla de horarios y el cron real: guardar reprograma.
create or replace function public.engine_settings_sync_cron()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_ingest_schedule();
  return null;
end;
$$;

drop trigger if exists engine_settings_sync_cron_trg on public.engine_settings;
create trigger engine_settings_sync_cron_trg
after insert or update on public.engine_settings
for each statement execute function public.engine_settings_sync_cron();

-- PostgREST expone `public` como API y estas funciones son SECURITY DEFINER:
-- sin esto, `anon` podria disparar ingestas desde /rest/v1/rpc/fire_ingest o
-- reescribir el endpoint con configure_ingest usando solo la clave publicable.
revoke all on function public.configure_ingest(text, text)   from public, anon, authenticated;
revoke all on function public.fire_ingest()                  from public, anon, authenticated;
revoke all on function public.sync_ingest_schedule()         from public, anon, authenticated;
revoke all on function public.engine_settings_sync_cron()    from public, anon, authenticated;

-- service_role es quien escribe engine_settings desde la app y dispara el trigger.
grant execute on function public.configure_ingest(text, text) to service_role;
grant execute on function public.fire_ingest()                to service_role;
grant execute on function public.sync_ingest_schedule()       to service_role;
grant execute on function public.engine_settings_sync_cron()  to service_role;

-- Deja el job alineado con lo que haya en engine_settings ahora mismo.
select public.sync_ingest_schedule();

-- ------------------------------------------------- avisos de la etapa 2
--
-- El patron buzon aplicado a la propia aplicacion: los triggers no transportan
-- trabajo, solo dicen "despierta y revisa la cola". Todos los despertadores
-- (los dos buzones, el paso de una noticia a 'analyzed', el cron de respaldo y
-- los botones de la interfaz) llaman al mismo sitio, asi que recibir un aviso
-- de mas es gratis en vez de peligroso.
--
-- Reutiliza el secreto `ingest_secret` del Vault: /api/content/tick y
-- /api/ingest son la misma maquinaria disparada por el mismo Postgres, y un
-- segundo secreto solo añadiria superficie de rotacion.
--
--   select public.configure_content_tick('https://<host>/api/content/tick');

create or replace function public.configure_content_tick(url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where name = 'content_tick_url';
  perform vault.create_secret(url, 'content_tick_url', 'Endpoint /api/content/tick de engine-hancel');
  return url;
end;
$$;

create or replace function public.fire_content_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url        text;
  v_secret     text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'content_tick_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ingest_secret';

  if v_url is null or v_secret is null then
    raise warning 'engine-hancel: falta configurar content_tick_url (usa configure_content_tick)';
    return null;
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;

  return v_request_id;
end;
$$;

-- Un aviso por transaccion. El agente puede cerrar veinte buzones en el mismo
-- UPDATE y el tick drena la cola entera, asi que el segundo aviso solo gastaria
-- una invocacion identica. El flag es local a la transaccion y desaparece al
-- terminar; si el agente escribe fila a fila en transacciones separadas, la
-- segunda defensa es que el tick es idempotente y barato en vacio.
create or replace function public.content_tick_on_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('engine_hancel.tick_avisado', true), '') = 'si' then
    return null;
  end if;
  perform set_config('engine_hancel.tick_avisado', 'si', true);
  perform public.fire_content_tick();
  return null;
end;
$$;

-- El WHEN hace dos trabajos: filtra el evento que importa y corta el bucle. La
-- app solo escribe `consumed_at`, nunca `status`, asi que su propia escritura no
-- vuelve a despertar el tick.
drop trigger if exists jobs_angle_tick_trg on public.jobs_angle;
create trigger jobs_angle_tick_trg
after update of status on public.jobs_angle
for each row
when (old.status is distinct from new.status and new.status in ('done', 'failed'))
execute function public.content_tick_on_row();

drop trigger if exists jobs_linkedin_tick_trg on public.jobs_linkedin;
create trigger jobs_linkedin_tick_trg
after update of status on public.jobs_linkedin
for each row
when (old.status is distinct from new.status and new.status in ('done', 'failed'))
execute function public.content_tick_on_row();

-- El modo automatico: el agente de analisis marca 'analyzed' y aqui arranca la
-- etapa 2. No se filtra por umbral ni por modo en el WHEN (una clausula WHEN no
-- admite subconsultas): eso lo decide el tick leyendo generation_config, que es
-- ademas donde debe vivir esa regla.
drop trigger if exists raw_news_tick_trg on public.raw_news;
create trigger raw_news_tick_trg
after update of status on public.raw_news
for each row
when (old.status is distinct from new.status and new.status = 'analyzed')
execute function public.content_tick_on_row();

revoke all on function public.configure_content_tick(text) from public, anon, authenticated;
revoke all on function public.fire_content_tick()          from public, anon, authenticated;
revoke all on function public.content_tick_on_row()        from public, anon, authenticated;

grant execute on function public.configure_content_tick(text) to service_role;
grant execute on function public.fire_content_tick()          to service_role;
grant execute on function public.content_tick_on_row()        to service_role;

-- Red de seguridad, no camino principal: cubre un pg_net caido, un despliegue en
-- curso o un 5xx por cold start. El tick es barato cuando no hay nada que hacer.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'engine_hancel_content_tick';
  perform cron.schedule('engine_hancel_content_tick', '*/5 * * * *', 'select public.fire_content_tick();');
end
$$;

-- ------------------------------------------------- el estudio (bloque 2)
--
-- La cadencia del agente de ideas y las recetas del agente de contenido. Reusa
-- la URL del tick de contenido cambiando la ruta, y el mismo secreto. Cada diez
-- minutos: que receta toca lo decide su horario, no el cron, y una tanda que el
-- presupuesto de la pasada corto se termina en la siguiente.
create or replace function public.fire_studio_tick()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url        text;
  v_secret     text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'content_tick_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ingest_secret';

  if v_url is null or v_secret is null then
    raise warning 'engine-hancel: falta content_tick_url/ingest_secret para el tick del estudio';
    return null;
  end if;

  select net.http_post(
    url := replace(v_url, '/api/content/tick', '/api/studio/tick'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.fire_studio_tick() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'engine_hancel_studio_tick';
  perform cron.schedule('engine_hancel_studio_tick', '*/10 * * * *', 'select public.fire_studio_tick();');
end
$$;

-- ------------------------------------------------------------ video studio
--
-- El tick de videos: genera guiones (modo automatico), exporta de Canva los
-- videos que una persona dejo en la etapa Video y los programa en Buffer. Cada
-- diez minutos, desfasado cinco del tick del estudio para no pisarse.
create or replace function public.fire_videos_tick()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url        text;
  v_secret     text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'content_tick_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ingest_secret';
  if v_url is null or v_secret is null then
    raise warning 'engine-hancel: falta content_tick_url/ingest_secret para el tick de videos';
    return null;
  end if;
  select net.http_post(
    url := replace(v_url, '/api/content/tick', '/api/videos/tick'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.fire_videos_tick() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'engine_hancel_videos_tick';
  perform cron.schedule('engine_hancel_videos_tick', '5-59/10 * * * *', 'select public.fire_videos_tick();');
end
$$;
