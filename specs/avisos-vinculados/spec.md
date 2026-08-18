# Spec — Avisos vinculados a notas (`notaId`, `NotaAviso`, modal de aviso)

Estado: **parcial** (17/08: modelo, alta desde la nota y snippet; faltan el modal
grande de aviso y el deep-link) · Depende de los specs 1 y 2.
Fuente: `design_handoff_mi_cursada/Mi Cursada.dc.html` (`:1017-1057` el modal,
`:1448-1467` la resolución, `:363-379/:466-486/:862-877` las tres superficies) y
`design_handoff_mi_cursada/NotaAviso.dc.html` (el snippet).

Implementación prevista: `lib/types.ts`, `lib/datos-locales.ts`, `app/actions.ts`,
`components/nota-aviso.tsx` (nuevo), `components/modal-aviso.tsx` (nuevo),
`components/avisos-lista.tsx`, `components/materia-detalle.tsx`, `components/hoy-live.tsx`.

## 1. Por qué

Es la única capacidad del paquete nuevo que **cierra un circuito** en vez de agregar
adorno: hoy una nota ("terminar el TP de integrales") y un aviso ("TP de integrales vence
el jueves") son dos cosas sin relación, escritas dos veces. El diseño las liga con un
campo `notaId` y hace que el aviso muestre un pedazo de la nota y sepa volver a ella.

La buena noticia es que la infraestructura ya está: `datos/avisos-manuales.json` existe y
hoy está en `[]`, `crearAvisoLocal` escribe ahí con id `manual:<uuid>`, `esManual()`
discrimina por prefijo y `eliminarAviso` ya rechaza los que vienen del aula virtual con
`Ese aviso viene del aula virtual.`. **Un aviso nacido de una nota es exactamente un aviso
manual con un campo más**, y el sync (que solo reescribe `aula-virtual.json`) no lo puede
pisar.

Lo que falta es todo lo demás: el campo, el componente del snippet, el modal grande, y la
navegación de vuelta a la nota exacta.

## 2. Adaptaciones respecto del handoff

| Prototipo | Esta app | Motivo |
|---|---|---|
| El chevron es un `<span role="button">` **dentro** de un `<button>`, y el snippet es un `<div>` dentro del mismo `<button>` (`.html:375,476,870`) | Chevron y snippet **fuera** del botón, como hermanos en un contenedor flex | HTML inválido: interactivo dentro de interactivo. React tira warning de hidratación y el teclado no llega (los spans no tienen `tabIndex` ni `onKeyDown`). `avisos-lista.tsx:89-120` ya usa el patrón correcto. |
| El snippet desaparece cuando el aviso está hecho (`hayNota: !!nb && !a.hecho`, `.html:1455`) | El snippet **se mantiene**, atenuado como el resto de la fila hecha | Bug 4: perdés el vínculo justo cuando querés revisar qué habías anotado. Parece efecto colateral de reusar la flag para la lista y para el modal. |
| Desde `/avisos` el chevron llama a `irNota`, y si el aviso no tiene nota no hay chevron (`.html:480-481`) | El chevron abre **siempre** el modal de aviso, en las tres superficies | Bug 2: hoy en el prototipo es **imposible** abrir el modal de aviso desde la lista de avisos. Que la misma affordance haga dos cosas distintas según la pantalla tampoco se sostiene. Para ir a la nota está "Abrir la nota →" dentro del modal, más el click en el propio snippet. |
| "Ver" del modal de card solo navega al tab Avisos (`.html:1963`) | Abre el modal de **ese** aviso | Bug 1: el botón se llama "Ver" y no muestra nada en particular. |
| `crearAvisoDeCarta` no chequea duplicados (`.html:1958`) | La action rechaza si ya hay un aviso con ese `notaId` | Bug 10: doble tap deja dos avisos y la UI solo muestra uno; el otro queda invisible y no se puede borrar desde ahí. |
| `id: 'a'+Date.now()` | `manual:<uuid>` | Formato de id del repo; `esManual()` depende del prefijo. |
| `cartaAvFecha` es un solo campo global (`.html:1956`) | La fecha es estado del modal abierto | Bug 11: abrir otra card conserva la fecha tipeada en la anterior. |
| Borrar la nota no toca el aviso | Igual (se tolera el huérfano) | Es lo correcto **y** lo prudente: `avisos-manuales.json` es la única copia. El aviso huérfano se muestra sin snippet. |

## 3. Requisitos

### R1 — Modelo

- **R1.1** `Aviso` suma `notaId?: string | null` — el id del bloque que lo originó
  (`lib/types.ts:166`).
- **R1.2** `avisoManualSchema` (`lib/datos-locales.ts:213`) suma
  `notaId: z.string().nullable().optional()`. Aditivo: el `[]` actual y cualquier registro
  viejo siguen validando.
- **R1.3** El merge de avisos (`lib/datos-locales.ts:417-425`) reconstruye el objeto campo
  por campo: hay que sumar `notaId: a.notaId ?? null` o el campo se pierde en silencio en
  cada lectura.
- **R1.4** `avisoSchema` del snapshot (`lib/datos-locales.ts:155`) también lo acepta como
  opcional. Moodle nunca lo manda, pero así el tipo es uno solo.
- **R1.5** El `hecho` sigue viniendo de `avisos-estado.json` para todos los avisos, como
  hoy. `Marcar como hecho` del modal reusa `toggleAviso` sin cambios.

### R2 — Resolución nota ↔ aviso

- **R2.1** Dado un aviso con `notaId`, se busca el bloque en la materia del aviso. Con el
  modelo plano actual alcanza `materia.bloques.find(b => b.id === a.notaId)`; cuando exista
  el tipo `pagina` (spec 5) la búsqueda pasa a ser recursiva sobre `hijos`
  (`buscarBloque`, `.html:1447`).
- **R2.2** Si el bloque no existe (nota borrada), el aviso se muestra **completo y sin
  snippet**. No se borra nada ni se limpia el `notaId`.
- **R2.3** Nombre del tipo de nota, exacto (`.html:1457`): `texto` → `nota`,
  `titulo` → `título`, `tarea` → `to-do`, `link` → `link`.
- **R2.4** Estado de la nota para el snippet (`.html:1448`, en minúscula):
  `pendiente` → `por hacer` `#64748b`; `proceso` → `en proceso` `#38bdf8`;
  `listo` → `listo` `#34d399`. Si el bloque está `hecho`, se muestra como `listo`.

### R3 — Crear el aviso desde el modal de card

Es la sección "Aviso" que el spec 2 (R12) dejó reservada.

- **R3.1** Label `Aviso` (mono 10.5px/600, `.14em`, uppercase, `--tx3`, `margin-bottom: 8px`).
- **R3.2** Sin aviso: fila `gap: 8px` con `<input type="date">` (`flex: 1`, alto 44px, fondo
  `--bg`, borde `--bor`, radio 12px, padding `0 12px`, mono 13px, default **hoy**) y botón
  **`Crear aviso`** (alto 44px, padding `0 14px`, 13px/700, fondo `--bg`, borde `--bor2`,
  radio 12px, ícono de campana 14×14; hover borde y texto `--acc`).
- **R3.3** Con aviso ya creado: caja fondo `--bg`, borde `--bor`, radio 12px, padding
  `10px 13px`, gap 9px — dot **7×7** `#fb7185`, texto 13px/600 `--tx2`
  **`Aviso creado · dd/mm`** (con ` · hecho` si está hecho), y botón **`Ver`**
  (12.5px/700, `--acc`) que abre el modal de **ese** aviso (ver §2).
- **R3.4** Action nueva `crearAvisoDesdeNota(materiaId, bloqueId, fecha)` en
  `app/actions.ts`, con `hayAcceso()` como todas. Arma el aviso así (`.html:1958-1962`):
  - `titulo` = texto del bloque recortado; si está vacío, **`Nota sin título`**;
  - si el texto supera 60 caracteres: `slice(0, 59) + '…'`;
  - `materiaId` = la materia del detalle; `fecha` = la elegida (default hoy);
  - `hecho: false`; `notaId` = el id del bloque; `id` = `manual:<uuid>`.
- **R3.5** Si ya existe un aviso con ese `notaId`, la action no crea otro y devuelve el
  existente (ver §2).
- **R3.6** Al crear, toast `Aviso creado desde la nota` (spec 4).
- **Aceptación**: crear un aviso desde una nota de 80 caracteres deja un título de 60 con
  `…` al final, ligado por `notaId`, y `datos/avisos-manuales.json` lo refleja.

### R4 — Componente `NotaAviso`

Portado de `NotaAviso.dc.html`, medidas exactas:

- **R4.1** Contenedor: `display: flex`, `align-items: flex-start`, `gap: 8px`, fondo
  `--bg`, borde `1px solid --bor`, **`border-left: 2px solid {color de la materia}`**,
  radio 9px, padding `7px 10px`, `margin-top: 7px`.
- **R4.2** Ícono de página 12×12, `stroke` del color de la materia, `stroke-width: 2`,
  `flex-shrink: 0`, `margin-top: 2px`.
- **R4.3** Texto: 12px, `line-height: 1.45`, `--tx2`, **truncado a una línea** con
  ellipsis.
- **R4.4** Subfila (`margin-top: 3px`, `gap: 6px`): tipo en **mono 9.5px**
  `letter-spacing: .1em` uppercase `--tx4`; dot **5×5** del color del estado; nombre del
  estado en **mono 9.5px** del mismo color.
- **R4.5** Es clickeable: abre la nota exacta (R6). Como no puede ir dentro del `<button>`
  de la fila (ver §2), se renderiza como hermano.

### R5 — Dónde aparece el snippet

| Superficie | Snippet | Chevron |
|---|---|---|
| `/avisos` (`components/avisos-lista.tsx`) | Sí | Sí |
| Tab Avisos de la materia (`components/materia-detalle.tsx`) | Sí | Sí |
| "Próximos avisos" en Hoy (`components/hoy-live.tsx`) | No | Sí |

- **R5.1** Chevron: 34×34 en `/avisos`, 32×32 en las otras dos (`.html:375,481,875`), radio
  10/9px, borde `1px solid --bor`, color `--tx3`, ícono `M9 6l6 6-6 6`. Área táctil 44px.
  `aria-label`: `Ver el aviso {título}`.
- **R5.2** El chevron **siempre** abre el modal de aviso (ver §2).
- **R5.3** En `/avisos` el chevron reemplaza al tachito solo visualmente en la fila: el
  borrar de los avisos manuales (`avisos-lista.tsx:52-62`) se mantiene y pasa al modal,
  para no perder la única forma de borrar un aviso propio.
- **R5.4** El snippet se muestra también en la sección "Hechos", atenuado (ver §2).

### R6 — Abrir la nota exacta

- **R6.1** Click en el snippet, o en "Abrir la nota →" dentro del modal, lleva a: detalle
  de la materia → tab **Notas** → vista **documento** → (página que la contiene, cuando
  exista el spec 5) → **modal de card de esa nota abierto** (`.html:1460-1464`).
- **R6.2** El prototipo hace todo en un `setState` porque es una SPA. Acá el destino es una
  URL: la navegación se hace con parámetros de búsqueda que `MateriaDetalle` lee al montar
  (por ejemplo `?tab=notas&nota=<id>`), y no con estado global.
  Esto además **cierra un pendiente ya anotado** en `docs/HANDOFF-UI.md` §6: hoy no hay
  deep-link a una tab del detalle, y desde el Grafo se navega a la materia sin poder abrir
  la tab.
- **R6.3** Si el bloque ya no existe, se abre la materia en la tab Notas sin modal, sin
  error.
- **Aceptación**: desde `/avisos`, tocar el snippet abre la materia con el modal de esa
  nota; la URL resultante se puede pegar en otra pestaña y hace lo mismo.

### R7 — Modal grande de aviso

- **R7.1** Usa el `Modal` de 440px (`panelStyle`, no el grande del spec 2).
- **R7.2** Kicker `Aviso` (mono 10.5px/600, `.14em`, uppercase, `--tx3`) y `✕` de 44×44.
- **R7.3** Título: **21px / 800**, `letter-spacing: -.015em`, `line-height: 1.3`, `--tx`.
- **R7.4** Fila meta (`gap: 14px`, `flex-wrap`, `margin-top: 12px`): dot **8×8** del color
  de la materia + nombre 13.5px/600 `--tx2` (gap 7px); fecha en **mono 12.5px** `--tx3`
  formato **`dd/mm/yyyy`**; badge de estado en mono 10.5px/600, `letter-spacing: .08em`,
  uppercase, color y borde iguales, radio 99px, padding `3px 10px`.
- **R7.5** Estados del badge (`.html:1947-1948`), en este orden de precedencia:

  | Texto | Cuándo | Color |
  |---|---|---|
  | `Hecho` | `hecho` | `#34d399` |
  | `Vencido` | fecha < hoy | `#fb7185` |
  | `Vence hoy` | fecha == hoy | `--acc` |
  | `Pendiente` | resto | `--tx2` |

  Se calcula con `estadoAviso` (`lib/cursada.ts:268`), que ya distingue vencido/hoy, más el
  caso `hecho`. La fecha se compara en `America/Argentina/Buenos_Aires`, nunca con la del
  dispositivo.
- **R7.6** Nota vinculada, si existe: kicker `Nota vinculada`; caja fondo `--bg`, borde
  `--bor`, **`border-left: 3px solid {color de la materia}`**, radio 12px, padding
  `14px 16px`; texto **sin truncar**, 14.5px, `line-height: 1.6`, `--tx`,
  `white-space: pre-wrap`. Pie (`margin-top: 10px`, `gap: 8px`): tipo mono 10px `.1em`
  uppercase `--tx4`, dot 6×6, estado mono 10.5px, y a la derecha el botón
  **`Abrir la nota →`** (13px/700, `--acc`).
- **R7.7** Acciones (`margin-top: 22px`, `gap: 10px`): primario `flex: 1`, fondo `#fbbf24`,
  texto `#221a00`, radio 12px, 14.5px/700, alto 48px, con label
  **`Marcar como hecho`** / **`Marcar como pendiente`**; y **`Cerrar`** transparente, borde
  `1px solid --bor2`, `--tx2`, radio 12px, 14px/700, alto 48px, padding `0 18px`.
- **R7.8** Si el aviso es manual, el modal incluye además el borrar (R5.3), con la misma
  confirmación de doble toque del spec 2 (R13.2).

## 4. Fuera de alcance

- Toasts → spec 4 (este spec dispara `Aviso creado desde la nota`, pero el componente lo
  define el otro).
- Notas dentro de páginas: la búsqueda recursiva y el `paginaId` del deep-link → spec 5.
- Cambiar de dónde salen los avisos de Moodle o cómo se sincronizan.
- Borrar la nota en cascada cuando se borra el aviso, o al revés.

## 5. Desviaciones que aparecieron implementando

_(se completa al implementar)_

## 6. Verificación

1. `npx tsc --noEmit`, `npx next lint`, `npx vitest run`.
2. Tests sin navegador:
   - round-trip de `avisos-manuales.json` con `notaId`: escribir, releer y verificar que
     el campo sobrevive (es el modo de falla que borra datos sin aviso);
   - título de 80 caracteres → 59 + `…`; texto vacío → `Nota sin título`;
   - dos llamadas seguidas a `crearAvisoDesdeNota` con el mismo bloque dejan **un** aviso;
   - un aviso con `notaId` que apunta a un bloque borrado se resuelve sin snippet y sin
     tirar;
   - el badge da `Vence hoy` para la fecha de hoy en Buenos Aires (no en UTC).
3. En navegador, con sesión temporal:
   - el snippet en `/avisos` y en la tab Avisos de la materia, con el riel del color de la
     materia, en tema oscuro y claro;
   - el chevron abre el modal desde las tres superficies;
   - "Abrir la nota →" cae en la materia con el modal de la nota abierto, y la URL
     resultante repite el resultado;
   - recorrido de teclado completo: fila → chevron → snippet, sin `<div>` dentro de
     `<button>` en el HTML servido.
4. **Copia previa de `datos/avisos-manuales.json` y `datos/bloques.json`.** Las dos se
   escriben en esta prueba y son irrecuperables.
