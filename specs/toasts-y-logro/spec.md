# Spec — Toast de acción y logro reubicado

Estado: **implementado** (17/08) · No depende de ningún spec; los specs 2 y 3 lo consumen.
Fuente: `design_handoff_mi_cursada/Mi Cursada.dc.html:1058-1090` (markup),
`:1288-1308` (lógica), `:34-35` (keyframes).

Implementación prevista: `lib/toast.ts` (nuevo), `components/toast.tsx` (nuevo),
`components/logro.tsx`, `lib/logro.ts`, `app/globals.css`, `app/(app)/layout.tsx`.

## 1. Por qué

La app hoy **no tiene ningún feedback efímero de acción**. Cuando algo sale mal se muestra
un error inline (`avisos-lista.tsx:160`, `materia-detalle.tsx:1103`); cuando sale bien, no
pasa nada visible más allá del cambio en pantalla. Con el diseño del 17/08 eso se vuelve un
problema concreto: mover una card de columna, convertir un tipo, vincular una referencia o
crear un aviso desde una nota son acciones cuyo efecto **ocurre en otro lado** (otra
columna, otra pantalla, otro archivo), y sin confirmación no se sabe si pasó.

El prototipo resuelve con un toast de dos variantes y **once mensajes** concretos.

Aparte, el logro ya implementado quedó desalineado en tres puntos verificables contra el
`.html`:

| | Prototipo | App hoy |
|---|---|---|
| Posición | `right: 18px; bottom: 96px` (abajo a la derecha) | `inset-x-0 top-[18px] … justify-center` (arriba, centrado) — `components/logro.tsx:44` |
| Animación | `logroIn`: `translateY(26px)` → `-4px` → 0 (**sube**) | `logro-in`: `translateY(-26px)` → `+4px` → 0 (**baja**) — `app/globals.css:252-265` |
| Frecuencia | una sola vez en la vida (`.html:1297-1299`) | en **cada** nota, con fallback `Nota anotada · +10 XP` — `lib/logro.ts:16` |

El pill en sí (gradiente, trofeo de 46px, brillo de 56px, 3800ms) ya es fiel: no se toca.

## 2. Adaptaciones respecto del handoff

| Prototipo | Esta app | Motivo |
|---|---|---|
| Flag en `localStorage['miCursada.logro.primera']` (`.html:1297`) | Overlay `datos/logros.json` (`{ "primera": true }`) | En la app los datos viven en el server; con `localStorage` el logro se repetiría en cada navegador y se perdería al limpiar el sitio. Hay que sumarlo a la lista de `getDatosLocales()` o el caché por `mtime` se queda viejo. |
| El logro aparece **una sola vez** y las ramas `n===5`, `n===10`, `n%25===0` son código muerto (`.html:1302-1304`) | Aparece en los **hitos**: 1, 5, 10 y cada 25 notas | Bug 3 del prototipo: la tabla de hitos existe, escrita, y el gate de "visto" la vuelve inalcanzable — quedó de una versión anterior. La app ya tiene esa tabla en `lib/logro.ts:11-17` y funciona. Lo que sí se corrige es el ruido: se elimina el fallback `Nota anotada · +10 XP`, que hacía saltar el toast en cada nota. **Si se prefiere paridad literal, es una línea: cortar en el primer hito.** |
| Toast y logro pueden solaparse: los dos van a `bottom: 96px`, uno centrado y otro a la derecha | Si hay logro, el toast se apila arriba de él | En 390px de ancho el pill del logro ocupa casi todo: superpuestos son ilegibles. El prototipo no lo cubre porque el logro casi nunca se dispara. |
| `lanzarLogro()` también en cards vacías (`.html:1641`) | El logro cuenta la nota cuando **tiene texto** | Bug 8: crear una card vacía no es "cargar una nota". |
| Toast sin rol ARIA | `role="status"` + `aria-live="polite"` | Es información efímera: si no se anuncia, para un lector de pantalla la acción no dejó rastro. |

## 3. Requisitos

### R1 — Componente del toast

- **R1.1** Contenedor `position: fixed`, `bottom: 96px`, `left: 0`, `right: 0`, `z-index: 60`,
  centrado, `pointer-events: none` (`.html:1059`).
- **R1.2** Pill: fondo `--sup`, borde `1px solid` según variante, radio 99px, padding
  `10px 18px 10px 12px`, `gap: 10px`, animación `logroIn .4s cubic-bezier(.3,1.4,.4,1) both`.
- **R1.3** Variante **ok**: borde `rgba(52,211,153,.5)`; ícono en círculo **28×28** fondo
  `rgba(52,211,153,.15)` con check de 14×14 `stroke-width: 2.5` color `#34d399`.
- **R1.4** Variante **delete**: borde `rgba(251,113,133,.5)`; círculo 28×28 fondo
  `rgba(251,113,133,.15)` con tachito de 14×14 `stroke-width: 2` color `#fb7185`.
- **R1.5** Mensaje: 13.5px / 700, `--tx`.
- **R1.6** Se descarta solo a los **2600 ms**. Un toast nuevo reemplaza al anterior y
  reinicia el timer (`.html:1288-1292`).
- **R1.7** `role="status"`, `aria-live="polite"`. Nunca `alert`: no interrumpe.
- **R1.8** Con `prefers-reduced-motion: reduce`, aparece sin animación de entrada y se
  mantiene el descarte por tiempo.

### R2 — Cómo se dispara

- **R2.1** `lib/toast.ts` expone el nombre del evento, el tipo `{ mensaje, variante }` y la
  duración, igual que `lib/logro.ts` hoy. El componente vive en el layout de `(app)` y
  escucha; quien muta, despacha.
- **R2.2** Se despacha **después** de que la Server Action responde `{ ok: true }`. Si la
  action falla, no hay toast de éxito: el error se sigue mostrando inline como hoy.
- **R2.3** El toast no reemplaza a los mensajes de error existentes.

### R3 — Los once mensajes

Copy exacto, con su variante (`.html:1565,1628,1652,1921,1932-1934,1962,1974,1984,2006`):

| Mensaje | Variante | Cuándo |
|---|---|---|
| `¡Completada! Movida a Listo` | ok | mover una card a `listo` |
| `Movida a Por hacer` / `Movida a En proceso` / `Movida a Listo` | ok | mover a las otras columnas (el de `listo` lo pisa el de arriba) |
| `Convertida en Texto` / `Título` / `Tarea` / `Link` | ok | convertir el tipo desde el modal |
| `Referencia vinculada` | ok | elegir una referencia |
| `Referencia quitada` | ok | sacar la referencia |
| `¡Tarea completada!` | ok | marcar una tarea como hecha (no al desmarcar) |
| `Aviso creado desde la nota` | ok | crear el aviso desde el modal de card |
| `Bloque eliminado` | delete | borrar un bloque en el documento |
| `Card eliminada del tablero` | delete | borrar con el tachito de la card |
| `Card eliminada` | delete | borrar desde el modal de card |
| `Materia eliminada` | delete | borrar una materia |

- **R3.1** `Página de nota` se suma a la lista de "Convertida en" cuando exista el spec 5.
- **R3.2** La variante la decide quién dispara, no una heurística: en el prototipo se
  deduce del segundo argumento y cualquier omisión sale roja (`.html:1750`).

### R4 — Logro: posición y animación

- **R4.1** Contenedor `position: fixed`, `right: 18px`, `bottom: 96px`, `z-index: 60`,
  alineado a la derecha, `pointer-events: none` (`.html:1077`). Hoy está arriba y centrado.
- **R4.2** `@keyframes logro-in` se invierte para que **suba**: `0%` →
  `translateY(26px) scale(.88)`, `opacity: 0`; `55%` → `translateY(-4px) scale(1.03)`,
  `opacity: 1`; `100%` → sin transformar. Duración 0.55s
  `cubic-bezier(.3,1.4,.4,1) both` (ya es la que usa el repo).
- **R4.3** `logro-brillo` no cambia (`translateX(-120%) skewX(-18deg)` →
  `translateX(320%)`, 1.4s ease con 0.35s de retraso).
- **R4.4** El pill queda igual: gradiente `120deg, #f97316, #ea580c`, radio 99px, padding
  `9px 26px 9px 10px`, gap 13px; trofeo en círculo 46×46 `rgba(59,21,3,.35)` con ícono
  22×22 `#ffedd5`; brillo de 56px `rgba(255,255,255,.22)` con `blur(2px)`; título
  `¡Logro desbloqueado!` 15.5px/800 `#fff7ed`; subtítulo mono 11.5px
  `rgba(255,247,237,.85)`; 3800 ms.
- **R4.5** En ≤640px el pill respeta el margen derecho y no desborda; si compite con el
  toast, el toast se apila arriba (§2).
- **R4.6** El bloque de `prefers-reduced-motion` de `app/globals.css:364-378` ya cubre
  `.logro-in` y `.logro-brillo`: se mantiene.

### R5 — Logro: cuándo aparece

- **R5.1** Se dispara en los hitos de `subtituloLogro` (`lib/logro.ts:11-17`): 1, 5, 10 y
  cada 25 notas. **Se elimina el fallback** `Nota anotada · +10 XP`: fuera de un hito no
  hay toast de logro (ver §2).
- **R5.2** El hito se cuenta sobre **todas** las notas de la cursada, como ya hace el
  layout (`app/(app)/layout.tsx:21-24`), excluyendo `divisor`.
- **R5.3** Cada hito se muestra **una sola vez**: se persiste en `datos/logros.json`
  (`{ "primera": true, "cinco": true, … }`). Sin eso, borrar y volver a crear notas repite
  el mismo logro.
- **R5.4** Solo cuenta una nota **con texto** (§2).
- **R5.5** El overlay nuevo se suma a la lista de archivos de `getDatosLocales()`, o el
  caché por `mtime` no se entera de que cambió.
- **Aceptación**: la primera nota muestra `Primera nota de tu cursada · +50 XP`; la segunda
  no muestra nada; la quinta muestra el de 5; borrar y recrear la primera no lo repite.

## 4. Fuera de alcance

- El diseño visual del pill del logro (ya es fiel).
- El sistema de XP como dato persistido: los `+50 XP` son copy, no hay contador real.
- Toasts para acciones que este paquete no menciona (sincronizar, editar materia, subir
  avatar).

## 5. Desviaciones que aparecieron implementando

_(se completa al implementar)_

## 6. Verificación

1. `npx tsc --noEmit`, `npx next lint`, `npx vitest run`.
2. Tests sin navegador:
   - `subtituloLogro` sin el fallback: devuelve `null` (o equivalente) fuera de los hitos;
   - el conteo excluye `divisor` y los bloques con texto vacío;
   - round-trip de `datos/logros.json`;
   - un segundo toast antes de los 2600 ms reemplaza al primero y reinicia el timer.
3. En navegador, con sesión temporal:
   - toast **ok** al mover una card a Listo y toast **delete** al borrarla, en tema oscuro y
     claro, comparados con el prototipo;
   - el logro entra **desde abajo** y queda abajo a la derecha (es el punto que hoy está
     invertido: mirar la animación, no solo la posición final);
   - a 390px, logro y toast a la vez sin superponerse;
   - con `prefers-reduced-motion`, los dos aparecen quietos y completos.
4. Copia de `datos/bloques.json` antes de probar (las pruebas crean y borran notas).
