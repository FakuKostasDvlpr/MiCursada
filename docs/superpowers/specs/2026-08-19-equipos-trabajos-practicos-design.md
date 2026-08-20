# Equipos para trabajos prácticos

Diseño validado el 19/08/2026. Origen: `mejoras.md` §"Creación de grupos para trabajos".

Reemplaza a la idea original de identificar compañeros **por correo**: la prueba en vivo
contra el Moodle de ORT (§2) mostró que el correo no está garantizado y que el
identificador correcto es el `userid` de Moodle, que además ya es la identidad que usa
el usuario sombra de la app (`moodle-{userid}@micursada.local`).

## 1. Por qué

Cuando cae un TP grupal, el equipo se arma por WhatsApp y el reparto de tareas se pierde
en el chat. La app ya sabe qué materias cursa cada uno, cuándo vencen las entregas y
quiénes son los compañeros de curso (vía el aula virtual): tiene todo para que un equipo
se arme en tres clicks y quede registrado junto a la materia.

El requisito duro es que **funcione para todos, no "para algunos"**: la app es nueva y la
mayoría de los compañeros todavía no la usa. Un equipo tiene que poder incluir a alguien
que no tiene cuenta, y esa persona tiene que encontrarse la invitación esperándola cuando
entre por primera vez.

## 2. Hallazgo que habilita la feature (verificado en vivo el 19/08)

Se probó `core_enrol_get_enrolled_users` (solo lectura) con el token real de un **alumno**
contra el curso `2756` (Fundamentos de Programación):

| Dato | Resultado |
|---|---|
| Usuarios devueltos | **54** (compañeros + docentes), todos con `roles` |
| `id` (userid de Moodle) | presente en **54 de 54** |
| `fullname` | presente en 54 de 54 |
| `email` | presente en **53 de 54** — uno lo tiene oculto por `maildisplay` |
| Otros campos útiles | `username`, `profileimageurl`, `groups`, `roles` |

Conclusiones que fijan el diseño:

- **ORT no bloquea la lista de participantes para alumnos.** El token de un `student`
  alcanza, así que a cualquier compañero le va a funcionar igual: no es un privilegio de
  una cuenta puntual.
- **El `email` NO se usa como clave.** Ya hay 1 de 54 que lo oculta; una lógica basada en
  correo funcionaría con la mayoría y fallaría en silencio con el resto. `id` vino en el
  100 % de los casos.
- `core_webservice_get_site_info` (lo que ya se llama al entrar) **no devuelve el email**
  ni siquiera del propio usuario, pero sí su `userid` — que es lo que se necesita.
- El campo `email` del roster **no se persiste**: no aporta nada que `moodle_id` no
  resuelva, y guardar correos de terceros que no dieron consentimiento sería gratis en
  costo y caro en privacidad.

## 3. Alcance: tres fases

La feature entera es grande. Se corta en tres fases apilables, cada una entregable y
verificable por su cuenta. Este spec cubre las tres, pero **el plan de implementación
arranca por la Fase 1** — las otras dos no tienen dónde vivir hasta que exista un equipo.

| Fase | Qué agrega | Depende de |
|---|---|---|
| 1 | Equipos, participantes desde Moodle, invitaciones pendientes, notificaciones, vencimiento | — |
| 2 | Tema del grupo y reparto (quién hace qué) | 1 |
| 3 | Kanban del equipo (tareas con título, subtítulo, tiempo estimado, asignado) | 1 |

**Solo modo Supabase.** Un equipo es multiusuario por definición: en modo local (sin
`.env.local`) `/equipo` muestra un estado vacío explicando que necesita la versión online,
y no se crea ningún overlay en `datos/`. La decisión la toma `supabaseConfigurado()` como
en el resto del código — la pantalla no sabe en qué modo está, solo recibe los datos.

## 4. Requisitos — Fase 1

### 4.1 Acceso a Moodle

- **R1.** Agregar `core_enrol_get_enrolled_users` a `FUNCIONES_PERMITIDAS` en
  `lib/moodle/cliente.ts`, con comentario que aclare que es de lectura pura (devuelve el
  padrón del curso; no escribe nada). La allowlist sigue siendo 100 % de lectura.
- **R2.** Nuevo módulo `lib/moodle/roster.ts` con `participantesDelCurso(courseId, cred)`:
  llama a la función de R1, valida la respuesta con `zod` (schema en
  `lib/moodle/schemas.ts`, tolerante a campos faltantes), y devuelve
  `{ moodleId, nombre, avatarUrl }[]`.
  - Filtra a quienes tengan `roles` con `shortname === 'student'`. Si un usuario viene
    **sin `roles`**, se lo incluye (mejor sobrar un compañero que faltar), salvo que sea
    el propio usuario.
  - Excluye el `moodleId` del usuario que consulta.
  - **Nunca** devuelve `email` ni `username`.
- **R3.** El roster se pide **on-demand**, con el token del usuario que abre el selector
  (descifrado desde `credenciales`, como hace el sync). No se guarda en ninguna tabla, no
  entra al sync compartido y no se cachea entre requests. Si tarda ~1-2 s, el selector
  muestra su estado de carga.
- **R4.** Si Moodle falla (token vencido, red, curso sin permiso), la action devuelve un
  error **genérico** (`No pudimos traer la lista de tu curso. Probá de nuevo.`) y el
  selector ofrece reintentar. Ninguna rama filtra la URL del aula, el token ni el
  `errorcode` de Moodle al cliente — mismo criterio que `/api/archivo`.

### 4.2 Modelo de datos

Migración nueva `supabase/migrations/0006_equipos.sql`, siguiendo los patrones de
`0001_multiusuario.sql` (RLS con `(select auth.uid())`, FKs con `on delete cascade`).

- **R5. `equipos`**: `id uuid pk`, `curso_id text references cursos(id)`, `titulo text`,
  `descripcion text`, `tema text`, `creador_id uuid references auth.users(id) on delete set null`,
  `cupo int`, `vence_en date`, `creado_en timestamptz`.
  - **`cupo` lo declara el admin al empezar** ("somos 4"), *antes* de elegir participantes:
    es el total del equipo contándose a sí mismo. El selector de participantes queda
    limitado a `cupo - 1` (R21). El admin puede editarlo después, **nunca por debajo** de
    los miembros que ya ocupan lugar (`admin` + `aceptado` + `pendiente`). Se valida en la
    action y con un `check (cupo >= 1)` en la tabla.
  - Una invitación `pendiente` **ocupa lugar**: si el equipo es de 4 y hay 3 invitados sin
    responder, está lleno. Un `rechazado` libera el lugar.
- **R6. `equipo_miembros`**: `equipo_id uuid references equipos(id) on delete cascade`,
  `usuario_id uuid references auth.users(id) on delete cascade` (**null mientras la
  persona no tenga cuenta**), `moodle_id bigint not null`, `nombre text not null`
  (snapshot del `fullname` al invitar), `estado text` (`admin` | `aceptado` | `pendiente` |
  `rechazado`), `tema_asignado text` (Fase 2), `invitado_en timestamptz`.
  - `primary key (equipo_id, moodle_id)` — impide invitar dos veces a la misma persona.
  - Índice por `moodle_id` para el match del primer login (R11).
- **R7. `notificaciones`** (genérica, reutilizable fuera de equipos):
  `id uuid pk`, `usuario_id uuid references auth.users(id) on delete cascade`,
  `tipo text`, `titulo text`, `cuerpo text`, `href text`, `leida_en timestamptz`,
  `creada_en timestamptz default now()`. Índice por `(usuario_id, leida_en)`.
- **R8. `equipo_tareas`** (Fase 3): `id uuid pk`, `equipo_id`, `titulo text`,
  `subtitulo text`, `columna text` (`pendiente` | `en_curso` | `hecha`),
  `asignado_moodle_id bigint` (null = sin asignar), `estimado_min int` (null = sin
  estimar), `orden int`.

**RLS (R9):**

- `equipos`: `select` para miembros con estado `admin`/`aceptado`/`pendiente` (el invitado
  necesita ver el título y la materia para decidir). `update`/`delete` solo para el
  `admin`.
- `equipo_tareas`: todo para miembros `admin`/`aceptado` **si el equipo no venció**
  (§4.4). Los `pendiente` no ven las tareas hasta aceptar.
- `equipo_miembros`: `select` para miembros del mismo equipo. **Sin policy de `insert`
  para `authenticated`**: las filas las escribe el servidor con `adminClient()`, porque
  una invitación pendiente referencia a alguien que todavía no existe en Auth — mismo
  patrón que el alta de `perfiles`. El `update` de `estado` (aceptar/rechazar) va por
  Server Action, no por policy.
- `notificaciones`: `select`/`update` (marcar leída) del dueño; el `insert` lo hace el
  servidor.

**R10.** El borrado de cuenta (`borrarMiCuenta`) ya cascadea por
`references auth.users(id) on delete cascade`, así que `equipo_miembros.usuario_id`,
`notificaciones` y los equipos donde es `creador_id` quedan cubiertos por el esquema. Dos
casos que el `cascade` **no** resuelve y hay que codear:

- Si el que se borra es el **admin** de un equipo con otros miembros, el equipo pasa al
  miembro `aceptado` más antiguo (por `invitado_en`). Si no queda ninguno, se borra el
  equipo.
- Las filas `pendiente` de esa persona en otros equipos tienen `usuario_id` null y no
  cascadean: se borran explícitamente por `moodle_id`.

### 4.3 Flujo de invitación

- **R11.** Al crear el equipo, para cada participante elegido:
  - Si ya existe usuario sombra con ese `moodle_id` (consulta a `perfiles` vía
    `adminClient()`), se inserta la fila con `usuario_id` resuelto y **estado
    `pendiente`**, y se crea la notificación en el acto.
  - Si no existe, se inserta con `usuario_id` null. **No se crea usuario sombra por
    adelantado**: eso pondría en Auth a alguien que nunca aceptó nada.
- **R12. El enganche del que llega después.** En el arranque de sesión, donde ya se conoce
  el `moodle_id` del que entra (`montarCursada` en `app/actions-sesion.ts`, después del
  consentimiento), un paso nuevo `vincularInvitacionesPendientes(userId, moodleId)`:
  completa el `usuario_id` de las filas `pendiente` que matcheen su `moodle_id` y genera
  una notificación por cada una. Es idempotente: si ya está vinculada, no duplica
  notificación.
- **R13.** La notificación dice `Te invitaron al equipo "{titulo}"` con cuerpo
  `{materia} · entrega {vence_en}` y `href` a `/equipo/{id}`.
- **R14.** En `/equipo/{id}` un invitado `pendiente` ve **Aceptar** / **Rechazar**.
  Rechazar deja la fila en `rechazado` (libera el lugar y evita re-invitar en loop); el
  admin lo ve como "rechazó la invitación" y puede invitar a otra persona.
  Aceptar revalida el cupo antes de escribir: como una invitación pendiente ya ocupa lugar
  (R5), en el flujo normal nunca puede desbordar, pero la validación va igual porque el
  admin puede haber invitado a un reemplazo entre medio.

### 4.4 Vencimiento

- **R15.** Un equipo está **vencido** cuando `vence_en < hoy` en
  `America/Argentina/Buenos_Aires` (`date-fns-tz`, como el resto de la app). Es un estado
  **calculado**, no una columna: no hay cron ni job que "vencer" nada.
- **R16.** Vencido = **solo-lectura**: el equipo sigue visible con badge
  `Venció el {fecha}`, y el kanban y el reparto quedan congelados (sin crear, mover ni
  editar). Queda como registro de la cursada; no se archiva ni se borra solo.
- **R17.** Si alguien abre la notificación de un equipo ya vencido, la página lo dice
  explícitamente (`Este grupo venció el {fecha}`) en lugar de ofrecer aceptar. La
  invitación no se puede aceptar después del vencimiento.

### 4.5 Pantallas y navegación

- **R18.** Entrada nueva **"Equipo"** en `components/sidebar.tsx` (pasa de 5 a 6 ítems) y
  en `components/bottom-nav.tsx` (`grid-cols-5` → `grid-cols-6`; a 390px son ~65px por
  pestaña, sigue cumpliendo el mínimo táctil de 44px por la altura de 56px). Ícono
  `Users` de `lucide-react`.
- **R19.** `/equipo` (dentro de `app/(app)/`): lista de tus equipos, activos primero y
  vencidos después, con título, materia, avatares de los miembros y fecha de entrega.
  Botón **Formar equipo**. Estado vacío con el copy del proyecto (voseo).
- **R20.** `/equipo/[id]`: cabecera con título, materia, tema, entrega y miembros;
  pestañas que crecen por fase (Miembros → Temas → Kanban).
- **R21. Selector de participantes**: el `team-selector` de kokonutui adaptado a los
  tokens del handoff (`bg-sup`, `border-bor`, `--acc-bg` para el primario). Es
  copy-paste tipo shadcn — **no agrega dependencia nueva**; ya existe `components.json`.
  Muestra avatar de Moodle + nombre y un badge **Ya usa Mi Cursada** / **Lo vamos a
  invitar**. El máximo seleccionable es `cupo - 1` (el admin ya ocupa un lugar).
- **R22. Campanita**: badge de no-leídas con panel que lista las notificaciones, las marca
  leídas al abrir y deep-linkea al `href`. Va en la zona del perfil (abajo en la sidebar,
  y junto al avatar en el header móvil), **no** entre las pestañas de nav. Usa el ícono
  `Inbox` y no `Bell`: `Bell` ya es la pestaña Avisos y dos campanas con significados
  distintos se confunden.
- **R23.** El orden de creación es: elegir materia → **decir cuántos son** (cupo) → elegir
  participantes → **título, descripción, tema y fecha de entrega** → crear. El título, la
  descripción y el tema los puede editar después el admin.

### 4.6 Guardas

- **R24.** Toda Server Action nueva usa `conUsuario()` de `app/actions.ts` (acceso +
  consentimiento). El layout de `(app)` no alcanza para una action.
- **R25.** Además del acceso, cada action valida **pertenencia**: que el `auth.uid()` sea
  miembro del equipo que toca, y `admin` para las operaciones de admin (editar equipo,
  invitar, cambiar cupo, borrar). No se confía en el `equipo_id` que llega del cliente.
- **R26.** Todas las entradas de texto (`titulo`, `descripcion`, `tema`, `subtitulo`)
  validadas con `zod`, con largos máximos, y renderizadas como texto plano — no pasan por
  `sanitize-html` porque no aceptan HTML.

## 5. Requisitos — Fase 2 (temas y reparto)

- **R27.** El admin escribe el `tema` general del equipo, y puede asignar a cada miembro
  `aceptado` su `tema_asignado` (texto libre, opcional).
- **R28.** Cualquier miembro `aceptado` puede **tomar** un tema libre; solo el admin puede
  reasignar el de otro. Esto evita el cuello de botella de que el admin tenga que estar
  presente para repartir.

## 6. Requisitos — Fase 3 (kanban)

- **R29.** Tres columnas fijas (`Pendiente`, `En curso`, `Hecha`). Tarjeta con título,
  subtítulo opcional, asignado opcional y **tiempo estimado opcional** en minutos, que se
  muestra como `1 h 30` cuando pasa de 60.
- **R30.** Mover de columna y reordenar lo puede hacer cualquier miembro `aceptado`;
  borrar una tarea, quien la creó o el admin.
- **R31.** El kanban del equipo es **independiente** de los bloques/notas personales
  (`bloques`): comparten estética pero no tabla ni código de estado. Reusar `bloques`
  arrastraría RLS por `auth.uid()` a un contexto compartido, que es justo lo que no
  queremos.

## 7. Privacidad

Regla estructural, en línea con el spec multiusuario del 18/08:

- Del roster de Moodle se persiste **solo** `moodle_id` + `nombre` de las personas
  **efectivamente invitadas**. Nada de la lista completa del curso, nada de correos, nada
  de usuarios.
- El `nombre` es un snapshot al invitar (para poder mostrar "invitamos a X" antes de que X
  tenga cuenta). Cuando la persona se une, la UI pasa a mostrar su nombre y avatar de
  `perfiles`.
- Una persona invitada que nunca se une queda como una fila con su id y nombre. Si pide
  que se borre, se borra por `moodle_id` (R10 ya tiene la operación).
- El contenido del equipo (tareas, temas) lo ven **solo los miembros aceptados**, jamás el
  panel `/admin` — que sigue sin poder leer contenido de nadie.

## 8. Tests

- `lib/moodle/roster.ts`: filtro de roles (incluye a los sin `roles`, excluye docentes y
  al propio usuario), que no devuelva `email`/`username`, y respuesta malformada de Moodle.
- Vencimiento: `vence_en` de ayer/hoy/mañana en la timezone de Buenos Aires — hoy **no**
  está vencido.
- Cupo: no se puede aceptar en un equipo lleno; no se puede bajar el cupo por debajo de
  los miembros actuales.
- `vincularInvitacionesPendientes`: matchea por `moodle_id`, es idempotente (correr dos
  veces no duplica notificaciones), y no toca invitaciones de otros.
- Guardas: cada action rechaza a un no-miembro y a un miembro no-admin donde corresponde.
- Traspaso de admin al borrar la cuenta del admin (con y sin miembros restantes).

## 9. Fuera de alcance

Deliberadamente **no** entra:

- Notificaciones por mail o push. La campanita in-app alcanza para un curso de ~50
  personas y no requiere pedir correos.
- Chat del equipo. Para eso está WhatsApp; la app aporta la estructura, no la mensajería.
- Compartir archivos subiendo a Storage. Los links a material sí (es texto en una tarea);
  subir archivos abre cuota, antivirus y moderación.
- Sincronizar el equipo con los "grupos" de Moodle (`groups` del roster). Se lee para
  nada por ahora; si algún día los docentes los usan, es una mejora aparte.
- Realtime (ver el kanban moverse en vivo). Revalidación por Server Action alcanza.
