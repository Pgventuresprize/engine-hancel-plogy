-- El chat crea varias piezas por pedido y en paralelo, 2026-11-03.
--
-- Hasta aqui el chat solo pedia piezas de noticias ya analizadas, de a una y en
-- la cola de todos. Ahora una persona pide hasta seis piezas sobre cualquier
-- tema con un mensaje, y tres agentes trabajan a la vez.
--
-- - carril: separa lo que nace en el chat de la cola de siempre. 'general' es
--   todo lo de antes y lo de la ingesta; 'chat' solo lo mueve su propia pasada,
--   dirigida a un trabajo concreto. Las pasadas normales leen la cola del mas
--   viejo al mas nuevo, asi que tres a la vez se pelearian por el mismo trabajo
--   en vez de repartirse tres. El carril tambien aparta estas noticias de lo que
--   ignora el estado: la deduplicacion de la ingesta (que borra en cascada), los
--   hechos cubiertos, el encolado automatico y la publicacion automatica.
-- - raw_news.status = 'chat': no existe en ninguna seleccion automatica.
-- - chat_trabajos.fase: investigar -> angulo -> pieza.
-- - chat_trabajos.lease_id / lease_hasta: el turno de una pasada. Lo reparte
--   chat_despachar, que es la unica que aparta turnos.
-- - chat_trabajos.fallos: turnos seguidos sin avanzar. A los cuatro, falla.
-- - chat_trabajos.vence_at: tope de un trabajo; recoge los cuelgues que no dejan
--   rastro (un recurso consumido por una pasada que murio, por ejemplo).
-- - chat_trabajos.reintentar_desde: espera tras agotar el limite del plan.
--
-- Aditiva e idempotente. Lo existente queda en 'general' y sigue igual. El cron
-- que recoge lo que quedo sin turno esta en scheduler.sql: se activa cuando la
-- app ya tiene /api/chat/pasada desplegada.

-- ------------------------------------------------------------------- carril

alter table public.raw_news       add column if not exists carril text not null default 'general';
alter table public.content_angles add column if not exists carril text not null default 'general';
alter table public.content_pieces add column if not exists carril text not null default 'general';
alter table public.jobs_angle     add column if not exists carril text not null default 'general';
alter table public.jobs_recurso   add column if not exists carril text not null default 'general';
alter table public.jobs_linkedin  add column if not exists carril text not null default 'general';
alter table public.jobs_instagram add column if not exists carril text not null default 'general';

-- Un angulo del chat, un trabajo vivo por red: pedirlo dos veces seria pagar dos
-- veces la misma generacion. Solo en el carril del chat: la cola general tiene
-- su propia comprobacion y filas historicas que no hay que validar.
create unique index if not exists jobs_linkedin_chat_uno_vivo
  on public.jobs_linkedin (content_angle_id)
  where carril = 'chat' and consumed_at is null;
create unique index if not exists jobs_instagram_chat_uno_vivo
  on public.jobs_instagram (content_angle_id)
  where carril = 'chat' and consumed_at is null;

-- ------------------------------------------------------------- chat_trabajos

alter table public.chat_trabajos add column if not exists carril text not null default 'general';
alter table public.chat_trabajos add column if not exists fase text;
alter table public.chat_trabajos add column if not exists pedido jsonb;
alter table public.chat_trabajos add column if not exists titulo text;
alter table public.chat_trabajos add column if not exists raw_news_id uuid references public.raw_news (id) on delete set null;
alter table public.chat_trabajos add column if not exists lease_id uuid;
alter table public.chat_trabajos add column if not exists lease_hasta timestamptz;
alter table public.chat_trabajos add column if not exists fallos integer not null default 0;
alter table public.chat_trabajos add column if not exists vence_at timestamptz;
alter table public.chat_trabajos add column if not exists reintentar_desde timestamptz;

alter table public.chat_trabajos drop constraint if exists chat_trabajos_fase_check;
alter table public.chat_trabajos add constraint chat_trabajos_fase_check
  check (fase is null or fase in ('investigar', 'angulo', 'pieza'));

create index if not exists chat_trabajos_turnos_idx
  on public.chat_trabajos (account_id, created_at)
  where carril = 'chat' and estado in ('espera', 'trabajando');
create index if not exists chat_trabajos_lease_idx
  on public.chat_trabajos (account_id)
  where lease_hasta is not null;

-- ------------------------------------------------------------ chat_despachar

-- Reparte turnos: mientras la marca tenga menos de tres pasadas vivas, aparta el
-- siguiente trabajo y llama a su pasada. Todo en una transaccion, con el aviso
-- incluido: pg_net solo envia si esto confirma, asi que no hay turno sin llamada
-- ni llamada sin turno.
--
-- El turno cuenta aunque el trabajo se haya detenido: una pasada viva sigue
-- gastando hasta que termina, y el tope existe por eso. Dura 60 s hasta que la
-- pasada lo confirma; una llamada que no llega se recupera sola.
--
-- La URL es la del tick cambiando la ruta. `chat_pasada_url` la sustituye para
-- probar contra otro despliegue sin tocar la de produccion.
create or replace function public.chat_despachar(p_account uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_tope   constant integer := 3;
  c_fallos constant integer := 4;
  v_url    text;
  v_secret text;
  v_cuenta uuid;
  v_libres integer;
  v_id     uuid;
  v_lease  uuid;
  v_total  integer := 0;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'chat_pasada_url';
  if v_url is null then
    select replace(decrypted_secret, '/api/content/tick', '/api/chat/pasada') into v_url
      from vault.decrypted_secrets where name = 'content_tick_url';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'ingest_secret';

  if v_url is null or v_secret is null then
    raise warning 'engine-hancel: falta content_tick_url o ingest_secret';
    return 0;
  end if;

  for v_cuenta in
    select distinct t.account_id
    from public.chat_trabajos t
    where t.carril = 'chat'
      and t.estado in ('espera', 'trabajando')
      and t.agente <> 'revisor'
      and (p_account is null or t.account_id = p_account)
  loop
    -- Dos despachos a la vez contarian los mismos huecos.
    perform pg_advisory_xact_lock(hashtext('chat_despachar'), hashtext(v_cuenta::text));

    select c_tope - count(*) into v_libres
    from public.chat_trabajos t
    where t.account_id = v_cuenta and t.lease_hasta > now();

    continue when v_libres <= 0;

    for v_id in
      select t.id
      from public.chat_trabajos t
      where t.account_id = v_cuenta
        and t.carril = 'chat'
        and t.estado in ('espera', 'trabajando')
        and t.agente <> 'revisor'
        and t.fallos < c_fallos
        and (t.vence_at is null or t.vence_at > now())
        and (t.lease_hasta is null or t.lease_hasta <= now())
        and (t.reintentar_desde is null or t.reintentar_desde <= now())
      order by t.created_at
      limit v_libres
      for update skip locked
    loop
      v_lease := gen_random_uuid();
      update public.chat_trabajos t
      set lease_id = v_lease,
          lease_hasta = now() + interval '60 seconds',
          fallos = t.fallos + 1,
          estado = 'trabajando',
          vence_at = coalesce(t.vence_at, now() + interval '90 minutes'),
          reintentar_desde = null,
          updated_at = now()
      where t.id = v_id;

      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_secret
        ),
        body := jsonb_build_object('trabajo', v_id, 'lease', v_lease),
        timeout_milliseconds := 15000
      );
      v_total := v_total + 1;
    end loop;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.chat_despachar(uuid) from public, anon, authenticated;
grant execute on function public.chat_despachar(uuid) to service_role;

-- ------------------------------------------------------------------ triggers

-- La pasada del chat drena lo suyo: avisar a una pasada general por sus trabajos
-- solo la despertaria para no encontrar nada.
drop trigger if exists jobs_angle_tick_trg on public.jobs_angle;
create trigger jobs_angle_tick_trg
after update of status on public.jobs_angle
for each row
when (old.status is distinct from new.status and new.status in ('done', 'failed') and new.carril = 'general')
execute function public.content_tick_on_row();

drop trigger if exists jobs_linkedin_tick_trg on public.jobs_linkedin;
create trigger jobs_linkedin_tick_trg
after update of status on public.jobs_linkedin
for each row
when (old.status is distinct from new.status and new.status in ('done', 'failed') and new.carril = 'general')
execute function public.content_tick_on_row();

drop trigger if exists jobs_recurso_tick_trg on public.jobs_recurso;
create trigger jobs_recurso_tick_trg
after update of status on public.jobs_recurso
for each row
when (
  old.status is distinct from new.status
  and (new.status in ('done', 'failed') or (old.status = 'processing' and new.status = 'pending'))
  and new.carril = 'general'
)
execute function public.content_tick_on_row();
