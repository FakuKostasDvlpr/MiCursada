# Spec — Secuencia de entrada, perfil de solo lectura y micro-animaciones

Estado: **implementado** · Fuente: `HANDOFF.md` v3 (§0 Login + secuencia de entrada,
§0b Perfil, §1 Hoy) y el prototipo `Mi Cursada.dc.html`.

Implementación: `components/login-entrada.tsx`, `components/perfil-vista.tsx`,
`components/saludo.tsx`, `components/cifra-rodante.tsx`, keyframes en
`app/globals.css`, `usuario` en `lib/moodle/credenciales.ts`.

## 1. Por qué

El handoff v3 convierte el login en la animación central del producto: entrás, y en vez
de un salto seco a un dashboard vacío, la pantalla te muestra que está trayendo tu
cursada del aula virtual. En esta app eso no es decorado: `iniciarSesion()` habla con
Moodle y `montarCursada()` baja el snapshot, y esas dos cosas tardan de verdad. La
secuencia le pone cara a la espera que ya existe.

Además el perfil deja de ser un formulario (los datos vienen del aula virtual, no se
escriben a mano) y Hoy suma dos micro-animaciones: el saludo y los contadores.

## 2. Adaptaciones respecto del handoff

El prototipo es una demo con `setTimeout`; acá hay backend real. Se mantienen **las
mismas fases visuales** (lo que el propio handoff pide para producción) cambiando qué
las dispara:

| Handoff (demo) | Esta app |
|---|---|
| Fases por timers fijos (1300/2000/2650/4300/5500 ms) | Fases por eventos reales: `cargando` dura lo que tarda `iniciarSesion()`, `datos` lo que tarda `montarCursada()` |
| Credenciales `demo`/`demo` + validación local de email | Usuario y contraseña reales del aula virtual; el error lo decide Moodle |
| Campo "Correo" | Campo "Usuario" (Moodle no autentica por correo) |
| Pastilla "demo / demo" que rellena credenciales | No existe: no hay demo |
| Error simulado a los 1100 ms | Error real (`Usuario o contraseña incorrectos.`, red, otra cuenta) |
| Fila "Correo" en el perfil | Fila "Usuario" (`username` del site info) |
| "Materias: N activas" hardcodeado | N real que devuelve `montarCursada()` |

## 3. Requisitos

### R1 — Login en dos cards
- **R1.1** Desktop (>640px): contenedor flex centrado, `max-width: 840px`, gap 14px, con
  card A (identidad, `flex-grow: 1.05`) a la izquierda y card B (formulario,
  `flex-grow: 1`) a la derecha. Ambas `flex-basis: 0`, `--sup`, borde `--bor`, radio 20px.
- **R1.2** Móvil (≤640px): una sola columna, `max-width: 440px`; la card B incluye arriba
  el tile del logo a 34px.
- **R1.3** Card A: logo institucional sobre tile blanco (radio 14px, padding 16px 20px,
  alto de imagen 44px); abajo kicker "INSTITUTO ORT ARGENTINA", título "Tu cursada,
  ordenada." (19px/800), sublínea "Entrá y traemos tu carrera, horarios y materias."
  (13.5px `--tx2`) y estado "Sincroniza con el aula virtual" (dot `#34d399` 6px + mono 11px).
- **R1.4** Card B: kicker "MI CURSADA", H1 "Entrá a tu cursada" (24px/800), campos Usuario
  y Contraseña con label mono uppercase, input 48px sobre `--bg`, borde `--bor`, radio 12px,
  y botón primario de 48px.
- **R1.5** No hay link "¿Te olvidaste la contraseña?" (removido en el handoff v3).
- **Aceptación**: `/login` renderiza las dos cards en desktop y una sola columna en móvil;
  el HTML no contiene "¿Te olvidaste la contraseña?" ni ninguna pastilla demo.

### R2 — Secuencia de entrada
- **R2.1** Fases: `form` → `cargando` → `check` → `saliendo` → `datos` → `abriendo`.
- **R2.2** `cargando`: el botón cambia su label por un spinner de 20px. Dura lo que tarda
  `iniciarSesion()`.
- **R2.3** `check`: el botón pasa a verde `#34d399` con un check que entra con `popCheck`.
  Duración fija de 700 ms (es feedback, no espera real).
- **R2.4** `saliendo`: la card B colapsa animando **solo `flex-grow`** (nunca `flex-basis`)
  con `.6s cubic-bezier(.22,.8,.3,1)`; la card A se topa en `max-width: 620px` y queda
  centrada, sin cambiar de tamaño. El texto de identidad sale con `opacity 0`,
  `translateY(-10px)` y `blur(4px)`.
- **R2.5** `datos`: cross-fade al bloque de sincronización — kicker pulsante "TRAYENDO TUS
  DATOS DEL AULA VIRTUAL" (dot `--acc` con `pulseDot`), el **nombre real** del usuario
  (26px/800), la línea de turno en mono 13px, y tres filas en stagger (`rowIn`, delays
  .2/.4/.6s): Carrera, Materias y Estado. Dura lo que tarda `montarCursada()`.
- **R2.6** Materias muestra el número real que devuelve `montarCursada()`; hasta que
  vuelve dice "buscando…". Estado pasa a "Sincronizado" en verde cuando terminó.
- **R2.7** `abriendo`: sale el bloque de datos con blur y entra el loader centrado
  (spinner 26px `--acc`) + "ABRIENDO TU CURSADA", hasta que la navegación a Hoy ocurre.
- **R2.8** El panel se mantiene **montado** en todas las fases: el relevo entre capas es
  por opacidad + `translateY` + `blur`, nunca montando y desmontando.
- **R2.9** El cuerpo de la card A anima su `min-height` (118px identidad → 274px datos →
  128px loader) con `.6s cubic-bezier(.22,.8,.3,1)`.
- **Aceptación**: con credenciales válidas contra un Moodle de prueba, el flujo llega a
  Hoy; ninguna fase requiere un click extra; si `montarCursada()` falla, igual entra.

### R3 — Estado de error
- **R3.1** Si `iniciarSesion()` devuelve error, la fase pasa a `error`.
- **R3.2** Los inputs toman borde `#fb7185` y una X roja (círculo 20px, glifo `#20060b`,
  `popCheck`) cuando el error es de credenciales; en errores de red no se marcan campos.
- **R3.3** Banner con fondo `rgba(251,113,133,.1)`, borde `rgba(251,113,133,.35)`, radio
  12px, `rowIn`, ícono de alerta y **el mensaje real del servidor**.
- **R3.4** El botón pasa a `#fb7185` con label "Reintentar"; al tocarlo limpia la
  contraseña y vuelve a `form`.
- **Aceptación**: con contraseña incorrecta se ve el banner con el mensaje de Moodle y el
  botón dice "Reintentar"; no se abre sesión.

### R4 — Perfil de solo lectura
- **R4.1** H1 = nombre del usuario; kicker "TU PERFIL".
- **R4.2** Avatar 104px con la foto (anillo verde + badge check) o las iniciales; el botón
  de cámara sigue siendo lo único editable.
- **R4.3** Cuatro filas de solo lectura (`--sup`, borde `--bor`, radio 12px, min-height
  50px, label mono uppercase de 76px): Nombre, Usuario (mono), Carrera, Instituto.
- **R4.4** Nota mono "datos sincronizados del aula virtual — no se editan acá".
- **R4.5** Acciones: primario "Listo" (vuelve a Hoy) y "Cerrar sesión" (ghost rojo, con el
  modal de confirmación que ya existe).
- **R4.6** El `username` sale del site info y se guarda en `datos/moodle.json`, no en el
  perfil editable.
- **Aceptación**: `/perfil` no tiene ningún `<input type="text">` de datos; el nombre y el
  instituto se ven como filas; sigue existiendo "Cerrar sesión".

### R5 — Saludo animado en Hoy
- **R5.1** Sobre la fecha larga, kicker "Bienvenido, {nombre}" en `--acc`.
- **R5.2** Cada carácter entra con `charRoll .5s cubic-bezier(.22,.8,.3,1)`, delay
  `0.1 + i*0.035s`, dentro de un contenedor con `overflow: hidden`.
- **Aceptación**: el saludo aparece con el nombre real; sin nombre, no se renderiza.

### R6 — Number-flow en los contadores del bento
- **R6.1** Cada dígito es un contenedor `height: 1em; overflow: hidden` con la tira 0–9
  desplazada por `translateY(-d*100%)`, `transition: transform .9s cubic-bezier(.22,.8,.3,1)`.
- **R6.2** Delay escalonado por posición (base .12s para Clases, .22s para Pendientes,
  + i*.08s) y arranque desde 0 en el primer frame.
- **R6.3** Sin dependencias nuevas (no se agrega `@number-flow/react`).
- **Aceptación**: los dos tiles muestran el número correcto ya renderizado en el HTML del
  servidor (accesible), y la animación es puramente visual.

### R7 — Keyframes y motion
- **R7.1** En `app/globals.css`: `spin`, `popCheck`, `cardIn`, `rowIn`, `welcomeIn`,
  `pulseDot`, `charRoll`, más los `fadeIn`/`sheetUp` que ya existen.
- **R7.2** Con `prefers-reduced-motion: reduce`, las animaciones nuevas se desactivan y
  todo queda en su estado final (nada de contenido invisible).
- **Aceptación**: con reduced motion, el saludo, las filas y los contadores se ven
  completos.

## 4. Fuera de alcance

- Tocar el editor de notas, el kanban, Semana, Materias o Avisos.
- Cambiar el modelo de datos del perfil (`datos/perfil.json` sigue igual).
- Etiquetado de comunidades de graphify, Supabase, y el flujo viejo de `cursada-sync`.

## 5. Desviaciones que aparecieron implementando

- **`/login` ya no rebota a `/` cuando hay sesión.** Toda Server Action llamada desde esa
  ruta hace que Next devuelva el árbol re-renderizado de la página; como la sesión se abre
  en la primera llamada (`iniciarSesion`), ese render disparaba `redirect('/')` y se comía
  la secuencia entera. Se verificó con el build real: antes el payload de la action traía
  un `NEXT_REDIRECT`, ahora trae cero. La navegación a Hoy la hace el componente al final.
- **`iniciarSesion` dejó de llamar a `revalidatePath`**: era redundante (revalida
  `montarCursada`, y el cliente hace `router.refresh()`) y sumaba un re-render de `/login`
  en medio de la animación.
- **El `username` se guarda en `datos/moodle.json`**, no en `datos/perfil.json`: es dato de
  la cuenta del aula virtual y así el modelo del perfil queda intacto (§4 lo pedía).
- **`guardarPerfil` queda sin uso en la UI** (el perfil ya no se edita). Se deja la action
  y sus tests: es el camino de escritura del perfil y no molesta a nadie.

## 6. Verificación

1. `npm test` (330), `tsc --noEmit`, `next lint`, build con turbopack. ✔
2. E2E contra un Moodle de mentira, con la app compilada: ✔
   - `/login` sirve las dos cards, sin "olvidaste la contraseña" ni nada de demo;
   - contraseña mala → `{"ok":false,"error":"Usuario o contraseña incorrectos."}` (el
     mensaje real que muestra el banner);
   - login OK → cookie de sesión y **cero `NEXT_REDIRECT`** en el payload;
   - `montarCursada` desde `/login` → `sincronizado:true, materias:1, avisos:1`;
   - Hoy → "Bienvenido, Facundo Costas" con `char-roll`, contadores con `cifra-tira` y el
     número en `sr-only`;
   - `/perfil` → filas Nombre/Usuario/Carrera/Instituto (con el `username` real), la nota
     mono, "Listo", "Cerrar sesión" y **ningún `<input type="text">`**.
3. **Pendiente**: correr la secuencia en un navegador de verdad. Las fases y sus tiempos
   son lógica de cliente y acá se verificaron por partes (markup servido + acciones del
   servidor), no viendo la animación: la extensión de Chrome no está conectada.
