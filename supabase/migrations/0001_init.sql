-- Fase 1 — Mi Cursada: schema inicial.
-- App personal (un solo usuario). Todas las tablas llevan user_id con RLS
-- para que cada fila pertenezca al usuario autenticado.

-- ---------------------------------------------------------------------------
-- perfil — una fila por usuario
-- ---------------------------------------------------------------------------
create table public.perfil (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() unique references auth.users (id) on delete cascade,
  nombre text not null,
  instituto text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- materias
-- ---------------------------------------------------------------------------
create table public.materias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null,
  profe text not null default '',
  aula text not null default '',
  -- uno de los 6 colores del handoff (riel/dot, nunca fondo)
  color text not null default '#38bdf8'
    check (color in ('#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#f97316', '#e2e8f0')),
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now()
);

create index materias_user_id_idx on public.materias (user_id);
-- upsert del scraper: unique parcial por usuario + id externo
create unique index materias_user_external_uidx
  on public.materias (user_id, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- horarios — 1=Lunes … 6=Sábado (domingo no se cursa)
-- ---------------------------------------------------------------------------
create table public.horarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  materia_id uuid not null references public.materias (id) on delete cascade,
  dia smallint not null check (dia between 1 and 6),
  inicio time not null,
  fin time not null
);

create index horarios_materia_id_idx on public.horarios (materia_id);

-- ---------------------------------------------------------------------------
-- bloques — notas estilo Notion (orden con huecos de 1000 para reordenar)
-- ---------------------------------------------------------------------------
create table public.bloques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  materia_id uuid not null references public.materias (id) on delete cascade,
  tipo text not null check (tipo in ('texto', 'titulo', 'tarea', 'link', 'divisor')),
  texto text not null default '',
  url text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'proceso', 'listo')),
  hecho boolean not null default false,
  orden int not null,
  created_at timestamptz not null default now()
);

create index bloques_materia_orden_idx on public.bloques (materia_id, orden);

-- ---------------------------------------------------------------------------
-- archivos
-- ---------------------------------------------------------------------------
create table public.archivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  materia_id uuid not null references public.materias (id) on delete cascade,
  nombre text not null,
  url text not null,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now()
);

create index archivos_materia_id_idx on public.archivos (materia_id);
create unique index archivos_user_external_uidx
  on public.archivos (user_id, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- avisos — materia_id nullable ("General"); al borrar la materia queda general
-- ---------------------------------------------------------------------------
create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  materia_id uuid references public.materias (id) on delete set null,
  titulo text not null,
  fecha date not null,
  hecho boolean not null default false,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now()
);

create index avisos_user_fecha_idx on public.avisos (user_id, fecha);
create unique index avisos_user_external_uidx
  on public.avisos (user_id, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- sync_log — corridas del scraper del aula virtual
-- ---------------------------------------------------------------------------
create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  corrida_at timestamptz not null default now(),
  resultado text not null default 'ok',
  detalle text not null default ''
);

create index sync_log_user_corrida_idx on public.sync_log (user_id, corrida_at desc);

-- ---------------------------------------------------------------------------
-- RLS: cada usuario ve/toca solo lo suyo
-- ---------------------------------------------------------------------------
alter table public.perfil enable row level security;
alter table public.materias enable row level security;
alter table public.horarios enable row level security;
alter table public.bloques enable row level security;
alter table public.archivos enable row level security;
alter table public.avisos enable row level security;
alter table public.sync_log enable row level security;

-- perfil
create policy "perfil select propio" on public.perfil
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "perfil insert propio" on public.perfil
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "perfil update propio" on public.perfil
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "perfil delete propio" on public.perfil
  for delete to authenticated using ((select auth.uid()) = user_id);

-- materias
create policy "materias select propio" on public.materias
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "materias insert propio" on public.materias
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "materias update propio" on public.materias
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "materias delete propio" on public.materias
  for delete to authenticated using ((select auth.uid()) = user_id);

-- horarios
create policy "horarios select propio" on public.horarios
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "horarios insert propio" on public.horarios
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "horarios update propio" on public.horarios
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "horarios delete propio" on public.horarios
  for delete to authenticated using ((select auth.uid()) = user_id);

-- bloques
create policy "bloques select propio" on public.bloques
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "bloques insert propio" on public.bloques
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "bloques update propio" on public.bloques
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "bloques delete propio" on public.bloques
  for delete to authenticated using ((select auth.uid()) = user_id);

-- archivos
create policy "archivos select propio" on public.archivos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "archivos insert propio" on public.archivos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "archivos update propio" on public.archivos
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "archivos delete propio" on public.archivos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- avisos
create policy "avisos select propio" on public.avisos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "avisos insert propio" on public.avisos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "avisos update propio" on public.avisos
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "avisos delete propio" on public.avisos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- sync_log
create policy "sync_log select propio" on public.sync_log
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "sync_log insert propio" on public.sync_log
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sync_log update propio" on public.sync_log
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sync_log delete propio" on public.sync_log
  for delete to authenticated using ((select auth.uid()) = user_id);
