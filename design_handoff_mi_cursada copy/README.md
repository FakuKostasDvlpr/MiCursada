# Handoff: Mi Cursada — app de cursada nocturna

## Overview
App **desktop-first y responsive** de uso personal (un solo usuario) para organizar una cursada nocturna en un instituto: login + alta de perfil con foto, dashboard con **bento grid**, materias con horarios, notas de clase estilo Notion (bloques, comandos `/`, tablero kanban), archivos/links con preview, y avisos/recordatorios con estados vencido/hoy. Incluye **modo oscuro y modo claro**. Todo el copy está en **español rioplatense con voseo** ("Hoy no cursás", "Anotá lo que dice el profe") — mantener ese tono textual.

Estética "**turno noche**": fondo azul-noche muy oscuro, un solo acento ámbar (sensación de luz de aula de noche), y un color propio por materia usado solo como riel fino o punto indicador, nunca como fondo grande. El modo claro es la misma estructura con la escala invertida (ver tokens).

Tipografía: **design system propio "Turno Noche"**, autocontenido en el propio archivo (variables CSS en el `<helmet>`): Plus Jakarta Sans (UI) + JetBrains Mono (datos), cargadas de Google Fonts. No depende de ningún design system externo.

## About the Design Files
Los archivos de este paquete son **referencias de diseño creadas en HTML** (formato Design Component: un template HTML + una clase de lógica JS embebidos en `Mi Cursada.dc.html`, que corre con `support.js`). Son un prototipo funcional que muestra el look & feel y el comportamiento esperado — **no es código de producción para copiar tal cual**. La tarea es **recrear este diseño en el entorno del codebase destino** (React, Vue, Svelte, SwiftUI, etc.) usando sus patrones y librerías; si todavía no existe un entorno, elegir el framework más apropiado (una SPA React/Vite con persistencia local es un mapeo directo).

`Mi Cursada.dc.html` abre en el navegador y es la fuente de verdad: el template está dentro de `<x-dc>` y toda la lógica en la clase `Component` (buscar `renderVals()`).

## Fidelity
**High-fidelity (hifi).** Colores, tipografía, espaciados, radios y copy son finales. Recrear la UI píxel-perfect con las convenciones del codebase destino.

## Design Tokens

### Colores — temas
Todo el color se resuelve por **CSS custom properties** en `:root`, y el modo claro las redefine con `html[data-tema="claro"]`. El toggle vive en el header de Hoy y persiste.

| Variable | Oscuro (default) | Claro | Uso |
|---|---|---|---|
| `--bg` | `#020617` | `#f1f5f9` | body, chips de clase, inputs de modal, cards kanban |
| `--sup` | `#0f172a` | `#ffffff` | cards, nav, modales, inputs |
| `--bor` | `#1e293b` | `#e2e8f0` | bordes de card/input, divisores |
| `--bor2` | `#334155` | `#cbd5e1` | círculos de check, botón secundario, menú `/` |
| `--tx` | `#e2e8f0` | `#0f172a` | texto principal |
| `--tx2` | `#94a3b8` | `#475569` | texto secundario |
| `--tx3` | `#64748b` | `#64748b` | kickers, labels, contadores |
| `--tx4` | `#475569` | `#94a3b8` | placeholders, hints, "— libre" |
| `--acc` | `#fbbf24` | `#b45309` | **acento**: botón primario, tab activa, links, foco, "hoy" |
| `--scrim` | `rgba(2,6,23,.72)` | `rgba(15,23,42,.4)` | overlay de modal |
| `--navbg` | `rgba(2,6,23,.93)` | `rgba(241,245,249,.93)` | bottom nav (+ `blur(14px)`) |

El ámbar de **fondo** de botones primarios/pills sigue siendo `#fbbf24` con texto `#221a00` en ambos temas (el `--acc` oscurecido se usa como color de *texto* en claro, para contraste). Vencido: `#fb7185`. Dot de sync OK: `#34d399`. En claro, `color-scheme: light`.

Colores de materia (solo riel de 4px o punto de 6–8px, nunca fondos): celeste `#38bdf8`, violeta `#a78bfa`, verde `#34d399`, rosa `#fb7185`, naranja `#f97316`, tiza `#e2e8f0`.

Estados kanban: Por hacer `#64748b` · En proceso `#38bdf8` · Listo `#34d399`. Dot de sync OK: `#34d399`.

### Tipografía
- **UI (sans):** `'Plus Jakarta Sans', system-ui, sans-serif` — pesos 400–800.
- **Datos (mono):** `'JetBrains Mono', ui-monospace, monospace` — todo lo que es hora, fecha, contador, y los "kickers".
- Kicker (PRÓXIMA CLASE, CLASES DE HOY…): mono 10.5px, weight 600, `letter-spacing: .14–.16em`, uppercase, `#64748b`.
- H1 de pantalla: 24px / 800 / `letter-spacing: -.015em`. Nombre en hero: 21px / 800. Horario en hero: mono 17px / 600. Cuerpo: 14–14.5px. Labels de nav: 11px / 700. Mínimo táctil **44px**.
- Ambas familias vienen de Google Fonts (ver `<link>` en el head del archivo).

### Radios y sombras
Radios: cards 13–16px, inputs/botones 12px, chips/pills 999px, bloques kanban 11px. **Sin sombras** (solo el blur del nav y el scrim). Foco visible: `outline: 2px solid #fbbf24; outline-offset: 2px`.

### Layout
**Desktop (>640px)**: sidebar fija de 232px, contenido `max-width: 1150px` con padding `34px 40px 80px 274px`. **Móvil (≤640px)**: viewport base 390px, contenido centrado `max-width: 720px`, padding lateral 18px, padding inferior 130px (despeje de la bottom nav). El breakpoint `(max-width: 640px)` (via matchMedia) decide nav lateral vs inferior, columnas del bento y de Semana, y sheet vs modal centrado. `html, body` deben scrollear (`overflow-y: auto`, altura automática): si un reset externo fija `overflow: hidden`, las pantallas largas (Semana) quedan cortadas.

## Screens / Views

Navegación — dos variantes según viewport (ninguna se muestra en Login/Perfil); **5 secciones**: Hoy, Semana, Materias, Avisos, Grafo:
- **Desktop: sidebar fija izquierda de 232px** (`--sup`, borde derecho `--bor`, padding 22px 14px): arriba logo (tile ámbar 36px con luna + "Mi Cursada" 14px/800 + kicker "TURNO NOCHE"); debajo los 5 ítems (44px, radio 11px, ícono 18px + label 13.5px/700; activo: texto ámbar sobre fondo `--bor`; inactivo `--tx3`); abajo (mt auto) botón de tema ("Modo claro"/"Modo oscuro" con ícono sol/luna) y botón de perfil (avatar 30px ámbar con iniciales + nombre + "Tu perfil").
- **Móvil: bottom nav fija de 5 pestañas**, ícono 21px + label 11px; activa en ámbar, inactivas `--tx3`. Grid de 5 columnas, `min-height: 56px` por ítem, `padding-bottom: env(safe-area-inset-bottom)`. En móvil el toggle de tema y el avatar-botón de perfil (40px) viven en el header de Hoy.

Flujo de arranque: **Login → (secuencia de sincronización) → app (Hoy)**. Con sesión ya guardada, la app entra directo a Hoy. El Perfil se abre desde el avatar y es solo lectura.

### 0. Login + secuencia de entrada
Sección centrada verticalmente (`min-height: calc(100dvh - 160px)`), contenedor flex centrado de `max-width: 840px` en desktop / `440px` en móvil, gap 14px.

**Card A — identidad (izquierda en desktop, `flex-grow: 1.05`, `flex-basis: 0`)**: `--sup`, borde `--bor`, radio 20px, padding 34px 30px. Arriba, el logo institucional sobre **tile blanco `#ffffff`** radio 14px, padding 16px 20px (el JPG tiene fondo blanco: nunca sobre superficie oscura), imagen `height: 44px`. Al fondo (`margin-top: auto; padding-top: 34px`): kicker "INSTITUTO ORT ARGENTINA", título "Tu cursada, ordenada." 19px/800, sublínea "Entrá y traemos tu carrera, horarios y materias." 13.5px `--tx2`, y estado "Sincroniza con el aula virtual" (dot `#34d399` 6px + mono 11px).

**Card B — formulario (derecha, `flex-grow: 1`, `flex-basis: 0`)**: mismo shell, padding 30px 26px, contenido centrado. En móvil incluye el tile del logo (34px) arriba. Kicker "MI CURSADA" + H1 "Entrá a tu cursada" 24px/800. Dos campos con label mono uppercase (Correo / Contraseña): input 48px sobre `--bg`, borde `--bor`, radio 12px, `padding: 0 40px 0 14px`, `transition: border-color .25s`. Botón primario 48px (grid place-items center, `transition: background .25s`). Debajo, fila demo: texto mono "DEMO" + pastilla clickeable "demo / demo" (radio 999px, borde `--bor`, texto `--acc`, 32px) que **rellena las credenciales**.

**Credenciales**: `demo` / `demo`, o cualquier correo válido con contraseña de ≥4 caracteres. El nombre se deriva del prefijo del correo (`juan.perez@…` → "Juan Perez"); con demo, "Estudiante ORT".

**Secuencia al entrar (fases del estado `loginFase`)** — esta es la animación central del producto:
| t (ms) | Fase | Qué pasa |
|---|---|---|
| 0 | `cargando` | el botón reemplaza su label por un **spinner** 20px (borde 3px, `border-top-color: #221a00`, `animation: spin .7s linear infinite`) |
| 1300 | `check` | botón a verde `#34d399` con **check** SVG 22px (`popCheck .45s cubic-bezier(.34,1.56,.64,1)`) |
| 2000 | `saliendo` | la **card B colapsa**: `flex-grow` → ~0, padding → `30px 0`, `border-width` → 0, opacidad 0, `scale(.96)`; el `gap` del contenedor va a 0. La card A **no cambia de tamaño** (se topa en `max-width: 620px`, `margin: 0 auto`) y queda centrada. En paralelo, el texto de identidad de la card A **se desvanece con blur**: `opacity 0`, `translateY(-10px)`, `filter: blur(4px)` (`.45–.55s`), pasando a `position: absolute` para que la capa siguiente ocupe su lugar sin salto |
| 2650 | `datos` | **cross-fade** al bloque de sincronización (entra desde `translateY(10px)` + `blur(4px)` → normal, `.5s`): kicker pulsante "TRAYENDO TUS DATOS DEL AULA VIRTUAL" (dot `--acc`, `pulseDot 1s infinite`), **nombre** 26px/800, **horario** "Turno noche · Lun a Sáb 18:10–21:30" mono 13px, y tres filas en stagger (`rowIn .5s` con delays .2/.4/.6s): Carrera "Analista de Sistemas", Materias "N activas", Estado "Sincronizado" en verde |
| 4300 | `abriendo` | el bloque de datos sale con blur hacia arriba y **cross-fadea** con el loader centrado (spinner 26px `--acc`) + "ABRIENDO TU CURSADA" |
| 5500 | — | entra a la app en Hoy; el `<main>` aparece con `cardIn .6s cubic-bezier(.22,.8,.3,1)` |

**Escena de loading — cómo se construye**: el cuerpo de la card A es un contenedor `position: relative` con `min-height` animada (`transition: min-height .6s cubic-bezier(.22,.8,.3,1)`) que pasa por **118px** (identidad) → **274px** (datos) → **128px** (loader); las tres capas (identidad / datos / loader) se superponen en ese espacio y se relevan por opacidad + `translateY` + `blur`, nunca por montaje y desmontaje seco. Ninguna capa cambia el ancho de la card.

Todas las transiciones de tamaño animan **solo `flex-grow`** (nunca `flex-basis`) con `.6s cubic-bezier(.22,.8,.3,1)`, y el panel se mantiene montado en todas las fases (también en móvil) — así el relevo es continuo, sin microcortes ni pops.

**Estado de error**: si el correo es inválido o la contraseña tiene menos de 4 caracteres, tras 1100ms de spinner la fase pasa a `error`: el campo culpable toma borde `#fb7185` y una **X roja** (círculo 20px `#fb7185`, glifo `#20060b`, `popCheck .4s`) dentro del input; aparece un banner (`rgba(251,113,133,.1)`, borde `rgba(251,113,133,.35)`, radio 12px, `rowIn .35s`) con ícono de alerta y el mensaje — "Ese correo no es válido. Probá con demo / demo." o "No pudimos entrar con esos datos. Probá con demo / demo."; el botón pasa a `#fb7185` con label **"Reintentar"**, que limpia la contraseña y vuelve a `form`.

No hay "¿Te olvidaste la contraseña?" (removido a pedido).

### 0b. Perfil (solo lectura)
`max-width: 400px`. Kicker "TU PERFIL" + H1 con **el nombre del usuario**. **Avatar 104px** circular: iniciales (hasta 2, 34px/800, fondo `#FBBF24`, texto `#221a00`) o ícono de persona si no hay nombre; si la foto está "tomada", anillo verde (`0 0 0 3px var(--bg), 0 0 0 5px #34d399`) + badge de check verde 30px abajo a la derecha. Botón secundario con ícono de cámara: "Sacate una foto" / "Sacar otra foto" — **solo UI, no abre cámara**; nota mono "cámara de muestra — solo UI".

**Los datos NO se editan** (vienen de la API del aula virtual): cuatro filas de solo lectura (`--sup`, borde `--bor`, radio 12px, min-height 50px) con label mono uppercase de 76px + valor — Nombre, Correo (mono 12.5px), Carrera "Analista de Sistemas", Instituto "ORT Argentina · Turno noche"; abajo la nota mono "datos sincronizados del aula virtual — no se editan acá". Acciones: botón primario "Listo" (vuelve a la app) y "Cerrar sesión" (ghost con borde `rgba(251,113,133,.45)`, texto `#fb7185`).

En producción: reemplazar el botón de foto por captura real (`getUserMedia` o file input con `capture`) + recorte circular, y persistir el avatar; los demás campos llegan del backend.

### 1. Hoy — dashboard bento
- Header en fila: bloque de título con **saludo "Bienvenido, {nombre}"** como kicker en `--acc` — animado letra por letra estilo **number-flow** (cada carácter en `display:inline-block` con `charRoll .5s cubic-bezier(.22,.8,.3,1)` y delay `0.1 + i*0.035s`, dentro de un contenedor con `overflow: hidden`) — y debajo la **fecha larga** como H1 ("Jueves 13 de agosto", calculada en vivo). En móvil el header suma **botón de tema** (40px, ícono sol en oscuro / luna en claro) + **avatar-botón de perfil** (40px circular ámbar con iniciales) con **menú al hover**: card `--sup` borde `--bor2` radio 14px anclada a `top: 40px` (con `padding-top: 6px` para que el cursor no pierda el hover), con nombre + correo, "Ver mi perfil" y "Cerrar sesión" en `#fb7185`; se cierra al salir el puntero.
- **Bento grid**: gap 10px, radios 16px, todas las celdas sobre `--sup` con borde `--bor`. Desktop: `repeat(4, minmax(0,1fr))` — hero en `1 / 3`, los dos tiles de stats en las columnas 3 y 4 (misma fila), "Clases de hoy" en `1 / 3` y "Próximos avisos" en `3 / 5` (lado a lado). Móvil: `repeat(2, 1fr)` — hero y tiles anchos a `1 / -1`, stats lado a lado.
  - **Hero "Próxima clase"** (`grid-column: 1 / -1`): riel vertical 4px del color de la materia, kicker dentro de la card, nombre 21px/800, horario mono 17px ("19:50–21:30"), aula 13px, y línea de estado 13.5px/600 **en el color de la materia**: "Empieza en 1 h 20 min" / "En curso — termina 21:30" / "Mañana a las 18:10" / "El lunes a las 18:10". Escanea hasta 7 días. Tap → detalle.
  - **Tile "CLASES HOY"** (1 col, min-height 106px): número mono 32px con **number-flow** (ver abajo) + sublínea contextual ("día libre" / "todas por delante" / "quedan 2" / "ya terminaste"). Tap → Semana.
  - **Tile "PENDIENTES"** (1 col): número mono 32px con number-flow, **en ámbar si hay pendientes** + sublínea ("al día" / "2 vencidos" / "nada vencido"). Tap → Avisos.
  - **Number-flow de los contadores**: cada dígito es un contenedor `height: 1em; overflow: hidden` con una tira vertical de los glifos 0–9 (cada uno `height: 1em`) desplazada por `transform: translateY(-d * 100%)` y `transition: transform .9s cubic-bezier(.22,.8,.3,1)` con delay escalonado por posición (base .12s / .22s + i*.08s). Arranca en 0 y rueda al valor tras el primer frame — al cambiar el dato, rueda de nuevo. En producción se puede usar `@number-flow/react` (`<NumberFlow value={n} />`), que implementa la misma mecánica.
  - **Tile ancho "CLASES DE HOY"** (`1 / -1`): filas anidadas sobre `--bg` (dot color 8px + nombre + aula + horario mono). Las terminadas a `opacity: .4`; la clase en curso con horario en ámbar. Vacío: "Hoy no cursás. Aprovechá para ponerte al día."
  - **Tile ancho "PRÓXIMOS AVISOS"** (`1 / -1`): máximo 3 pendientes + link "Ver todos". Vacío: "Nada pendiente. Tranquilo."
- Footer de sincronización (hook para un scraper futuro): dot verde 6px + mono 11px "Sincronizado con el aula virtual · hace 2 h", centrado.
- Sin materias: card invitación "Cargá tus materias" + botón primario "Nueva materia".

### 2. Semana
- H1 "Semana" + rango mono a la derecha ("11/08 – 16/08").
- Grilla **Lunes a Sábado** (fechas de la semana actual; si es domingo, la semana que arranca mañana): 2 columnas `minmax(0,1fr)` con `align-items: start` en desktop, 1 columna en móvil. Cada día: card con nombre 14px/700 + fecha mono; **el día actual con borde ámbar y pill "hoy"** (ámbar, texto `#221a00`, mono 10px uppercase).
- Cada clase es un chip fila (fondo `#020617`, borde `#1e293b`): dot de color + nombre + horario mono; tap → detalle. Días sin clases: "— libre" (mono, `#475569`).

### 3. Materias
- H1 "Materias" + botón primario "+ Nueva" arriba a la derecha.
- Grilla `repeat(auto-fill, minmax(165px, 1fr))`, gap 12px. Card: dot color + nombre 15px/700, horarios mono 11.5px ("Lun 18:10–19:40"), y línea de contadores mono 11px: "2 notas · 1 arch. · 1 aviso" — **el contador de avisos pendientes en ámbar si es > 0**. Card completa navegable.
- Vacío: "Todavía no cargaste materias. Empezá por acá arriba."

### 4. Avisos
- H1 "Avisos" + botón "+ Nuevo".
- Pendientes ordenados por fecha asc. Fila: círculo toggle 20px (borde `#334155`) + título 14.5px/600 + subfila (dot de materia 6px + nombre o "General" con dot `#64748b`) + fecha mono dd/mm a la derecha. **Vencidos**: fecha + "· vencido" en `#fb7185`. **De hoy**: "· hoy" en `#fbbf24`. Tap en la fila = marcar hecho.
- Sección "**Hechos**" abajo: filas a `opacity: .5`, título tachado, círculo relleno `#334155` con check; tap = desmarcar.
- Vacío: "Nada pendiente. Tranquilo."

### 5. Grafo — red estilo Obsidian
Quinta pestaña: toda la cursada como grafo de fuerzas **sobre el fondo de la página, sin card** (transparente, como el graph view de Obsidian). H1 "Grafo" + nota mono "tu cursada como red"; debajo, totales como texto mono suelto ("5 materias · 8 notas · 4 archivos · 3 avisos pendientes", avisos en ámbar si hay).

**Estructura de la red** (SVG `viewBox 0 0 760 560`, width 100%):
- Nodo central **vos** (círculo ámbar r24 con iniciales, fijo en 380,270) → conectado a cada **materia** (r = 13 + min(12, ítems×1.3)) → conectada a un nodo por cada **nota** (r5), **archivo** (r4.5, opacidad .75) y **aviso pendiente** (r5).
- **Layout por simulación de fuerzas propia** (sin librería): repulsión Coulomb entre todos los nodos (`f = 1500·α/d²`, cortada a d>190), resortes en las aristas (largo natural 165 centro–materia / 48 materia–ítem, k=0.028·α), gravedad suave al centro (0.0012·α), damping 0.86, límites del lienzo, y enfriamiento `α ×= 0.99` hasta 0.02. Corre en un `requestAnimationFrame` que solo vive mientras la pestaña está activa y se detiene al asentarse. **Los nodos NO se arrastran.**
- **Estilo Obsidian**: en reposo, ítems grises (`--bor2`), aristas `--bor` al 50%, labels grises; las materias conservan su color. **Todos los nodos llevan su nombre** (materias 12.5px/700 `--tx2`; ítems 9px/500 `--tx3`, truncados a 18 chars).
- **Hover = focus de cadena**: al posar el mouse sobre un ítem se enciende su camino completo — ítem → materia → centro — con el color de la materia (nodos coloreados, aristas a opacidad .85 y 1.6px); todo lo demás se atenúa (nodos a .35, labels transparentes, aristas a .25). Hover sobre una materia enciende su rama entera. Transiciones CSS en r/fill/opacity de .2–.25s para que el foco se sienta fluido; halo del color al hover (r+10, opacidad .22).
- **Tooltip descriptivo** (HTML absoluto sobre el SVG, no SVG): card `--sup` borde `--bor2` radio 12px, 218px, con dot del color + kicker mono uppercase ("nota · Análisis Matemático"), título completo 13px/700, dato contextual mono (nota: "dd/mm · en proceso"; archivo: dominio; aviso: "dd/mm · pendiente"; materia: "profe · aula · N ítems") y "CLICK PARA IR →" en el color. Se ancla al lado libre del nodo (izquierda si x>460) y se clampea con `min()/clamp()` para no salirse del lienzo; mientras está visible, el label chico del nodo se oculta. `pointer-events: none`, fade .16s.
- **Click navega**: nota → detalle de la materia en tab Notas; archivo → tab Archivos; aviso → tab Avisos; materia → su detalle. El nodo central no es clickeable.
- Vacío: "Sin datos para graficar todavía. Cargá tus materias primero." · Pie: "hover para leer cada ítem · click para ir".
- En producción puede implementarse con d3-force o similar manteniendo estos parámetros visuales.

### 6. Logro (achievement toast)
Al **agregar una nota** (cualquier bloque no-divisor, en documento o kanban) baja un toast desde arriba, centrado, `position: fixed; top: 18px; z-index: 60`:
- Pill `border-radius: 999px`, gradiente naranja `linear-gradient(120deg, #f97316, #ea580c)`, padding `9px 26px 9px 10px`.
- Círculo 46px `rgba(59,21,3,.35)` con trofeo SVG `#ffedd5` + textos: "¡Logro desbloqueado!" 15.5px/800 `#fff7ed` y subtítulo mono 11.5px `rgba(255,247,237,.85)`.
- Entrada con rebote: `logroIn .55s cubic-bezier(.3,1.4,.4,1)` (baja desde -26px con overshoot) + **brillo diagonal** que recorre el pill una vez (`logroBrillo 1.4s`, franja blanca al 22% con blur y skew). Se autodescarta a los 3.8s.
- **Hitos por total de notas acumuladas**: 1 → "Primera nota de tu cursada · +50 XP"; 5 → "¡5 notas! Vas tomando ritmo · +100 XP"; 10 → "10 notas. Imparable · +150 XP"; cada 25 → "+250 XP"; resto → "Nota anotada · +10 XP".
- En el prototipo también se dispara una vez ~1.4s después de cargar la app (demo); en producción, quitar ese disparo.

### 7. Detalle de materia (desde cualquier card/clase)
- Botón "‹ Volver" (ámbar, 44px). Header: riel 4px del color + nombre 24px/800 + filas con íconos 15px `#64748b`: profe, aula, y un renglón mono por horario ("Jueves 19:50–21:30").
- **3 tabs con contador** (Notas · Archivos · Avisos): activa en ámbar con subrayado 2px ámbar; inactivas `#64748b`; contador en mono 11px.

#### Tab Notas — editor de bloques estilo Notion
- Toggle segmentado **Documento | Tablero** + hint mono ("tocá / para bloques" / "arrastrá entre columnas").
- **Composer**: input + botón "+" ámbar. Enter agrega bloque de texto. Escribir `/` abre el **menú de comandos** (filtra mientras tipeás): `/texto`, `/titulo`, `/tarea`, `/link` (link con preview), `/divisor`, `/tablero` (cambia a vista kanban). Cada opción: ícono glifo mono en tile `#1e293b`, nombre, y el comando a la derecha. Enter ejecuta la primera opción; Esc cierra.
- **Bloques** (cada uno: handle de drag ⋮⋮ a la izquierda + contenido + dot de estado + borrar ✕):
  - *Texto*: textarea sin borde 14.5px, autocrece.
  - *Título*: 17.5px / 800.
  - *Tarea*: checkbox cuadrado redondeado 20px; hecho → check ámbar, texto tachado `#64748b`, estado pasa a "listo".
  - *Link*: mientras no hay URL, card punteada con inputs nombre + URL (Enter/blur normaliza agregando `https://`); con URL válida se vuelve **card de preview**: favicon 20px (`https://www.google.com/s2/favicons?domain=<dominio>&sz=64`), título en ámbar, dominio en mono, flecha ↗; abre en pestaña nueva.
  - *Divisor*: línea 1px `#1e293b`.
- **Drag & drop para reordenar**: se arrastra desde el handle; el destino muestra una marca superior de 2px ámbar; se inserta antes del bloque destino.
- **Dot de estado** por bloque (cicla al tocarlo): Por hacer → En proceso → Listo (listo también marca hecho).
- **Vista Tablero (kanban)**: 3 columnas "POR HACER / EN PROCESO / LISTO" (dot de color + contador; `minmax(218px,1fr)`, scroll horizontal en móvil). Cards editables (textarea) con fecha mono + tipo + handle de drag; **arrastrar entre columnas cambia el estado** (columna destino con borde ámbar durante el drag). Botón "+ Agregar" punteado por columna.
- Vacío: "Sin notas todavía. Anotá lo que dice el profe acá — con / agregás títulos, tareas, links y divisores."

#### Tab Archivos
- Alta: input nombre + input link + botón "Agregar" (normaliza `https://`).
- Lista: filas `<a target="_blank">` con ícono archivo, nombre en ámbar, URL mono truncada, flecha ↗.
- Vacío: "Sin archivos todavía. Guardá los PDFs y links de la materia acá."

#### Tab Avisos
- Alta inline: input título + date input + "Agregar" (queda asociado a la materia). Lista igual que la global pero sin la subfila de materia; hechos tachados y atenuados al final.
- Vacío: "Nada pendiente para esta materia."

#### Eliminar materia
Botón full-width al fondo, borde `rgba(251,113,133,.45)`, texto `#fb7185`. **Confirmación de doble toque**: primer tap → se arma ("¿Seguro? Tocá de nuevo para eliminar", fondo `#fb7185`, texto `#20060b`); se desarma solo a los 3.5s; segundo tap elimina la materia y sus avisos, y vuelve atrás.

### 8. Modales
- **Móvil (≤640px)**: sheet desde abajo, ancho 100%, radios `20px 20px 0 0`, animación slide-up 280ms `cubic-bezier(.22,.8,.3,1)`. **Desktop**: modal centrado 440px, radio 16px. Scrim con fade 180ms; tap afuera o ✕ cierra.
- **Nueva materia**: nombre, profe + aula (2 columnas), selector de color (6 círculos de 34px; el elegido con anillo ámbar `0 0 0 3px #0f172a, 0 0 0 5px #fbbf24`), y horarios múltiples: select de día (Lun–Sáb) + dos `<input type="time">` + botón "+" → se agregan como **chips removibles** (mono, fondo `#1e293b`, ✕). Validación: nombre y ≥1 horario ("Poné un nombre y agregá al menos un horario."); fin > inicio ("El fin tiene que ser después del inicio."). Acciones: Cancelar (ghost) + "Guardar materia" (primario, flex 1).
- **Nuevo aviso**: título, select de materia (primera opción "General"), fecha (default hoy). Validación: "Poné un título y una fecha."

## Interactions & Behavior
- Reloj: tick cada 30s recalcula countdown/estados del hero y el atenuado de clases pasadas.
- Fechas y semana se calculan en vivo (nunca hardcodear "Jueves 13").
- Navegar a un detalle no cambia la pestaña activa del nav; tocar cualquier pestaña cierra el detalle.
- `color-scheme: dark` en el body para que date/time/select nativos rendericen oscuros.
- Links `<a>` por defecto en ámbar (`#fbbf24`, hover `#fde68a`).
- Drag & drop con HTML5 nativo (`draggable` en el handle, `dragover`/`drop` en el destino). En touch no hay drag nativo: en producción usar una lib de DnD con soporte táctil (dnd-kit o similar).
- Empty states siempre como invitación (borde punteado, texto `--tx3` 13.5px, centrado), nunca como error.
- **Tema**: el toggle escribe `data-tema="claro"|"oscuro"` en `<html>` y persiste; no hay transición de color (cambio instantáneo). En producción conviene además respetar `prefers-color-scheme` como valor inicial.
- **Login/Perfil son solo UI**: no hay auth real ni cámara. "Entrar" acepta `demo`/`demo` o cualquier correo válido con contraseña de ≥4 caracteres, y el error es simulado tras 1100ms; el Perfil es solo lectura. En producción, reemplazar la validación local por la respuesta del backend, manteniendo exactamente las mismas fases visuales.

### Keyframes usados (definidos una vez en el `<style>` del helmet)
`spin` (rotate 360, loader) · `popCheck` (scale .3→1.18→1, check y X) · `cardIn` (translateY 22px + scale .96 → normal; cards y entrada al dashboard) · `rowIn` (translateX -14px + fade; filas en stagger) · `welcomeIn` (translateY 12px + scale .94 + `blur(6px)` → normal) · `pulseDot` (opacidad .35↔1, dot de sincronización) · `logroIn` (caída con rebote del toast de logro) · `logroBrillo` (franja de brillo que recorre el pill) · `charRoll` (translateY 120% → 0, letras del saludo) · `fadeIn` y `sheetUp` (scrim y sheet de los modales). Curva estándar del producto: `cubic-bezier(.22,.8,.3,1)`.

## State Management
Persistencia en `localStorage` (en producción: la capa de datos que corresponda). Tres espacios: datos de ejemplo (`miCursada.demo.v2`), datos propios (`miCursada.propia.v1`), y **preferencias de UI** (`miCursada.ui.v1`: `{tema, nombre, insti, foto, dentro}`) — de ahí sale si la app arranca en Login o directo en Hoy. Hay migración de notas planas → bloques (`migrar()`).

```ts
type Materia = {
  id: string; nombre: string; profe: string; aula: string;
  color: string;                        // uno de los 6 hex
  horarios: { dia: 1|2|3|4|5|6; ini: 'HH:MM'; fin: 'HH:MM' }[];  // 1=Lunes … 6=Sábado
  doc: Bloque[];                        // notas estilo Notion
  archivos: { id: string; nombre: string; url: string }[];
};
type Bloque = {
  id: string;
  tipo: 'texto'|'titulo'|'tarea'|'link'|'divisor';
  texto: string; url: string;           // url solo para tipo link
  estado: 'pendiente'|'proceso'|'listo';// columna del kanban
  hecho: boolean;                       // tareas (listo ⇄ hecho)
  fecha: number;                        // timestamp de creación
};
type Aviso = { id: string; titulo: string; materiaId: string|null; fecha: 'YYYY-MM-DD'; hecho: boolean };
```

Estado de UI: **pantalla** (`login` | `perfil` | `app`), **fase del login** (`form` | `cargando` | `check` | `saliendo` | `datos` | `abriendo` | `error`), **hover del grafo** (`gHover`: id del nodo; la simulación vive fuera del estado React y pide re-render por frame solo mientras está caliente), **logro activo** (subtítulo del toast + timeout de 3.8s), flag `entrando` (anima la entrada al dashboard), **tema** (`oscuro` | `claro`), campos de login (la contraseña no se persiste; el correo sí), perfil (nombre derivado, flag `fotoTomada`), menú del avatar (`menuPerfil`), pestaña activa, materia en detalle + tab del detalle, vista de notas (doc/kanban), modal abierto, formularios controlados, estado del menú `/`, índices de drag, flag "armado" del doble toque de eliminar, `isMobile` (matchMedia 640px), reloj.

Derivados clave (ver `renderVals()`): próxima clase (scan 7 días con estados empieza-en/en-curso), clases de hoy con atenuado, **stats del bento** (clases de hoy + cuántas quedan; pendientes + vencidos), semana Lun–Sáb con fechas, avisos ordenados con vencido/hoy, iniciales del avatar, contadores por materia.

## Actualización — notas estilo Notion, tablero y avisos vinculados (17/08)
Estas capacidades reemplazan/extienden lo descrito arriba para la tab Notas y Avisos. La fuente de verdad es `Mi Cursada.dc.html`.

### Editor de notas (documento)
- **Bloques**: texto, título, to-do (checkbox), link, divisor y **página** (`/pagina`): sub-documento con título grande editable (27px/800), fecha, breadcrumb "‹ Todas las notas", y su propio editor de bloques + kanban (campo `hijos[]`). En desktop la vista de página ensancha el main a 1320px.
- **Comandos `/`** en el composer: `/texto`, `/titulo`, `/todo` (alias tarea/check), `/link`, `/divisor`, `/pagina`, `/tablero`. Menú filtrable bajo el input.
- **Referencias `@`** (en composer y en el modal de card): archivos de la materia (abren en pestaña nueva), otras materias (navegan a su detalle, chip del color de la materia) y avisos pendientes (navegan a Avisos, chip rosado). La referencia queda como chip pill (dot de color + nombre mono 11px) pegado al bloque y visible en la card del tablero. Campo `ref: {tipo, id}`.
- **To-dos**: Enter dentro de un to-do inserta otro debajo con foco (placeholder "To-do… (Enter crea otro)"). Las páginas muestran badge **"TO-DO hechas/total"** (ámbar si quedan pendientes, verde `#34d399` si completó) por fuera en la fila y por dentro en el header junto a una barra de progreso (74×4px, animada) y botón "+ To-do".
- **Formato por bloque** (`fmt: {b,i,u,hl}`): negrita, cursiva, subrayado y resaltado ámbar `rgba(251,191,36,.16)`; se aplican al bloque y a su card del tablero; toggles B/I/S̲/▍A en el modal (pill 44×40, activo fondo ámbar texto `#221a00`).
- Cada bloque tiene botón "⋯" que abre el mismo modal de detalle del tablero.

### Tablero (kanban) y modal de detalle de card
- Columnas Por hacer / En proceso / Listo; **click en una card abre su modal de detalle** (las páginas navegan a la página); drag solo desde el handle. "+ Nueva card" crea una tarea vacía en esa columna y abre el modal.
- **Modal de card** (`panelStyleGrande`: 580px desktop / sheet móvil, padding 24–26px): header con badge de tipo (pill ámbar outline, mono 10px uppercase) + badge de estado en su color (gris/celeste/verde) + fecha mono; textarea 17px ×4 filas (acepta `/` para convertir tipo y `@` para referenciar, con menús propios); segmento de Estado; fila Formato; select de Referencia; sección **Aviso** (date + "Crear aviso" → crea aviso ligado vía `notaId`, o muestra "Aviso creado · fecha" + Ver); URL con preview si es link (favicon Google s2 + dominio + ↗ en la card); check de hecha; Borrar con doble confirmación ("¿Seguro? Tocá de nuevo", 3s) y "Listo".
- Cards tipo link muestran preview clickeable (favicon + dominio) sin abrir el modal; tachito con confirmación inline ("¿SEGURO?" rojo) en cada card.

### Avisos vinculados a notas + componente `NotaAviso`
- Un aviso puede nacer de una nota (`notaId`). En la lista de Avisos, en la tab Avisos de la materia y con chevron en Home, esos avisos muestran un **snippet de la nota** — componente separado **`NotaAviso.dc.html`** (props: texto, tipo, estadoNombre, estadoColor, color): card con riel izquierdo 2px del color de la materia, ícono de página, texto truncado 12px, tipo mono uppercase 9.5px y estado kanban con dot. Click en el snippet o chevron → abre la nota exacta (materia → página si corresponde → modal de card).
- **Modal grande de aviso** (chevron en Home/Avisos/materia): título 21px/800, materia con dot, fecha dd/mm/yyyy, badge de estado (Pendiente/Vence hoy/Vencido/Hecho en su color), nota vinculada completa (texto sin truncar, borde izq 3px del color) con "Abrir la nota →", y acciones "Marcar como hecho" / Cerrar.

### Toasts y logro
- **Toast de acción** (abajo, centrado, pill `--sup`, entra con rebote `logroIn .4s`, se va a los 2.6s): variante **ok** (borde/icono check verde `#34d399`) para mover de estado ("¡Completada! Movida a Listo"), convertir tipo, vincular referencia, completar tarea, crear aviso; variante **delete** (borde/tachito rojo `#fb7185`) para borrados (card, bloque, materia).
- **Logro** (pill naranja gradiente `#f97316→#ea580c`, abajo a la derecha, trofeo + brillo diagonal, 3.8s): aparece **una sola vez**, al crear la primera nota ("Primera nota cargada · +50 XP"); flag persistido en localStorage (`miCursada.logro.primera`).

## Assets
- Logo institucional: `https://www.ort.edu.ar/img/LogoOrtArgWeb2017.jpg` (JPG con fondo blanco — siempre sobre un tile `#ffffff` radio 12–14px, nunca directo sobre la superficie oscura). En producción, servirlo desde los assets del proyecto (idealmente SVG/PNG transparente) en lugar de hotlinkear.
- Íconos nuevos: luna/sol (toggle de tema), cámara (perfil), check (badge de foto), alerta (banner de error), salida (cerrar sesión).
- Sin imágenes propias. Íconos: SVG inline de trazo (stroke 1.9–2.2, linecap round) — luna, calendario, libro, campana, +, ✕, chevron, reloj, pin, persona, archivo, ↗, tacho, puntos de drag. Reemplazables por Lucide/Feather.
- Favicons de links: se pintan como `background-image` de un `<span>` 20px (no `<img>`), servicio `https://www.google.com/s2/favicons?domain=<dominio>&sz=64`; fallback: tile `--bor`.
- Fuentes: Google Fonts (Plus Jakarta Sans, JetBrains Mono).

## Actualización — Panel Admin (18/08)
Nueva pantalla independiente: **`Mi Cursada Admin.dc.html`** — panel de monitoreo desktop-first (1280px max) en la misma estética turno noche, para ver todos los usuarios activos y todo lo trackeable. Datos de ejemplo hardcodeados; en producción se llenan desde el backend/scraper.

- **Header sticky** (blur, borde `#1e293b`): logo tile ámbar 36px con birrete SVG, "Mi Cursada · Admin" 15px/800 + kicker "PANEL DE MONITOREO", y a la derecha indicador "en vivo · actualizado hace 12 s" con dot verde `#34d399` pulsante (`pulso 2.2s`).
- **Fila de stats** (grid auto-fit minmax 170px): 6 cards `--sup` radio 14px — usuarios activos (verde), usuarios totales, notas creadas hoy (ámbar), sesión promedio, scrapers ok "4/6" (ámbar, delta en rojo si hay errores), avisos vencidos (rojo). Valor mono 26px + delta mono 11px.
- **Tabla de usuarios** (grid `minmax(210px,1.5fr) 110px 1fr 92px 90px`, filas ≥58px): avatar circular 34px con iniciales sobre el color del usuario, nombre 13.5px/700 + carrera mono 10.5px; estado con dot (online verde pulsante / inactivo ámbar / offline gris) y label mono; última actividad en texto ("Editando nota en Programación II"); duración de sesión mono; notas de hoy (ámbar si >0, "—" si 0). Fila seleccionada con fondo `rgba(251,191,36,.06)`; hover `rgba(30,41,59,.45)`.
- **Filtros y búsqueda**: segmento Todos/Online/Inactivos/Offline (pill activa fondo `--bor`) + input de búsqueda por nombre/mail/carrera; contador "N de M"; vacío: «Ningún usuario con ‹q›».
- **Panel de detalle** (aside sticky top 86px, 330px+ en desktop; abajo en <980px; entra con `slideIn .3s`): avatar 44px + nombre/mail; badges outline mono uppercase de estado (en su color), dispositivo ("Desktop · Chrome") y versión de app; **grid 3×2 de métricas** (materias, notas, to-dos hechos/total — verde si va bien, rojo si atrasado —, archivos, avisos pendientes, XP); **"Pantallas más usadas"** como barras horizontales ámbar con porcentaje mono; **"Actividad reciente"** como feed con dot de color semántico por tipo de evento (verde=completado, celeste=navegación/edición, ámbar=logro, violeta=referencia/archivo, rojo=vencimiento) + tiempo relativo mono; al pie, estado del scraper del aula virtual por usuario ("ok · hace 2 h" / "error de login" / "nunca conectado").
- Estado en UI: filtro activo, query de búsqueda, usuario seleccionado (`selId`), media query <980px que colapsa a una columna.

## Files
- `Mi Cursada.dc.html` — **el diseño completo**: template (login + secuencia de entrada, perfil, las 5 pestañas incl. Grafo, detalle con notas estilo Notion y tablero, modales de card/aviso, toasts) + clase `Component` con toda la lógica, la simulación de fuerzas del grafo y los datos de ejemplo (`semilla()`). Las variables de tema están en el `<style>` del `<helmet>`, arriba del archivo.
- `support.js` — runtime del formato Design Component (solo para abrir el prototipo; no portar).
- `NotaAviso.dc.html` — componente separado del snippet de nota vinculada en avisos (props documentadas en su `data-props`).
- `Mi Cursada Admin.dc.html` — panel admin de monitoreo (pantalla independiente; ver sección "Panel Admin").

Props de demo del prototipo (no portar): `horaSimulada` ("HH:MM" para previsualizar estados del hero), `datosDeEjemplo` (seed vs vacío), `mostrarSincronizacion` (línea de sync).
