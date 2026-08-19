# Handoff de sesión — 19/08/2026

> Este archivo NO es `HANDOFF.md` (ese es la fuente de verdad de los design
> tokens y no se toca). Este es el estado de **una sesión de trabajo**, para
> retomarla sin releer todo el repo.

---

## 1. Lo primero: nada de esto está en producción

**Todo el trabajo de la sesión está sin commitear.** El working tree tiene
**23 archivos modificados y 17 nuevos** sobre `f2f3ca2`.

Y hay algo peor de arrastre: **producción está congelada desde el 18/08**.

| commit | deploy |
|---|---|
| `f2f3ca2` Updates notes | ❌ failure |
| `7d97e18` feat(admin-panel) | ❌ failure |
| `9d01eac` Importante | ❌ failure |
| `1807039` fix images | ❌ failure |
| `5eb89f5` fix(images-pattern) | ✅ **lo que corre hoy en prod** |

**Causa del fallo** (ya arreglada en el working tree, no en prod):
`components/admin-panel.tsx` importaba `@/lib/admin-contenido`, un módulo que
nunca existió en disco ni en ningún commit, y llamaba a dos rutas API que
tampoco existían. Se commiteó el consumidor sin el proveedor.

> **Acción pendiente #1:** commit + push. Hasta que eso pase, los usuarios no
> ven nada de lo que sigue. El usuario todavía no dio el OK.

---

## 2. Arrancar

```bash
npm run dev          # local en http://localhost:3000
npm test             # 546 tests
npx tsc --noEmit     # typecheck
npx eslint .         # lint
NEXT_DIST_DIR=.next-build npx next build --turbopack   # build sin pisar el dev
```

Estado al cerrar: **546 tests en verde, lint limpio, build de producción
limpio.**

El login es con usuario y contraseña del aula virtual. El `.env.local` apunta
al proyecto de Supabase **real** (el mismo que usa prod): cualquier cambio de
esquema o de datos desde el local **afecta a los usuarios de verdad**.

---

## 3. El problema de fondo que motivó casi todo

Los usuarios entraban y **no veían nada**. No era un bug de datos: las materias
sincronizaban bien. **Faltaban los horarios.**

El aula virtual (Moodle) no publica horarios en ningún campo — son un overlay
que carga cada persona. Y `lib/cursada.ts:60` y `app/(app)/semana/page.tsx`
arman las pantallas iterando `materia.horarios`. Con cero horarios, "Hoy"
mostraba *"Hoy no cursás"* (que era directamente falso) y "Semana" quedaba
vacía.

Estado real medido en la base durante la sesión:

```
persona#1: 7 materias · 0 horarios   ← Analista, 1er tramo
persona#2: 7 materias · 7 horarios   ← el dueño (único que veía la app llena)
persona#3: 6 materias · 2 horarios   ← IADS (otra carrera); cargó 2 a mano
persona#4: 4 materias · 0 horarios   ← Analista, 2º tramo
```

**Hallazgo importante:** en Moodle **cada comisión es un curso distinto**, con
su propio id. Las personas #1 y #2 comparten los **siete `curso_id` idénticos**.
O sea: estar inscripto al mismo `curso_id` **ya significa cursar juntos** — la
comisión no hay que deducirla de ningún nombre ni del `shortname`
(`asc-ya-11a`), ya está en la tabla `inscripciones`.

---

## 4. Qué se hizo

### 4.1 Hotfix del build
- Se eliminó el componente `VisorDatos` de `components/admin-panel.tsx`.
  Mostraba **el texto de las notas privadas** de cualquier usuario, contra la
  regla estructural de `specs/panel-admin/spec.md:35-38` ("no existe función que
  devuelva contenido de notas al panel"). Decidido con el usuario: quitarlo.
- Nueva ruta `app/api/admin/metricas/route.ts` — el panel ya la llamaba cada
  30 s contra una ruta inexistente. Incluye el campo `actualizado`, que el
  cliente esperaba y nadie mandaba.

### 4.2 Horarios (el núcleo)
- **`lib/plantilla-horarios.ts`** — grilla de Analista en Sistemas turno noche,
  **primer tramo**, extraída de los horarios reales que ya estaban cargados, no
  inventada. `claveMateria()` recorta el sufijo "- Plan 2 años 2°Semestre 2026"
  para sobrevivir al cambio de cuatrimestre.
  **Alcance medido: cubre a #1 y #2. NO cubre IADS ni el 2º tramo.**
- **`lib/horarios-comision.ts`** — herencia entre compañeros: si alguien de tu
  mismo `curso_id` ya cargó horarios, los heredás. Escala sola y cubre las
  carreras que la plantilla no conoce. Copia la grilla **completa** de una
  persona, no las franjas más votadas de varias (mezclar armaría semanas que
  nadie cursa).
- **`sembrarHorarios()`** en `lib/sync-compartido.ts`: primero herencia,
  después plantilla. Solo actúa si tenés **cero** horarios, así nadie te pisa
  la grilla una vez que la tocaste.
- **`components/armar-semana.tsx`** — el editor, en `/semana`. Dos velocidades:
  botones `L M M J V S` para marcar el día entero de 19:00 a 23:00, y campos de
  hora + select de día + "Agregar horario" para el detalle (el miércoles con
  Matemáticas 19:00–21:40 e Inglés 21:40–23:00).
- **`lib/franjas.ts`** — toda la lógica pura: `alternarDia`, `agregarFranja`,
  `editarFranja`, `quitarFranja`, `franjaValida`, `diasSolapados`,
  `partirHora`, `componerHora`.
- **`components/hoy-live.tsx`**: con cero horarios ya no miente. Dice que
  faltan cargarlos y linkea a `/semana`.

### 4.3 Alta manual de materias
- `crearMateriaManual` / `eliminarMateriaManual` en `app/actions.ts`,
  `components/agregar-materia.tsx`, botón en `/materias`.
- Los ids llevan prefijo `manual:` (convención ya existente, ver `esManual` en
  `lib/types.ts`).
- `lib/armar-materias.ts` respeta ahora `datos.source`; antes hardcodeaba
  `'moodle'` y toda materia manual se mostraba como sincronizada.

### 4.4 Notas y grafo
- **`lib/comandos-nota.ts`**: `/todo Traer el TP` crea el to-do **con su
  título**. Antes creaba un bloque vacío abajo del input.
- **Deep-link `?nota=<id>`**: estaba documentado en `specs/paginas-de-nota` pero
  **nunca se había implementado**. Ahora los nodos de nota del grafo apuntan
  ahí, y `notas-editor.tsx` abre el día colapsado, scrollea y resalta.

### 4.5 Avatares
- **Biblioteca**: cada subida guarda un archivo propio
  (`{userId}.{uuid}.{ext}`) en vez de pisar el anterior. Máximo **3 fotos**, con
  ✕ para borrar.
- **Óvalo con `+`** en la grilla; se eliminó el "…o subí tu propia foto".
- **Optimización en el cliente** (`lib/imagen.ts`): recorte cuadrado centrado,
  256×256, WebP. Una foto de 8 MB sube como ~25 KB.
  Sin esto el bucket (1 GB en el free tier) se llenaba con ~65 personas.
- **El GIF no se toca** a propósito: pasarlo por canvas perdería la animación.
  Como no se puede achicar, se acota a 1 MB.
- Constantes y presupuesto en **`lib/avatares.ts`**.

### 4.6 Perfil y toasts
- **El perfil es siempre modal**, también entrando derecho a `/perfil` o con F5.
  Un solo `<Modal>` con dos vistas (perfil / avatar) y breadcrumb "‹ Perfil /
  Avatar". Antes el avatar abría un segundo modal encima del primero.
- **Toasts arriba a la derecha**, `z-[60]` (sobre los modales), con animación
  propia que entra desde arriba.
- Nueva variante **`error`** (ámbar) en `lib/toast.ts`, además de `ok` y
  `delete`.

### 4.7 Otros
- **`components/campo-hora.tsx`** — reemplaza `<input type="time">`, que
  mostraba **12 h con AM/PM** según el locale del navegador ("7 a 11" en vez de
  "19 a 23"). Dos `<select>` propios: siempre 24 h.
- **`/manual`** — manual de uso (`app/(app)/manual/page.tsx`). Acceso desde la
  sidebar en desktop y desde el perfil en móvil.
- **`next.config.ts`** — el `search: ''` del `remotePattern` rechazaba con 400
  toda `avatar_url` (todas llevan `?v=`). El hostname ahora se deriva de
  `NEXT_PUBLIC_SUPABASE_URL` en vez de estar hardcodeado.
- **`vitest.config.ts`** — excluía `.next` pero no `.next-build`, así que
  **cada test corría dos veces** (contra el código actual y contra la copia
  congelada del artefacto de build). Lo que se veía como 980 tests eran 490.

---

## 5. Trampas del repo (esto rompe si no lo sabés)

1. **`app/actions.ts` lleva `'use server'`: todo export tiene que ser una
   función async.** Exportar una constante compila con `tsc` y **rompe el
   build**. Por eso `MAX_FOTOS_BIBLIOTECA` vive en `lib/avatares.ts`.
2. **El sync borra inscripciones que no estén en el snapshot de Moodle.** Las
   materias manuales nunca están ahí: el filtro
   `.not('curso_id', 'like', 'manual:%')` en `lib/sync-compartido.ts` es lo
   único que evita que el primer sync se las lleve con sus horarios y notas por
   cascada.
3. **La policy de Storage autoriza con `split_part(name, '.', 1) = auth.uid()`.**
   Por eso los avatares se nombran `{userId}.{uuid}.{ext}` y **no** en
   subcarpetas: una subcarpeta no pasaría la policy y obligaría a migrar.
4. **`adminClient()` saltea RLS.** Toda action que lo use tiene que chequear
   pertenencia a mano (ver `eliminarMateriaManual` y `nombreDesdeUrl`).
5. **El local usa la base de producción.** No hay entorno de staging.

---

## 6. Pendientes

### Bloqueado por decisión del usuario
- [ ] **Commit y push.** Lo más urgente: prod sigue rota.
- [ ] **Título y descripción para notas** (`mejoras.md`, sección "Notas
      /tablero"). Es el único ítem de ese bloque sin hacer. Necesita
      `alter table bloques add column titulo` → **migración en la base de
      producción**, que no se aplicó sin OK.
- [ ] **Backfill de horarios de persona#1**: heredaría 7 franjas de persona#2 en
      su próximo sync. Se puede forzar escribiendo en la base, pero es una
      escritura a prod.

### Sin verificar
- [ ] **¿Hay cuentas huérfanas en `auth.users`?** Las consultas a esa tabla las
      bloqueó el clasificador de permisos durante toda la sesión. Importa
      porque en `lib/supabase/puente.ts:38-46`, si `createUser` funciona pero el
      insert en `perfiles` falla, esa persona **queda bloqueada para siempre**:
      el siguiente intento no la encuentra por `moodle_id` y `createUser` rebota
      por email duplicado. Comparar `select count(*) from auth.users` contra los
      4 perfiles.

### De `mejoras.md`, sin empezar
Docker local · grupos de trabajo · caja de comentarios · loader de kokonutui ·
banner + página de contador de usuarios · `/impeccable` en toda la web.
La detección de Zoom está marcada por el propio usuario como "plan futuro".

### Ambigüedad abierta
- *"no se puede cargar uno aleatorio. como un gif"* (`mejoras.md`, Profile
  avatar). Se interpretó como "no se puede cargar una imagen cualquiera, por
  ejemplo un gif" y quedó resuelto. Puede haber querido decir "falta un botón
  que asigne uno **al azar**". Sin confirmar.

---

## 7. Archivos nuevos de esta sesión

```
app/(app)/manual/page.tsx           manual de uso
app/api/admin/metricas/route.ts     dataset del panel admin (polling)
components/agregar-materia.tsx      alta manual de materia
components/armar-semana.tsx         editor de horarios
components/campo-hora.tsx           selector de hora 24 h
components/perfil-avatar.tsx        vista de avatar dentro del modal de perfil
lib/avatares.ts        (+ test)     límites del bucket y formateo de peso
lib/comandos-nota.ts   (+ test)     parseo de "/todo Texto"
lib/franjas.ts         (+ test)     manipulación de franjas horarias
lib/horarios-comision.ts (+ test)   herencia entre compañeros
lib/imagen.ts                       optimización de la foto en el cliente
lib/plantilla-horarios.ts (+ test)  grilla Analista noche 1er tramo
HANDOFF-SESION-2026-08-19.md        este archivo
```

---

## 8. Skills sugeridas para la próxima sesión

Invocalas con la herramienta `Skill` según lo que vayas a tocar:

| Skill | Cuándo |
|---|---|
| `supabase:supabase-postgres-best-practices` | **Antes** de escribir cualquier SQL o migración. Obligatoria para el pendiente de "título y descripción" (`alter table bloques`). |
| `supabase:supabase` | RLS, policies, Storage, Auth, debugging de errores de Postgres o PostgREST. |
| `superpowers:systematic-debugging` | Cualquier bug o comportamiento raro, antes de proponer arreglos. |
| `portar-diseno` | Si algo "no se ve como el handoff". La fuente de verdad es `Mi Cursada.dc.html`, no el README. |
| `graphify` | Preguntas sobre el codebase; hay un grafo en `graphify-out/`. |
| `impeccable` | Para el ítem `/impeccable` de `mejoras.md`. |

---

## 9. Para el agente que retoma

Leé la sección 1 y decile al usuario, antes que nada, que **el trabajo sigue
sin commitear y prod sigue en `5eb89f5`**. Es la decisión que destraba todo lo
demás.

Después, lo más valioso sin tocar prod es cerrar el circuito de horarios para
las carreras que la plantilla no cubre (IADS y 2º tramo), que hoy dependen de
que alguien de esa comisión cargue los suyos primero.

**No** apliques migraciones ni escribas en la base sin pedirlo: no hay staging,
la base del local es la de producción y hay 4 personas reales usándola.
