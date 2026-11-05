-- Panel de administracion de la plataforma.
--
-- Es aditiva: no borra ni reescribe datos. Se aplica ANTES de desplegar el codigo
-- de la rama panel-admin, porque ese codigo lee accounts.suspendida_en al cargar
-- cualquier cuenta. Se puede aplicar antes sin efecto alguno sobre lo que corre.
--
-- - platform_admins: quien entra al panel. No es lo mismo que ser owner de una
--   empresa: esto mira toda la plataforma.
-- - accounts.suspendida_en: una empresa suspendida no entra y sus motores paran.
--   Nada se borra; al reactivarla sigue donde estaba.
-- - admin_actividad: lo que se hizo, quien y por que. No se edita ni se borra.
-- - platform_ajustes: los ajustes de toda la plataforma, hoy el registro abierto.
--   Null = lo decide REGISTRO_ABIERTO, como antes de este panel.
-- - Funciones admin_*: solo la service role; el codigo comprueba antes que quien
--   pregunta es administrador. Ninguna devuelve un secreto: de las conexiones solo
--   sale si existen.
--
-- Las tablas tienen RLS sin politicas, como el resto: solo llega la service role.
--
-- Despues de aplicarla hay que nombrar al primer administrador, una sola vez, en
-- el editor SQL de Supabase:
--
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'TU_CORREO';
--
-- Para deshacerla:
--   drop function if exists public.admin_consumo(timestamptz, text);
--   drop function if exists public.admin_metricas_empresas();
--   drop function if exists public.admin_almacenamiento();
--   drop function if exists public.admin_fallos(timestamptz, integer);
--   drop function if exists public.admin_cerrar_sesiones(uuid);
--   drop table if exists public.admin_actividad, public.platform_ajustes, public.platform_admins;
--   alter table public.accounts drop column if exists suspendida_en, drop column if exists suspension_motivo;
--   y volver a correr chat_despachar y vc2_claim de sus migraciones originales.

-- ------------------------------------------------------------ administradores
create table if not exists public.platform_admins (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  nombrado_por uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

-- ------------------------------------------------------------ empresas suspendidas
alter table public.accounts add column if not exists suspendida_en timestamptz;
alter table public.accounts add column if not exists suspension_motivo text;

-- ------------------------------------------------------------ ajustes de plataforma
create table if not exists public.platform_ajustes (
  id               boolean primary key default true,
  registro_abierto boolean,
  updated_at       timestamptz not null default now(),
  constraint platform_ajustes_singleton check (id)
);
alter table public.platform_ajustes enable row level security;
insert into public.platform_ajustes (id) values (true) on conflict (id) do nothing;

-- ------------------------------------------------------------ actividad
-- Sin llaves foraneas a proposito: el registro tiene que sobrevivir a lo que
-- describe, y un `on delete set null` chocaria con el trigger de abajo.
create table if not exists public.admin_actividad (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  -- El correo se copia: si borran al usuario, el registro sigue diciendo quien fue.
  actor       text not null,
  tipo        text not null,
  accion      text not null,
  sobre       text not null,
  account_id  uuid,
  usuario_id  uuid,
  detalle     text,
  motivo      text,
  constraint admin_actividad_tipo_check check (tipo in ('plan', 'acceso', 'bloqueo', 'plataforma'))
);
create index if not exists admin_actividad_at_idx on public.admin_actividad (at desc);
create index if not exists admin_actividad_cuenta_idx on public.admin_actividad (account_id, at desc);
alter table public.admin_actividad enable row level security;

create or replace function public.admin_actividad_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La actividad no se puede editar ni borrar.';
end;
$$;

drop trigger if exists admin_actividad_inmutable_trg on public.admin_actividad;
create trigger admin_actividad_inmutable_trg
before update or delete on public.admin_actividad
for each row execute function public.admin_actividad_inmutable();

drop trigger if exists admin_actividad_sin_truncate_trg on public.admin_actividad;
create trigger admin_actividad_sin_truncate_trg
before truncate on public.admin_actividad
for each statement execute function public.admin_actividad_inmutable();

-- ------------------------------------------------------------ consumo
create index if not exists pipeline_events_uso_idx
  on public.pipeline_events (at desc) where kind = 'claude.uso';
create index if not exists pipeline_events_cuenta_at_idx
  on public.pipeline_events (account_id, at desc);

-- Una fila por empresa, dia, paso y modelo. El costo no se calcula aqui: el precio
-- depende del modelo y vive en src/lib/precios-claude.ts.
create or replace function public.admin_consumo(p_desde timestamptz, p_zona text default 'America/Bogota')
returns table (
  account_id    uuid,
  dia           date,
  paso          text,
  modelo        text,
  llamadas      bigint,
  entrada       bigint,
  salida        bigint,
  de_cache      bigint,
  cache_escrita bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.account_id,
    (e.at at time zone p_zona)::date,
    coalesce(e.detail ->> 'paso', ''),
    coalesce(e.detail ->> 'modelo', ''),
    count(*),
    coalesce(sum((e.detail ->> 'entrada')::numeric), 0)::bigint,
    coalesce(sum((e.detail ->> 'salida')::numeric), 0)::bigint,
    coalesce(sum((e.detail ->> 'deCache')::numeric), 0)::bigint,
    coalesce(sum((e.detail ->> 'cacheEscrita')::numeric), 0)::bigint
  from public.pipeline_events e
  where e.kind = 'claude.uso'
    and e.at >= p_desde
    and e.account_id is not null
  group by 1, 2, 3, 4
  order by 1, 2, 3, 4;
$$;

-- ------------------------------------------------------------ metricas por empresa
create or replace function public.admin_metricas_empresas()
returns table (
  account_id       uuid,
  piezas_30        bigint,
  publicadas_30    bigint,
  programadas      bigint,
  ultima_actividad timestamptz,
  claude           text,
  claude_desde     timestamptz,
  serper           boolean,
  instagram        boolean,
  facebook         boolean,
  linkedin         boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    (select count(*) from public.content_pieces p
      where p.account_id = a.id and p.created_at >= now() - interval '30 days'),
    (select count(*) from public.content_pieces p
      where p.account_id = a.id and p.published_at >= now() - interval '30 days'),
    (select count(*) from public.content_pieces p
      where p.account_id = a.id and p.programada_para is not null and p.published_at is null),
    (select max(e.at) from public.pipeline_events e where e.account_id = a.id),
    case
      when s.claude_oauth_token is null or s.claude_oauth_token = '' then null
      when s.claude_oauth_token like 'sk-ant-api%' then 'api'
      else 'suscripcion'
    end,
    s.claude_token_updated_at,
    coalesce(s.serper_api_key, '') <> '',
    s.instagram_user_id is not null,
    s.facebook_page_id is not null,
    exists (select 1 from public.linkedin_account l where l.account_id = a.id)
  from public.accounts a
  left join public.account_secrets s on s.account_id = a.id;
$$;

-- Los archivos por empresa. Fotos y kits van bajo `{cuenta}/...`, el logo bajo
-- `marca/{cuenta}/...` y los carruseles bajo `{pieza}/...`. Lo que no se pueda
-- atribuir sale con account_id null, y tambien cuenta para el limite del plan.
create or replace function public.admin_almacenamiento()
returns table (account_id uuid, bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(directa.id, en_marca.id, pieza.account_id),
    coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  left join public.accounts directa on directa.id::text = split_part(o.name, '/', 1)
  left join public.accounts en_marca
    on split_part(o.name, '/', 1) = 'marca' and en_marca.id::text = split_part(o.name, '/', 2)
  left join public.content_pieces pieza on pieza.id::text = split_part(o.name, '/', 1)
  group by 1;
$$;

-- Lo que fallo, de donde sea que falle. Los errores se recortan: esto es para
-- saber que paso, el detalle sigue en cada tabla.
create or replace function public.admin_fallos(p_desde timestamptz, p_limite integer default 200)
returns table (at timestamptz, account_id uuid, origen text, error text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.at, f.account_id, f.origen, left(f.error, 300)
  from (
    select coalesce(j.processed_at, j.created_at) as at, j.account_id, 'Ángulo' as origen, j.error
      from public.jobs_angle j where j.status = 'failed'
    union all
    select coalesce(j.processed_at, j.created_at), j.account_id, 'LinkedIn', j.error
      from public.jobs_linkedin j where j.status = 'failed'
    union all
    select coalesce(j.processed_at, j.created_at), j.account_id, 'Instagram', j.error
      from public.jobs_instagram j where j.status = 'failed'
    union all
    select coalesce(j.processed_at, j.created_at), j.account_id, 'Recurso', j.error
      from public.jobs_recurso j where j.status = 'failed'
    union all
    select t.updated_at, t.account_id, 'Chat', t.error
      from public.chat_trabajos t where t.estado = 'fallo'
    union all
    select v.updated_at, v.account_id, 'Campañas de video', v.error
      from public.vc2_jobs v where v.status = 'held'
    union all
    select coalesce(p.published_at, p.approved_at, p.created_at), p.account_id, 'Publicación', p.publish_error
      from public.content_pieces p where p.publish_error is not null
  ) f
  where f.at >= p_desde
  order by f.at desc
  limit greatest(p_limite, 1);
$$;

-- ------------------------------------------------------------ sesiones
-- No hay una llamada de la API de Auth para cerrar las sesiones de otro por su id:
-- al borrarlas caen tambien sus refresh tokens y getUser() deja de aceptar el token.
create or replace function public.admin_cerrar_sesiones(p_usuario uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  delete from auth.sessions where user_id = p_usuario;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ------------------------------------------------------------ permisos
revoke all on function public.admin_consumo(timestamptz, text) from public, anon, authenticated;
revoke all on function public.admin_metricas_empresas() from public, anon, authenticated;
revoke all on function public.admin_almacenamiento() from public, anon, authenticated;
revoke all on function public.admin_fallos(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.admin_cerrar_sesiones(uuid) from public, anon, authenticated;
grant execute on function public.admin_consumo(timestamptz, text) to service_role;
grant execute on function public.admin_metricas_empresas() to service_role;
grant execute on function public.admin_almacenamiento() to service_role;
grant execute on function public.admin_fallos(timestamptz, integer) to service_role;
grant execute on function public.admin_cerrar_sesiones(uuid) to service_role;

-- ------------------------------------------------------------ colas de las suspendidas
-- Los motores recorren todasLasCuentas(), que ya las salta. Estas dos colas las
-- aparta Postgres directamente, asi que el filtro va aqui. Son las funciones de
-- 2026-11-03-chat-lotes.sql y 2026-11-04-vc2-campanas-video.sql con una sola
-- condicion mas: `suspendida_en is null`. El trabajo no se pierde: queda en cola.
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
    join public.accounts a on a.id = t.account_id
    where t.carril = 'chat'
      and t.estado in ('espera', 'trabajando')
      and t.agente <> 'revisor'
      and a.suspendida_en is null
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

create or replace function public.vc2_claim(p_account uuid default null)
returns setof public.vc2_jobs language plpgsql security definer set search_path = '' as $$
declare chosen uuid; chosen_account uuid;
begin
  update public.vc2_pieces p set payload=p.payload||jsonb_build_object('status','error','error','La tarea agotó la recuperación automática. Puedes reintentar el paso.')
    from public.vc2_jobs j where j.piece_id=p.id and j.status='running' and j.lease_until<now() and j.attempts>=3;
  update public.vc2_jobs set status='held',lease=null,lease_until=null,error='Recuperación agotada.' where status='running' and lease_until<now() and attempts>=3;
  select j.id into chosen from public.vc2_jobs j
    join public.vc2_pieces p on p.id=j.piece_id join public.vc2_campaigns c on c.id=p.campaign_id
    join public.accounts a on a.id=j.account_id
    where not c.paused and a.suspendida_en is null and (p_account is null or j.account_id=p_account)
    and (j.status='queued' or (j.status='running' and j.lease_until < now()))
    and j.next_at <= now() and j.attempts < 3
    order by j.updated_at for update of j skip locked limit 1;
  if chosen is null then return; end if;
  select account_id into chosen_account from public.vc2_jobs where id=chosen;
  perform pg_advisory_xact_lock(hashtextextended(chosen_account::text, 2));
  if (select count(*) from public.vc2_jobs where account_id=chosen_account and status='running' and lease_until>now())>=2 then return; end if;
  return query update public.vc2_jobs set status='running',lease=gen_random_uuid(),lease_until=now()+interval '360 seconds',attempts=attempts+1,updated_at=now() where id=chosen returning *;
end; $$;
