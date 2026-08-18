# Multiusuario en Vercel + Supabase — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Mi Cursada sea multiusuario (login Moodle → sesión Supabase con RLS real), con contenido de cursos compartido, tokens cifrados, consentimiento, borrado de cuenta, sync compartido con cron, y quede desplegada en Vercel. El panel `/admin` es un plan aparte (el spec lo cubre; se implementa después).

**Architecture:** El login sigue siendo el del aula virtual; al validar contra Moodle se crea/encuentra un usuario sombra en Supabase Auth y se acuña una sesión del lado del servidor (`generateLink` + `verifyOtp`), con lo cual `auth.uid()` y RLS funcionan en cada query. El contenido del aula vive compartido en `cursos` (jsonb) + `avisos_curso`; lo personal (horarios, notas, estados, extras) vive en tablas por usuario con RLS `auth.uid()`. El modo local con `datos/` sigue como fallback de desarrollo sin `.env.local`.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, `@supabase/supabase-js` + `@supabase/ssr`, zod, vitest, Vercel Hobby, Supabase Free (proyecto `bhjachrwvujqfkgrscei`).

**Spec:** `docs/superpowers/specs/2026-08-18-vercel-supabase-multiusuario-design.md`

## Global Constraints

- Copy en español rioplatense **con voseo**; textos existentes NO se parafrasean.
- Timezone fija `America/Argentina/Buenos_Aires` vía `date-fns-tz`; días 1=Lunes…6=Sábado.
- **Ni la contraseña ni el token de Moodle vuelven al cliente ni van a un log** (usar `sanitizar()` de `lib/moodle/cliente` al loguear errores).
- **Toda Server Action y todo route handler chequean acceso por su cuenta** (`hayAcceso()` / `usuarioActual()`).
- `SUPABASE_SERVICE_ROLE_KEY` solo en servidor: jamás con prefijo `NEXT_PUBLIC_`, jamás importada desde un client component.
- Policies RLS: `TO authenticated`, `(select auth.uid())` (no `auth.uid()` pelado), UPDATE siempre con `USING` **y** `WITH CHECK`.
- Server Components por defecto; mutaciones por Server Actions; sin librerías de estado global.
- El modo local (`datos/`, sin `.env.local`) tiene que seguir funcionando: cada módulo que se migre conserva la rama local existente.
- Tests con vitest (`npm test`); typecheck con `npm run typecheck`. Commit al final de cada tarea.
- Variables de entorno nuevas: `SUPABASE_SERVICE_ROLE_KEY`, `CURSADA_TOKEN_KEY` (32 bytes en base64), `CURSADA_ADMIN_ID`, `CRON_SECRET`.

---

### Task 1: Cifrado AES-256-GCM para los tokens

**Files:**
- Create: `lib/cifrado.ts`
- Test: `lib/cifrado.test.ts`

**Interfaces:**
- Produces: `cifrar(texto: string): { cifrado: Buffer; nonce: Buffer }`, `descifrar(cifrado: Buffer, nonce: Buffer): string`, `hashUsuario(userId: string): string`. Las tres leen `CURSADA_TOKEN_KEY` (base64, 32 bytes) del entorno y tiran `Error` si falta o mide mal.

- [ ] **Step 1: Escribir los tests que fallan** (`lib/cifrado.test.ts`)

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { cifrar, descifrar, hashUsuario } from '@/lib/cifrado';

describe('cifrado', () => {
  beforeEach(() => {
    process.env.CURSADA_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('descifrar(cifrar(x)) === x', () => {
    const { cifrado, nonce } = cifrar('token-secreto-123');
    expect(descifrar(cifrado, nonce)).toBe('token-secreto-123');
  });

  it('cada cifrado usa un nonce distinto', () => {
    const a = cifrar('igual');
    const b = cifrar('igual');
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.cifrado.equals(b.cifrado)).toBe(false);
  });

  it('un cifrado manoseado no descifra (GCM autentica)', () => {
    const { cifrado, nonce } = cifrar('token');
    cifrado[0] ^= 0xff;
    expect(() => descifrar(cifrado, nonce)).toThrow();
  });

  it('sin clave en el entorno, tira un error claro', () => {
    delete process.env.CURSADA_TOKEN_KEY;
    expect(() => cifrar('x')).toThrow(/CURSADA_TOKEN_KEY/);
  });

  it('hashUsuario es determinístico y no contiene el id', () => {
    const h = hashUsuario('abc-123');
    expect(h).toBe(hashUsuario('abc-123'));
    expect(h).not.toContain('abc-123');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npm test -- lib/cifrado.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** (`lib/cifrado.ts`)

```ts
// Cifrado de los tokens del aula virtual — SOLO SERVIDOR.
// AES-256-GCM con nonce de 12 bytes por registro. La clave vive en
// CURSADA_TOKEN_KEY (base64, 32 bytes): un dump de la base se lleva ruido.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function clave(): Buffer {
  const crudo = process.env.CURSADA_TOKEN_KEY;
  if (!crudo) throw new Error('Falta CURSADA_TOKEN_KEY en el entorno.');
  const k = Buffer.from(crudo, 'base64');
  if (k.length !== 32) throw new Error('CURSADA_TOKEN_KEY tiene que ser 32 bytes en base64.');
  return k;
}

/** Cifra un texto. El tag GCM (16 bytes) va pegado al final del cifrado. */
export function cifrar(texto: string): { cifrado: Buffer; nonce: Buffer } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', clave(), nonce);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { cifrado, nonce };
}

export function descifrar(cifrado: Buffer, nonce: Buffer): string {
  const tag = cifrado.subarray(cifrado.length - 16);
  const cuerpo = cifrado.subarray(0, cifrado.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', clave(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(cuerpo), decipher.final()]).toString('utf8');
}

/** Hash para el log de eventos: identifica sin identificar (la sal es la clave). */
export function hashUsuario(userId: string): string {
  return createHash('sha256').update(clave()).update(userId).digest('hex');
}
```

- [ ] **Step 4: Correr y ver que pasa** — `npm test -- lib/cifrado.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add lib/cifrado.ts lib/cifrado.test.ts && git commit -m "feat: cifrado AES-256-GCM para tokens del aula virtual"`

---

### Task 2: Cliente admin de Supabase (service role)

**Files:**
- Create: `lib/supabase/admin.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `adminClient(): SupabaseClient` (service role, sin cookies, sin sesión persistida) y `adminConfigurado(): boolean`. SOLO SERVIDOR.

- [ ] **Step 1: Implementar** (`lib/supabase/admin.ts`)

```ts
// Cliente de Supabase con la SERVICE ROLE KEY — SOLO SERVIDOR, y solo para lo
// que el usuario no puede hacer por sí mismo: alta del usuario sombra, leer y
// escribir `credenciales`, el sync compartido (escribe `cursos`), `eventos` y
// el borrado de cuenta. NUNCA importar desde un client component ni exponer la
// clave con NEXT_PUBLIC_. Para todo lo demás va el cliente de server.ts, que
// respeta RLS.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function adminConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function adminClient(): SupabaseClient {
  if (!adminConfigurado()) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

- [ ] **Step 2: Actualizar `.env.example`**

```bash
# Copiá este archivo a .env.local y completá los valores de tu proyecto de Supabase.
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Solo servidor — NUNCA con prefijo NEXT_PUBLIC_:
# SUPABASE_SERVICE_ROLE_KEY=
# 32 bytes en base64 (openssl rand -base64 32) — cifra los tokens del aula virtual:
# CURSADA_TOKEN_KEY=
# Tu id de Moodle (userid del site info) — habilita /admin más adelante:
# CURSADA_ADMIN_ID=
# Protege el endpoint del cron de sync:
# CRON_SECRET=
```

- [ ] **Step 3: `npm run typecheck`** → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat: cliente admin de Supabase (service role)"`

---

### Task 3: Migración nueva — esquema compartido + RLS + storage

**Files:**
- Delete: `supabase/migrations/0001_init.sql`, `0002_rpc_materia.sql`, `0003_storage.sql`, `0004_editar_materia.sql` (el proyecto remoto está vacío: no hay datos que migrar, arranca limpio)
- Create: `supabase/migrations/0001_multiusuario.sql`

**Interfaces:**
- Produces: las tablas y policies que consumen las Tasks 4–17: `cursos`, `archivo_refs`, `avisos_curso`, `perfiles`, `credenciales`, `inscripciones`, `horarios`, `materias_extra`, `bloques`, `avisos_estado`, `avisos_manuales`, `archivos_manuales`, `eventos`, `sync_log`, RPC `editar_materia`, bucket `avatares`.

- [ ] **Step 1: Borrar las migraciones viejas** — `git rm supabase/migrations/000*.sql`

- [ ] **Step 2: Escribir `supabase/migrations/0001_multiusuario.sql`**

```sql
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
```

- [ ] **Step 3: Aplicar al proyecto remoto.** Requiere autenticarse una vez: pedirle al usuario que corra `! supabase login` (o exporte `SUPABASE_ACCESS_TOKEN`). Después:

```bash
supabase link --project-ref bhjachrwvujqfkgrscei
supabase db push
```

Si la CLI no está instalada: `brew install supabase/tap/supabase`. Alternativa: MCP de Supabase (`execute_sql`) si la sesión corre dentro del repo con el MCP autenticado.

- [ ] **Step 4: Verificar** — correr contra el proyecto (via `supabase db query` o MCP): `select tablename from pg_tables where schemaname = 'public' order by 1;` → deben aparecer las 14 tablas. Y `select count(*) from pg_policies where schemaname = 'public';` → 12 policies (más las 3 de storage en `storage.objects`).

- [ ] **Step 5: Correr los advisors** — `supabase db advisors` (o MCP `get_advisors`); corregir lo que marque de seguridad.

- [ ] **Step 6: Commit** — `git add -A supabase && git commit -m "feat: esquema multiusuario compartido con RLS"`

---

### Task 4: Puente Moodle → Supabase Auth

**Files:**
- Create: `lib/supabase/puente.ts`
- Test: `lib/supabase/puente.test.ts`

**Interfaces:**
- Consumes: `adminClient()` (Task 2), `createClient()` de `lib/supabase/server.ts`.
- Produces: `emailSombra(moodleId: number): string`; `asegurarUsuarioSombra(moodleId: number, nombre: string): Promise<string>` (devuelve el `user_id` uuid, creando el usuario de Auth y la fila de `perfiles` si no existen); `acunarSesion(userId: string): Promise<void>` (deja las cookies de sesión de Supabase puestas — solo desde una Server Action).

- [ ] **Step 1: Test de la parte pura** (`lib/supabase/puente.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { emailSombra } from '@/lib/supabase/puente';

describe('emailSombra', () => {
  it('deriva un email sintético estable del id de Moodle', () => {
    expect(emailSombra(10747)).toBe('moodle-10747@micursada.local');
  });
  it('rechaza ids no positivos', () => {
    expect(() => emailSombra(0)).toThrow();
    expect(() => emailSombra(-1)).toThrow();
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npm test -- lib/supabase/puente.test.ts` → FAIL.

- [ ] **Step 3: Implementar** (`lib/supabase/puente.ts`)

```ts
// Puente entre el login del aula virtual y Supabase Auth — SOLO SERVIDOR.
//
// Nadie tiene contraseña de Supabase: cada cuenta de Moodle tiene un "usuario
// sombra" con email sintético, y la sesión se acuña del lado del servidor con
// generateLink(magiclink) + verifyOtp(token_hash). Con la sesión puesta,
// auth.uid() funciona y las policies de RLS aplican en cada query.

import { adminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** Email sintético del usuario sombra. El dominio .local no rutea a ningún lado. */
export function emailSombra(moodleId: number): string {
  if (!Number.isInteger(moodleId) || moodleId <= 0) {
    throw new Error('moodleId inválido para el usuario sombra.');
  }
  return `moodle-${moodleId}@micursada.local`;
}

/**
 * Devuelve el user_id del usuario sombra para ese id de Moodle, creándolo si
 * es la primera vez (fila en auth.users + fila en perfiles). El mapeo vive en
 * perfiles.moodle_id (unique).
 */
export async function asegurarUsuarioSombra(moodleId: number, nombre: string): Promise<string> {
  const admin = adminClient();

  const { data: perfil, error: ePerfil } = await admin
    .from('perfiles')
    .select('user_id')
    .eq('moodle_id', moodleId)
    .maybeSingle();
  if (ePerfil) throw ePerfil;
  if (perfil) return perfil.user_id as string;

  const { data: creado, error: eUser } = await admin.auth.admin.createUser({
    email: emailSombra(moodleId),
    email_confirm: true,
    app_metadata: { moodle_id: moodleId },
  });
  if (eUser || !creado.user) throw eUser ?? new Error('createUser no devolvió usuario.');

  const { error: eInsert } = await admin
    .from('perfiles')
    .insert({ user_id: creado.user.id, moodle_id: moodleId, nombre });
  if (eInsert) throw eInsert;

  return creado.user.id;
}

/**
 * Acuña la sesión de Supabase para ese usuario y deja las cookies puestas.
 * generateLink NO manda ningún email: solo genera el token, que verificamos
 * acá mismo. Llamar únicamente desde una Server Action o Route Handler.
 */
export async function acunarSesion(userId: string): Promise<void> {
  const admin = adminClient();
  const { data: u, error: eGet } = await admin.auth.admin.getUserById(userId);
  if (eGet || !u.user?.email) throw eGet ?? new Error('usuario sombra sin email.');

  const { data: link, error: eLink } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: u.user.email,
  });
  if (eLink || !link.properties?.hashed_token) {
    throw eLink ?? new Error('generateLink no devolvió token.');
  }

  const supabase = await createClient();
  const { error: eOtp } = await supabase.auth.verifyOtp({
    type: 'email',
    token_hash: link.properties.hashed_token,
  });
  if (eOtp) throw eOtp;
}
```

- [ ] **Step 4: Correr tests + typecheck** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: puente de login Moodle → Supabase Auth (usuario sombra + sesión acuñada)"`

---

### Task 5: Sesión dual — Supabase con fallback local

**Files:**
- Modify: `lib/sesion-actual.ts`

**Interfaces:**
- Consumes: `supabaseConfigurado()`, `createClient()` (server), módulo local `lib/sesion.ts` (queda intacto para el modo local).
- Produces: se agregan `usuarioActual(): Promise<{ userId: string; moodleId: number } | null>` y se mantienen los contratos existentes `sesionActual()`, `hayAcceso()`, `exigirSesion()`, `abrirSesion(nombre?)` (solo modo local), `cerrarSesionActual()`. Todo el resto del código sigue llamando `hayAcceso()`/`exigirSesion()` sin cambios.

- [ ] **Step 1: Reescribir `lib/sesion-actual.ts`**

```ts
// La sesión del request actual — SOLO SERVIDOR.
//
// Dos modos:
//  - Con Supabase configurado: la sesión ES la de Supabase (cookies de
//    @supabase/ssr, puestas por el puente en el login). auth.uid() → RLS real.
//  - Sin configurar (dev local con datos/): la cookie propia de siempre,
//    validada contra datos/sesiones.json (lib/sesion.ts).

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  COOKIE_SESION,
  DIAS_SESION,
  type Sesion,
  borrarSesion,
  crearSesion,
  validarSesion,
} from '@/lib/sesion';
import { supabaseConfigurado } from '@/lib/supabase/configurado';
import { createClient } from '@/lib/supabase/server';

async function porHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? '';
  return proto.split(',')[0]?.trim() === 'https';
}

/** Usuario de la sesión de Supabase, o null. Solo en modo Supabase. */
export async function usuarioActual(): Promise<{ userId: string; moodleId: number } | null> {
  if (!supabaseConfigurado()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const moodleId = Number((user.app_metadata as Record<string, unknown>)?.moodle_id);
  if (!Number.isInteger(moodleId) || moodleId <= 0) return null;
  return { userId: user.id, moodleId };
}

/** Sesión válida de este request, o null si no hay (modo local). */
export async function sesionActual(): Promise<Sesion | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  return validarSesion(token);
}

/** ¿Este request puede ver los datos? Sesión de Supabase o cookie local, según el modo. */
export async function hayAcceso(): Promise<boolean> {
  if (supabaseConfigurado()) return (await usuarioActual()) !== null;
  return (await sesionActual()) !== null;
}

/** Corta el render y manda a /login si no hay sesión. Para layouts y páginas. */
export async function exigirSesion(): Promise<void> {
  if (!(await hayAcceso())) redirect('/login');
}

/** Abre la sesión LOCAL y deja la cookie. En modo Supabase la sesión la acuña el puente. */
export async function abrirSesion(nombre?: string): Promise<void> {
  const token = await crearSesion(nombre);
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DIAS_SESION * 24 * 60 * 60,
    secure: await porHttps(),
  });
}

/** Cierra la sesión de este dispositivo, en el modo que corresponda. */
export async function cerrarSesionActual(): Promise<void> {
  if (supabaseConfigurado()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return;
  }
  const store = await cookies();
  await borrarSesion(store.get(COOKIE_SESION)?.value);
  store.delete(COOKIE_SESION);
}
```

- [ ] **Step 2: `npm test && npm run typecheck`** → PASS (los tests de `lib/sesion.test.ts` no tocan este módulo).
- [ ] **Step 3: Commit** — `git commit -m "feat: sesión dual — Supabase con fallback a la cookie local"`

---

### Task 6: Login multiusuario

**Files:**
- Modify: `app/actions-sesion.ts` (función `iniciarSesion`)
- Create: `lib/moodle/credenciales-db.ts`
- Test: `lib/moodle/credenciales-db.test.ts` (solo la parte pura de encode/decode de bytea)

**Interfaces:**
- Consumes: `asegurarUsuarioSombra`, `acunarSesion` (Task 4), `cifrar`/`descifrar` (Task 1), `adminClient` (Task 2), tipo `Credencial` de `lib/moodle/credenciales.ts`.
- Produces: `leerCredencialDb(userId: string): Promise<Credencial | null>`, `guardarCredencialDb(userId: string, cred: Credencial): Promise<void>`, `olvidarCredencialDb(userId: string): Promise<void>`, `bytesAHex(b: Buffer): string`, `hexABytes(h: string): Buffer`. `iniciarSesion` conserva su firma `(usuario, password) → ResultadoLogin`.

- [ ] **Step 1: Tests del encode bytea** (`lib/moodle/credenciales-db.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { bytesAHex, hexABytes } from '@/lib/moodle/credenciales-db';

describe('bytea por PostgREST', () => {
  it('ida y vuelta', () => {
    const b = Buffer.from([0, 1, 254, 255]);
    expect(hexABytes(bytesAHex(b)).equals(b)).toBe(true);
  });
  it('el formato es \\x + hex (lo que espera Postgres)', () => {
    expect(bytesAHex(Buffer.from([0xde, 0xad]))).toBe('\\xdead');
  });
});
```

- [ ] **Step 2: Correr y ver que falla.**

- [ ] **Step 3: Implementar `lib/moodle/credenciales-db.ts`**

```ts
// Credenciales del aula virtual EN LA BASE (modo Supabase, multiusuario) —
// SOLO SERVIDOR. El token viaja y se guarda cifrado (lib/cifrado.ts); esta es
// la única puerta que lo descifra. Igual que en credenciales.ts: el token
// NUNCA sale hacia el cliente. Siempre via adminClient: la tabla credenciales
// no tiene policies a propósito.

import { cifrar, descifrar } from '@/lib/cifrado';
import { type Credencial, URL_MOODLE_DEFAULT } from '@/lib/moodle/credenciales';
import { adminClient } from '@/lib/supabase/admin';

/** Postgres espera bytea como '\x<hex>'; PostgREST lo devuelve igual. */
export const bytesAHex = (b: Buffer): string => `\\x${b.toString('hex')}`;
export const hexABytes = (h: string): Buffer => Buffer.from(h.replace(/^\\x/, ''), 'hex');

type Meta = Omit<Credencial, 'token'>;

export async function leerCredencialDb(userId: string): Promise<Credencial | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('credenciales')
    .select('token_cifrado, nonce, meta')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const token = descifrar(hexABytes(data.token_cifrado as string), hexABytes(data.nonce as string));
  const meta = data.meta as Meta;
  return { ...meta, url: meta.url ?? URL_MOODLE_DEFAULT, token };
}

export async function guardarCredencialDb(userId: string, cred: Credencial): Promise<void> {
  const { token, ...meta } = cred;
  const { cifrado, nonce } = cifrar(token);
  const admin = adminClient();
  const { error } = await admin.from('credenciales').upsert({
    user_id: userId,
    token_cifrado: bytesAHex(cifrado),
    nonce: bytesAHex(nonce),
    meta,
    actualizado: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function olvidarCredencialDb(userId: string): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from('credenciales').delete().eq('user_id', userId);
  if (error) throw error;
}
```

- [ ] **Step 4: Reescribir `iniciarSesion` en `app/actions-sesion.ts`.** La rama local queda como está hoy; con Supabase configurado el flujo es: token → site info → allowlist → sombra → sesión → credencial cifrada → perfil. **Desaparece el candado de "un solo dueño"** en modo Supabase (el error `ERROR_OTRA_CUENTA` queda solo para el modo local). Reemplazar el cuerpo desde el chequeo de `permitidos` (inclusive) hasta el `return { ok: true … }` por:

```ts
  const permitidos = usuariosPermitidos();
  if (permitidos && !permitidos.includes(site.username.toLowerCase())) {
    return { ok: false, error: ERROR_NO_HABILITADO };
  }

  if (supabaseConfigurado()) {
    try {
      const userId = await asegurarUsuarioSombra(site.userid, site.fullname);
      await acunarSesion(userId);
      await guardarCredencialDb(userId, {
        ...cred,
        userid: site.userid,
        usuario: site.username,
        ultimaVerificacion: { ok: true, cuando: new Date().toISOString(), nombre: site.fullname },
      });
      const admin = adminClient();
      const { error: ePerfil } = await admin
        .from('perfiles')
        .update({
          instituto: site.sitename.trim(),
          ultima_visita: new Date().toISOString(),
        })
        .eq('user_id', userId);
      if (ePerfil) loguear('iniciarSesion (perfil)', ePerfil);
      await registrarEvento('sesion_iniciada', userId);
    } catch (e) {
      loguear('iniciarSesion (supabase)', e);
      return { ok: false, error: ERROR_GENERICO };
    }
    return { ok: true, nombre: site.fullname };
  }

  // ——— Modo local (sin .env.local): el flujo de siempre, un solo dueño. ———
  if ((await hayArchivoCredenciales()) && previa !== null && previa.userid !== site.userid) {
    return { ok: false, error: ERROR_OTRA_CUENTA };
  }
  // …(el resto del cuerpo actual queda igual: guardarCredenciales, perfil local, abrirSesion)…
```

Imports nuevos arriba del archivo: `supabaseConfigurado`, `asegurarUsuarioSombra`, `acunarSesion`, `guardarCredencialDb`, `adminClient`, `registrarEvento` (se crea en el Step 5 de esta misma task).

- [ ] **Step 5: Crear `lib/eventos.ts`** (el módulo completo — lo consumen también sync, consentimiento y borrado):

```ts
// Log de eventos para métricas — SOLO SERVIDOR. Guarda el hash del usuario,
// nunca contenido. Nunca rompe el flujo que lo llama.
import { hashUsuario } from '@/lib/cifrado';
import { adminClient, adminConfigurado } from '@/lib/supabase/admin';

export async function registrarEvento(
  evento: string,
  userId?: string,
  datos: Record<string, unknown> = {}
): Promise<void> {
  if (!adminConfigurado()) return;
  try {
    const admin = adminClient();
    await admin.from('eventos').insert({
      evento,
      usuario_hash: userId ? hashUsuario(userId) : null,
      datos,
    });
  } catch (e) {
    console.error('registrarEvento:', e instanceof Error ? e.message : e); // nunca rompe el flujo
  }
}
```

- [ ] **Step 6: `npm test && npm run typecheck`** → PASS.
- [ ] **Step 7: Smoke real** — crear `.env.local` con URL/anon key/service role/`CURSADA_TOKEN_KEY` del proyecto real, levantar `npm run dev`, entrar por el navegador con las credenciales del aula virtual del usuario y verificar: (a) entra a la app, (b) en Supabase aparecen la fila de `perfiles` y la de `credenciales`, (c) `select evento from eventos` muestra `sesion_iniciada`. **Este smoke valida el riesgo principal del spec — si el puente falla acá, frenar y resolver antes de seguir.**
- [ ] **Step 8: Commit** — `git commit -m "feat: login multiusuario — usuario sombra, sesión Supabase y credencial cifrada"`

---

### Task 7: Panel del aula virtual multiusuario (estadoToken / generarToken / olvidarToken)

**Files:**
- Modify: `app/actions-moodle.ts`

**Interfaces:**
- Consumes: `usuarioActual()` (Task 5), `leerCredencialDb`/`guardarCredencialDb`/`olvidarCredencialDb` (Task 6).
- Produces: las mismas firmas públicas de hoy (`estadoToken`, `generarToken`, `olvidarToken`, `sincronizarAhora` — esta última se reescribe en Task 10).

- [ ] **Step 1: Agregar un helper al principio de `app/actions-moodle.ts`**

```ts
/** Credencial del usuario del request: de la base (multiusuario) o del archivo (local). */
async function credencialDelUsuario(): Promise<Credencial | null> {
  if (supabaseConfigurado()) {
    const u = await usuarioActual();
    if (!u) return null;
    return leerCredencialDb(u.userId);
  }
  return leerCredenciales();
}
```

- [ ] **Step 2: Reemplazar cada `leerCredenciales()` de `estadoToken` y `generarToken` por `credencialDelUsuario()`.** En `generarToken`, el guardado (`guardarCredenciales(...)`) pasa a ser dual: con Supabase, `guardarCredencialDb(u.userId, cred)`; sin, el actual. Ídem `guardarVerificacion`: con Supabase se actualiza `meta.ultimaVerificacion` releyendo + reescribiendo con `guardarCredencialDb`; extraer helper `guardarVerificacionDual(v: Verificacion)` dentro del archivo. En `olvidarToken`, la rama Supabase llama `olvidarCredencialDb(u.userId)`.
- [ ] **Step 3: `npm test && npm run typecheck`** → PASS. Smoke en dev: abrir el panel del aula virtual, "Verificar token" debe andar.
- [ ] **Step 4: Commit** — `git commit -m "feat: credenciales del aula virtual por usuario"`

---

### Task 8: Queries sobre el esquema compartido

**Files:**
- Modify: `lib/queries.ts` (reescritura de la parte Supabase; la rama local queda)
- Create: `lib/armar-materias.ts`
- Test: `lib/armar-materias.test.ts`

**Interfaces:**
- Consumes: tablas de Task 3; tipos de `lib/types.ts` (sin cambios).
- Produces: `getMaterias()`, `getMateria(id)`, `getAvisos()`, `getPerfil()`, `getUltimaSync()` conservan firma y tipos de retorno. Nuevo módulo puro: `armarMaterias(cursos, extras, horarios, bloques, archivosManuales): Materia[]` y `armarAvisos(deCurso, estados, manuales): Aviso[]` en `lib/armar-materias.ts`. `getPerfil()` pasa a devolver también `carrera` → **ampliar `Perfil` en `lib/types.ts`**: `carrera: string | null` (la rama local devuelve `carrera: null`).

- [ ] **Step 1: Tests del armado puro** (`lib/armar-materias.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { armarAvisos, armarMaterias } from '@/lib/armar-materias';

const curso = {
  id: 'curso:2756',
  nombre: 'Fundamentos',
  datos: {
    nombre: 'Fundamentos',
    source: 'moodle',
    archivos: [{ id: 'mod:9', nombre: 'TP1.pdf', url: 'https://x/9' }],
    secciones: [],
  },
};

describe('armarMaterias', () => {
  it('mezcla curso compartido + overlays personales', () => {
    const materias = armarMaterias(
      [curso],
      [{ curso_id: 'curso:2756', profe: 'Vero', aula: '3B', color: '#a78bfa' }],
      [{ id: 'h1', curso_id: 'curso:2756', dia: 2, inicio: '18:10:00', fin: '21:30:00' }],
      [{ id: 'b1', curso_id: 'curso:2756', tipo: 'texto', texto: 'hola', url: '', estado: 'pendiente', hecho: false, orden: 1000, created_at: '2026-08-18T00:00:00Z' }],
      [{ id: 'a1', curso_id: 'curso:2756', nombre: 'Apunte', url: 'https://y' }]
    );
    expect(materias).toHaveLength(1);
    const m = materias[0];
    expect(m.id).toBe('curso:2756');
    expect(m.profe).toBe('Vero');
    expect(m.color).toBe('#a78bfa');
    expect(m.horarios[0]).toMatchObject({ dia: 2, inicio: '18:10', fin: '21:30' });
    expect(m.archivos.map((a) => a.id)).toEqual(['mod:9', 'a1']); // aula primero, manuales después
    expect(m.bloques[0].texto).toBe('hola');
  });

  it('sin overlay usa defaults', () => {
    const [m] = armarMaterias([curso], [], [], [], []);
    expect(m.profe).toBe('');
    expect(m.color).toBe('#38bdf8');
  });
});

describe('armarAvisos', () => {
  it('mezcla avisos del curso (con estado personal) y manuales, ordenado por fecha', () => {
    const avisos = armarAvisos(
      [{ id: 'assign:1', curso_id: 'curso:2756', titulo: 'TP', fecha: '2026-09-01' }],
      [{ aviso_id: 'assign:1', hecho: true }],
      [{ id: 'm1', curso_id: null, titulo: 'Comprar carpeta', fecha: '2026-08-20', hecho: false }]
    );
    expect(avisos.map((a) => a.id)).toEqual(['m1', 'assign:1']);
    expect(avisos[1].hecho).toBe(true);
    expect(avisos[0].materiaId).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver que falla.**

- [ ] **Step 3: Implementar `lib/armar-materias.ts`** (puro, sin red — tipos de fila exportados para queries.ts):

```ts
// Arma los tipos de dominio a partir de las filas del esquema compartido.
// Puro a propósito: se testea sin Supabase.

import type { Aviso, ColorMateria, Dia, EstadoBloque, Materia, TipoBloque } from '@/lib/types';

export type CursoRow = { id: string; nombre: string; datos: Record<string, unknown> };
export type ExtraRow = { curso_id: string; profe: string; aula: string; color: string };
export type HorarioRow = { id: string; curso_id: string; dia: number; inicio: string; fin: string };
export type BloqueRow = {
  id: string; curso_id: string; tipo: string; texto: string; url: string;
  estado: string; hecho: boolean; orden: number; created_at: string;
};
export type ArchivoManualRow = { id: string; curso_id: string; nombre: string; url: string };
export type AvisoCursoRow = { id: string; curso_id: string | null; titulo: string; fecha: string };
export type AvisoEstadoRow = { aviso_id: string; hecho: boolean };
export type AvisoManualRow = {
  id: string; curso_id: string | null; titulo: string; fecha: string; hecho: boolean;
};

const aHHMM = (t: string) => t.slice(0, 5);

export function armarMaterias(
  cursos: CursoRow[],
  extras: ExtraRow[],
  horarios: HorarioRow[],
  bloques: BloqueRow[],
  archivosManuales: ArchivoManualRow[]
): Materia[] {
  const porCurso = <T extends { curso_id: string }>(filas: T[]) => {
    const m = new Map<string, T[]>();
    for (const f of filas) {
      const lista = m.get(f.curso_id) ?? [];
      lista.push(f);
      m.set(f.curso_id, lista);
    }
    return m;
  };
  const ex = new Map(extras.map((e) => [e.curso_id, e]));
  const hs = porCurso(horarios);
  const bs = porCurso(bloques);
  const am = porCurso(archivosManuales);

  return cursos
    .map((c) => {
      const d = c.datos as {
        nombre?: string; source?: string; asistenciaUrl?: string; claseUrl?: string;
        secciones?: Materia['secciones'];
        archivos?: { id: string; nombre: string; url: string }[];
      };
      const e = ex.get(c.id);
      return {
        id: c.id,
        nombre: d.nombre ?? c.nombre,
        profe: e?.profe ?? '',
        aula: e?.aula ?? '',
        color: (e?.color ?? '#38bdf8') as ColorMateria,
        source: 'moodle' as const,
        ...(d.asistenciaUrl ? { asistenciaUrl: d.asistenciaUrl } : {}),
        ...(d.claseUrl ? { claseUrl: d.claseUrl } : {}),
        ...(d.secciones ? { secciones: d.secciones } : {}),
        horarios: (hs.get(c.id) ?? []).map((h) => ({
          id: h.id, materiaId: c.id, dia: h.dia as Dia,
          inicio: aHHMM(h.inicio), fin: aHHMM(h.fin),
        })),
        bloques: (bs.get(c.id) ?? [])
          .sort((a, b) => a.orden - b.orden)
          .map((b) => ({
            id: b.id, materiaId: c.id, tipo: b.tipo as TipoBloque, texto: b.texto,
            url: b.url, estado: b.estado as EstadoBloque, hecho: b.hecho,
            orden: b.orden, createdAt: b.created_at,
          })),
        archivos: [
          ...(d.archivos ?? []).map((a) => ({ ...a, materiaId: c.id })),
          ...(am.get(c.id) ?? []).map((a) => ({
            id: a.id, materiaId: c.id, nombre: a.nombre, url: a.url,
          })),
        ],
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function armarAvisos(
  deCurso: AvisoCursoRow[],
  estados: AvisoEstadoRow[],
  manuales: AvisoManualRow[]
): Aviso[] {
  const hecho = new Map(estados.map((e) => [e.aviso_id, e.hecho]));
  return [
    ...deCurso.map((a) => ({
      id: a.id, materiaId: a.curso_id, titulo: a.titulo,
      fecha: a.fecha, hecho: hecho.get(a.id) ?? false,
    })),
    ...manuales.map((a) => ({
      id: a.id, materiaId: a.curso_id, titulo: a.titulo, fecha: a.fecha, hecho: a.hecho,
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
}
```

- [ ] **Step 4: Correr los tests** → PASS.

- [ ] **Step 5: Reescribir la rama Supabase de `lib/queries.ts`.** Borrar los tipos de fila y mappers viejos (`MateriaRow`, `SELECT_MATERIA`, `mapMateria`, etc.) e importar los de `lib/armar-materias`. Las lecturas van en paralelo y RLS filtra solo:

```ts
export async function getMaterias(): Promise<Materia[]> {
  if (!conSupabase()) return (await getDatosLocales()).materias;
  const supabase = await createClient();
  const [cursos, extras, horarios, bloques, archivos] = await Promise.all([
    supabase.from('inscripciones').select('curso:cursos ( id, nombre, datos )'),
    supabase.from('materias_extra').select('curso_id, profe, aula, color'),
    supabase.from('horarios').select('id, curso_id, dia, inicio, fin'),
    supabase.from('bloques').select('id, curso_id, tipo, texto, url, estado, hecho, orden, created_at'),
    supabase.from('archivos_manuales').select('id, curso_id, nombre, url'),
  ]);
  const conError = [cursos, extras, horarios, bloques, archivos].find((r) => r.error);
  if (conError?.error) {
    console.error('getMaterias:', conError.error);
    throw conError.error;
  }
  const filasCursos = (cursos.data ?? [])
    .map((i) => (i as { curso: CursoRow | null }).curso)
    .filter((c): c is CursoRow => c !== null);
  return armarMaterias(
    filasCursos,
    (extras.data ?? []) as ExtraRow[],
    (horarios.data ?? []) as HorarioRow[],
    (bloques.data ?? []) as BloqueRow[],
    (archivos.data ?? []) as ArchivoManualRow[]
  );
}
```

`getMateria(id)`: igual pero cada select con `.eq('curso_id', id)` (y el de inscripciones con `.eq('curso_id', id)`), devolviendo `armarMaterias(...)[0] ?? null` (mantener el manejo de `decodeURIComponent` de la rama local, aplicándolo al `id` antes de las queries en ambas ramas).

`getAvisos()`:

```ts
export async function getAvisos(): Promise<Aviso[]> {
  if (!conSupabase()) return (await getDatosLocales()).avisos;
  const supabase = await createClient();
  const [deCurso, estados, manuales] = await Promise.all([
    supabase.from('avisos_curso').select('id, curso_id, titulo, fecha'),
    supabase.from('avisos_estado').select('aviso_id, hecho'),
    supabase.from('avisos_manuales').select('id, curso_id, titulo, fecha, hecho'),
  ]);
  const conError = [deCurso, estados, manuales].find((r) => r.error);
  if (conError?.error) {
    console.error('getAvisos:', conError.error);
    throw conError.error;
  }
  return armarAvisos(
    (deCurso.data ?? []) as AvisoCursoRow[],
    (estados.data ?? []) as AvisoEstadoRow[],
    (manuales.data ?? []) as AvisoManualRow[]
  );
}
```

`getPerfil()`: `from('perfiles').select('nombre, carrera, instituto, avatar_url').maybeSingle()` → `{ nombre, carrera, instituto, avatarUrl }`. Rama local: agregar `carrera: null` al objeto devuelto por `leerPerfilLocal()` (tocar `lib/datos-locales.ts:677` para incluirlo, y el tipo `Perfil` en `lib/types.ts`).

`getUltimaSync()`: igual que hoy pero `select('id, corrida_at, resultado, detalle')` sobre la tabla `sync_log` nueva **via `adminClient()`** (la tabla es solo-servidor); si `!adminConfigurado()`, devolver la rama local.

- [ ] **Step 6: `npm test && npm run typecheck`** → PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat: queries sobre el esquema compartido"`

---

### Task 9: Mutaciones sobre el esquema nuevo

**Files:**
- Modify: `app/actions.ts`

**Interfaces:**
- Consumes: RPC `editar_materia` (Task 3), tablas nuevas. `conUsuario()` ya existe y sigue igual.
- Produces: mismas firmas públicas de todas las actions. Cambios de tabla por action (la rama local de cada una NO se toca):

- [ ] **Step 1: Ajustar cada action de la rama Supabase:**

| Action | Antes | Ahora |
|---|---|---|
| `actualizarMateria` | rpc `editar_materia(p_materia_id, …)` | rpc `editar_materia(p_curso_id: id, …)` (mismo resto) |
| `guardarHorariosLocales` | solo local | sigue solo local (la rama Supabase pasa por `actualizarMateria`) |
| `crearArchivo` | insert `archivos` | insert `archivos_manuales { curso_id: materiaId, nombre, url }` |
| `eliminarArchivo` | delete `archivos` (chequeo source) | delete `archivos_manuales` por id (uuid); si el id tiene `:` es del aula → `ERROR_ARCHIVO_MOODLE` |
| `crearAviso` | insert `avisos` | insert `avisos_manuales { curso_id: materiaId ?? null, titulo, fecha }` |
| `toggleAviso` | update `avisos.hecho` | si `esManual(id)` → update `avisos_manuales`; si no → upsert `avisos_estado { aviso_id: id, hecho }` (onConflict `user_id,aviso_id`) |
| `eliminarAviso` | delete `avisos` (chequeo source) | delete `avisos_manuales` por id; si el id tiene `:` → `ERROR_AVISO_MOODLE` |
| `crearBloque` / `actualizarBloque` / `eliminarBloque` / `reordenarBloques` | tabla `bloques` con `materia_id` | tabla `bloques` con `curso_id` (renombrar la columna en cada insert/eq) |
| `guardarPerfil` | update `perfil { nombre }` | update `perfiles { nombre, carrera }` — ampliar el schema zod con `carrera: z.string().trim().max(80).optional()` |
| `guardarAvatarLocal` | escribe `datos/avatar.*` | rama Supabase nueva: subir al bucket `avatares` como `${user.id}.${ext}` con `upsert: true`, `getPublicUrl`, update `perfiles.avatar_url` (con `?v=${Date.now()}` para bustear caché) |

Ejemplo completo de una (las demás siguen el mismo molde, con el copy de error EXACTO de hoy) — `toggleAviso`, rama Supabase:

```ts
  if (esManual(id)) {
    const { error } = await supabase
      .from('avisos_manuales')
      .update({ hecho: parsed.data.hecho })
      .eq('id', id);
    if (error) {
      console.error('toggleAviso:', error);
      return { ok: false, error: ERROR_GUARDAR };
    }
  } else {
    const { error } = await supabase
      .from('avisos_estado')
      .upsert(
        { aviso_id: id, hecho: parsed.data.hecho },
        { onConflict: 'user_id,aviso_id' }
      );
    if (error) {
      console.error('toggleAviso:', error);
      return { ok: false, error: ERROR_GUARDAR };
    }
  }
  revalidarTodo();
  return { ok: true };
```

- [ ] **Step 2: `npm test && npm run typecheck`** → PASS (los tests de actions existentes corren la rama local: deben seguir verdes).
- [ ] **Step 3: Smoke en dev (con `.env.local`):** editar una materia (profe/aula/color/horarios), crear y borrar un archivo manual, crear/marcar/borrar un aviso, escribir una nota. Verificar en Supabase que las filas caen con TU `user_id`.
- [ ] **Step 4: Commit** — `git commit -m "feat: mutaciones sobre el esquema compartido"`

---

### Task 10: Sync compartido

**Files:**
- Create: `lib/sync-compartido.ts`
- Modify: `app/actions-moodle.ts` (`sincronizarAhora`), `app/actions-sesion.ts` (`montarCursada`)

**Interfaces:**
- Consumes: `construirPlan`, `armarSnapshot` de `lib/moodle/plan.ts` (existentes, no se tocan), `adminClient`, `credencialDelUsuario` (Task 7), `registrarEvento`.
- Produces: `sincronizarCompartido(cred: Credencial, userId: string, origen: 'login' | 'boton' | 'cron'): Promise<{ materias: number; archivos: number; avisos: number; generado: string; nombre: string }>` y `cursadaFresca(userId: string, horas?: number): Promise<boolean>`.

- [ ] **Step 1: Implementar `lib/sync-compartido.ts`**

```ts
// Sincronización COMPARTIDA — SOLO SERVIDOR, siempre via service role (los
// usuarios no tienen policies de escritura sobre cursos/avisos_curso).
//
// La idea que abarata todo: si cinco personas cursan Fundamentos, el contenido
// se baja UNA vez. Quien sincroniza refresca los cursos para todos; los demás
// reusan. La ventana de frescura la chequea el que llama (montarCursada/cron):
// el botón "Sincronizar ahora" fuerza siempre.

import { registrarEvento } from '@/lib/eventos';
import type { Credencial } from '@/lib/moodle/credenciales';
import { armarSnapshot, construirPlan } from '@/lib/moodle/plan';
import { adminClient } from '@/lib/supabase/admin';

export const HORAS_FRESCO_COMPARTIDO = 6;

/** ¿Todos los cursos del usuario están sincronizados hace menos de `horas`? */
export async function cursadaFresca(
  userId: string,
  horas = HORAS_FRESCO_COMPARTIDO
): Promise<boolean> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('inscripciones')
    .select('curso:cursos ( sincronizado )')
    .eq('user_id', userId);
  if (error) throw error;
  const marcas = (data ?? [])
    .map((i) => (i as { curso: { sincronizado: string } | null }).curso?.sincronizado)
    .filter((s): s is string => Boolean(s));
  if (marcas.length === 0) return false; // sin cursos todavía: hay que sincronizar
  const limite = Date.now() - horas * 60 * 60 * 1000;
  return marcas.every((s) => new Date(s).getTime() > limite);
}

export async function sincronizarCompartido(
  cred: Credencial,
  userId: string,
  origen: 'login' | 'boton' | 'cron'
): Promise<{ materias: number; archivos: number; avisos: number; generado: string; nombre: string }> {
  const plan = await construirPlan(cred);
  const snapshot = armarSnapshot(plan);
  const admin = adminClient();
  const ahora = snapshot.generado ?? new Date().toISOString();

  // Cursos: el contenido completo de cada materia, sin overlays personales.
  const filasCursos = snapshot.materias.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    datos: m,
    sincronizado: ahora,
  }));
  if (filasCursos.length > 0) {
    const { error } = await admin.from('cursos').upsert(filasCursos);
    if (error) throw error;
  }

  // Refs de archivos para el proxy.
  const filasRefs = Object.entries(plan.refsArchivos).map(([ref, datos]) => ({
    ref,
    datos,
    actualizado: ahora,
  }));
  if (filasRefs.length > 0) {
    const { error } = await admin.from('archivo_refs').upsert(filasRefs);
    if (error) throw error;
  }

  // Avisos del aula (ids estables tipo "assign:14782").
  const filasAvisos = snapshot.avisos.map((a) => ({
    id: a.id,
    curso_id: a.materiaId ?? null,
    titulo: a.titulo,
    fecha: a.fecha,
  }));
  if (filasAvisos.length > 0) {
    const { error } = await admin.from('avisos_curso').upsert(filasAvisos);
    if (error) throw error;
  }

  // Inscripciones del que sincronizó: su set actual de cursos, ni más ni menos.
  const ids = snapshot.materias.map((m) => m.id);
  const { error: eIns } = await admin
    .from('inscripciones')
    .upsert(ids.map((curso_id) => ({ user_id: userId, curso_id })));
  if (eIns) throw eIns;
  const { error: eDel } = await admin
    .from('inscripciones')
    .delete()
    .eq('user_id', userId)
    .not('curso_id', 'in', `(${ids.map((i) => `"${i}"`).join(',')})`);
  if (ids.length > 0 && eDel) throw eDel;

  const archivos = snapshot.materias.reduce((n, m) => n + m.archivos.length, 0);
  await admin.from('sync_log').insert({
    origen,
    resultado: 'ok',
    detalle: `${snapshot.materias.length} materias · ${archivos} archivos · ${snapshot.avisos.length} avisos`,
  });
  await registrarEvento('sync_ok', userId, { origen, cursos: snapshot.materias.length });

  return {
    materias: snapshot.materias.length,
    archivos,
    avisos: snapshot.avisos.length,
    generado: ahora,
    nombre: plan.site.fullname,
  };
}
```

**Nota de tipo:** `armarSnapshot` devuelve materias con `id` tipo `"curso:{n}"` — verificar contra `lib/moodle/plan.ts` que `m.id` existe en `Snapshot['materias']` (si el campo se llama `externalId` en el snapshot, mapear acá). `snapshot.generado` es string ISO.

- [ ] **Step 2: `sincronizarAhora` dual en `app/actions-moodle.ts`** — tras obtener `cred` con `credencialDelUsuario()`: si `supabaseConfigurado()`, llamar `sincronizarCompartido(cred, u.userId, 'boton')` en vez de `sincronizarSnapshot(cred)` (mismo manejo de `TokenInvalido`/`SinToken`/red, misma forma de retorno). La rama local sigue con `sincronizarSnapshot`.
- [ ] **Step 3: `montarCursada` dual en `app/actions-sesion.ts`** — con Supabase: si `await cursadaFresca(u.userId)` → `{ ok: true, sincronizado: false, materias: …, avisos: … }` (contar con `getMaterias()`/`getAvisos()`); si no → `sincronizarAhora()` como hoy. La rama local no cambia.
- [ ] **Step 4: Smoke en dev:** botón "Sincronizar ahora" → en Supabase, `cursos` con jsonb, `avisos_curso`, `inscripciones` tuyas, `archivo_refs`, `sync_log`. Salir y volver a entrar antes de las 6 h → no vuelve a llamar a Moodle (mirar el log del server).
- [ ] **Step 5: `npm test && npm run typecheck`** → PASS. Commit — `git commit -m "feat: sincronización compartida (una vez por curso, no por persona)"`

---

### Task 11: Proxy de archivos multiusuario

**Files:**
- Modify: `app/api/archivo/route.ts`

**Interfaces:**
- Consumes: `archivo_refs` (Task 3), `credencialDelUsuario` — mover ese helper de `app/actions-moodle.ts` a `lib/moodle/credencial-actual.ts` para poder importarlo desde el route handler sin ciclos, re-exportándolo donde ya se usa.
- Produces: el mismo endpoint `/api/archivo?ref=…`.

- [ ] **Step 1: Leer `app/api/archivo/route.ts` y localizar de dónde saca hoy la ref y el token** (archivo de refs local + `leerCredenciales()`).
- [ ] **Step 2: Rama Supabase:** la ref se busca con `adminClient().from('archivo_refs').select('datos').eq('ref', ref).maybeSingle()`; el token sale de `credencialDelUsuario()` (el del usuario logueado — está inscripto o no ve el link). Mantener el chequeo de sesión que el route ya tiene (`hayAcceso()`); si no lo tiene, agregarlo al principio: `if (!(await hayAcceso())) return new Response(null, { status: 401 });`.
- [ ] **Step 3: Smoke en dev:** abrir un PDF del aula desde la app.
- [ ] **Step 4: Commit** — `git commit -m "feat: proxy de archivos multiusuario (refs en la base, token del usuario)"`

---

### Task 12: Consentimiento en el primer ingreso

**Files:**
- Create: `app/consentimiento/page.tsx` (fuera del grupo `(app)`), `components/consentimiento.tsx`
- Modify: `app/(app)/layout.tsx`, `app/actions-sesion.ts`

**Interfaces:**
- Consumes: `perfiles.consentimiento_en`, `usuarioActual()`.
- Produces: action `aceptarConsentimiento(): Promise<void>` (update + redirect `/`); el layout de `(app)` redirige a `/consentimiento` si el perfil no lo tiene.

- [ ] **Step 1: La página vive FUERA del grupo `(app)`** (así el redirect del layout no la alcanza): crear `app/consentimiento/page.tsx` con `exigirSesion()` propio. En `app/(app)/layout.tsx`, después de `exigirSesion()`: si `supabaseConfigurado()`, leer `consentimiento_en` del perfil (`createClient()` + `from('perfiles').select('consentimiento_en').maybeSingle()`); si es null → `redirect('/consentimiento')`.
- [ ] **Step 2: La pantalla** (`components/consentimiento.tsx`, client component con el shell visual de login — card `--sup`, radio 20px): título "Antes de empezar", el texto (voseo, sin eufemismos):

> Para que Mi Cursada funcione guardamos: tu nombre y tu carrera, un token de **solo lectura** del aula virtual (cifrado), tus horarios, tus notas y tus avisos. Tu contraseña no se guarda nunca. El servidor lo administra una persona física (Facu), que puede ver **que** usás la app pero no **qué** escribís en ella. Podés borrar tu cuenta y todos tus datos cuando quieras, desde tu perfil.

Botón primario "Acepto y quiero entrar" → `aceptarConsentimiento()`. Botón secundario "No acepto" → `cerrarSesion()`.

- [ ] **Step 3: La action en `app/actions-sesion.ts`:**

```ts
export async function aceptarConsentimiento(): Promise<void> {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  const supabase = await createClient();
  const { error } = await supabase
    .from('perfiles')
    .update({ consentimiento_en: new Date().toISOString() })
    .eq('user_id', u.userId);
  if (error) {
    console.error('aceptarConsentimiento:', error);
    throw new Error('No se pudo guardar. Probá de nuevo.');
  }
  await registrarEvento('consentimiento_aceptado', u.userId);
  revalidatePath('/', 'layout');
  redirect('/');
}
```

- [ ] **Step 4: Smoke:** con un perfil con `consentimiento_en = null` (setearlo a mano en la base), entrar → aparece la pantalla; aceptar → entra y no vuelve a aparecer.
- [ ] **Step 5: Commit** — `git commit -m "feat: consentimiento en el primer ingreso"`

---

### Task 13: Borrar mi cuenta

**Files:**
- Modify: `app/actions-sesion.ts`, `components/perfil-vista.tsx`

**Interfaces:**
- Produces: `borrarMiCuenta(): Promise<{ ok: false; error: string } | never>` (borra todo y redirige a `/login`).

- [ ] **Step 1: La action** (en `app/actions-sesion.ts`):

```ts
/**
 * Borra la cuenta DE VERDAD: el usuario de Auth (que cascadea perfiles,
 * credenciales, inscripciones, horarios, materias_extra, bloques,
 * avisos_estado, avisos_manuales y archivos_manuales), más el avatar del
 * bucket. Los eventos quedan: son hashes, no identifican a nadie.
 */
export async function borrarMiCuenta(): Promise<{ ok: false; error: string } | never> {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  try {
    const admin = adminClient();
    const { data: lista } = await admin.storage.from('avatares').list('', { search: u.userId });
    const nombres = (lista ?? []).map((f) => f.name).filter((n) => n.startsWith(u.userId));
    if (nombres.length > 0) await admin.storage.from('avatares').remove(nombres);
    await registrarEvento('cuenta_borrada', u.userId);
    const { error } = await admin.auth.admin.deleteUser(u.userId);
    if (error) throw error;
  } catch (e) {
    loguear('borrarMiCuenta', e);
    return { ok: false, error: 'No se pudo borrar la cuenta. Probá de nuevo.' };
  }
  await cerrarSesionActual();
  revalidatePath('/', 'layout');
  redirect('/login');
}
```

- [ ] **Step 2: UI en `components/perfil-vista.tsx`:** sección al final "Borrar mi cuenta" (solo visible si hay Supabase — pasar un prop `conCuenta: boolean` desde la página de perfil con `supabaseConfigurado()`), botón con texto rojo `#fb7185` que abre el `Modal` existente: título "¿Borrar tu cuenta?", texto "Se borran tu token del aula virtual, tus notas, tus horarios y tus avisos. No hay vuelta atrás.", confirmación "Borrar todo" / "Mejor no".
- [ ] **Step 3: Smoke** con una cuenta sombra de prueba (segundo usuario de Moodle no hay — probar con la propia y volver a loguear).
- [ ] **Step 4: Commit** — `git commit -m "feat: borrar mi cuenta"`

---

### Task 14: Carrera por persona

**Files:**
- Modify: `components/perfil-vista.tsx`, `components/sidebar.tsx`, `components/login-entrada.tsx` (y cualquier otro uso de `INSTITUTO.carrera`: `grep -rn "INSTITUTO.carrera\|SEDE_Y_TURNO" components app`)

**Interfaces:**
- Consumes: `Perfil.carrera` (Task 8), `guardarPerfil` con carrera (Task 9).
- Produces: la carrera mostrada sale de `perfil.carrera ?? INSTITUTO.carrera` en todos lados; el perfil la edita (input de texto con label "CARRERA", mono uppercase, igual que el de nombre).

- [ ] **Step 1: Relevar usos** con el grep de arriba y reemplazar cada `INSTITUTO.carrera` mostrado al usuario por el valor del perfil con fallback. `SEDE_Y_TURNO` queda (sede y turno siguen constantes — el spec lo deja fuera de alcance).
- [ ] **Step 2: Agregar el campo editable en el perfil** (mismo patrón que el nombre en `perfil-vista.tsx` → `guardarPerfil({ nombre, carrera })`).
- [ ] **Step 3: Smoke + `npm test && npm run typecheck`** → PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat: carrera editable por persona"`

---

### Task 15: Import de datos/ existentes (una corrida)

**Files:**
- Create: `scripts/importar-datos-locales.ts`

**Interfaces:**
- Consumes: overlays de `lib/datos-locales.ts` (leer los JSON directamente con sus schemas exportados), `adminClient`, `cifrar`.

- [ ] **Step 1: Escribir el script.** Recibe el `moodle_id` destino por argv, busca el `user_id` en `perfiles` (el usuario tiene que haber entrado al menos una vez), y trasvasa: `datos/horarios.json` → `horarios`; `datos/materias-extra.json` → `materias_extra`; `datos/bloques.json` → `bloques` (ids nuevos uuid, conservar `orden` y `createdAt`); `datos/avisos-manuales.json` → `avisos_manuales`; `datos/archivos-manuales.json` → `archivos_manuales`; `datos/avisos-estado.json` → `avisos_estado` (solo los ids que existan en `avisos_curso`). El snapshot NO se importa: lo regenera el primer sync. Correr con `npx tsx scripts/importar-datos-locales.ts 10747` cargando `.env.local` (usar `import 'dotenv/config'`? — no hay dotenv: leer `.env.local` a mano con `fs` y setear `process.env` al principio del script). Idempotencia: usar upsert donde hay PK natural y saltear bloques ya importados comparando `(curso_id, orden, texto)`.
- [ ] **Step 2: Correrlo contra el proyecto real** después del primer login + primer sync del usuario. Verificar en la app que las notas y horarios de siempre aparecen.
- [ ] **Step 3: Commit** — `git commit -m "feat: script de import de datos/ al esquema multiusuario"`

---

### Task 16: Cron diario de sync

**Files:**
- Create: `app/api/cron/sync/route.ts`, `vercel.json`

**Interfaces:**
- Consumes: `sincronizarCompartido`, `cursadaFresca`, `leerCredencialDb`, `adminClient`.

- [ ] **Step 1: El route handler**

```ts
// Cron diario (vercel.json): refresca el contenido compartido de madrugada.
// Recorre los usuarios con credencial; el primero que sincroniza deja frescos
// los cursos compartidos, así que los que cursan lo mismo se saltean solos.
// Protegido con CRON_SECRET (Vercel lo manda como Bearer).

import { registrarEvento } from '@/lib/eventos';
import type { Credencial } from '@/lib/moodle/credenciales';
import { leerCredencialDb } from '@/lib/moodle/credenciales-db';
import { adminClient } from '@/lib/supabase/admin';
import { cursadaFresca, sincronizarCompartido } from '@/lib/sync-compartido';

export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }

  const admin = adminClient();
  const { data: usuarios, error } = await admin.from('credenciales').select('user_id');
  if (error) return Response.json({ ok: false }, { status: 500 });

  let ok = 0;
  let errores = 0;
  for (const { user_id } of usuarios ?? []) {
    try {
      if (await cursadaFresca(user_id)) continue;
      const cred: Credencial | null = await leerCredencialDb(user_id);
      if (!cred) continue;
      await sincronizarCompartido(cred, user_id, 'cron');
      ok += 1;
    } catch (e) {
      errores += 1;
      console.error('cron sync:', e instanceof Error ? e.message : 'error');
      await admin.from('sync_log').insert({
        origen: 'cron',
        resultado: 'error',
        detalle: e instanceof Error ? e.message.slice(0, 200) : 'error',
      });
      await registrarEvento('sync_error', user_id, { origen: 'cron' });
    }
  }
  return Response.json({ ok: true, sincronizados: ok, errores });
}
```

- [ ] **Step 2: `vercel.json`**

```json
{
  "crons": [{ "path": "/api/cron/sync", "schedule": "0 7 * * *" }]
}
```

(07:00 UTC = 04:00 en Buenos Aires.)

- [ ] **Step 3: Smoke local:** `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync` → `{ ok: true, … }`; sin header → 401.
- [ ] **Step 4: Commit** — `git commit -m "feat: cron diario de sincronización compartida"`

---

### Task 17: Documentación y verificación integral

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: `CLAUDE.md`:** actualizar Autenticación (sesión Supabase con usuario sombra en modo multiusuario, cookie local solo como fallback de dev; toda action sigue chequeando acceso por su cuenta), Stack (service role solo servidor, `CURSADA_TOKEN_KEY`), y agregar la regla: "El contenido del aula es compartido (`cursos`); lo personal lleva RLS por `auth.uid()`. `credenciales`, `eventos`, `archivo_refs` y `sync_log` son solo-servidor: sin policies, siempre via `adminClient()`."
- [ ] **Step 2: `README.md`:** sección "Multiusuario (Supabase + Vercel)": cómo configurar `.env.local`, qué guarda cada tabla, el consentimiento y el borrado de cuenta, y que el modo `datos/` sigue para desarrollo.
- [ ] **Step 3: Verificación integral:** `npm test` (todo verde), `npm run typecheck`, `NEXT_DIST_DIR=.next-build npm run build` (build limpio sin pisar el dev server). Smoke completo en dev: login → consentimiento → sync → dashboard con materias → notas → avisos → perfil (carrera) → logout → login de nuevo (sin re-sync si está fresco).
- [ ] **Step 4: Commit** — `git commit -m "docs: multiusuario en CLAUDE.md y README"`

---

### Task 18: Deploy en Vercel

**Files:**
- (sin archivos nuevos; configuración de plataforma)

- [ ] **Step 1: Crear el proyecto** — desde la raíz del repo: `vercel link` (proyecto nuevo `micursada`, scope personal del usuario). **Ojo:** la cuenta ya está al 90% de Fast Data Transfer del ciclo; si el deploy falla por límites, esperar el reset del ciclo o resolver el consumo de los otros proyectos primero (ya conversado con el usuario).
- [ ] **Step 2: Variables de entorno** (production + preview), con `vercel env add`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CURSADA_TOKEN_KEY` (la MISMA que en `.env.local` — si cambia, los tokens guardados no descifran), `CURSADA_ADMIN_ID` (el userid de Moodle del usuario), `CRON_SECRET` (generar con `openssl rand -hex 32`).
- [ ] **Step 3: Deploy** — `vercel deploy --prod`. Verificar que el cron quedó registrado (dashboard → Settings → Cron Jobs).
- [ ] **Step 4: Smoke en producción:** entrar a `https://micursada.vercel.app` (o el dominio que asigne) con las credenciales del aula, consentir, sincronizar, escribir una nota, cerrar sesión, volver a entrar. Verificar que la cookie quedó `secure` (viene por https) y que `select count(*) from eventos` creció.
- [ ] **Step 5: Commit final + push** — `git push origin main`.

---

## Fuera de este plan (plan siguiente)

- **Panel `/admin`** completo (spec §7): `exigirAdmin()` contra `CURSADA_ADMIN_ID`, 404 para no-admins, `lib/admin/metricas.ts` que lee solo `eventos`/`perfiles`/`sync_log`, tiles + barras SVG + lista de personas. Se implementa cuando el usuario lo pida ("ver mi admin luego").
