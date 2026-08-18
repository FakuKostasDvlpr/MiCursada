# Spec — Modal de detalle de card y tablero clickeable

Estado: **implementado** (17/08) · Depende del spec 1 (`fmt` y `ref` en el bloque).
Fuente: `design_handoff_mi_cursada/Mi Cursada.dc.html:914-1015` (el modal) y
`:775-814` (el tablero).

Implementación prevista: `components/modal-card.tsx` (nuevo),
`components/notas-editor.tsx`, `components/modal.tsx`, `app/actions.ts`.

## 1. Por qué

El tablero de la app existe y es fiel en su grilla (columnas `minmax(218px,1fr)`, gap 10,
`min-width: 680px`, header mono 10.5px — todo verificado igual), pero le falta **la puerta
que el diseño nuevo abre**: en el prototipo la card es clickeable y lleva a un modal donde
se edita todo lo que la card no muestra (tipo, estado, formato, referencia, URL, hecha,
aviso y borrado). Hoy en la app esas propiedades se editan con gestos sueltos repartidos
por la fila del documento (ciclar el dot, tocar el checkbox) y **algunas no se pueden
editar en absoluto**: no hay forma de convertir un bloque de un tipo a otro.

Sin este modal, el spec 3 no tiene desde dónde crear un aviso ligado a una nota, y el
spec 1 no tiene dónde poner los toggles de formato.

Brechas concretas medidas contra el repo:

- La card del tablero no tiene `onClick`, ni `cursor-pointer`, ni hover
  (`notas-editor.tsx:614-616`).
- No hay borrar en la card del tablero (el prototipo tiene tachito con `¿SEGURO?`).
- El botón dice `+ Agregar` y crea un bloque de tipo `texto`
  (`notas-editor.tsx:396,675`); el prototipo dice `+ Nueva card`, crea una **tarea** y
  abre el modal (`.html:1636-1641`).
- `bloquePatchSchema` (`app/actions.ts:375`) no acepta `tipo`: convertir es imposible
  server-side.
- El `Modal` genérico es de 440px (`components/modal.tsx:33-41`); este necesita 580px.

## 2. Adaptaciones respecto del handoff

| Prototipo | Esta app | Motivo |
|---|---|---|
| El handle de drag no frena la propagación (`.html:808`) | El handle hace `stopPropagation` en el click | Bug 1: en touch, donde no hay drag nativo, tocar el handle abre el modal siempre. |
| El menú `/` del modal vacía el texto al convertir (`x.texto=''`, `.html:1933`) | Convertir **conserva** el texto | Bug 5: convertir una nota escrita en tarea la deja vacía. Es destructivo y el usuario no lo pidió. |
| El menú `@` del modal queda abierto para siempre (`lastIndexOf('@')`, `.html:1928`) | Se abre solo si el `@` arranca palabra y está en el último token | Bug 3, mismo criterio que el spec 1 (R2). |
| Filtro del `/` por `indexOf` sobre la clave (`.html:1931`) | Mismas keywords que el composer (spec 1, R3) | Bug 6: `/i` matchea `titulo`, `link` y `pagina` a la vez, y `/página` con tilde no matchea nada. Dos vocabularios para lo mismo no van. |
| Un solo timer `_borrT` para el tachito de las cards y el Borrar del modal (`.html:1625,1980`) | Un timer por control | Bug 9: armar una confirmación desarma la otra. |
| `autoFocus` en el textarea (`.html:925`) | Sin autofoco en móvil | El sheet está anclado abajo: el teclado lo tapa. En desktop sí enfoca. |
| Segmento de Estado `min-height: 38px`, formato 44×40, "Ver" con `padding: 4px 2px` | Área táctil de 44px en los tres | El resto del handoff respeta 44px; estos tres quedaron abajo. Se mantiene el **tamaño visual** y se agranda el área. |
| `id: 'b'+Date.now()+random(99)` | `manual:<uuid>` (`crearBloque` ya lo hace) | Es el formato de id del repo y `esManual()` depende del prefijo. |

## 3. Requisitos

### R1 — La card abre el modal

- **R1.1** La card del tablero toma `cursor: pointer`, hover `border-color: var(--bor2)`
  (`.html:785`) y `onClick` que abre el modal de esa card.
- **R1.2** El handle de drag (28×24, `cursor: grab`, color `--bor2`, ícono 12×16 de seis
  puntos `r=1.4`) **frena la propagación**: arrastrarlo o tocarlo no abre el modal.
- **R1.3** El preview de link tampoco abre el modal: es un `<a target="_blank">` con
  `stopPropagation` (`.html:786-792`).
- **R1.4** En el documento, el botón `⋯` (spec 1, R6) abre el mismo modal.
- **Aceptación**: click en el cuerpo de la card abre el modal; click en el handle, en el
  preview de link o en el tachito, no.

### R2 — Panel del modal

- **R2.1** Desktop: **580px** de ancho, radio 16px, centrado, `max-height: 86dvh`,
  `overflow-y: auto`. Móvil (≤640px): sheet `width: 100%`, radios `20px 20px 0 0`,
  `max-height: 92dvh`. Padding **`24px 26px 32px`** en los dos (`.html:1728-1731`).
- **R2.2** Scrim `--scrim` con `fadeIn .18s ease`; panel con
  `sheetUp .28s cubic-bezier(.22,.8,.3,1)`. Click en el scrim cierra. Los dos keyframes ya
  existen en `app/globals.css`.
- **R2.3** Se hace variante del `Modal` que ya existe (`components/modal.tsx`), con un
  prop de ancho — no un segundo modal desde cero. El foco atrapado, el Esc y el cierre ya
  están resueltos ahí.
- **Aceptación**: en 1440px el panel mide 580px; en 390px es un sheet a ancho completo.

### R3 — Header del modal

- **R3.1** Fila `gap: 10px`, `margin-bottom: 16px` con, en orden:
  - **Badge de tipo**: mono 10px/600, `letter-spacing: .12em`, uppercase, color y borde
    `--acc`, radio 99px, padding `4px 11px`. Textos: `Nota`, `Título`, `Tarea`, `Link`
    (`.html:1914`).
  - **Badge de estado**: mismo estilo, color y borde según el estado —
    `Por hacer` → `--tx3`, `En proceso` → `#38bdf8`, `Listo` → `#34d399`. Si `hecho`, dice
    `Listo` sin importar el `estado` (`.html:1975-1976`).
  - **Fecha**: mono 11px `--tx4`, formato `dd/mm` (`.html:1915`).
  - **Cerrar `✕`**: `margin-left: auto`, 44×44, `margin-right: -12px`, radio 12px, ícono
    18px `stroke-width: 2.2`.
- **Aceptación**: una tarea hecha muestra badge `TAREA` ámbar y badge `LISTO` verde.

### R4 — Textarea

- **R4.1** `rows=4`, fondo `--bg`, borde `--bor`, radio 14px, padding `14px 16px`,
  **17px / 600**, `line-height: 1.55`, `resize: vertical`.
- **R4.2** Placeholder exacto: **`¿Qué hay que hacer? · / cambia el tipo · @ referencia`**.
- **R4.3** Guarda con el mismo debounce (~600ms) que ya usa el editor; no en cada tecla.
- **R4.4** Autofoco solo en desktop (ver §2).

### R5 — Menú `/` "Convertir en"

- **R5.1** Se abre cuando el texto arranca con `/` (`.html:1929`). Caja `margin-top: 8px`,
  fondo `--bg`, borde `--bor2`, radio 12px, padding 4px. Kicker **`Convertir en`**
  (mono 10px/600, `.14em`, uppercase, `--tx4`, padding `8px 10px 4px`).
- **R5.2** Ítems: `min-height: 42px` (área táctil 44), padding `6px 10px`, radio 9px,
  hover fondo `--bor`; glifo en cuadro **26×26** radio 8px fondo `--bor` mono 12px `--acc`;
  nombre 13.5px/600; comando mono 10.5px `--tx3`.
- **R5.3** Opciones: `Texto` (`T`), `Título` (`#`), `Tarea` (`✓`), `Link` (`↗`)
  (`.html:1930`). Filtran con las mismas keywords del composer.
- **R5.4** Convertir cambia `tipo` y **conserva `texto`** (ver §2). Al convertir a `link`,
  el texto se mantiene como nombre del link y la URL queda vacía.
- **R5.5** `bloquePatchSchema` y `actualizarBloque` (`app/actions.ts:375-400`) aceptan
  `tipo`. Es el cambio que hoy hace imposible convertir.
- **Aceptación**: escribir `/link` en el modal convierte la card sin borrar lo escrito.

### R6 — Menú `@` "Referenciar"

- **R6.1** Mismo catálogo, colores y markup del spec 1 (R2), con kicker **`Referenciar`**
  y **máximo 5** resultados (el modal usa 5, el composer 7 — `.html:1926`).
- **R6.2** Elegir setea `ref` y **conserva** el texto posterior al `@` (ver §2).

### R7 — Segmento de Estado

- **R7.1** Label mono 10.5px/600, `.14em`, uppercase, `--tx3`, `margin-bottom: 8px`,
  texto `Estado`.
- **R7.2** Contenedor fondo `--bg`, borde `--bor`, radio 11px, padding 3px, gap 2px. Tres
  botones `flex: 1`, alto visual 38px (área táctil 44), radio 8px, 12.5px/700, gap 6px,
  con dot de **7×7**. Activo: color `--tx`, fondo `--bor`. Inactivo: `--tx3`, transparente
  (`.html:1646-1652`).
- **R7.3** Elegir estado setea `estado` y `hecho = (estado === 'listo')` — la misma regla
  que ya aplica el tablero al soltar (`notas-editor.tsx:343-355`).
- **R7.4** Dispara toast (spec 4): `¡Completada! Movida a Listo` si el destino es `listo`,
  si no `Movida a {nombre}`.

### R8 — Fila de Formato

- **R8.1** Label `Formato`, mismo estilo que R7.1. Fila `gap: 8px`.
- **R8.2** Cuatro botones de **44×40** visuales (área táctil 44), borde `--bor`, radio
  10px, 14px, `transition: background .15s ease, color .15s ease`. Glifos: `B` (peso 700),
  `I` (itálica), `U` (subrayado — ver spec 1, §2), `▍A` (resaltado).
- **R8.3** Activo: fondo `#fbbf24`, texto `#221a00`. Inactivo: fondo `--bg`, texto `--tx2`.
- **R8.4** Cada toggle escribe `fmt` (spec 1, R1) y se refleja al instante en la card.

### R9 — Select de Referencia

- **R9.1** Label `Referencia`. `<select>` ancho completo, alto 46px, fondo `--bg`, borde
  `--bor`, radio 12px, padding `0 12px`, 14px.
- **R9.2** Primera opción **`Sin referencia`** (valor vacío, quita el `ref`). El resto son
  las mismas del catálogo, con prefijo por tipo (`.html:1918`).
- **R9.3** Es el camino accesible al mismo dato que el `@`: teclado y lector de pantalla
  llegan sin depender del menú flotante.

### R10 — URL (solo tipo `link`)

- **R10.1** Label `URL`. Input alto 46px, fondo `--bg`, borde `--bor`, radio 12px, padding
  `0 14px`, **mono 13px**, placeholder **`Pegá el link acá`**.
- **R10.2** Al salir del campo se normaliza agregando `https://` si falta — lo hace
  `normalizarUrl` en la action, que ya existe (`app/actions.ts:398`).

### R11 — Check de hecha (solo tipo `tarea`)

- **R11.1** Botón ancho completo, alto 46px, fondo `--bg`, borde `--bor`, radio 12px,
  padding `0 14px`, 14px/600, gap 10px.
- **R11.2** Casilla **19×19**, radio 7px, borde `2px solid --bor2`, fondo `--bor` cuando
  está hecha; check de 10×10 `stroke-width: 3.5` color `--acc`.
- **R11.3** Copy exacto: **`Marcar como hecha`** / **`Hecha — tocá para desmarcar`**.
- **R11.4** Togglear setea `hecho` y `estado = hecho ? 'listo' : 'pendiente'`, y dispara el
  toast `¡Tarea completada!` solo al marcar (no al desmarcar).

### R12 — Sección Aviso

Se especifica entera en el spec 3 (R3). Acá solo queda reservado el lugar: va después del
check de hecha y antes del pie.

### R13 — Pie: Borrar y Listo

- **R13.1** Fila `gap: 10px`, `margin-top: 20px`.
- **R13.2** **Borrar** con doble toque, timeout **3000ms**, timer propio (ver §2).
  Desarmado: transparente, borde `1px solid rgba(251,113,133,.45)`, texto `#fb7185`,
  radio 12px, 13.5px/700, alto 46px, padding `0 16px`, label **`Borrar`**.
  Armado: fondo `#fb7185`, texto `#20060b`, borde `#fb7185`, label
  **`¿Seguro? Tocá de nuevo`**.
- **R13.3** Al borrar: cierra el modal, elimina el bloque y dispara el toast
  `Card eliminada` (spec 4).
- **R13.4** **Listo**: `flex: 1`, fondo `#fbbf24`, texto `#221a00`, radio 12px, 14.5px/700,
  alto 46px. Solo cierra (todo se fue guardando).
- **Aceptación**: un solo toque en Borrar no borra; el segundo dentro de 3s sí; a los 3s
  vuelve a decir `Borrar`.

### R14 — Cambios en la card del tablero

- **R14.1** Copy del botón: **`+ Nueva card`** (hoy `+ Agregar`). Crea un bloque de tipo
  **`tarea`** (hoy `texto`), texto vacío, `estado` = el de la columna,
  `hecho = (estado === 'listo')`, y **abre el modal recién creado**.
- **R14.2** Hover del botón: color y borde `--acc` (`.html:814`); en touch, el mismo
  cambio en `:active`.
- **R14.3** **Tachito con confirmación inline** en cada card: alto 24px, ancho mínimo 28px
  (área táctil 44), `margin-left: auto`, ícono 13×13, hover `#fb7185`. Armado: reemplaza
  el ícono por **`¿SEGURO?`** en mono 9.5px/600 `letter-spacing: .06em` color `#fb7185`,
  timeout 3000ms. Al confirmar, toast `Card eliminada del tablero`.
- **R14.4** **Preview de link en la card** (`.html:786-792`), cuando el tipo es `link` y la
  URL matchea `^https?://`: fila fondo `--sup`, borde `--bor`, radio 9px, padding `7px 9px`,
  `margin-top: 6px`; favicon **16×16** radio 4px (`google.com/s2/favicons?domain=…&sz=64`,
  fondo `--bor` mientras carga), dominio mono **10.5px** `--acc` truncado, flecha `↗` de
  12×12 `--tx3`. Alto efectivo ≥44px por el mínimo táctil.
- **R14.5** Texto de la card: el texto del bloque; si es link sin texto, **el dominio**; si
  no hay nada, `Sin título` (`.html:1612`). Hoy dice `Sin texto` / `Sin elegir todavía`.
- **R14.6** Chip de referencia en la card: pill radio 99px, padding `4px 10px`,
  `margin-top: 6px`, dot 6×6, mono 10.5px, color por tipo (spec 1, R2.3).
- **R14.7** Se **mantienen** los links `→ en proceso` / `→ listo`
  (`notas-editor.tsx:650-666`): son la desviación deliberada de la sesión anterior para
  touch, donde no hay drag nativo. El modal es un segundo camino, no un reemplazo.

## 4. Fuera de alcance

- Crear el aviso desde la card (solo se reserva el lugar) → spec 3.
- Los toasts en sí → spec 4.
- La opción `Página de nota` del menú "Convertir en" y las cards que navegan en vez de
  abrir el modal → spec 5.
- Reordenar bloques por drag dentro del documento.

## 5. Desviaciones que aparecieron implementando

_(se completa al implementar)_

## 6. Verificación

1. `npx tsc --noEmit`, `npx next lint`, `npx vitest run`.
2. Tests sin navegador:
   - `actualizarBloque` acepta `tipo` y rechaza un tipo inválido.
   - Convertir un bloque con texto a otro tipo **conserva** el texto.
   - Elegir estado `listo` deja `hecho: true`; volver a `pendiente` lo deja en `false`.
   - Borrar con un solo toque no llama a la action.
3. En navegador (sesión temporal, borrarla después), con captura al lado del prototipo:
   - modal a 580px en desktop y como sheet en 390px;
   - los dos badges del header con sus colores en tema oscuro y claro;
   - el tap en el handle **no** abre el modal (probar con emulación táctil, que es donde
     el prototipo falla);
   - `¿SEGURO?` en la card y `¿Seguro? Tocá de nuevo` en el modal, cada uno con su timer,
     armados a la vez.
4. Copia de `datos/bloques.json` antes de probar: el modal borra bloques.
