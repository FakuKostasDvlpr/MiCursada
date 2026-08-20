# Spec — Onboarding con loader, salida con confirmación y detalle de aviso desde Hoy

Fuente: `Mi Cursada - App de estudio (8)/design_handoff_onboarding_sesion/`
(`Mi Cursada.dc.html` como fuente de verdad, `README.md` como índice).

Tres piezas independientes que llegaron en el mismo paquete:

| # | Pieza | Estado antes de este spec |
|---|---|---|
| 1 | Onboarding de 3 pasos + loader de anillos | no existe |
| 2 | Modal de confirmación al cerrar sesión | existe con diseño y copy propios |
| 3 | Fila de aviso con checkbox + chevron y modal grande de detalle en Hoy | la fila es un `<Link href="/avisos">`; el modal grande nunca se implementó |

## 1. Por qué

**Pieza 1.** La app no explica nada de lo que hace. Hay `/manual`, pero nadie
entra a un manual antes de usar algo. Después del login se cae directo en Hoy,
que arranca casi vacío hasta que armás la semana.

**Pieza 2.** `components/cerrar-sesion.tsx` ya confirma, pero con el `Modal`
genérico (título 17px + ✕) y copy propio. El handoff define una variante
distinta: tile rosa 44×44 con ícono de salida, sin fila de título, sin ✕, y dos
botones parejos `Quedarme` / `Cerrar sesión` (el destructivo en `#fb7185`, no en
ámbar). Hoy el botón peligroso está en ámbar, que es el color de "seguí".

**Pieza 3.** Evidencia concreta, `components/hoy-live.tsx:261-293`: la fila del
aviso es un `<Link href="/avisos">`, y el círculo de 20px del checkbox es un
`<span aria-hidden>` decorativo — **no marca nada**. Se ve un checkbox que no
se puede tocar. Además `specs/avisos-vinculados/spec.md:149` (R7, el modal
grande de aviso) quedó **sin implementar**: en su lugar se hizo el snippet
inline de `components/nota-aviso.tsx`. Ese requisito sigue abierto y este
handoff lo vuelve a pedir, ahora también desde Hoy.

## 2. Adaptaciones respecto del handoff

El prototipo es una demo con `localStorage`, login falso y timers fijos. La app
tiene Moodle, sesión real y overlays irrecuperables.

- **A1 — El onboarding se muestra una sola vez, no en cada login.** El
  prototipo no persiste nada (`README.md:177`) y él mismo recomienda el flag
  por usuario en el backend. En una app de uso diario, tres pasos y 3,4 s de
  loader en cada ingreso son fricción pura. **Decisión del usuario.** Se
  persiste en `perfiles.onboarding_en` (modo Supabase) y en
  `datos/perfil.json → onboardingEn` (modo local). Nada en `localStorage`.
- **A2 — El overlay se monta en el layout de `(app)`, no en una pantalla
  `pantalla === 'onboarding'`.** La app no tiene una máquina de estados de
  pantalla: tiene rutas. El layout ya monta el `Consentimiento` con el mismo
  patrón (capa encima de la app difuminada), así que el onboarding reusa ese
  lugar. Consecuencia buscada: el onboarding aparece sobre **cualquier** ruta de
  `(app)`, no solo sobre Hoy — si recargás en `/semana` con el flag sin
  escribir, sale ahí.
- **A3 — Onboarding y consentimiento no se apilan, y el onboarding va PRIMERO.**
  Dos overlays con blur uno sobre otro no se leen, así que se muestra uno a la
  vez. El orden lo decide `capaDeEntrada()` (`lib/onboarding.ts`), que está
  testeada: primero la presentación, después el permiso — tiene más sentido
  contar qué hace la app y recién ahí pedirlo. **Decisión del usuario
  (19/08)**; la primera versión hacía lo contrario.

  Con el consentimiento pendiente **el loader se saltea**: su checklist dice
  "Sincronizando con el aula virtual" y `sincronizarAhora` exige consentimiento
  (`app/actions-moodle.ts:205`), así que ahí todavía no sincronizó nada y el
  texto sería falso. `Empezar`/`Saltar` cierra el overlay y aparece el
  consentimiento; el sync real lo dispara `aceptarConsentimiento`, que ya tiene
  su propio feedback. Para quien ya consintió, el loader va completo.

  Consecuencia asumida: `terminarOnboarding()` escribe `onboarding_en` **antes**
  del consentimiento. Es coherente con lo que ya pasa — la fila de `perfiles` se
  crea en el login, también antes de consentir — y no es un dato personal sino
  un flag de UI. Sin persistirlo, el onboarding volvería a salir después de
  aceptar.
- **A4 — El loader es un beat de cierre, no una carga real.** La app ya baja
  los datos de verdad durante el login (`montarCursada()` en
  `components/login-entrada.tsx:100`): cuando el onboarding aparece no queda
  nada por cargar. Se conserva la timeline exacta del handoff porque cierra la
  secuencia y se ve una sola vez. Los textos del checklist describen lo que
  **ya pasó** en el login, así que no mienten. **Decisión del usuario.**
- **A5 — El loader de KokonutUI se implementa vendorizado, en CSS.** El README
  pide `pnpm dlx shadcn@latest add @kokonutui/loader`. El repo no tiene `motion`
  ni ninguna librería de animación (`CLAUDE.md`: "Nada más — si una dependencia
  no la usa nadie, se va"), y ya hay precedente de vendorizar un componente de
  Kokonut sin dependencia nueva (`components/kokonutui/avatar-picker.tsx`). Los
  anillos del prototipo ya están adaptados a la paleta del proyecto, así que se
  portan tal cual a `components/kokonutui/loader.tsx`.
- **A6 — Copy del modal de salida.** El handoff dice "Vas a tener que entrar de
  nuevo **con tu correo**". En esta app no se entra con un correo: se entra con
  el usuario y la contraseña del aula virtual (`app/actions-sesion.ts`). Se
  cambia solo esa cláusula: *"Vas a tener que entrar de nuevo con el usuario del
  aula virtual."* Todo el resto del copy es literal.
- **A7 — El chevron no va anidado dentro del botón de la fila.** El prototipo
  mete un `<span role="button">` adentro del `<button>` de la fila
  (`.html:459`): un interactivo dentro de otro, HTML inválido y sin navegación
  por teclado. Mismo arreglo que ya se hizo en `components/nota-aviso.tsx` y en
  `components/avisos-lista.tsx`: los dos controles son hermanos dentro de un
  contenedor con el borde.
- **A8 — Sin `Marcar como pendiente` desde Hoy.** El modal grande lo tiene
  (R7.7) porque en `/avisos` se ve la sección Hechos. La lista de Hoy solo trae
  pendientes: al marcar uno hecho, sale de la lista y el modal se cierra.
- **A9 — Reduced motion.** El prototipo no lo implementa
  (`README.md:168`). Acá sí: todas las animaciones nuevas entran al bloque
  `@media (prefers-reduced-motion: reduce)` de `app/globals.css`.

## 3. Requisitos

### R1 — Persistencia del flag

- **R1.1** `Perfil` (`lib/types.ts`) gana `onboardingEn: string | null` — ISO de
  cuándo se terminó el onboarding, `null` si todavía no.
- **R1.2** Modo Supabase: migración `0005_perfiles_onboarding.sql` con
  `alter table public.perfiles add column onboarding_en timestamptz;`.
  `getPerfil()` lo suma al `select` y al mapeo.
- **R1.3** Modo local: `perfilArchivoSchema` gana
  `onboardingEn: z.string().nullable().default(null)`. **El schema va primero**:
  `perfilArchivoSchema` descarta lo que no declara, así que escribir el campo
  antes de declararlo lo perdería en la próxima lectura. `escribirPerfilLocal`
  lo **conserva** (`undefined` = dejar el guardado), igual que `sede` y
  `avatarUrl`.
- **R1.4** Server Action `terminarOnboarding()` en `app/actions-sesion.ts`:
  chequea acceso por su cuenta (es un POST, no pasa por el layout), escribe el
  ISO en el modo que corresponda y `revalidatePath('/', 'layout')`. Nunca
  redirige. Si falla, **no** bloquea: el overlay se cierra igual en el cliente
  (perder el flag reabre el onboarding una vez; no dejar entrar es peor).

### R2 — Overlay del onboarding

- **R2.1** `position: fixed; inset: 0; z-index: 70` (por encima del toast, que
  está en 60), flex centrado, `padding: 24px`, `overflow-y: auto`.
- **R2.2** Fondo `rgba(2,6,23,.62)` + `backdrop-filter: blur(10px)` con prefijo
  `-webkit-`. Entrada `fadeIn .5s ease`.
- **R2.3** Se monta cuando hay fila de perfil y `!perfil.onboardingEn`, **antes**
  del consentimiento (A3). La decisión sale de `capaDeEntrada()`; el layout no
  la calcula. La app de atrás va con `aria-hidden` + `inert` mientras haya
  cualquiera de las dos capas.
- **R2.4** El overlay **no** se cierra con click afuera ni con Escape: es la
  presentación, se sale con `Saltar` o completando los pasos.

### R3 — Paso de contenido

- **R3.1** Bloque `max-width: 480px`.
- **R3.2** Fila superior: kicker `Paso N de 3` (mono 10.5px/600, `.16em`,
  uppercase, `--tx3`) a la izquierda; botón texto `Saltar` (13px/700, `--tx3`,
  `min-height: 44px`) a la derecha.
- **R3.3** Card: `background: --sup`, `border: 1px solid --bor`,
  `border-radius: 20px`, `padding: 34px 30px`, `margin-top: 10px`. Anima con
  `onbPasoIn .5s cubic-bezier(.22,.8,.3,1) both` en **cada** cambio de paso: se
  remonta con `key={paso}`.
- **R3.4** Tile de ícono 58×58, radio 16px, fondo por paso `#fbbf24` / `#38bdf8`
  / `#a78bfa`. Ícono 27px, stroke `#221a00`, width 2, linecap/linejoin round:
  calendario, documento, grafo de 3 nodos. Se usa Lucide
  (`CalendarDays`, `FileText`, `Share2`) — el handoff dice que Lucide es
  equivalente (`README.md:201`).
- **R3.5** Título `h2` 25px/800, `letter-spacing: -.015em`, `line-height: 1.25`,
  `margin-top: 20px`. (`h2` y no `h1`: la página de atrás ya tiene su `h1`.)
- **R3.6** Descripción 14.5px, `line-height: 1.6`, `--tx2`, `margin-top: 10px`.
- **R3.7** Tres filas de feature (`margin-top: 20px`, columna, `gap: 10px`):
  fondo `--bg`, borde `--bor`, radio 12px, `padding: 11px 14px`, `gap: 11px`;
  dot 7×7 del color indicado, texto 13.5px/600 `--tx` con `flex: 1`, tag mono
  10px `--tx4`.
- **R3.8** Contenido **exacto** de los tres pasos (`.html:1908-1919`):

  | Paso | Tile | Título | Descripción |
  |---|---|---|---|
  | 1 | `#fbbf24` | `Tu semana, de un vistazo` | `En Hoy ves tu próxima clase con cuenta regresiva, las clases del día y los avisos que vencen. En Semana, tu grilla de lunes a sábado.` |
  | 2 | `#38bdf8` | `Notas como en Notion` | `Cada materia tiene su documento: escribí con /comandos (títulos, to-dos, links, páginas), referenciá archivos y materias con @, y organizá las cards en un tablero kanban.` |
  | 3 | `#a78bfa` | `Todo conectado` | `Los avisos se vinculan a tus notas, el Grafo muestra toda tu cursada como red interactiva, y el scraper del aula virtual trae datos solo.` |

  Features (texto · dot · tag):
  - Paso 1: `Próxima clase con estado en vivo` `#fbbf24` `HOY` ·
    `Día actual resaltado en la semana` `#38bdf8` `SEMANA` ·
    `Avisos: hoy en ámbar, vencidos en rojo` `#fb7185` `AVISOS`
  - Paso 2: `/todo crea checkboxes · Enter encadena` `#34d399` `/ COMANDO` ·
    `@Guía 5 (PDF) referencia archivos` `#a78bfa` `@ REF` ·
    `Por hacer · En proceso · Listo` `#38bdf8` `TABLERO`
  - Paso 3: `Crear aviso desde una nota` `#fb7185` `AVISO` ·
    `Grafo estilo red: hover y click` `#a78bfa` `GRAFO` ·
    `Sincronizado con el aula virtual` `#34d399` `SYNC`
- **R3.9** Fila inferior (`margin-top: 20px`, space-between): dots de progreso
  (`gap: 7px`, alto 8px, radio 999px; activo **26px** de ancho en `--acc`,
  inactivos 8px en `--bor2`, transición `width .3s ease, background .3s ease`),
  clickeables y con `aria-label`; botón primario `--acc-bg` / `--acc-fg`,
  14.5px/700, radio 12px, `min-height: 48px`, `padding: 0 26px`, label
  `Siguiente` en pasos 1–2 y `Empezar` en el 3.

  El fondo del botón va en `--acc-bg` (no `--acc`): en tema claro `--acc` se
  oscurece a `#b45309` y es solo para texto (`CLAUDE.md`, Tokens de diseño). Los
  dots activos sí van en `--acc`, que es un acento.

### R4 — Loader

- **R4.1** Reemplaza la card dentro del **mismo** overlay. Columna centrada,
  `max-width: 380px`, `gap: 26px`, entrada `fadeIn .4s ease`.
- **R4.2** Anillos 74×74 (`components/kokonutui/loader.tsx`): externo `inset: 0`,
  `conic-gradient(from 0deg, transparent 0deg, rgba(251,191,36,.15) 120deg, #fbbf24 320deg, transparent 360deg)`,
  máscara `radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))`,
  `spin 1.15s linear infinite`; interno `inset: 11px`,
  `conic-gradient(from 180deg, transparent 0deg, rgba(56,189,248,.12) 140deg, #38bdf8 310deg, transparent 360deg)`,
  máscara de 2.5px, `spin 1.7s linear infinite reverse`. Sin punto central.
- **R4.3** Título `Preparando tu cursada…` 18px/800, `letter-spacing: -.01em`,
  con shimmer (`linear-gradient(90deg, var(--tx3), var(--tx) 50%, var(--tx3))`,
  `background-size: 200% 100%`, `background-clip: text`, `color: transparent`,
  `shimmerTxt 1.6s linear infinite`). Subtítulo
  `Esperá un momento, estamos dejando todo listo.` 13.5px `--tx3`,
  `margin-top: 6px`. El bloque va con `margin-top: -8px`.
- **R4.4** Checklist de 3 ítems (ancho completo, columna, `gap: 12px`,
  `gap: 11px` por fila): `opacity: 1` si está hecha o activa, `.45` si está
  pendiente, transición `.35s`.
  - hecha: círculo 20px `#34d399` con check 11px stroke `#06251a` width 3.4,
    entrada `popCheck .35s cubic-bezier(.3,1.4,.4,1)`; texto 14px/600 `#34d399`.
  - activa: spinner 20px (`border: 2.5px solid --bor2`, `border-top-color: --acc`,
    `spin .7s`); texto 14px/600 con shimmer `1.3s`.
  - pendiente: círculo 20px `border: 2.5px solid --bor`; texto 14px/600 `--tx3`.
  - Textos: `Sincronizando con el aula virtual` → `Cargando materias y horarios`
    → `Preparando notas y tablero`.
- **R4.5** Pie: mono 10px, `.14em`, uppercase, `--tx4`: `No cierres la app`.
- **R4.6** Timeline (ms desde `Empezar`/`Saltar`): tarea 1 activa en **0**,
  tarea 2 en **950**, tarea 3 en **1850**, todas hechas en **2700**, overlay
  cerrado en **3400**. Los timers se acumulan y se limpian al desmontar.
  `terminarOnboarding()` se dispara **al cerrar el overlay**, no al arrancar la
  timeline: la action hace `revalidatePath('/', 'layout')` y ese re-render, con
  el flag ya escrito, desmonta el overlay — disparándola al arrancar, el loader
  no se veía nunca (ver §5, D1).
- **R4.7** El checklist va con `role="list"` y `aria-live="polite"` en el
  contenedor: el lector de pantalla anuncia el progreso sin interrumpir.

### R5 — Modal de cierre de sesión

- **R5.1** Reemplaza el cuerpo del modal actual de `components/cerrar-sesion.tsx`.
  Reusa el `Modal` de 440px (`ancho="estandar"`) — ya trae overlay
  `rgba(2,6,23,.72)`, sheet inferior en ≤640px, radios y `max-height`.
- **R5.2** **Sin** fila de título ni ✕: se pasa `encabezado` vacío. El
  `aria-label` del `role="dialog"` sigue siendo el `titulo`.
- **R5.3** Fila superior (`gap: 14px`, `align-items: flex-start`): tile 44×44,
  radio 13px, `background: rgba(251,113,133,.12)`,
  `border: 1px solid rgba(251,113,133,.35)`, ícono `LogOut` 20px stroke
  `#fb7185` width 2.
- **R5.4** Título `¿Cerrás sesión?` 17px/800, `letter-spacing: -.01em`.
  Descripción `margin-top: 6px`, 13.5px, `line-height: 1.55`, `--tx2`:
  `Tus materias, notas y avisos quedan guardados. Vas a tener que entrar de nuevo con el usuario del aula virtual.` (A6).
- **R5.5** Acciones (`margin-top: 20px`, `gap: 10px`, ambos `flex: 1`,
  `min-height: 48px`, radio 12px): `Quedarme` sin fondo, `border: 1px solid
  --bor2`, `--tx2` 14px/700, cierra el modal; `Cerrar sesión` fondo `#fb7185`,
  texto `#20060b` 14.5px/700, sin borde, hace el submit del
  `<form action={cerrarSesion}>`.
- **R5.6** Se conserva el `useFormStatus` que ya estaba: mientras el submit está
  pendiente el botón dice `Saliendo…` y queda deshabilitado. El prototipo no lo
  tiene porque su logout es instantáneo; acá hay red de por medio.

### R6 — Fila de aviso en Hoy

- **R6.1** Contenedor por fila: `background: --bg`, `border: 1px solid --bor`,
  radio 12px, `min-height: 52px`, flex `gap: 12px`, `padding: 8px 12px` (A7).
- **R6.2** Botón de toggle (`flex: 1`, `min-width: 0`): círculo 20×20
  `border: 2px solid --bor2` vacío + bloque de texto (título 14px/600 truncado a
  una línea; debajo `margin-top: 3px`, `gap: 6px`: dot 6×6 del color de la
  materia — o `#64748b` si no tiene — y nombre 12px `--tx3`, o `General`) +
  fecha mono 12px `dd/mm` con sufijo ` · vencido` en `--vencido`, ` · hoy` en
  `--acc`, sin sufijo y en `--tx3` si es futuro. El estado sale de
  `estadoAviso()` (`lib/cursada.ts`), que ya compara en
  `America/Argentina/Buenos_Aires`.
- **R6.3** Tocar el toggle marca el aviso como hecho: update optimista con
  `useOptimistic` + `toggleAviso(id, true)` y toast verde
  `lanzarToast(…, 'ok')`. El aviso sale de la lista (la lista es solo
  pendientes). Mensaje del toast: `Aviso marcado como hecho` — el mismo que ya
  usa `/avisos`, si existe; si no, se define acá.
- **R6.4** Chevron: `<button>` 32×32, `border: 1px solid --bor`, radio 9px, grid
  centrado, `--tx3`, `ChevronRight` 14px, `aria-label="Ver detalle del aviso"`,
  `title="Ver detalle"`. Abre el modal grande; **no** marca nada. Al no estar
  anidado (A7) no hace falta `stopPropagation`.
- **R6.5** El chevron mide 32px, por debajo del mínimo táctil de 44px del
  handoff (`README.md:166`). Se mantiene el cuadrado visible de 32px y se
  agranda el área tocable a 44px con un `::after` (`padding`/`inset` negativo),
  como ya se hace en otros controles chicos del repo. Si eso no se puede sin
  romper el layout de la fila, gana el mínimo táctil y se anota acá.
- **R6.6** Estado vacío: caja `border: 1px dashed --bor`, radio 12px,
  `padding: 16px`, centrada, 13.5px `--tx3`, texto `Nada pendiente. Tranquilo.`
  (ya está así).
- **R6.7** `Ver todos` (13px/700, `--acc`, `min-height: 44px`) sigue siendo el
  link a `/avisos`. Es la única navegación que queda en la card: la fila ya no
  navega.

### R7 — Modal grande de aviso (cierra el R7 de `avisos-vinculados`)

Componente nuevo `components/aviso-modal.tsx`, compartible.

- **R7.1** `Modal` con `ancho="card"` (580px en desktop, sheet en móvil).
  El handoff de `avisos-vinculados` decía 440px; este dice **580px**
  (`README.md:150`). Gana el paquete nuevo.
- **R7.2** Encabezado propio: kicker `Aviso` + ✕ de 44×44 (`encabezado`).
- **R7.3** Título 21px/800, `letter-spacing: -.015em`, `line-height: 1.3`, `--tx`.
- **R7.4** Fila meta (`margin-top: 12px`, `gap: 14px`, `flex-wrap`): dot 8×8 del
  color de la materia + nombre 13.5px/600 `--tx2` (`gap: 7px`); fecha mono
  12.5px `--tx3` en `dd/mm/yyyy`; badge de estado mono 10.5px/600, `.08em`,
  uppercase, color y borde iguales, radio 999px, `padding: 3px 10px`.
- **R7.5** Badge, en este orden de precedencia: `Hecho` `#34d399` si `hecho`;
  `Vencido` `--vencido` si fecha < hoy; `Vence hoy` `--acc` si fecha == hoy;
  `Pendiente` `--tx2` el resto.
- **R7.6** Nota vinculada (si el aviso tiene `notaId` y el bloque existe):
  kicker `Nota vinculada`; caja fondo `--bg`, borde `--bor`,
  `border-left: 3px solid {color de la materia}`, radio 12px,
  `padding: 14px 16px`; texto **sin truncar** 14.5px, `line-height: 1.6`,
  `--tx`, `white-space: pre-wrap`. Pie (`margin-top: 10px`, `gap: 8px`): tipo
  mono 10px `.1em` uppercase `--tx4`, dot 6×6, estado mono 10.5px, y a la
  derecha `Abrir la nota →` (13px/700, `--acc`) que navega a
  `/materias/{materiaId}?nota={notaId}` — el deep-link que ya entiende
  `components/materia-detalle.tsx:102`.
- **R7.7** Acciones (`margin-top: 22px`, `gap: 10px`): primario `flex: 1`,
  `--acc-bg`/`--acc-fg`, radio 12px, 14.5px/700, alto 48px, label
  `Marcar como hecho`; y `Cerrar` transparente, `border: 1px solid --bor2`,
  `--tx2`, radio 12px, 14px/700, alto 48px, `padding: 0 18px`.
- **R7.8** Al marcar hecho: se cierra el modal y se dispara el mismo toast que
  R6.3. Sin `Marcar como pendiente` (A8).

### R8 — Animaciones

- **R8.1** Keyframes nuevos en `app/globals.css`, con los nombres del repo
  (kebab-case) y el del handoff en el comentario: `onb-paso-in` (`onbPasoIn`),
  `shimmer-txt` (`shimmerTxt`), `girar-inv` (el `spin … reverse` del anillo
  interno, para no depender de `animation-direction` en un `style` inline).
- **R8.2** Reutilizados: `scrim-in` (fadeIn), `pop-check` (popCheck),
  `girar` (spin), `card-in` (cardIn), `sheet-up` (sheetUp).
- **R8.3** `@media (prefers-reduced-motion: reduce)`: `.onb-paso-in`,
  `.shimmer-txt` y las dos clases de anillo quedan en `animation: none`. El
  shimmer sin movimiento sería un degradado fijo ilegible, así que en reduced
  motion el texto vuelve a `color: var(--tx)` plano.
- **R8.4** El `cardIn` del dashboard al cerrar el overlay (y el flag `entrando`
  que el prototipo apaga a los 4900 ms) **no** se porta: el contenedor de la app
  es un Server Component compartido por todas las rutas y meterle una clase
  desde el overlay obliga a tocar `document.body` desde el cliente. El overlay
  se va con su propio fade. Se anota como lo único de la timeline que queda
  afuera.

## 4. Fuera de alcance

- El chevron y el modal grande en `/avisos` y en la tab Avisos de la materia. El
  handoff §3 es la card de Hoy; esas dos pantallas ya muestran el snippet inline
  y sumarles el chevron es scope que este paquete no pide.
- Volver a ver el onboarding a pedido (enlace en `/manual` que borre el flag).
- Bajar el paquete oficial `@kokonutui/loader` del registry (A5).
- Cualquier otra pantalla del prototipo: el README es explícito en que el resto
  es contexto (`README.md:11`).

## 5. Desviaciones que aparecieron implementando

**D1 — `terminarOnboarding()` mataba el loader.** El spec original (R4.6) decía
disparar la action al arrancar la timeline, "en paralelo". Error: la action hace
`revalidatePath('/', 'layout')`, y ese re-render encuentra `onboarding_en` ya
escrito → el layout deja de renderizar `<Onboarding />` y el overlay se
desmonta a los ~300 ms. Medido en el navegador: a los 1200 ms `.anillo-ext` ya
no existía en el DOM. Arreglado moviendo la llamada al cierre (3400 ms), junto
al `setCerrado(true)`. R4.6 quedó reescrito.

**D2 — El nombre de materia estiraba la fila de Hoy a 89px.** El handoff pide
`min-height: 52px`. Ni el prototipo ni el código previo truncan el nombre de la
materia en la subfila, porque la demo usa nombres cortos. Los reales del aula
virtual son `Taller de Herramientas de Programación – Plan 2 años 2°Semestre
2026` y envolvían en **tres líneas** (medido: 89px). Se agregó `min-w-0` +
`truncate`. La fila quedó en 57px, que es el alto natural del contenido de dos
líneas con el padding del handoff — el 52 es piso, no techo.

**D3 — El menú del avatar quedaba abierto detrás del modal de salida.** El
handoff (§2, *Disparadores*) dice que al disparar "cierra el menú del avatar y
abre el modal". No se podía hacer sin partir el componente: `MenuPerfil`
desmonta su contenido al cerrarse, así que un modal montado adentro se iba con
él. Se separó `components/cerrar-sesion.tsx` en `FilaSalir` (el disparador del
menú) y `ModalSalir` (el modal), y `MenuPerfil` monta el modal **afuera** del
menú con su propio estado. `CerrarSesion` sigue existiendo igual para la
sidebar y el perfil, donde el disparador no vive en un popover.

**D4 — El README dice que la fila de Hoy dispara un toast; el `.html` no.**
`avVm.toggle` (`Mi Cursada.dc.html:1580`) solo muta el aviso, sin
`lanzarToast`. Se implementó **con** toast (`Aviso marcado como hecho`, verde):
la fila desaparece de una lista de tres y sin confirmación se lee como un bug.
Un caso más de README ≠ prototipo.

**D5 — El campo `hayNota` del prototipo esconde la nota si el aviso está
hecho** (`hayNota: !!nb && !a.hecho`). En Hoy no aplica porque la lista es solo
de pendientes, pero se copió el criterio en `app/(app)/page.tsx`: los avisos
hechos no resuelven su `ResumenNota`, así que tampoco viaja al cliente.

**D6 — El `cardIn` del dashboard al cerrar el overlay quedó afuera**, como
anticipaba R8.4. El overlay se va con su propio fade y la app de atrás no
anima. Es lo único de la timeline del handoff que no se portó.

**D7 — El ancho del anillo mide 90px, no 74px, si se lo mide con
`getBoundingClientRect()`.** No es un bug: el elemento está rotando y el rect
devuelve el bounding box del cuadrado rotado (74·√2 ≈ 104 en el peor ángulo).
Queda anotado para que la próxima medición no lo persiga.

**D8 — La migración sí se aplicó, después de un desvío.** `supabase db push`
falló queriendo re-crear `cursos`: el esquema remoto estaba en 0004 pero la
tabla de historial de migraciones estaba **vacía** (se habían aplicado a mano).
Se arregló con `supabase migration repair --status applied 0001..0004` y después
el push aplicó solo la 0005. En el camino, el editor SQL del dashboard daba
`42P01: relation "public.perfiles" does not exist` porque el navegador estaba
logueado con una cuenta que no es miembro de la org **CWC**, que es donde vive
el proyecto.

**D9 — El orden se dio vuelta (19/08).** Ver A3. Trajo `capaDeEntrada()` a
`lib/onboarding.ts` con 7 tests: la decisión de qué capa se muestra dejó de
estar inline en el layout.

**D10 — Reset del flag para todas las cuentas.** `0006_reset_onboarding.sql` es
una migración de **datos**, no de esquema: pone `onboarding_en` en `null` para
todos, porque las pruebas de verificación se lo habían escrito a algunas cuentas
(entre ellas la del dueño) y nunca lo habrían visto. Va como migración porque es
la única vía versionada para escribir en el remoto — `supabase db query` pide un
access token de plataforma (`supabase login`, interactivo) que el entorno no
tiene.

**D11 — `sinLoader` no se pudo ver en modo Supabase.** La rama
`onboarding-sin-loader` → `consentimiento` se verificó en el navegador forzando
`conSupabase: true` en el layout de un entorno local aislado (cambio temporal,
revertido: no queda ningún `TEMPORAL-VERIF` en el árbol). Reproducirla de verdad
habría exigido poner en `null` el `consentimiento_en` de una cuenta real, y eso
la obligaría a consentir otra vez.

## 6. Verificación

### Lo que falta hacer a mano

**La migración `0005_perfiles_onboarding.sql` no está aplicada.** Hasta que
corra, en modo Supabase `getPerfil()` pide una columna que no existe y todo
`(app)` devuelve 500. Se aplica con `npx supabase db push` (el CLI ya está
linkeado a `MiCursada`) o pegando el `alter table` en el editor SQL.

### Lo que se corrió (2026-08-19)

- `npx vitest run` → **32 archivos, 592 tests en verde**. De esos, 24 son los
  nuevos de `lib/onboarding.ts` (copy exacto, voseo, kicker, label del botón,
  estado de cada tarea según la timeline, y que hay un paso de timeline por
  tarea más el de "todas hechas") y de `badgeAviso` / `fechaLargaAviso`.
- `npx tsc --noEmit` y `npx next lint` → limpios.
- Navegador (Playwright, `deviceScaleFactor: 2`), **modo local aislado**: copia
  de `datos/` en el scratchpad, `CURSADA_DATOS_DIR` apuntado ahí,
  `NEXT_DIST_DIR=.next-verif` y las env de Supabase vaciadas. Ni el `datos/`
  real ni el `.next` ni el dev server del usuario se tocaron (`git status
  datos/` vacío al final). 4 combinaciones: 1440×900 y 390×844 × oscuro y claro.

**Medido, no deducido:**

| Qué | Handoff | Medido |
|---|---|---|
| Card del paso: ancho / radio / padding / fondo | 480px / 20px / `34px 30px` / `--sup` | 480px / 20px / `34px 30px` / `rgb(15,23,42)` |
| Overlay: fondo / blur / z-index | `rgba(2,6,23,.62)` / 10px / 70 | idéntico |
| Título del paso | 25px / 800 / Plus Jakarta Sans | idéntico (no cayó a Segoe UI) |
| Dots de progreso | 26 / 8 / 8 px | 26 / 8 / 8 |
| Tile de ícono | 58×58, `#fbbf24` | 58×58, `rgb(251,191,36)` |
| Anillo externo / interno | `spin 1.15s` / `1.7s reverse` | `girar 1.15s` / `girar-inv 1.7s` |
| Opacidad del checklist (hecha/activa/pendiente) | 1 / 1 / .45 | 1 / 1 / 0.45 |
| Chevron: visible / tocable | 32×32 / ≥44 | 32×32 / 44×44 |
| Fila del aviso | `min-height: 52px` | 57px (contenido de dos líneas + padding) |
| Panel del modal de aviso | 580px | 580px |
| Badge de estado | `Vencido` en `#fb7185` | `Vencido`, `rgb(251,113,133)` |

**Comportamiento verificado:**

1. Con `onboardingEn` en `null`, entrar: sale el overlay difuminado sobre Hoy;
   los tres pasos avanzan con `Siguiente` y con los dots; `Empezar` corre el
   checklist completo y el overlay se va. ✓ (en las 4 combinaciones)
2. Recargar: **no** vuelve a salir, y `datos/perfil.json` quedó con
   `onboardingEn` en ISO. ✓ (en las 4)
3. Menú del avatar → `Cerrar sesión`: el menú **se cierra** y sale el modal
   nuevo, centrado en desktop y como sheet inferior en móvil. ✓
4. Chevron en Hoy → abre el modal grande sin marcar nada. ✓

**No verificado en el navegador:** `Abrir la nota →` y el bloque de nota
vinculada — el `datos/bloques.json` de esta instancia no tiene ningún aviso con
`notaId`, así que no hubo caso que mostrar. El camino está cubierto por los
tests de `resumenNota` y el deep-link es el que ya entiende
`components/materia-detalle.tsx:102`, pero **no se lo vio corriendo**. Tampoco
se probó el submit real de `Cerrar sesión` (habría cerrado la sesión de prueba a
mitad de las capturas).
