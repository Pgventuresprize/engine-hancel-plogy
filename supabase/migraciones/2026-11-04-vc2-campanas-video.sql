-- Módulo aislado. Solo crea objetos vc2_*; no altera tablas ni jobs del motor actual.
begin;
create table if not exists public.vc2_campaigns (
  id uuid primary key, account_id uuid not null references public.accounts(id),
  config jsonb not null, brand jsonb not null, paused boolean not null default false,
  runs_started integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.vc2_pieces (
  id uuid primary key, campaign_id uuid not null references public.vc2_campaigns(id),
  account_id uuid not null references public.accounts(id), payload jsonb not null,
  revision integer not null default 0, updated_at timestamptz not null default now()
);
create table if not exists public.vc2_jobs (
  id uuid primary key default gen_random_uuid(), piece_id uuid not null unique references public.vc2_pieces(id),
  account_id uuid not null references public.accounts(id), phase text not null,
  status text not null default 'queued' check(status in ('queued','running','held','done')),
  lease uuid, lease_until timestamptz, next_at timestamptz not null default now(),
  attempts integer not null default 0, error text, updated_at timestamptz not null default now()
);
create table if not exists public.vc2_versions (
  id uuid primary key default gen_random_uuid(), piece_id uuid not null references public.vc2_pieces(id),
  account_id uuid not null references public.accounts(id), payload jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.vc2_sources (
  account_id uuid not null references public.accounts(id), key text not null, actor text not null,
  status text not null default 'starting', run_id text, data jsonb, error text,
  created_at timestamptz not null default now(), primary key(account_id,key)
);
create table if not exists public.vc2_settings (
  account_id uuid primary key references public.accounts(id), apify_ciphertext text,
  updated_at timestamptz not null default now()
);
alter table public.vc2_campaigns enable row level security;
alter table public.vc2_pieces enable row level security;
alter table public.vc2_jobs enable row level security;
alter table public.vc2_versions enable row level security;
alter table public.vc2_sources enable row level security;
alter table public.vc2_settings enable row level security;
revoke all on public.vc2_campaigns, public.vc2_pieces, public.vc2_jobs, public.vc2_versions, public.vc2_sources, public.vc2_settings from anon, authenticated;
grant all on public.vc2_campaigns, public.vc2_pieces, public.vc2_jobs, public.vc2_versions, public.vc2_sources, public.vc2_settings to service_role;
create index if not exists vc2_campaign_account on public.vc2_campaigns(account_id,created_at desc);
create index if not exists vc2_piece_campaign on public.vc2_pieces(campaign_id);
create index if not exists vc2_jobs_queue on public.vc2_jobs(status,next_at);
create index if not exists vc2_versions_piece on public.vc2_versions(account_id,piece_id,created_at desc);

create or replace function public.vc2_wake()
returns void language plpgsql security definer set search_path = '' as $$
declare u text; s text;
begin
  if not exists (select 1 from public.vc2_jobs j join public.vc2_pieces p on p.id=j.piece_id join public.vc2_campaigns c on c.id=p.campaign_id where not c.paused and (j.status='queued' or (j.status='running' and j.lease_until < now())) and j.next_at <= now()) then return; end if;
  select decrypted_secret into u from vault.decrypted_secrets where name='ingest_url';
  select decrypted_secret into s from vault.decrypted_secrets where name='ingest_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(url := regexp_replace(u, '/api/ingest/?$', '') || '/api/videos/tick/campanas',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||s),
    body := '{}'::jsonb, timeout_milliseconds := 15000);
end; $$;

create or replace function public.vc2_create(p_id uuid,p_account uuid,p_config jsonb,p_brand jsonb,p_pieces jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r jsonb; made integer;
begin
  insert into public.vc2_campaigns(id,account_id,config,brand) values(p_id,p_account,p_config,p_brand) on conflict(id) do nothing;
  get diagnostics made = row_count;
  if not exists(select 1 from public.vc2_campaigns where id=p_id and account_id=p_account) then raise exception 'Campaña de otra cuenta'; end if;
  if made=0 then return p_id; end if;
  for r in select value from jsonb_array_elements(p_pieces) loop
    insert into public.vc2_pieces(id,campaign_id,account_id,payload) values((r->>'id')::uuid,p_id,p_account,r);
    insert into public.vc2_jobs(piece_id,account_id,phase) values((r->>'id')::uuid,p_account,r->>'phase');
  end loop;
  perform public.vc2_wake();
  return p_id;
end; $$;

create or replace function public.vc2_claim(p_account uuid default null)
returns setof public.vc2_jobs language plpgsql security definer set search_path = '' as $$
declare chosen uuid; chosen_account uuid;
begin
  update public.vc2_pieces p set payload=p.payload||jsonb_build_object('status','error','error','La tarea agotó la recuperación automática. Puedes reintentar el paso.')
    from public.vc2_jobs j where j.piece_id=p.id and j.status='running' and j.lease_until<now() and j.attempts>=3;
  update public.vc2_jobs set status='held',lease=null,lease_until=null,error='Recuperación agotada.' where status='running' and lease_until<now() and attempts>=3;
  select j.id into chosen from public.vc2_jobs j
    join public.vc2_pieces p on p.id=j.piece_id join public.vc2_campaigns c on c.id=p.campaign_id
    where not c.paused and (p_account is null or j.account_id=p_account)
    and (j.status='queued' or (j.status='running' and j.lease_until < now()))
    and j.next_at <= now() and j.attempts < 3
    order by j.updated_at for update of j skip locked limit 1;
  if chosen is null then return; end if;
  select account_id into chosen_account from public.vc2_jobs where id=chosen;
  perform pg_advisory_xact_lock(hashtextextended(chosen_account::text, 2));
  if (select count(*) from public.vc2_jobs where account_id=chosen_account and status='running' and lease_until>now())>=2 then return; end if;
  return query update public.vc2_jobs set status='running',lease=gen_random_uuid(),lease_until=now()+interval '360 seconds',attempts=attempts+1,updated_at=now() where id=chosen returning *;
end; $$;

create or replace function public.vc2_commit(p_job uuid,p_lease uuid,p_revision integer,p_payload jsonb,p_phase text,p_status text,p_delay integer default 0)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.vc2_jobs; old jsonb;
begin
  select * into j from public.vc2_jobs where id=p_job and lease=p_lease and status='running' and lease_until>now() for update;
  if j.id is null then return false; end if;
  if exists(select 1 from public.vc2_pieces p join public.vc2_campaigns c on c.id=p.campaign_id where p.id=j.piece_id and c.paused) then
    update public.vc2_jobs set status='queued',lease=null,lease_until=null,attempts=0 where id=j.id; return false;
  end if;
  select payload into old from public.vc2_pieces where id=j.piece_id and revision=p_revision for update;
  if old is null then
    update public.vc2_jobs set status='held',lease=null,lease_until=null,error='La pieza cambió durante la generación.' where id=j.id; return false;
  end if;
  if (old->'script') is distinct from (p_payload->'script') and old->'script' <> 'null'::jsonb then
    insert into public.vc2_versions(piece_id,account_id,payload) values(j.piece_id,j.account_id,old);
  end if;
  update public.vc2_pieces set payload=p_payload,revision=revision+1,updated_at=now() where id=j.piece_id;
  update public.vc2_jobs set phase=p_phase,status=p_status,lease=null,lease_until=null,
    attempts=0,
    next_at=now()+make_interval(secs=>greatest(0,least(p_delay,300))),error=null,updated_at=now() where id=j.id;
  perform public.vc2_wake();
  return true;
end; $$;

create or replace function public.vc2_reserve_run(p_campaign uuid,p_account uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.vc2_campaigns set runs_started=runs_started+1
    where id=p_campaign and account_id=p_account and not paused
    and runs_started < least(40,coalesce((config->>'maxRuns')::integer,12));
  get diagnostics n=row_count; return n=1;
end; $$;

create or replace function public.vc2_edit(p_piece uuid,p_account uuid,p_revision integer,p_payload jsonb,p_phase text,p_queue boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.vc2_jobs; old jsonb;
begin
  select * into j from public.vc2_jobs where piece_id=p_piece and account_id=p_account for update;
  if j.id is null or (j.status='running' and j.lease_until>now()) then return false; end if;
  select payload into old from public.vc2_pieces where id=p_piece and account_id=p_account and revision=p_revision for update;
  if old is null then return false; end if;
  if old->'script' <> 'null'::jsonb then insert into public.vc2_versions(piece_id,account_id,payload) values(p_piece,p_account,old); end if;
  update public.vc2_pieces set payload=p_payload,revision=revision+1,updated_at=now() where id=p_piece;
  update public.vc2_jobs set phase=p_phase,status=case when p_queue then 'queued' else 'held' end,lease=null,lease_until=null,attempts=0,error=null,next_at=now(),updated_at=now() where id=j.id;
  if p_queue then perform public.vc2_wake(); end if;
  return true;
end; $$;
create or replace function public.vc2_context(p_campaign uuid,p_account uuid,p_config jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.vc2_campaigns;
begin
  select * into c from public.vc2_campaigns where id=p_campaign and account_id=p_account for update;
  if c.id is null then return false; end if;
  if exists(select 1 from public.vc2_jobs j join public.vc2_pieces p on p.id=j.piece_id where p.campaign_id=c.id and j.status='running' and j.lease_until>now()) then return false; end if;
  update public.vc2_campaigns set config=p_config where id=c.id;
  update public.vc2_pieces set payload=payload||jsonb_build_object('review',null,'status','queued','error','','phase',
      case when payload->'script'<>'null'::jsonb then 'review' else payload->>'phase' end),
      revision=revision+1,updated_at=now() where campaign_id=c.id;
  update public.vc2_jobs j set phase=p.payload->>'phase',status='queued',attempts=0,lease=null,lease_until=null,next_at=now(),updated_at=now()
    from public.vc2_pieces p where j.piece_id=p.id and p.campaign_id=c.id;
  perform public.vc2_wake();return true;
end; $$;
revoke all on function public.vc2_context(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vc2_context(uuid,uuid,jsonb) to service_role;
revoke all on function public.vc2_wake(),public.vc2_create(uuid,uuid,jsonb,jsonb,jsonb),public.vc2_claim(uuid),public.vc2_commit(uuid,uuid,integer,jsonb,text,text,integer),public.vc2_reserve_run(uuid,uuid),public.vc2_edit(uuid,uuid,integer,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.vc2_wake(),public.vc2_create(uuid,uuid,jsonb,jsonb,jsonb),public.vc2_claim(uuid),public.vc2_commit(uuid,uuid,integer,jsonb,text,text,integer),public.vc2_reserve_run(uuid,uuid),public.vc2_edit(uuid,uuid,integer,jsonb,text,boolean) to service_role;
-- Backstop propio: no modifica ni reprograma ningún cron existente.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and not exists(select 1 from cron.job where jobname='vc2_campaign_recovery') then
    perform cron.schedule('vc2_campaign_recovery','* * * * *','select public.vc2_wake()');
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
