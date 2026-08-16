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

Navegación — dos variantes según viewport (ninguna se muestra en Login/Perfil):
- **Desktop: sidebar fija izquierda de 232px** (`--sup`, borde derecho `--bor`, padding 22px 14px): arriba logo (tile ámbar 36px con luna + "Mi Cursada" 14px/800 + kicker "TURNO NOCHE"); debajo los 4 ítems (44px, radio 11px, ícono 18px + label 13.5px/700; activo: texto ámbar sobre fondo `--bor`; inactivo `--tx3`); abajo (mt auto) botón de tema ("Modo claro"/"Modo oscuro" con ícono sol/luna) y botón de perfil (avatar 30px ámbar con iniciales + nombre + "Tu perfil").
- **Móvil: bottom nav fija de 4 pestañas**, ícono 21px + label 11px; activa en ámbar, inactivas `--tx3`. Grid de 4 columnas, `min-height: 56px` por ítem, `padding-bottom: env(safe-area-inset-bottom)`. En móvil el toggle de tema y el avatar-botón de perfil (40px) viven en el header de Hoy.

Flujo de arranque: **Login → Perfil → app (Hoy)**. Con perfil ya guardado, la app entra directo a Hoy.

### 0. Login (solo UI)
Columna centrada, `max-width: 360px`, centrada verticalmente. Tile ámbar 54px radio 16px con ícono luna; kicker "MI CURSADA · TURNO NOCHE"; H1 "Entrá a tu cursada". Inputs `email` y `password` (48px, `--sup`, borde `--bor`, radio 12px), botón primario "Entrar" (48px), link ghost "¿Te olvidaste la contraseña?" y nota mono "demo — entrá con cualquier correo". Sin validación real: "Entrar" avanza a Perfil (en producción, auth del codebase).

### 0b. Perfil inicial / editar perfil
`max-width: 400px`. Kicker "TU PERFIL" + H1 "Contanos quién sos". **Avatar 104px** circular: muestra iniciales (hasta 2, 34px/800, fondo `#FBBF24` sobre texto `#221a00`) o un ícono de persona si no hay nombre; si la foto está "tomada", anillo verde (`0 0 0 3px var(--bg), 0 0 0 5px #34d399`) + badge de check verde 30px abajo a la derecha. Botón secundario con ícono de cámara: "Sacate una foto" / "Sacate otra foto" — **solo UI, no abre cámara**; nota mono "cámara de muestra — solo UI". Debajo: inputs "Tu nombre" y "Instituto (opcional)", error en `#fb7185` ("Poné tu nombre así te saludamos."), botón primario "Empezar" y ghost "Volver".

En producción: reemplazar el botón de foto por captura real (`getUserMedia` o file input con `capture`) + recorte circular, y persistir el avatar; el resto de la UI no cambia.

### 1. Hoy — dashboard bento
- Header en fila: bloque de título (kicker "MI CURSADA · TURNO NOCHE" + **fecha larga** como H1, "Jueves 13 de agosto", calculada en vivo). En móvil el header suma **botón de tema** (40px, ícono sol en oscuro / luna en claro) + **avatar-botón de perfil** (40px circular ámbar con iniciales, abre Perfil).
- **Bento grid**: gap 10px, radios 16px, todas las celdas sobre `--sup` con borde `--bor`. Desktop: `repeat(4, minmax(0,1fr))` — hero en `1 / 3`, los dos tiles de stats en las columnas 3 y 4 (misma fila), "Clases de hoy" en `1 / 3` y "Próximos avisos" en `3 / 5` (lado a lado). Móvil: `repeat(2, 1fr)` — hero y tiles anchos a `1 / -1`, stats lado a lado.
  - **Hero "Próxima clase"** (`grid-column: 1 / -1`): riel vertical 4px del color de la materia, kicker dentro de la card, nombre 21px/800, horario mono 17px ("19:50–21:30"), aula 13px, y línea de estado 13.5px/600 **en el color de la materia**: "Empieza en 1 h 20 min" / "En curso — termina 21:30" / "Mañana a las 18:10" / "El lunes a las 18:10". Escanea hasta 7 días. Tap → detalle.
  - **Tile "CLASES HOY"** (1 col, min-height 106px): número mono 32px + sublínea contextual ("día libre" / "todas por delante" / "quedan 2" / "ya terminaste"). Tap → Semana.
  - **Tile "PENDIENTES"** (1 col): número mono 32px **en ámbar si hay pendientes** + sublínea ("al día" / "2 vencidos" / "nada vencido"). Tap → Avisos.
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

### 5. Detalle de materia (desde cualquier card/clase)
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

### 6. Modales
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
- **Login/Perfil son solo UI**: no hay auth ni cámara real; "Entrar" avanza y "Empezar" valida únicamente que haya nombre.

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

Estado de UI: **pantalla de arranque** (`login` | `perfil` | `app`), **tema** (`oscuro` | `claro`), campos de login (email/pass, no se persisten), perfil (nombre, instituto, flag `fotoTomada`), pestaña activa, materia en detalle + tab del detalle, vista de notas (doc/kanban), modal abierto, formularios controlados, estado del menú `/`, índices de drag, flag "armado" del doble toque de eliminar, `isMobile` (matchMedia 640px), reloj.

Derivados clave (ver `renderVals()`): próxima clase (scan 7 días con estados empieza-en/en-curso), clases de hoy con atenuado, **stats del bento** (clases de hoy + cuántas quedan; pendientes + vencidos), semana Lun–Sáb con fechas, avisos ordenados con vencido/hoy, iniciales del avatar, contadores por materia.

## Assets
- Íconos nuevos: luna/sol (toggle de tema), cámara (perfil), check (badge de foto).
- Sin imágenes propias. Íconos: SVG inline de trazo (stroke 1.9–2.2, linecap round) — luna, calendario, libro, campana, +, ✕, chevron, reloj, pin, persona, archivo, ↗, tacho, puntos de drag. Reemplazables por Lucide/Feather.
- Favicons de links: se pintan como `background-image` de un `<span>` 20px (no `<img>`), servicio `https://www.google.com/s2/favicons?domain=<dominio>&sz=64`; fallback: tile `--bor`.
- Fuentes: Google Fonts (Plus Jakarta Sans, JetBrains Mono).

## Files
- `Mi Cursada.dc.html` — **el diseño completo**: template (login, perfil, las 4 pestañas, detalle, tabs, modales) + clase `Component` con toda la lógica y los datos de ejemplo (`semilla()`). Las variables de tema están en el `<style>` del `<helmet>`, arriba del archivo.
- `support.js` — runtime del formato Design Component (solo para abrir el prototipo; no portar).

Props de demo del prototipo (no portar): `horaSimulada` ("HH:MM" para previsualizar estados del hero), `datosDeEjemplo` (seed vs vacío), `mostrarSincronizacion` (línea de sync).
