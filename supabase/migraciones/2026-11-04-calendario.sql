-- El calendario de publicacion, 2026-11-04.
--
-- Una persona arrastra a una fecha y hora lo que el Estudio ya genero, y la pieza
-- sale sola a esa hora. Publicar no se deshace, asi que la regla es: ante la duda
-- no publica y lo enseña.
--
-- - programada_para: el instante en que debe salir. Null = no esta en el calendario.
-- - programada_intentos: cuantas veces se reclamo para publicar. Lo suma el propio
--   reclamo, asi que un proceso que muere tambien cuenta.
-- - programada_revisar: no se sabe si salio (la respuesta se corto, el proceso
--   murio). No se reintenta sola: reintentar seria un post doble. Lo decide una
--   persona mirando la red.
-- - contenido_cambiado_at: la ultima vez que cambio el payload. Lo pone el trigger
--   de abajo. El motor espera unos minutos tras un cambio, porque el texto se
--   guarda antes de redibujar y una pasada en medio mezclaria texto nuevo con
--   laminas viejas.
-- - calendario_ajustes: el interruptor general y la plantilla de horarios, una
--   fila por cuenta. Sin fila o con el interruptor apagado no publica nada.
--
-- Como el resto del esquema: RLS activado y sin politicas, se entra con service
-- role y el codigo filtra por cuenta. Idempotente.
--
-- El trigger es lo unico que cambia algo desde que se aplica: editar una pieza
-- aprobada le quita la aprobacion. Lo demas son columnas vacias y una tabla nueva.
--
-- Para deshacerla:
--   drop trigger if exists content_pieces_contenido_cambia_trg on public.content_pieces;
--   drop function if exists public.content_pieces_contenido_cambia();
--   drop table if exists public.calendario_ajustes;
--   drop index if exists public.content_pieces_programadas_idx;
--   alter table public.content_pieces
--     drop column if exists programada_para,
--     drop column if exists programada_intentos,
--     drop column if exists programada_revisar,
--     drop column if exists contenido_cambiado_at;

alter table public.content_pieces add column if not exists programada_para timestamptz;
alter table public.content_pieces add column if not exists programada_intentos integer not null default 0;
alter table public.content_pieces add column if not exists programada_revisar boolean not null default false;
alter table public.content_pieces add column if not exists contenido_cambiado_at timestamptz;

-- Sin indice unico por hora, a proposito: si una publicacion falla y otra pieza
-- ocupo su hueco, ese indice impediria devolverla a su estado y quedaria colgada.
-- Dos posts a la misma hora son inofensivos: el motor los saca de a uno.
create index if not exists content_pieces_programadas_idx
  on public.content_pieces (programada_para)
  where programada_para is not null and published_at is null;

create table if not exists public.calendario_ajustes (
  account_id      uuid primary key references public.accounts (id) on delete cascade,
  publicar_activo boolean     not null default false,
  -- { "instagram": { "1": ["12:00"], ... }, "linkedin": { ... } }, 0 = domingo.
  horarios        jsonb       not null default '{}',
  updated_at      timestamptz not null default now()
);

alter table public.calendario_ajustes enable row level security;

-- Lo aprobado es lo que alguien vio. Si el contenido cambia, ya no es eso.
-- Va en un trigger porque el payload lo escriben mas de diez sitios (el chat, el
-- revisor, restaurar una version, regenerar) y uno que se olvide publicaria sin
-- revisar. Aprobar y editar en la misma escritura si conserva la aprobacion.
create or replace function public.content_pieces_contenido_cambia()
returns trigger
language plpgsql
as $$
begin
  if new.payload is distinct from old.payload then
    new.contenido_cambiado_at := now();
    if old.status = 'approved' and new.status = 'approved' then
      new.status := 'generated';
      new.approved_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists content_pieces_contenido_cambia_trg on public.content_pieces;
create trigger content_pieces_contenido_cambia_trg
before update of payload on public.content_pieces
for each row
execute function public.content_pieces_contenido_cambia();
