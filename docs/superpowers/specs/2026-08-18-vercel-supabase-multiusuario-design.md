# Mi Cursada multiusuario en Vercel + Supabase — diseño

Fecha: 2026-08-18
Estado: **diseño aprobado, no implementado**

Reemplaza a `2026-08-16-autohospedaje-multiusuario-design.md` (VM Oracle autohospedada):
el 18/08 se decidió volver al camino de `docs/PLAN-VERCEL.md` — Vercel + Supabase — porque
ya existe el proyecto de Supabase (`bhjachrwvujqfkgrscei`), el deploy es inmediato y no
hay un servidor que mantener. Del spec del 16/08 se conservan las decisiones que no
dependen de la plataforma: esquema compartido, panel que no lee contenido, log de
eventos, consentimiento y notas sin cifrar.

---

## 1. Objetivo

Que Mi Cursada viva en una URL pública, la usen ~20 personas del instituto (de cualquier
carrera), cueste $0/mes, y tenga un panel `/admin` que solo ve el administrador, con
estadísticas de uso pero **nunca** contenido ajeno.

La experiencia de usuario es la misma que hoy: entrar con la cuenta del aula virtual,
sincronizar cursos, tomar notas, ver clases y avisos. La diferencia es que cada persona
ve solo lo suyo.

---

## 2. Arquitectura

```
Navegador
    │  https
    ▼
Vercel (Next.js, plan Hobby)
    ├──► Supabase (Postgres + Auth + Storage, plan Free)
    └──► Aula Virtual ORT (API Moodle, solo lectura — cliente ya existente)
```

- **Vercel Hobby**: 1M invocaciones/mes, cron diario incluido. Gratis permanente (no trial).
- **Supabase Free**: 500 MB de Postgres, Auth, Storage. Proyecto ya creado.
- El modo local con `datos/` **sigue funcionando** como fallback de desarrollo sin
  `.env.local`, como hasta ahora.

Qué lo rompería ($0): uso comercial (Hobby es no comercial), >~200 usuarios activos, o
cachear PDFs en la base. **Decisión: los archivos del aula no se cachean** — se sirven a
demanda desde Moodle por el proxy existente.

---

## 3. Autenticación: login Moodle → sesión Supabase

El login sigue siendo usuario + contraseña del aula virtual. El flujo nuevo, todo en el
servidor (`app/actions-sesion.ts`):

1. Credenciales → `{moodle}/login/token.php`. Si Moodle las rechaza, no hay cuenta.
2. Con el token se llama `core_webservice_get_site_info` → `userid`, nombre, sitename.
3. **Usuario sombra en Supabase Auth**: se busca/crea con la admin API (service role) un
   usuario con email sintético `moodle-{userid}@micursada.local`, email confirmado, sin
   contraseña utilizable. `app_metadata.moodle_id = userid`.
4. **Se acuña la sesión del lado del servidor**: `auth.admin.generateLink({ type:
   'magiclink' })` + `auth.verifyOtp({ token_hash })` — patrón estándar para iniciar
   sesión sin que el usuario tenga contraseña de Supabase. `@supabase/ssr` guarda las
   cookies.
5. El token de Moodle se cifra (sección 5) y se guarda en `credenciales`.

Consecuencias:

- La cookie `cursada_sesion`, `datos/sesiones.json` y el candado de "un solo dueño"
  desaparecen. La sesión es la de Supabase.
- `exigirSesion()` y `hayAcceso()` pasan a resolver `supabase.auth.getUser()`. La regla
  de CLAUDE.md se mantiene: **toda action y todo route handler chequean acceso por su
  cuenta**.
- `auth.uid()` funciona en Postgres → **RLS real en cada query**.
- El logout sigue redirigiendo desde la propia action (`redirect('/login')`).
- Ni la contraseña ni el token vuelven jamás al cliente ni van a un log (regla vigente).

La `SUPABASE_SERVICE_ROLE_KEY` vive solo en variables de entorno del servidor y solo la
usan: el alta/lookup del usuario sombra, la lectura/escritura de `credenciales`, el sync
de contenido compartido y las consultas del panel. Nunca llega al cliente.

---

## 4. Esquema

Reescribe `supabase/migrations/` (las migraciones actuales duplicaban todo por usuario y
no coinciden con este diseño; la base de destino está vacía, no hay datos que migrar en
Supabase). El contenido del aula se guarda **compartido y como `jsonb`**: se lee entero,
cambia solo en el sync, y modelar la estructura de Moodle en columnas no aporta.
Lo que escribe cada persona va en columnas reales, porque se consulta y filtra.

```sql
-- Compartido: si cinco personas cursan Fundamentos, existe una sola vez
cursos            (id_moodle bigint PK, nombre, datos jsonb, sincronizado timestamptz)
inscripciones     (user_id uuid → auth.users, curso_id → cursos, PK(user_id, curso_id))
avisos_curso      (id PK, curso_id, external_id, titulo, fecha, UNIQUE(curso_id, external_id))

-- Identidad y acceso
perfiles          (user_id uuid PK → auth.users, moodle_id bigint UNIQUE, nombre,
                   carrera, instituto, avatar_url, consentimiento_en timestamptz,
                   alta timestamptz, ultima_visita timestamptz)
credenciales      (user_id uuid PK → auth.users, token_cifrado bytea, nonce bytea,
                   actualizado timestamptz)

-- De cada persona, privado
horarios          (id PK, user_id, curso_id, dia smallint /*1=Lun…6=Sáb*/, inicio time, fin time)
materias_extra    (user_id, curso_id, profe, aula, color, PK(user_id, curso_id))
bloques           (id PK, user_id, curso_id, tipo, texto, url, estado, hecho bool,
                   orden int, creado)                    -- notas estilo Notion
avisos_estado     (user_id, aviso_id → avisos_curso, hecho bool, PK(user_id, aviso_id))
avisos_manuales   (id PK, user_id, curso_id nullable, titulo, fecha, hecho)
archivos_manuales (id PK, user_id, curso_id, nombre, url, creado)

-- Métricas (sin contenido, sección 7)
eventos           (id bigserial PK, ts timestamptz, usuario_hash text, evento text,
                   datos jsonb)

-- Sync
sync_log          (id PK, curso_id, corrida_at, resultado, detalle)
```

Convenciones vigentes: `timestamptz` siempre; render con `date-fns-tz` sobre
`America/Argentina/Buenos_Aires`; días 1=Lunes…6=Sábado.

### RLS

- Tablas personales: `user_id = auth.uid()` para todo (select/insert/update/delete).
- `cursos` y `avisos_curso`: **select** solo si existe inscripción del `auth.uid()`;
  escritura solo service role (ninguna policy de escritura para `authenticated`).
- `credenciales` y `eventos`: **ninguna policy** — solo service role. Un cliente con la
  anon key no puede leerlas ni sabiendo la URL.
- `perfiles`: cada uno ve y edita solo el suyo (carrera, avatar); `moodle_id`,
  `consentimiento_en` y `ultima_visita` los escribe el servidor.
- Storage (avatares): bucket con policies por `auth.uid()` (adaptar `0003_storage.sql`).

### Migración de los datos actuales

Un script de una sola corrida (`scripts/importar-datos-locales.ts`) importa el `datos/`
de hoy como el primer usuario (vos), tras tu primer login real. `datos/` queda en disco
como respaldo hasta validar producción.

---

## 5. Seguridad

1. **Tokens cifrados** con AES-256-GCM (`crypto` de Node, nonce por registro), clave de
   32 bytes en `CURSADA_TOKEN_KEY` (env de Vercel). Un dump de la base se lleva ruido.
2. **La contraseña nunca se guarda** (ya es así) y no vuelve al cliente ni va a logs.
3. **Consentimiento en el primer ingreso**, castellano claro: qué se guarda, para qué,
   quién administra (una persona física) y cómo borrarse. Sin aceptar no se entra;
   `consentimiento_en` lo registra.
4. **Borrar mi cuenta** que borra de verdad: usuario de Auth (cascada sobre todas las
   tablas personales e inscripciones), credenciales y avatar. Los `eventos` quedan
   (son hash, no identifican).
5. **RLS** como defensa estructural (sección 4), además del filtro explícito en
   `lib/queries.ts`.
6. **Las notas se guardan sin cifrar — decisión consciente** (heredada del spec del
   16/08): cifrarlas con clave derivada de la contraseña de Moodle deja las notas
   ilegibles si la persona cambia esa contraseña. En su lugar: ninguna ruta del panel
   lee contenido ajeno, y el consentimiento dice explícitamente que quien opera el
   proyecto tiene acceso administrativo a la base.

---

## 6. Sincronización compartida

- El contenido se sincroniza **una vez por curso, no por persona**: al entrar (o con
  "Sincronizar ahora"), para cada curso inscripto se mira `cursos.sincronizado`; si es
  más viejo que la ventana (6 h), se refresca con el token del que dispara — llamadas
  secuenciales con la pausa de 500 ms que ya tiene `lib/moodle/`. Si está fresco, se
  reusa. Menos golpes al servidor de ORT.
- Lo escribe el service role (los usuarios no tienen policy de escritura en `cursos`).
- **Cron diario de Vercel** (madrugada, `vercel.json`): recorre los cursos con
  inscriptos y los refresca usando un token vigente de algún inscripto (descifrado en el
  server). Protegido con `CRON_SECRET`. Resultado en `sync_log`.
- Si un token venció, el curso se salta y se anota; el login de esa persona lo renueva
  (comportamiento actual).

---

## 7. El panel `/admin`

Heredado del spec del 16/08, adaptado a Supabase. **Privado, solo administrador.**

### Cómo se cierra

- El admin es **un id de Moodle en `CURSADA_ADMIN_ID`** (id numérico: estable, el
  username lo puede cambiar el instituto). No es un rol en la base.
- Se entra con el mismo login del aula. No hay segundo login.
- `exigirAdmin()` compara el `moodle_id` del perfil de la sesión contra la env var, en el
  layout de `app/(app)/admin/` **y por separado en cada action/route handler del panel**.
- Para cualquier otro usuario `/admin` devuelve **404, no 403** (un 403 confirma que la
  ruta existe).
- Las consultas del panel usan service role **solo en Server Components/actions del
  panel**, tras `exigirAdmin()`. Nada del panel llega al bundle del cliente.

### La garantía estructural

Las consultas viven en `lib/admin/metricas.ts`, que lee **solo** `eventos`, `perfiles`,
`inscripciones` (conteos) y `sync_log`. No importa los lectores de contenido; no existe
función que abra bloques ajenos desde el panel. El panel lo dice en pantalla:

> Este panel no muestra el contenido de las notas, la bitácora ni los avisos de nadie.

### Qué mide

Log append-only en `eventos`, sin analytics de terceros. Cada evento guarda el **hash**
(SHA-256 con sal de servidor) del user_id, nunca contenido:

```
{ ts, usuario_hash, evento }   sesion_iniciada · aula_conectada · horario_cargado
                               nota_creada · materia_organizada · cuenta_borrada
{ ts, evento, datos }          sync_ok / sync_error (curso, ms, detalle)
```

### Qué muestra

- **Tiles**: activas (7 días), altas totales, materias organizadas, notas escritas.
- **Activas por semana** desde el lanzamiento — barras en SVG/CSS, sin librería.
- **Personas**: nombre, carrera, alta, última visita, cantidad de materias. Sin contenido.
- **Salud del sync**: última corrida del cron, cursos actualizados, errores.
- **Números absolutos, nunca porcentajes** (con ~20 personas los porcentajes son humo).
- Estética con los tokens del handoff; el ámbar `--acc-bg` solo botones/pills.

---

## 8. Multiusuario en el código

Los módulos que hoy tocan disco — `lib/datos-locales.ts` (overlays), `lib/sesion.ts`,
token en `datos/moodle.json` — pasan a Supabase. `lib/queries.ts` sigue siendo **la única
puerta de lectura** y resuelve el usuario desde la sesión; las páginas no cambian de
contrato. Las funciones reciben el usuario de forma explícita (sin AsyncLocalStorage).

Lo que hoy está fijo y pasa a ser por persona:

- **Carrera, sede y turno** dejan de ser constantes de `lib/instituto.ts`: carrera
  editable en el perfil (la API de Moodle no la expone); instituto sigue viniendo del
  `sitename`.
- **Los horarios no vienen de Moodle**: se cargan a mano en la app (ya se puede). El
  lector de PDFs de horarios queda fuera de alcance.

Tests: los de overlays apuntan hoy a un temporal con `CURSADA_DATOS_DIR`; la lógica pura
(cifrado, mapeos, validaciones, ventana de sync) se testea con vitest sin red; lo que
toca Supabase se prueba contra el proyecto real en el smoke de cada fase.

---

## 9. Deploy

- Proyecto en Vercel (Hobby) conectado al repo; build estándar de Next 15.
- Env vars (production + preview): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CURSADA_TOKEN_KEY`,
  `CURSADA_ADMIN_ID`, `CRON_SECRET`, URL de Moodle.
- Cron diario en `vercel.json` → route handler del sync (sección 6).
- Dominio: `micursada.vercel.app` (dominio propio, pendiente).
- Local: `.env.local` con las mismas variables; sin él, modo `datos/` como siempre.

---

## 10. Fases

| Fase | Qué | Se puede parar acá |
|---|---|---|
| **1. Puente de login** | Usuario sombra + sesión Supabase acuñada en el server, cifrado del token, consentimiento. Se valida contra el proyecto real antes de seguir. | no |
| **2. Datos** | Migraciones nuevas (esquema §4 + RLS), reescritura de queries/actions/overlays a Supabase, log de eventos, import de `datos/`, CLAUDE.md actualizado | no |
| **3. Sync compartido** | Ventana por curso, escritura service role, botón "Sincronizar ahora" multiusuario | **sí** — multiusuario andando |
| **4. Deploy** | Vercel, env vars, cron diario, smoke en producción | **sí** — tus amigos ya entran |
| **5. Panel** | `/admin` completo (§7), borrar mi cuenta, carrera editable | — |

El log de eventos va en la fase 2 **por diseño**: cada semana sin instrumentación es
curva de adopción que no se reconstruye nunca.

---

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El puente magiclink+verifyOtp cambia en Supabase | Es la fase 1: se valida contra el proyecto real antes de escribir el resto |
| Supabase Free pausa proyectos inactivos (7 días sin uso) | Con 20 personas usándola no aplica; el cron diario además la mantiene activa |
| ORT deshabilita el servicio móvil | Los datos sincronizados siguen visibles; aviso en el panel |
| Uso comercial rompe el Hobby de Vercel | No aplica: entre compañeros y sin cobrar |
| Filtración de la service role key | Solo vive en env de Vercel; nunca en el cliente ni en el repo |
| Perder datos personales | Supabase Free incluye backups diarios; los datos de Moodle se re-sincronizan |

---

## 12. Fuera de alcance, a propósito

- Notas compartidas entre compañeros (v2: cambia el modelo de privacidad entero).
- Cachear PDFs/archivos del aula (proxy a demanda, como hoy).
- Notificaciones, app móvil, roles más allá de admin/usuario.
- Lector de PDFs de horarios por carrera.
- Cualquier métrica que toque contenido.
- `/demo` pública y vidriera de portfolio (eran del camino autohospedado; se puede
  retomar después).

---

## 13. Decisiones pendientes

1. Dominio propio (~US$12/año) o `micursada.vercel.app`.
2. Ventana de frescura del sync (default propuesto: 6 horas).
