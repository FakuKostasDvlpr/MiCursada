# Handoff — track de UI / fidelidad con el handoff de diseño

Complementa a `docs/HANDOFF-SESION.md` (que cubre datos, Moodle y arquitectura).
Este documento cubre **solo** el trabajo de llevar la app al diseño.

Cerrado el **17/08/2026**. Rama `main`.

---

## 0. Lo primero, antes de tocar nada

1. **La fuente de verdad es el `.html`, no el README.** El README del paquete de
   diseño describe por arriba; el `.html` tiene las medidas. Cada vez que se
   portó algo leyendo solo el README salió mal (ver §3). Si vas a tocar una
   pantalla, abrí `Mi Cursada.dc.html` y buscá el markup de esa pantalla.
2. **Hay un diseño nuevo esperando** en `design_handoff_mi_cursada/` (ver §5).
   No está implementado. Es el próximo trabajo.
3. **Para hacerlo, usá la skill `/portar-diseno`** (`.claude/skills/portar-diseno/`),
   que es este proceso escrito como receta: leer el `.html`, comparar con
   capturas, escribir el spec, implementar, verificar en navegador, limpiar.

---

## 1. Qué se hizo en esta sesión

### Bugs de fondo encontrados y arreglados

| Qué | Evidencia | Dónde |
|---|---|---|
| **Toda la app renderizaba en Segoe UI**, no en Plus Jakarta Sans | `getComputedStyle(body).fontFamily` devolvía el stack por defecto de Tailwind | `app/layout.tsx`, `app/globals.css` |
| **Los contadores del bento salían en blanco** con cualquier valor ≠ 0 | PENDIENTES valía 3 y no mostraba nada | `components/cifra-rodante.tsx` |
| **Las dos cards del login no medían lo mismo** | la de identidad quedaba corta y centrada | `components/login-entrada.tsx` |
| **La card del login ocupaba todo el alto del viewport** al colapsar | el contenido flotaba con un vacío enorme abajo | `components/login-entrada.tsx` |

**Fuentes** — causa: `next/font` ponía `--font-jakarta` en `<body>`, pero
`--font-sans` se consume desde `:root`; una custom property que referencia otra
indefinida hereda vacía, y `font-family: var(--font-sans)` moría. Las utilidades
`font-mono` de Tailwind sí andaban (van inlineadas), por eso los horarios
parecían bien y el resto no — eso confundió el diagnóstico un rato. Arreglado
moviendo las variables a `<html>` y declarando `--fuente-sans`/`--fuente-mono`
en `:root` (fuera de `@theme inline`, que **no emite** la property).

**Number-flow** — `translateY(-d * 100%)` es porcentaje de la **tira** (10em, los
diez glifos), no del dígito: se iba diez veces de largo. Ahora
`calc(d * -1em)`. **Este bug también está en el prototipo**; el port lo había
copiado fielmente.

**Login colapsado** — al colapsar, la card del formulario se va a ancho ~0 pero
sigue ocupando alto: su contenido se reacomoda en una columna larguísima y la
card de identidad, que está en `items-stretch`, se estira para igualarla. Se
resolvió con un piso de ancho (`min-w-[300px]`) al contenido del formulario: no
se reacomoda, se recorta, y la card A no cambia de tamaño — que es lo que pide
el handoff textualmente.

### Pantallas y features nuevas

- **Grafo** (5ª pestaña, §5 del handoff de diseño): `lib/grafo.ts` con la
  simulación de fuerzas propia (Coulomb, resortes 165/48, gravedad, damping .86,
  enfriamiento a .02) + 21 tests; `components/grafo.tsx` con focus de cadena al
  hover, tooltip anclado y click que navega; `app/(app)/grafo/page.tsx`.
  Las posiciones iniciales usan un hash del id y **no** `Math.random()`, para no
  romper la hidratación.
- **Toast de logro** (§6): `lib/logro.ts` + `components/logro.tsx`, montado en
  el layout de `(app)`. El editor avisa por evento (`cursada:nota-creada`)
  porque el hito cuenta las notas de **toda** la cursada.
- **Interruptor de tema + avatar con menú** en el header de Hoy, al pie del
  `.html` (62×34, knob ámbar que se corre `translateX(28px)`, íconos en
  `--acc-fg` del lado activo). La sidebar quedó con **solo el perfil** abajo.
- **Menú `/` al pie del `.html`**: kicker `BLOQUES`, glifos ámbar, nombres
  reales, filtro **por keywords** (`/kanban` encuentra "Ver tablero"), vacío
  «No hay ningún comando «/xxx».», y `/tablero` que cambia de vista sin crear
  bloque.
- **Vista Tablero** (kanban) con drag & drop desde el handle, `col-span-full`
  del visor, soltar en *Listo* marca `hecho`, `+ Agregar` que crea el bloque ya
  en el estado de esa columna. Se le sumaron links `→ en proceso` / `→ listo`
  por card porque **en touch no hay drag nativo**.
- **Referencias al curso desde las notas** (diseño nuevo, no está en el `.html`):
  marcador `[[mod:1234|Nombre]]` dentro del `texto`, sin campos nuevos. Un solo
  parser (`lib/referencias.ts`, 29 tests) para las dos formas: `@` inline (chip)
  y bloque `/curso` (card). Se re-resuelve siempre contra las secciones de hoy;
  si el módulo ya no está, queda tachado y la nota no se rompe.
- **Anotar / Realizar** en cada módulo de la tab Curso.
- **Bento de adjuntos** en la tab Curso + apertura del módulo por hover (220ms).

---

## 2. Estado verificable

```bash
npx tsc --noEmit          # limpio
npx next lint             # limpio
npx vitest run            # 409 tests
```

Capturas de todo lo anterior comparadas contra el prototipo. **La secuencia de
entrada del login se vio correr en un navegador por primera vez** (los dos
handoffs anteriores la daban por pendiente): se montó un Moodle de mentira y un
dev server aparte — receta completa en la skill.

---

## 3. Por qué "leé siempre el `.html`"

Casos concretos de esta sesión donde el README mentía o se quedaba corto:

| README | `.html` |
|---|---|
| "el toggle de tema vive en el header **en móvil**" | está en el header **siempre**, sin condicional |
| "botón de tema en la sidebar" | la sidebar abajo tiene **solo el perfil** |
| "tres filas en stagger" | son **chips** sobre `--bg`, borde, radio 12, label mono de ancho fijo 74px |
| "hint mono" | mono **11px `--tx4`**, con textos exactos |
| nada sobre el drag | el `draggable` va **en el handle**, no en la card |
| nada | soltar en *Listo* también marca `hecho` |
| nada | `+ Agregar` crea el bloque **en el estado de esa columna** |
| "/link (link con preview)" | el ítem se llama **"Link con preview"**, glifo `↗` |
| nada | el menú `/` filtra por **keywords**, no por prefijo del comando |
| "label de 76px" | 74px |

---

## 4. Trampas del repo (todas costaron una vuelta)

1. **Nunca corras `next build` ni borres `.next` con el dev server del usuario
   levantado.** Para levantar un server aparte:
   `NEXT_DIST_DIR=.next-verif CURSADA_DATOS_DIR=<copia> npx next dev -p 3210`.
2. **`TaskStop` mata el `npx` pero no el `next start` hijo.** Cerrá con
   PowerShell filtrando `Get-CimInstance Win32_Process` por `CommandLine`, y
   matá también los hijos por `ParentProcessId`.
3. **No corras `npx prettier --write`**: el repo no tiene config, prettier
   aplica sus defaults (comillas dobles) y te reescribe el archivo entero.
   Formateá con `npx next lint` y nada más.
4. **`noUncheckedIndexedAccess` está activo**: todo `arr[i]` es `T | undefined`.
   En loops usá `const a = arr[i]; if (!a) continue;`.
5. **Un `{/* comentario */}` no es válido en posición de expresión** (dentro de
   una rama de ternario). Va en posición de children o como `//` afuera del JSX.
6. **`@theme inline` NO emite la custom property.** Si necesitás
   `var(--x)` en CSS suelto, declarala en `:root` aparte.
7. Los hooks de **graphify**: `graphify query` antes de grepear, `graphify
   update .` después de cambiar código.
8. **El usuario suele tener trabajo sin commitear.** Antes de culpar a un cambio
   propio por un 500, stasheá **solo tu archivo** y volvé a probar.

---

## 5. Estado de los paquetes de diseño

- **17/08 (`design_handoff_mi_cursada/`)** — notas estilo Notion, tablero,
  modal de card, avisos vinculados, toasts y logro: **implementado** (specs en
  `specs/modal-de-card`, `specs/avisos-vinculados`, `specs/toasts-y-logro`,
  `specs/bloques-formato-y-referencias`, `specs/paginas-de-nota`; rama
  `handoff-ui-17-08`, mergeada a main el 18/08).
- **18/08 (`design_handoff_mi_cursada copy/`)** — trae además
  **`Mi Cursada Admin.dc.html`**: el panel de monitoreo. **Implementado el
  18/08** (spec en `specs/panel-admin/spec.md`): ruta `/admin` en el grupo
  `app/(admin)/` (header propio, sin el shell de la app), guarda doble
  sesión+`CURSADA_ADMIN_ID` con 404 para el resto, datos por
  `lib/admin-metricas.ts` (nunca contenido de notas — solo counts, fechas y
  nombres de materia), cálculos puros con tests en `lib/admin-calculos.ts`, y
  seed sintético (`lib/admin-demo.ts`) para dev sin Supabase, con badge "demo".
  Las adaptaciones respecto del prototipo (estados por umbral de
  `ultima_visita`, "Materias con más notas" en lugar de "Pantallas más usadas",
  sin dispositivo/versión) están todas en el spec §2, con motivo.
- **19/08 (`Mi Cursada - App de estudio (8)/design_handoff_onboarding_sesion/`)**
  — onboarding de 3 pasos + loader de anillos, modal de cierre de sesión y
  chevron + modal grande de aviso en la card de Hoy: **implementado el
  19/08** (spec en `specs/onboarding-y-salida/spec.md`).

  Tres cosas que conviene saber:

  1. **Las migraciones 0005 y 0006 ya están aplicadas en el proyecto remoto.**
     La 0005 agrega `perfiles.onboarding_en`; la 0006 es de **datos** y lo pone
     en `null` para todas las cuentas, así todos ven el onboarding una vez.
     Ojo: `supabase db push` falló la primera vez porque la tabla de historial
     de migraciones estaba vacía aunque el esquema estuviera en 0004 — se
     arregló con `supabase migration repair --status applied 0001 0002 0003 0004`.
     Si `db push` vuelve a querer re-crear tablas que ya existen, es eso.
     La verificación en navegador se hizo en modo local aislado, así que el
     camino Supabase **no se vio corriendo con Postgres**.
  2. **Este paquete cierra el R7 de `specs/avisos-vinculados`** (el modal grande
     de aviso), que estaba specado y sin implementar desde el 17/08 — en su
     lugar se había hecho el snippet inline de `components/nota-aviso.tsx`. El
     modal ahora existe en `components/aviso-modal.tsx` y lo abre el chevron de
     Hoy. **En `/avisos` y en la tab Avisos de la materia sigue estando solo el
     snippet**: sumarles el chevron quedó fuera de alcance (el handoff §3 es la
     card de Hoy).
  3. El onboarding se muestra **una sola vez por persona**, no en cada login
     como el prototipo — decisión del usuario, flag en `perfiles.onboarding_en`
     / `datos/perfil.json → onboardingEn`. Nada en `localStorage`. **No hay
     forma de volver a verlo** desde la UI: se resetea con SQL (§6).
  4. **El onboarding va ANTES del consentimiento** (decisión del 19/08; la
     primera versión hacía lo contrario). Nunca los dos a la vez: la decisión
     está en `capaDeEntrada()` (`lib/onboarding.ts`), con tests. Con el
     consentimiento pendiente **el loader se saltea**, porque su checklist dice
     "Sincronizando con el aula virtual" y `sincronizarAhora` exige
     consentimiento — ahí todavía no sincronizó nada. Si alguna vez se cambia
     ese copy o el gate del sync, revisar esa rama.

### Lo implementado del paquete nuevo (17/08)

Ya está en la app y verificado en el navegador:

- **Modelo**: `fmt` y `ref` como campos del bloque, `notaId` en el aviso. Los tres
  son opcionales y sobreviven a un guardado posterior (hay tests de round-trip:
  es el modo de falla que borra el overlay sin avisar).
- **Modal de detalle de card** (`components/modal-card.tsx`): 580px, badges de
  tipo y estado, textarea 17px, menús `/` y `@`, segmento de Estado, fila de
  Formato, select de Referencia, URL, check de hecha y Borrar de doble toque.
  Se abre desde la card del tablero y desde el `⋯` de cada fila.
- **Toast de acción** (`components/toast.tsx` + `lib/toast.ts`) con sus dos
  variantes, y el **logro reubicado** abajo a la derecha (además el keyframe
  estaba invertido: bajaba en vez de subir).
- **Copy y comandos exactos**: `/todo` en lugar de `/tarea`, sin `/curso`, y los
  placeholders del `.html`.
- **Snippet `NotaAviso`** en la lista de Avisos, con el riel del color de la materia.

Falta: el modal grande de aviso y el deep-link a la nota (spec 3), las páginas de
nota (spec 5) y el flag persistido del logro.

### La comparación completa está escrita (17/08)

Se leyó el `.html` nuevo entero y se cruzó contra el código. El resultado está en
**`specs/`**, cinco specs con las medidas del prototipo y la brecha contra cada
archivo del repo — ver `specs/README.md` para el orden y las dependencias:

| Spec | Qué agrega |
|---|---|
| `bloques-formato-y-referencias` | `fmt` y `ref` como campos del bloque, `/todo`, copy exacto, botón `⋯` |
| `modal-de-card` | El modal de 580px, click en la card, `+ Nueva card`, borrado con confirmación |
| `avisos-vinculados` | `notaId`, snippet `NotaAviso`, modal grande de aviso, deep-link a la nota |
| `toasts-y-logro` | El toast de acción (11 mensajes) y el logro reubicado abajo a la derecha |
| `paginas-de-nota` | Tipo `pagina` con `hijos[]` — el único que cambia la forma del overlay |

Tres cosas que salieron de esa lectura y conviene saber antes de implementar:

1. **`datos/avisos-manuales.json` ya existe y está vacío.** Un aviso nacido de una
   nota es un aviso manual con un campo más; el sync no lo puede pisar. No hace
   falta inventar nada para tener avisos de origen local.
2. **El overlay de bloques tiene 5 registros, cuatro con `texto` vacío.** Cualquier
   migración de esquema es gratis hoy y cara en un mes.
3. **`bloqueLocalSchema` descarta lo que no declara.** Si se escribe un campo nuevo
   antes de sumarlo al schema, la próxima lectura lo tira y el archivo se reescribe
   sin él. Los overlays son irrecuperables: el schema va primero, siempre.

Se anotaron **14 bugs del propio prototipo** repartidos en los specs (el drag dentro
de una página que reordena la raíz, el menú `@` que se come el texto, el `¿SEGURO?`
que comparte timer con el del modal, el logro cuyo gate vuelve inalcanzable su propia
tabla de hitos). Ninguno se copia: cada spec dice qué se hace en su lugar y por qué.

Además, `HANDOFF.md` y `Mi Cursada.dc.html` **en la raíz del repo siguen siendo
la versión vieja** (sin Grafo, sin Logro, sin lo del 17/08). Ya hizo perder
tiempo dos veces. Conviene reemplazarlos por los del paquete nuevo, o borrarlos
y dejar solo la carpeta.

---

## 6. Backlog abierto (decisiones del usuario, no bugs)

- **Avatar**: `datos/avatar.png` es un PNG casi en blanco de 249 bytes subido a
  mano desde `/perfil`. **La app nunca baja la foto de Moodle** (no hay una sola
  referencia a `profileimageurl`). Se ve como un círculo blanco donde el diseño
  pone el ámbar con iniciales. Opciones: borrar el archivo, subir una foto, o
  implementar la bajada desde el aula virtual.
- **23 videos con `preload="metadata"` a la vez** en el módulo
  "Videotutoriales de BPMN". Pasaba antes del bento también. Falta decidir:
  cargar solo el que entra en pantalla, o `preload="none"` con póster.
- **El click en una referencia abre la tab Curso pero no hay deep-link por URL**
  (es estado interno de `MateriaDetalle`). Desde el Grafo se navega a la materia
  sin abrir la tab.
- El subtítulo de la secuencia de entrada dice `SEDE_Y_TURNO`
  ("Almagro · Turno noche"); el prototipo dice "Turno noche · Lun a Sáb
  18:10–21:30". Es una constante de `lib/instituto.ts`, se dejó a propósito.
- **Volver a ver el onboarding a pedido**: desde la UI no hay forma. Para
  resetearlo hay que ir a SQL (`update public.perfiles set onboarding_en = null`),
  que es lo que hace la migración 0006. Un botón en `/manual` lo resolvería,
  pero no se implementó (no lo pedía el handoff).
- **El chevron + modal grande de aviso solo está en Hoy** (19/08). En `/avisos`
  y en la tab Avisos de la materia sigue el snippet inline. Si se quiere
  consistencia, `components/aviso-modal.tsx` ya es reusable.

---

## 7. Higiene al terminar

Todo lo que se levante durante la verificación hay que bajarlo:

- Sesiones de prueba agregadas a `datos/sesiones.json` → borrarlas por su hash.
- `datos/bloques.json` y demás overlays → **son irrecuperables**, hacer copia
  antes de cualquier prueba que escriba y restaurar después.
- `.next-verif`, copias de `datos/`, servers de mentira y dev servers extra →
  matarlos y borrarlos.
- `graphify update .` al final.
