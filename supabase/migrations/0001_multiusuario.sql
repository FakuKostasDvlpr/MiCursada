-- Mi Cursada multiusuario: contenido del aula compartido + datos personales con RLS.
-- Spec: docs/superpowers/specs/2026-08-18-vercel-supabase-multiusuario-design.md

-- ---------------------------------------------------------------------------
-- COMPARTIDO: si cinco personas cursan Fundamentos, esto existe una sola vez.
-- ---------------------------------------------------------------------------

-- El id conserva el formato del snapshot ("curso:2756"): componentes y URLs no cambian.
create table public.cursos (
  id text primary key,
  nombre text not null,
  -- La materia tal como la arma el sync, sin overlays personales:
  -- { nombre, source, asistenciaUrl?, claseUrl?, secciones?, archivos }
  datos jsonb not null,
  sincronizado timestamptz not null default now()
);

-- Refs opacas de archivos del aula ("{cmid}:{indice}" → datos para el proxy).
-- Solo las lee el servidor: el proxy /api/archivo resuelve con el token del usuario.
create table public.archivo_refs (
  ref text primary key,
  datos jsonb not null,
  actualizado timestamptz not null default now()
);

-- Avisos que trae el sync ("assign:14782"). curso_id null = aviso general del calendario.
create table public.avisos_curso (
  id text primary key,
  curso_id text references public.cursos (id) on delete cascade,
  titulo text not null,
  fecha date not null
);
create index avisos_curso_fecha_idx on public.avisos_curso (fecha);
create index avisos_curso_curso_idx on public.avisos_curso (curso_id);

-- ---------------------------------------------------------------------------
-- IDENTIDAD Y ACCESO
-- ---------------------------------------------------------------------------

create table public.perfiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  moodle_id bigint not null unique,
  nombre text not null,
  carrera text not null default 'Analista de Sistemas',
  instituto text not null default '',
  avatar_url text,
  consentimiento_en timestamptz,
  alta timestamptz not null default now(),
  ultima_visita timestamptz not null default now()
);

-- Token del aula virtual, cifrado con AES-256-GCM (lib/cifrado.ts). meta guarda
-- lo no sensible de la credencial: { url, userid, usuario, guardadoEn, ultimaVerificacion }.
create table public.credenciales (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_cifrado bytea not null,
  nonce bytea not null,
  meta jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

create table public.inscripciones (
  user_id uuid not null references auth.users (id) on delete cascade,
  curso_id text not null references public.cursos (id) on delete cascade,
  primary key (user_id, curso_id)
);
create index inscripciones_curso_idx on public.inscripciones (curso_id);

-- ---------------------------------------------------------------------------
-- DE CADA PERSONA, PRIVADO
-- ---------------------------------------------------------------------------

create table public.horarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  curso_id text not null references public.cursos (id) on delete cascade,
  dia smallint not null check (dia between 1 and 6),
  inicio time not null,
  fin time not null
);
create index horarios_user_idx on public.horarios (user_id, curso_id);

create table public.materias_extra (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  curso_id text not null references public.cursos (id) on delete cascade,
  profe text not null default '',
  aula text not null default '',
  color text not null default '#38bdf8'
    check (color in ('#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#f97316', '#e2e8f0')),
  primary key (user_id, curso_id)
);

create table public.bloques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  curso_id text not null references public.cursos (id) on delete cascade,
  tipo text not null check (tipo in ('texto', 'titulo', 'tarea', 'link', 'divisor')),
  texto text not null default '',
  url text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'proceso', 'listo')),
  hecho boolean not null default false,
  orden int not null,
  created_at timestamptz not null default now()
);
create index bloques_user_curso_orden_idx on public.bloques (user_id, curso_id, orden);

create table public.avisos_estado (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  aviso_id text not null references public.avisos_curso (id) on delete cascade,
  hecho boolean not null default false,
  primary key (user_id, aviso_id)
);

create table public.avisos_manuales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  curso_id text references public.cursos (id) on delete set null,
  titulo text not null,
  fecha date not null,
  hecho boolean not null default false,
  created_at timestamptz not null default now()
);
create index avisos_manuales_user_fecha_idx on public.avisos_manuales (user_id, fecha);

create table public.archivos_manuales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  curso_id text not null references public.cursos (id) on delete cascade,
  nombre text not null,
  url text not null,
  created_at timestamptz not null default now()
);
create index archivos_manuales_user_curso_idx on public.archivos_manuales (user_id, curso_id);

-- ---------------------------------------------------------------------------
-- MÉTRICAS Y SYNC (solo servidor)
-- ---------------------------------------------------------------------------

-- usuario_hash = sha256(clave || user_id): identifica sin identificar. Sin contenido.
create table public.eventos (
  id bigserial primary key,
  ts timestamptz not null default now(),
  usuario_hash text,
  evento text not null,
  datos jsonb not null default '{}'::jsonb
);
create index eventos_ts_idx on public.eventos (ts desc);

create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  corrida_at timestamptz not null default now(),
  origen text not null default 'boton' check (origen in ('login', 'boton', 'cron')),
  resultado text not null default 'ok',
  detalle text not null default ''
);
create index sync_log_corrida_idx on public.sync_log (corrida_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.cursos enable row level security;
alter table public.archivo_refs enable row level security;
alter table public.avisos_curso enable row level security;
alter table public.perfiles enable row level security;
alter table public.credenciales enable row level security;
alter table public.inscripciones enable row level security;
alter table public.horarios enable row level security;
alter table public.materias_extra enable row level security;
alter table public.bloques enable row level security;
alter table public.avisos_estado enable row level security;
alter table public.avisos_manuales enable row level security;
alter table public.archivos_manuales enable row level security;
alter table public.eventos enable row level security;
alter table public.sync_log enable row level security;

-- Compartido: se LEE solo estando inscripto; lo escribe únicamente el service role.
create policy cursos_select on public.cursos for select to authenticated
  using (exists (
    select 1 from public.inscripciones i
    where i.curso_id = cursos.id and i.user_id = (select auth.uid())
  ));

-- Un aviso de curso se ve estando inscripto; los generales (curso_id null) los ve
-- cualquiera con sesión: son eventos del calendario institucional, sin contenido personal.
create policy avisos_curso_select on public.avisos_curso for select to authenticated
  using (
    curso_id is null or exists (
      select 1 from public.inscripciones i
      where i.curso_id = avisos_curso.curso_id and i.user_id = (select auth.uid())
    )
  );

create policy inscripciones_select on public.inscripciones for select to authenticated
  using (user_id = (select auth.uid()));

-- Perfil: cada uno ve y edita SOLO el suyo. El alta la hace el servidor (sin policy de insert).
create policy perfiles_select on public.perfiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy perfiles_update on public.perfiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- credenciales, eventos, archivo_refs, sync_log: SIN policies — solo service role.

-- Personales: dueño para todo.
create policy horarios_todo on public.horarios for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy materias_extra_todo on public.materias_extra for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy bloques_todo on public.bloques for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy avisos_estado_todo on public.avisos_estado for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy avisos_manuales_todo on public.avisos_manuales for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy archivos_manuales_todo on public.archivos_manuales for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Las tablas solo-servidor no deben ser tocables por los roles del Data API ni
-- siquiera si un día alguien les crea una policy de más:
revoke all on public.credenciales from anon, authenticated;
revoke all on public.eventos from anon, authenticated;
revoke all on public.archivo_refs from anon, authenticated;
revoke all on public.sync_log from anon, authenticated;
revoke usage, select on sequence public.eventos_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: editar profe/aula/color + horarios de una materia en una transacción.
-- security invoker: corre como el usuario, RLS aplica.
-- ---------------------------------------------------------------------------

create or replace function public.editar_materia(
  p_curso_id text,
  p_profe text,
  p_aula text,
  p_color text,
  p_horarios jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  h jsonb;
begin
  if not exists (
    select 1 from public.inscripciones
    where curso_id = p_curso_id and user_id = (select auth.uid())
  ) then
    raise exception 'no inscripto' using errcode = 'P0002';
  end if;

  insert into public.materias_extra (curso_id, profe, aula, color)
  values (p_curso_id, p_profe, p_aula, p_color)
  on conflict (user_id, curso_id)
  do update set profe = excluded.profe, aula = excluded.aula, color = excluded.color;

  delete from public.horarios
  where curso_id = p_curso_id and user_id = (select auth.uid());

  for h in select * from jsonb_array_elements(p_horarios) loop
    insert into public.horarios (curso_id, dia, inicio, fin)
    values (p_curso_id, (h ->> 'dia')::smallint, (h ->> 'inicio')::time, (h ->> 'fin')::time);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- STORAGE: avatares. Lectura pública (la URL lleva un uuid), escritura solo
-- del dueño sobre su propio archivo ("{user_id}.{ext}").
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('avatares', 'avatares', true)
on conflict (id) do nothing;

create policy avatares_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and split_part(name, '.', 1) = (select auth.uid())::text);
create policy avatares_update on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and split_part(name, '.', 1) = (select auth.uid())::text)
  with check (bucket_id = 'avatares' and split_part(name, '.', 1) = (select auth.uid())::text);
create policy avatares_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and split_part(name, '.', 1) = (select auth.uid())::text);
