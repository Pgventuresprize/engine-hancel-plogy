-- Registro concurrente (2026-11-05).
--
-- Cada empresa nueva inserta en engine_settings, y su trigger borraba y volvia a crear
-- el job de ingesta en cron.job. Dos registros a la vez tocaban la misma fila y uno
-- fallaba con "tuple concurrently deleted", dejando la empresa sin configuracion.
--
-- El horario es fijo: si el job ya esta como debe, no hay nada que escribir. Solo se
-- recrea cuando falta o cambio, y con candado para que dos no lo hagan a la vez.

create or replace function public.sync_ingest_schedule()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  c_horario constant text := '*/10 * * * *';
  c_comando constant text := 'select public.fire_ingest();';
begin
  if exists (
    select 1 from cron.job
    where jobname = 'engine_hancel_ingest' and schedule = c_horario and command = c_comando and active
  ) then
    return c_horario;
  end if;

  perform pg_advisory_xact_lock(hashtext('engine_hancel_ingest'));
  perform cron.unschedule(jobid) from cron.job where jobname = 'engine_hancel_ingest';
  perform cron.schedule('engine_hancel_ingest', c_horario, c_comando);
  return c_horario;
end;
$$;
