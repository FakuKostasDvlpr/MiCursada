---
name: portar-diseno
description: "Usar cuando haya que llevar la app al handoff de diseño de Mi Cursada — portar un paquete de diseño nuevo, corregir fidelidad de una pantalla, o cuando el usuario diga que algo 'no se ve como el handoff'. Lee el .html como fuente de verdad (nunca solo el README), compara con capturas del prototipo y de la app, escribe el spec antes de tocar código (SDD) y verifica en un navegador de verdad."
---

# /portar-diseno

Llevar la app al handoff de diseño **con evidencia**, no de memoria.

El paquete de diseño está en `design_handoff_mi_cursada*/` y trae tres cosas:
`Mi Cursada.dc.html` (el prototipo, **la fuente de verdad**), `README.md` (un
resumen) y `support.js` (el runtime del formato Design Component).

---

## Regla número uno

**Leé el `.html`. El README no alcanza y a veces miente.**

Casos reales de este proyecto:

| README | `.html` |
|---|---|
| "el toggle de tema vive en el header **en móvil**" | está en el header **siempre** |
| "botón de tema en la sidebar" | la sidebar tiene **solo el perfil** abajo |
| "tres filas en stagger" | son **chips** sobre `--bg`, borde, radio 12, label de 74px |
| "/link (link con preview)" | el ítem se llama **"Link con preview"** |
| nada | el `draggable` va **en el handle**, no en la card |
| nada | soltar en *Listo* también marca `hecho` |
| "label de 76px" | 74px |

El README sirve para saber **qué pantallas hay**. Las medidas, los textos
exactos, los estados y el comportamiento salen del `.html`.

**El prototipo también tiene bugs.** Si algo del `.html` es claramente un error
(un contador que nunca se ve, un valor fuera de rango), arreglalo y decilo — no
lo copies fielmente. Ya pasó con el number-flow de los contadores.

---

## Checklist

Creá una tarea por cada punto y hacelos en orden.

### 1. Orientarse

```bash
graphify query "<qué toca esta pantalla>"     # antes de grepear (lo piden los hooks)
ls design_handoff_mi_cursada*/                 # ¿hay un paquete nuevo?
diff <(grep -E "^#{2,3} " viejo/README.md) <(grep -E "^#{2,3} " nuevo/README.md)
```

Si hay un paquete anterior, el diff de secciones te dice qué es nuevo en un
vistazo. Después **igual** hay que leer el `.html` de las pantallas tocadas.

Leé `docs/HANDOFF-UI.md` (qué se hizo antes, qué quedó abierto) y `CLAUDE.md`.

### 2. Capturar el prototipo

Playwright está en la caché de npx; resolvelo así:

```bash
NODE_PATH="$(ls -d /c/Users/*/AppData/Local/npm-cache/_npx/*/node_modules | \
  xargs -I{} sh -c 'test -d {}/playwright && echo {}')" node script.cjs
```

Abrí `file:///…/Mi%20Cursada.dc.html`, limpiá `localStorage`, recargá, entrá
con la pastilla `demo / demo` y sacá una captura por pantalla (login, cada fase
de la entrada, Hoy, Semana, Materias, Avisos, Grafo, detalle, modales) en
**oscuro y claro**. `deviceScaleFactor: 2`, viewport 1440×900 y 390×844.

### 3. Capturar la app

Necesitás sesión. **No inventes un bypass** — no existe ninguno. Agregá una
sesión temporal al archivo (y borrala al final, §7):

```js
const c = require('node:crypto'), fs = require('node:fs');
const tok = c.randomBytes(32).toString('base64url');
const id = c.createHash('sha256').update(tok).digest('hex');
const j = JSON.parse(fs.readFileSync('datos/sesiones.json', 'utf8'));
j.sesiones.push({ id, creada: new Date().toISOString(),
  expira: new Date(Date.now() + 864e5).toISOString(), nombre: 'Verificacion UI' });
fs.writeFileSync('datos/sesiones.json', JSON.stringify(j, null, 2) + '\n');
console.log(tok);   // → cookie cursada_sesion
```

Usá el dev server que ya esté corriendo en el 3000. **No corras `next build` ni
borres `.next`**: dejás al dev server sirviendo server actions que ya no existen.

### 4. Comparar con números, no con impresiones

Poné las dos capturas al lado y anotá diferencias **concretas**: medidas,
colores, pesos, textos. "Se ve distinto" no sirve; "el label es 74px y acá es
`justify-between`" sí.

Cuando algo no cierre, **medilo en el navegador** en vez de deducirlo:

```js
await p.evaluate(() => {
  const el = document.querySelector('…');
  const cs = getComputedStyle(el);
  return { box: el.getBoundingClientRect().toJSON(), font: cs.fontFamily, h: cs.height };
});
```

Así apareció el bug de las fuentes (el computed decía Segoe UI) y el del
number-flow (la tira estaba desplazada 960px en vez de 96px).

### 5. Escribir el spec (SDD) — antes de tocar código

En `specs/<slug>/spec.md`, con el formato de `specs/entrada-animada/spec.md`:

1. **Por qué** — qué está mal hoy, con la evidencia del paso 4.
2. **Adaptaciones respecto del handoff** — el prototipo es una demo con
   `localStorage`; la app tiene Moodle, sesión real y datos irreemplazables.
   Toda diferencia deliberada va acá, escrita, con el motivo.
3. **Requisitos** numerados (R1, R2…), cada uno con las medidas del `.html`.
4. **Fuera de alcance.**
5. **Desviaciones que aparecieron implementando** — se completa al final.
6. **Verificación** — qué se corre y qué se mira para darlo por hecho.

Si el trabajo es grande, separalo en features independientes y hacé un spec por
cada uno; no mezcles cuatro pantallas en un spec.

### 6. Implementar

- **La lógica pura va a `lib/` con tests** (`lib/grafo.ts`, `lib/referencias.ts`).
  Simulaciones, parsers, cálculos: todo eso se testea sin navegador.
- Los componentes van a `components/`, Server Components por defecto.
- Copy en **castellano rioplatense con voseo**, textos **exactos** del handoff.
- Nada de `Math.random()` ni `new Date()` en render: rompe la hidratación.
  Para dispersión determinística, hasheá un id.
- Respetá `prefers-reduced-motion` en toda animación nueva.
- Si el diseño depende de hover, agregá un camino táctil: en touch no hay hover
  ni drag nativo.

Trampas del repo que ya costaron una vuelta:

- **`@theme inline` NO emite la custom property.** Para usar `var(--x)` en CSS
  suelto, declarala en `:root` aparte.
- **`noUncheckedIndexedAccess`**: `const a = arr[i]; if (!a) continue;`.
- **`{/* … */}` no va en posición de expresión** (rama de ternario).
- **No corras `npx prettier --write`**: sin config te reescribe el archivo
  entero a comillas dobles. Formateá con `npx next lint`.

### 7. Verificar en un navegador de verdad

No alcanza con que compile. Sacá la captura y mirala.

Si la pantalla necesita login real (la secuencia de entrada), montá el entorno
aparte — **sin tocar el `datos/` ni el `.next` del usuario**:

```bash
# 1. copia de datos apuntada a un Moodle de mentira
cp datos/*.json <scratch>/datos-verif/
#    en <scratch>/datos-verif/moodle.json: url → http://localhost:3124

# 2. Moodle falso (responde /login/token.php por POST y los wsfunction)
PORT=3124 node moodle-falso.mjs

# 3. dev server aparte, con su propio dist dir
NEXT_DIST_DIR=.next-verif CURSADA_DATOS_DIR=<scratch>/datos-verif \
  npx next dev -p 3210
```

Si el sync contra el Moodle falso no completa, poné `generado` del snapshot en
`new Date()`: `montarCursada` lo toma como fresco y devuelve el camino feliz sin
sincronizar. Es el mismo camino que corre cuando entrás con datos ya bajados.

Después:

```bash
npx tsc --noEmit
npx next lint
npx vitest run
```

**Nunca digas que algo anda sin haberlo visto.** En este repo ya pasó dos veces.

### 8. Limpiar

Sí o sí, antes de cerrar:

- Borrar la sesión temporal de `datos/sesiones.json` (filtrando por su hash).
- Restaurar los overlays que hayas escrito (`datos/bloques.json` y compañía son
  **irrecuperables**: hacé copia **antes** de cualquier prueba que escriba).
- Matar servers y borrar `.next-verif` y las copias de datos:

```powershell
$o = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*<patrón>*' }
$h = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -in $o.ProcessId }
foreach ($p in @($h) + @($o)) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
```

`TaskStop` mata el `npx` pero **no** al `next` hijo: cerralos por PID.

- `graphify update .`
- Completar la sección "Desviaciones" del spec.
- Actualizar `docs/HANDOFF-UI.md` con lo hecho y lo que quede abierto.

---

## Qué reportar

Al terminar, decí:

- **Qué estaba mal y por qué**, con la evidencia (el computed style, la medida).
- **Qué se cambió**, por archivo.
- **Qué se verificó y cómo** — tests, tipos, lint y las capturas.
- **Qué quedó afuera y por qué.** Si algo no se pudo verificar, decilo; no lo
  presentes como hecho.
- **Las desviaciones deliberadas** respecto del prototipo, con el motivo.

## Lo que no hay que hacer

- Portar el README sin abrir el `.html`.
- Revertir desvíos que el usuario pidió (el logo de ORT, el botón de sync).
- Pisar archivos con trabajo sin commitear sin avisar. Antes de culpar a un
  cambio propio por un 500, stasheá **solo tu archivo** y volvé a probar.
- Dar por hecho algo que no se vio corriendo.
