# Spec — Formato por bloque y referencias estructuradas

Estado: **implementado** (17/08) · Fuente: `design_handoff_mi_cursada/Mi Cursada.dc.html`
(§"Actualización 17/08" del README del paquete; las medidas salen del `.html`).

Implementación prevista: `lib/types.ts`, `lib/datos-locales.ts`, `app/actions.ts`,
`components/notas-editor.tsx`, `components/campo-nota.tsx`, `components/ref-curso.tsx`.

Es la base de los otros specs: el modal de card (spec 2) edita estos dos campos y los
avisos vinculados (spec 3) dependen del `ref` de tipo `aviso`.

## 1. Por qué

El editor de la app ya tiene bloques, comandos `/` y referencias al curso, pero el diseño
del 17/08 cambia **dos cosas de modelo**, no de estilo:

1. **El formato deja de ser implícito.** Hoy cada tipo de bloque tiene un peso fijo
   (`notas-editor.tsx:824`). El diseño agrega `fmt: {b,i,u,hl}` por bloque: negrita,
   cursiva, subrayado y resaltado ámbar, que se aplican **al bloque y a su card del
   tablero** (`.html:1543-1548` y `:1616-1618`). El repo no tiene el campo, y
   `rgba(251,191,36,.16)` no aparece en ningún archivo.
2. **La referencia deja de vivir dentro del texto.** Hoy una referencia es un marcador
   `[[mod:1234|Nombre]]` embebido en `texto` (`lib/referencias.ts:62`), y el único tipo
   citable es un módulo del aula virtual. El diseño la saca afuera como campo
   `ref: {tipo, id}` (`.html:1577`), la muestra como chip pegado al bloque, y suma dos
   tipos nuevos: **otras materias** y **avisos pendientes** (`.html:1592-1596`).

Además hay copy que difiere palabra por palabra (tabla en R4), y un botón `⋯` por bloque
que hoy no existe y que es la única puerta al modal del spec 2.

Evidencia del estado actual: `datos/bloques.json` tiene 5 bloques, cuatro con `texto`
vacío y uno con un marcador `[[mod:146532|…]]`. Cualquier migración es trivial.

## 2. Adaptaciones respecto del handoff

| Prototipo | Esta app | Motivo |
|---|---|---|
| `ref.tipo` = `archivo \| materia \| aviso \| clase` | `modulo \| materia \| aviso` | En el prototipo "archivo" es una fila de `m.archivos` (un link cargado a mano). Acá lo equivalente es un módulo del aula virtual (`ModuloCurso`), que es lo que `lib/referencias.ts` ya sabe resolver. `clase` está declarado en `REFCOL` (`.html:1517`) pero **no se genera nunca**: es color huérfano, no se porta. |
| El `@` reemplaza el texto tipeado: `x.texto = t.slice(0,ix)` (`.html:1927`) | El `@` inserta el chip y **conserva** lo escrito después | Bug 4 del prototipo: se come el texto en silencio. |
| El menú `@` se abre con cualquier arroba (`lastIndexOf('@')`, `.html:1590`) | Se abre solo si el `@` arranca palabra | `lib/referencias.ts:195-212` ya lo resuelve bien; escribir un mail no debe abrir el menú. |
| Marcadores `[[mod:…]]` no existen | Se mantienen | Hay datos guardados con ese formato y 29 tests que lo cubren. El parser sigue vivo para lo que ya está escrito; lo nuevo usa `ref`. |
| Glifo del toggle de subrayado: `S` (`.html:1935`) | `U` | Bug 5/7: el glifo `S` se lee como *strikethrough* pero aplica `underline`. No hay tachado manual en el diseño (el `line-through` solo lo produce `hecho`, `.html:1544`). |
| `fmt` sin límite de combinación | Igual | — |

## 3. Requisitos

### R1 — Campo `fmt` en el bloque

- **R1.1** `Bloque` suma `fmt?: { b?: boolean; i?: boolean; u?: boolean; hl?: boolean }`
  (`lib/types.ts:40`). Opcional: los bloques ya guardados no lo tienen y deben seguir
  parseando.
- **R1.2** `bloqueLocalSchema` (`lib/datos-locales.ts:226`) suma `fmt` como objeto
  opcional con cuatro booleanos opcionales. **Esto va primero que cualquier escritura**:
  el schema descarta lo no declarado, y el próximo `actualizarBloqueLocal` reescribiría
  el archivo sin el campo. El overlay es irrecuperable.
- **R1.3** `bloquePatchSchema` y `actualizarBloque` (`app/actions.ts:375-400`) aceptan
  `fmt`. La lista blanca de `cambios` es explícita: si no se suma ahí, el campo se
  descarta en el server sin error.
- **R1.4** Render en el documento (`.html:1543-1548`): `font-weight` 700 si `b` (si no
  400), `font-style: italic` si `i`, `background: rgba(251,191,36,.16)` si `hl` (si no
  transparente, con `border-radius: 6px` y `padding: 7px 4px` que ya están),
  `text-decoration` = `underline` si `u`, más `line-through` si `hecho`, `none` si
  ninguno. Color del texto: `--tx3` si `hecho`, `--tx` si no.
- **R1.5** Render en la card del tablero (`.html:1616-1618`): igual pero el peso sube —
  **800 si `b`, 600 si no** (en la card el peso base ya es semibold).
- **Aceptación**: un bloque con `fmt:{b:true,hl:true}` se ve en negrita y resaltado en
  las dos vistas; un bloque sin `fmt` se ve exactamente como hoy.

### R2 — Campo `ref` en el bloque

- **R2.1** `Bloque` suma `ref?: { tipo: 'modulo' | 'materia' | 'aviso'; id: string } | null`.
  Mismo tratamiento de schema y patch que R1 (R1.2, R1.3).
- **R2.2** Catálogo de lo referenciable, en este orden (`.html:1592-1596`):
  módulos del aula virtual de **esta** materia, **otras** materias (`m.id !== materiaId`)
  y avisos **pendientes** (`!a.hecho`). Máximo **7** resultados en el composer
  (`.html:1597`).
- **R2.3** Colores por tipo (`REFCOL`, `.html:1517`): `modulo` → `--acc`;
  `materia` → el color de esa materia, fallback `#a78bfa`; `aviso` → `#fb7185`.
- **R2.4** Menú `@` (`.html:668-680`): mismo contenedor que el de `/` (fondo `--sup`,
  borde `--bor2`, radio 12px, padding 4px, `margin-top: 8px`), kicker **`Referenciar`**
  (mono 10px/600, `letter-spacing: .14em`, uppercase, `--tx4`, padding `8px 10px 4px`).
  Cada ítem: dot **8×8** del color del tipo, nombre 14px/600 truncado, y el tipo en mono
  10px `letter-spacing: .1em` uppercase `--tx4`. Vacío:
  **`Nada que referenciar con «{query}».`**
- **R2.5** Chip en el composer (`.html:638-645`): pill fondo `--sup`, borde `--bor2`,
  radio 99px, padding `5px 6px 5px 12px`, dot **7×7**, nombre **mono 11.5px** color
  `--tx`, botón `✕` de 24×24. Con chip adjunto, el margen superior del composer pasa de
  14px a **8px** (`.html:1896`).
- **R2.6** Chip debajo del bloque (`.html:700-703`): pill fondo `--bg`, borde `--bor`,
  radio 99px, padding `4px 11px`, margen `0 0 7px 4px`, dot **6×6**, nombre **mono 11px**
  con el color del tipo.
- **R2.7** Click del chip por tipo (`.html:1517-1526`): `modulo` abre el módulo en la tab
  Curso (el `onIrAModulo` que ya existe, `notas-editor.tsx:138`); `materia` navega al
  detalle de esa materia; `aviso` navega a `/avisos`.
- **R2.8** Si el destino ya no existe (módulo que desapareció del aula virtual, materia
  borrada, aviso eliminado), el chip se muestra **tachado y sin acción**, y el bloque no
  se rompe. Es la regla que ya sigue `lib/referencias.ts` para los marcadores.
- **R2.9** El marcador `[[mod:…|…]]` sigue parseándose para lo ya escrito
  (`components/ref-curso.tsx`), pero el `@` nuevo **no lo escribe más**: escribe `ref`.
- **Aceptación**: `@` sobre una materia deja un chip violeta que navega a esa materia; el
  texto tipeado después del `@` no se pierde; un bloque viejo con `[[mod:…]]` sigue
  renderizando su chip.

### R3 — Comandos del composer

- **R3.1** La lista queda así (`.html:1598-1605`), con el glifo, el nombre y las keywords
  exactos:

  | cmd | nombre | glifo | keywords |
  |---|---|---|---|
  | `/texto` | Texto | `T` | `texto nota parrafo` |
  | `/titulo` | Título | `#` | `titulo encabezado` |
  | `/todo` | To-do (checkbox) | `✓` | `tarea pendiente check todo to-do checkbox` |
  | `/link` | Link con preview | `↗` | `link url preview` |
  | `/divisor` | Divisor | `—` | `divisor separador linea` |
  | `/tablero` | Ver tablero | `▦` | `tablero kanban board` |

- **R3.2** `/tarea` pasa a llamarse **`/todo`** con nombre "To-do (checkbox)", pero sigue
  creando un bloque de tipo `tarea` — el tipo interno no cambia, solo el vocabulario del
  menú. `tarea` queda como keyword para que quien escriba `/tarea` lo siga encontrando.
- **R3.3** `/curso` (glifo `▸`, "Del curso") **se saca del menú**: su función la absorbe
  el `@` de R2, que cubre los mismos módulos y dos tipos más. Los bloques de tipo `ref`
  ya guardados se siguen renderizando (no se migran ni se borran).
- **R3.4** El filtrado sigue siendo por keywords **o** por prefijo del comando, como ya
  está (`notas-editor.tsx:183`).
- **Aceptación**: `/todo` y `/checkbox` encuentran el ítem de to-do; `/curso` no aparece
  en el menú; un bloque `ref` viejo sigue viéndose.

### R4 — Copy exacto

Los textos son los del `.html`, sin parafrasear:

| Dónde | Texto exacto | Hoy dice |
|---|---|---|
| Placeholder del composer (`.html:649`) | `Anotá lo que dice el profe · / bloques · @ referencias` | `Anotá lo que dice el profe, o tocá /` |
| Pista al lado del toggle (`.html:1889`) | `/ bloques · @ referencias` | `tocá / para bloques` |
| Placeholder de texto (`.html:698`) | `Escribí…` | `Escribí acá…` |
| Placeholder de to-do (`.html:713`) | `To-do… (Enter crea otro)` | `Tarea…` |
| Vacío del editor (`.html:163` README) | `Sin notas todavía. Anotá lo que dice el profe acá — con / agregás títulos, tareas, links y divisores.` | `…links y cosas del curso.` |
| Menú `/` vacío | `No hay ningún comando «/{query}».` | igual ✔ |

### R5 — Enter dentro de un to-do

- **R5.1** Enter (sin Shift) dentro de un bloque `tarea` **inserta otro to-do debajo** y
  le da el foco (`.html:1556-1562`); no mete un salto de línea. Shift+Enter sigue siendo
  salto de línea.
- **R5.2** El foco se pasa por id (`focusId`), no por índice: si el guardado con debounce
  reordena o re-siembra desde el server, el foco no salta a otro bloque.
- **R5.3** El nuevo to-do nace con el mismo `estado` de la columna/documento donde está,
  `hecho: false`, y `orden` entre el actual y el siguiente (los huecos de 1000 de
  `Bloque.orden` alcanzan; si no hay hueco, se reordena ese tramo).
- **Aceptación**: tres Enter seguidos dejan tres to-dos vacíos encadenados, con el cursor
  en el último.

### R6 — Botón `⋯` por bloque

- **R6.1** Aparece en los bloques editables (todos menos `divisor`, `.html:1542`), a la
  izquierda del dot de estado.
- **R6.2** Medida del prototipo: **26×34**, sin fondo ni borde, color `--tx4`, hover
  `--acc`, ícono de 14×14 con tres círculos `r=1.7`.
  **Desviación**: el área táctil sube a **44px** de alto (clase `.tactil`), manteniendo el
  ícono de 14px. El prototipo se queda en 34px, por debajo del mínimo táctil que el resto
  del handoff respeta.
- **R6.3** `aria-label`: `Abrir detalle de la nota` (el prototipo usa `title=`, que no
  existe en touch).
- **R6.4** Abre el modal del spec 2. Hasta que ese spec esté implementado, el botón no se
  agrega: sin destino no tiene sentido.
- **Aceptación**: cada bloque editable muestra `⋯`, `divisor` no.

### R7 — Accesibilidad y motion

- **R7.1** Los chips de referencia son `<button>` o `<a>` reales, con `aria-label` que
  incluye el tipo ("Ir a la materia Análisis Matemático").
- **R7.2** El menú `@` y el `/` se cierran con Esc y son navegables con flechas; Enter
  ejecuta la primera opción (ya está para `/`, `.html:1607`).
- **R7.3** El resaltado `hl` no se usa como único portador de información: es decoración,
  el texto se lee igual sin él.

## 4. Fuera de alcance

- El modal de card, el segmento de Estado y la fila de Formato en el modal → spec 2.
- Crear avisos desde una nota → spec 3.
- Toasts → spec 4.
- Tipo de bloque `pagina` y `hijos[]` → spec 5.
- Drag & drop para reordenar en el documento (el prototipo lo tiene, `.html:1569`, pero
  con un bug: reordena siempre la raíz aunque estés dentro de una página). Se trata junto
  con el spec 5, que es donde el bug importa.

## 5. Desviaciones que aparecieron implementando

_(se completa al implementar)_

## 6. Verificación

1. `npx tsc --noEmit`, `npx next lint`, `npx vitest run` (409 tests hoy; suman los nuevos
   de `lib/referencias.ts` para el catálogo de tres tipos).
2. Tests nuevos, sin navegador:
   - `bloqueLocalSchema` parsea un bloque sin `fmt` ni `ref` (los 5 que hay en
     `datos/bloques.json`) y **conserva** ambos campos cuando están.
   - Round-trip: escribir un bloque con `fmt` y `ref`, releer, y verificar que no se
     perdió nada (es el modo de falla caro: el overlay no se puede recuperar).
   - Catálogo: con una materia con módulos, otra materia y un aviso pendiente y otro
     hecho, `@` devuelve máximo 7 y **no** incluye el aviso hecho ni la materia propia.
   - El `@` a mitad de un mail (`hola@gmail`) no abre el menú.
3. En navegador, con el dev server que ya corre en el 3000 y una sesión temporal
   (borrarla después): un bloque con las cuatro marcas de formato, en tema oscuro y
   claro, comparado contra el prototipo abierto al lado.
4. **Antes de cualquier prueba que escriba**: copia de `datos/bloques.json`. Es
   irrecuperable.
