# Spec — Páginas de nota (bloque `pagina` con `hijos[]`)

Estado: **sin implementar** · Depende de los specs 1 y 2. Es el más invasivo de los cinco.
Fuente: `design_handoff_mi_cursada/Mi Cursada.dc.html` (`:613-634` el encabezado de
página, `:722-733` la card, `:1324-1329` el acceso al array, `:1759` el ancho).

Implementación prevista: `lib/types.ts`, `lib/datos-locales.ts`, `lib/bitacora.ts`,
`app/actions.ts`, `components/notas-editor.tsx`, `components/contenedor.tsx`.

## 1. Por qué

Es la única parte del paquete que cambia **la forma** del overlay de notas, no su
contenido: `datos/bloques.json` deja de ser una lista plana por materia y pasa a ser un
árbol de un nivel. Una "página" es un bloque que contiene otros bloques (`hijos[]`), con su
propio documento, su propio tablero y su propio contador de to-dos.

Se separó del resto por eso. Los specs 1 a 4 son aditivos: agregan campos opcionales y
componentes. Este toca la escritura, el reordenamiento, el agrupado por día
(`lib/bitacora.ts`) y todos los contadores, y **puede postergarse sin bloquear a nadie**.

Hoy no existe nada: `pagina` no está en `TIPOS_BLOQUE` (`lib/types.ts:24`), ni en
`bloqueLocalSchema` (`lib/datos-locales.ts:229`), ni en `NOMBRE_TIPO`
(`notas-editor.tsx:105`) — que además es un `Record` exhaustivo y **rompe la compilación**
si se agrega el tipo sin la clave.

## 2. Adaptaciones respecto del handoff

El prototipo tiene tres bugs serios acá, y dos son de pérdida de datos. Ninguno se copia.

| Prototipo | Esta app | Motivo |
|---|---|---|
| Arrastrar dentro de una página reordena **la raíz**: `const arr = d.materias.find(...).doc` en vez de `arrDe(d, det.id, S.paginaId)` (`.html:1569-1573`) | El reordenamiento opera siempre sobre el array de la página activa | Bug 1: corrompe el orden del documento raíz. Es el único lugar del prototipo que no usa `arrDe`; el resto (borrar `:1565`, Enter de to-do `:1558`, agregar `:1577`) lo usa bien. |
| Páginas anidadas fallan **en silencio**: `arrDe` solo busca en el primer nivel y si no encuentra devuelve la raíz (`.html:1324-1328`) | **Un solo nivel**, explícito: dentro de una página no se ofrece `/pagina` | Bug 2: hoy, crear una página dentro de una página te deja editando la raíz creyendo que estás adentro. Mejor no ofrecer la operación que ofrecerla rota. |
| `/pagina Clase 6` descarta el título tipeado: `… ? '' : ''`, las dos ramas iguales (`.html:1604`) | Lo que se escribe después de `/pagina` es el título | Bug 3: ternario muerto, se ve la intención perdida. |
| El contador de notas suma la página **y** sus hijos (`.html:1500,1510`) | La página cuenta como **1**; sus hijos no suman al total de la materia | El "N notas" del tab no coincide con lo que se ve listado. Se cuenta lo que se ve. |
| Botón "+ To-do" de `min-height: 32px` (`.html:626`) | Área táctil 44px, mismo tamaño visual | Bug 10: es el único botón del handoff por debajo del mínimo táctil. |
| `paginaId` en estado de componente | En la URL (`?nota=<id>`) | Necesario para el deep-link del spec 3 (R6), que tiene que poder abrir una nota que vive dentro de una página. |

## 3. Requisitos

### R1 — Modelo

- **R1.1** `TIPOS_BLOQUE` suma `'pagina'` (`lib/types.ts:24`). Hay que agregar la clave en
  `NOMBRE_TIPO` (`página`, minúscula, `.html:1457`) o no compila.
- **R1.2** `Bloque` suma `hijos?: Bloque[]`, presente **solo** cuando `tipo === 'pagina'`.
- **R1.3** `bloqueLocalSchema` pasa a ser recursivo (`z.lazy()`), con `hijos` opcional. Como
  siempre: **el schema va antes que cualquier escritura**, o la próxima lectura descarta el
  campo y el overlay se pierde.
- **R1.4** Profundidad **máxima 1**: los hijos no pueden tener hijos. El schema lo impone y
  el menú `/` dentro de una página no ofrece `/pagina` (§2).
- **R1.5** Las escrituras que hoy hacen `find`/`filter` planos sobre `mapa[materiaId]`
  (`actualizarBloqueLocal`, `eliminarBloqueLocal`, `reordenarBloquesLocales`,
  `lib/datos-locales.ts:646-691`) tienen que bajar un nivel: un bloque hijo no aparece en la
  lista plana y hoy no se encontraría.
- **R1.6** Borrar una página borra sus hijos. Es la única operación en cascada del paquete y
  necesita confirmación de doble toque, como el borrado de card (spec 2, R13.2).
- **R1.7** Los hijos **no** aparecen en la lista plana de la materia
  (`lib/datos-locales.ts:388-408`) ni en el contador del tab (§2).

### R2 — Comando `/pagina`

- **R2.1** Ítem del menú (`.html:1604`): cmd **`/pagina`**, nombre **`Página de nota`**,
  glifo **`▤`**, keywords `pagina nota nueva subpagina`.
- **R2.2** Crea el bloque con `hijos: []` y **entra a la página** recién creada.
- **R2.3** El texto que sigue al comando es el título: `/pagina Clase 6` crea la página
  "Clase 6" (§2).
- **R2.4** Dentro de una página, `/pagina` no se ofrece (R1.4).

### R3 — Card de página en el documento

- **R3.1** Botón: alto mínimo 52px, radio 12px, padding `11px 13px`, `margin: 2px 0`.
- **R3.2** Ícono de documento 16×16 `--acc`; título 14.5px/700 truncado (vacío →
  `Nota sin título`); subtítulo mono 10.5px `--tx3` con **`N bloque`** / **`N bloques`**;
  chevron 15px.
- **R3.3** Si tiene to-dos, badge `TO-DO hechas/total` (R5) en la propia fila.
- **R3.4** El botón `⋯` (spec 1, R6) **no** aparece en las páginas: no tienen modal de card
  (`esEditable` excluye `pagina` y `divisor`, `.html:1542`).
- **R3.5** En el tablero, la card de una página **navega a la página** en vez de abrir el
  modal (`.html:1620`).

### R4 — Vista de página

- **R4.1** Breadcrumb: botón alto 40px (área táctil 44), gap 6px, chevron-left 15px
  `stroke-width: 2.2`, texto **`Todas las notas`** 12.5px/700 `--tx3`. En el prototipo el
  glifo `‹` es parte del ícono, no del texto.
- **R4.2** Título editable: `<input>` de **27px / 800**, `letter-spacing: -.02em`, padding
  `4px 0 0`, `margin-top: 4px`, placeholder **`Título de la nota`**.
- **R4.3** Fecha: mono 10.5px, `letter-spacing: .1em`, uppercase, `--tx4`, formato
  `dd/mm/yyyy` en `America/Argentina/Buenos_Aires` — con `date-fns-tz`, nunca
  `toLocaleDateString` sobre la zona del dispositivo (el prototipo usa la del navegador,
  `.html:1907`).
- **R4.4** Regla inferior de 1px `--bor`, `margin-top: 14px`.
- **R4.5** La página tiene su propio composer, su propio documento y su propio tablero,
  operando sobre `hijos`.
- **R4.6** En desktop el contenedor se ensancha de **1150px a 1320px** mientras se está
  dentro de una página (`.html:1759`), manteniendo el padding izquierdo de la sidebar. En
  ≤640px no cambia nada.
- **R4.7** La página activa vive en la URL (§2), así que se puede compartir y el botón
  "atrás" del navegador sale de la página.

### R5 — Badge y progreso de to-dos

- **R5.1** Texto: **`TO-DO {hechas}/{total}`** (`.html:1899`), mono **9.5px / 600**,
  `letter-spacing: .08em`, borde 1px del mismo color, radio 99px, padding `3px 9px`.
- **R5.2** Color: `--acc` si queda alguna sin hacer, **`#34d399`** si están todas
  (`.html:1900`).
- **R5.3** Aparece en dos lugares: en la card de la página dentro del documento padre, y en
  el header de la página junto a la barra de progreso.
- **R5.4** Barra: contenedor **74×4px**, radio 99px, fondo `--bor`; relleno del color del
  badge con `transition: width .4s cubic-bezier(.22,.8,.3,1)`. El ancho es el porcentaje
  entero de to-dos hechos. Es decorativa: el dato ya está en el badge, en texto.
- **R5.5** Botón **`+ To-do`**: `margin-left: auto`, pill fondo `--sup`, borde `--bor`,
  radio 99px, alto visual 32px (área táctil 44 — §2), padding `0 13px`, 12px/700 `--tx2`,
  ícono `+` de 12×12 `stroke-width: 2.6`; hover texto `--acc` y borde `--bor2`. Crea un
  to-do al final de la página.
- **R5.6** Sin to-dos en la página, no se muestran ni el badge ni la barra.

### R6 — Impacto en lo que ya existe

- **R6.1** `lib/bitacora.ts` (agrupado por día de Buenos Aires) opera sobre el array
  visible: en la raíz, los bloques de nivel 1; dentro de una página, sus hijos. La página se
  agrupa por su propio `createdAt`.
- **R6.2** El contador del tab Notas cuenta bloques de nivel 1 sin `divisor` (§2).
- **R6.3** El conteo de notas del logro (spec 4, R5.2) usa el mismo criterio, para que el
  número que dispara el hito sea el que se ve.
- **R6.4** La búsqueda de una nota por id para los avisos vinculados (spec 3, R2.1) pasa a
  ser recursiva, y el deep-link tiene que abrir primero la página y después el modal
  (`.html:1461-1463`).

## 4. Fuera de alcance

- Páginas anidadas (§2).
- Mover un bloque entre la raíz y una página (el prototipo tampoco lo tiene).
- Reordenar por drag en el documento: se resuelve acá para el array activo, pero el diseño
  del gesto (marca de drop de 2px ámbar arriba del destino, `.html:1569`) queda para cuando
  se aborde el drag del documento completo.

## 5. Desviaciones que aparecieron implementando

_(se completa al implementar)_

## 6. Verificación

1. `npx tsc --noEmit`, `npx next lint`, `npx vitest run`.
2. Tests sin navegador — es el spec donde más importan, porque toca escritura:
   - round-trip del overlay con una página y tres hijos: escribir, releer, verificar que no
     se perdió ningún hijo ni ningún campo;
   - `actualizarBloqueLocal` encuentra y modifica **un hijo** (hoy el `find` plano no lo
     ve);
   - `reordenarBloquesLocales` dentro de una página **no toca** el orden de la raíz (es el
     bug 1 del prototipo: hay que tener un test que lo pruebe);
   - borrar la página borra sus hijos y nada más;
   - el schema rechaza un hijo con `hijos` (profundidad 1);
   - `TO-DO 2/3` con el color ámbar, `TO-DO 3/3` con `#34d399`;
   - la fecha de la página sale en zona de Buenos Aires cerca de medianoche.
3. En navegador, con sesión temporal: entrar y salir de una página, el ancho 1320px en
   desktop, el badge y la barra, y el botón atrás del navegador saliendo de la página.
4. **Copia de `datos/bloques.json` antes de todo.** Este spec reescribe la estructura del
   archivo y es irrecuperable. Conviene además probar primero contra una copia en
   `CURSADA_DATOS_DIR`, no contra los datos reales.
