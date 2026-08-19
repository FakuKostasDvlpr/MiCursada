# Panel Admin — monitoreo de usuarios (`/admin`)

Puerta del handoff: `design_handoff_mi_cursada copy/Mi Cursada Admin.dc.html`
(**fuente de verdad**; el README §"Panel Admin (18/08)" solo orienta).
Captura de referencia tomada del prototipo a 1440×900 y 390×844.

## 1. Por qué

El plan multiusuario (specs de 2026-08-16/18) siempre tuvo un panel de admin como
fase propia; el handoff del 18/08 le puso diseño. Hoy `/admin` no existe: no hay
forma de ver cuánta gente usa la app, si los sync andan, ni quién quedó colgado
con un token vencido. Los datos ya están (perfiles, eventos, credenciales,
bloques con `created_at`); falta la pantalla.

## 2. Adaptaciones respecto del handoff

El prototipo es una demo con 6 usuarios hardcodeados y datos que la app real
**no trackea**. Toda esta lista es deliberada:

| Prototipo | Acá | Motivo |
|---|---|---|
| Estados online/inactivo/offline "en vivo" | Derivados de `ultima_visita`: **online** <30 min, **inactivo** <24 h, **offline** resto | `ultima_visita` se actualiza al entrar; no hay heartbeat y no vamos a agregar tracking en vivo por 20 personas |
| "Editando nota en Programación II" (acción en vivo) | Texto de la última actividad **registrada**: "Entró", "Creó una nota en X", "Sincronizó el aula" | No se trackea navegación, a propósito (privacidad) |
| Columna "Sesión" (42 min) | Minutos desde el último `sesion_iniciada` de hoy; "—" si no entró hoy | No hay duración de sesión real |
| Badges "Desktop · Chrome" y "v1.4.2" | Solo estado + carrera | Dispositivo y versión no se registran |
| "Pantallas más usadas" (barras %) | **"Materias con más notas"**, mismas barras | No se trackean páginas vistas; esto usa datos reales y conserva el elemento visual |
| Stat "sesión promedio 34m" | **"activas esta semana"** | Sin duración de sesión no hay promedio honesto |
| Deltas ("+18% vs ayer") | Solo los computables de `eventos`; si no hay dato, no se inventa | Números absolutos > porcentajes con n=20 |
| mail `falvarez@ort.edu.ar` | Usuario del aula (`credenciales.meta.usuario`), mono | El mail no se guarda |
| Paleta hardcodeada oscura | Tokens del tema (`--bg`, `--sup`, `--bor`…) | El prototipo es dark-only; la app tiene tema claro y el panel lo hereda gratis |
| "actualizado hace 12 s" en vivo | Timestamp del render (server component); sin polling | Panel de lectura; F5 alcanza |
| "Scrapers ok 4/6" cuenta usuarios con error/nunca | Igual, desde `credenciales.meta.ultimaVerificacion` | dato real ✔ |

**Privacidad (regla estructural, del spec 2026-08-16 §6):** el módulo de datos
del panel (`lib/admin-metricas.ts`) **nunca selecciona `bloques.texto`, `url`,
`fmt` ni `ref`** — solo counts, tipos, fechas y nombres de materia. No existe
función que devuelva contenido de notas al panel.

## 3. Requisitos

**Acceso**
- R1. Ruta `/admin` en grupo propio `app/(admin)/` con layout que llama
  `exigirSesion()` y además exige admin: `usuarioActual().moodleId` igual a
  `CURSADA_ADMIN_ID` (env). Si no es admin → `notFound()` (**404, no 403**).
- R2. Modo local (sin Supabase): en dev el panel muestra un set sintético
  marcado "demo" (sirve para desarrollo y para el futuro /demo del portfolio);
  en producción sin Supabase → 404.
- R3. Sin Server Actions nuevas; el panel es de solo lectura. Filtros, búsqueda
  y selección son estado del cliente sobre los datos ya bajados (≤20 usuarios).

**Header (medidas del .html)**
- R4. Header sticky, borde `--bor` abajo, fondo con blur (`backdrop-filter:
  blur(12px)`), contenido max 1280px, padding 16/28. Tile ámbar 36px radio 10
  con el birrete SVG (stroke `#221a00` 2.2). Título "Mi Cursada · Admin"
  15px/800; kicker "PANEL DE MONITOREO" mono 10px tracking .14em.
- R5. A la derecha: dot verde `#34d399` 7px con `pulso 2.2s` + "actualizado
  {hora del render}" mono 11px `--tx3`. Respetar `prefers-reduced-motion`
  (sin animación).

**Stats (fila superior)**
- R6. Grid `auto-fit minmax(170px,1fr)` gap 12. Card: `--sup`, borde `--bor`,
  radio 14, padding 16/18. Label mono 10px uppercase `--tx3`; valor mono 26px/600
  con color semántico; delta mono 11px.
- R7. Las 6 cards: **activas ahora** (verde `#34d399`), **usuarias totales**,
  **notas creadas hoy** (ámbar `--acc`), **activas esta semana**, **syncs ok
  "N/M"** (ámbar; con delta rojo "K error · J nunca" si aplica), **avisos
  vencidos** (rojo `#fb7185`; delta "en N usuarios").

**Tabla de usuarios**
- R8. Título "Usuarios" 17px/800 + contador "N de M" mono 11px. Filtros como
  segmento (Todos / Online / Inactivos / Offline) en contenedor `--sup` radio 10
  padding 3; pill activa fondo `--bor` texto `--tx`, inactiva transparente
  `--tx3`; botones min-height 32.
- R9. Búsqueda: input min-height 42, `--sup`, radio 11, placeholder "Buscá por
  nombre, usuario o carrera…". Filtra sobre nombre+usuario+carrera,
  case-insensitive. Vacío: «Ningún usuario con "{q}".» centrado 13px `--tx3`.
- R10. Tabla en card `--sup` radio 14 overflow hidden. Header de columnas mono
  9.5px uppercase `--tx4`: Usuario / Estado / Última actividad / Sesión / Notas
  hoy, grid `minmax(210px,1.5fr) 110px 1fr 92px 90px` gap 10.
- R11. Fila: botón min-height 58 padding 9/16, borde inferior `--bor`. Avatar
  34px redondo con iniciales 12.5px/800 sobre color propio (si hay `avatar_url`
  se usa la imagen; el color de fallback sale de un hash del id — nada de
  `Math.random()`). Nombre 13.5px/700 elipsis; carrera mono 10.5px `--tx3`.
  Estado: dot 7px + label mono en su color (online `#34d399` con pulso, inactivo
  `#fbbf24`, offline `#64748b`). Última actividad 12.5px `--tx2` elipsis.
  Sesión y Notas hoy mono 11.5px (notas: ámbar si >0, "—" `--tx4` si 0).
  Seleccionada: fondo `rgba(251,191,36,.06)`. Hover: `rgba(30,41,59,.45)`.

**Panel de detalle (aside)**
- R12. Grid exterior `minmax(0,1.6fr) minmax(330px,1fr)` gap 20; en <980px
  colapsa a una columna (el detalle va abajo). Aside `--sup` radio 16 padding
  20, sticky top 86, entra con `slideIn .3s cubic-bezier(.22,.8,.3,1)`
  (respetando reduced-motion).
- R13. Cabecera: avatar 44px, nombre 16px/800, usuario del aula mono 10.5px
  `--tx3`, botón cerrar 38×38 (`aria-label="Cerrar"`).
- R14. Badges outline mono 9.5px uppercase radio 99 padding 4/10: estado (borde
  y texto en su color) + carrera (borde `--bor2`, texto `--tx2`).
- R15. Grid 3×2 de métricas: cajas `--bg` borde `--bor` radio 11 padding 10/12,
  label mono 9px uppercase `--tx4`, valor mono 17px/600. Las seis: materias,
  notas, to-dos "hechos/total" (verde si ≥80%, ámbar 40–79%, rojo <40%),
  archivos, avisos pend. (ámbar >0, `--tx3` si 0), XP (verde).
  XP = hitos de `lib/logro.ts`: 50 (1ª nota) + 100 (5) + 150 (10) + 250 por
  cada múltiplo de 25 alcanzado — función pura `xpTotal()` con tests.
- R16. "Materias con más notas": label mono 10px uppercase `--tx3`; filas con
  nombre 12px/600 `--tx2` (74px fijo, elipsis), barra 5px fondo `--bor` con
  relleno `--acc` al % sobre el total de notas, % mono 10.5px a la derecha
  (38px). Top 5.
- R17. "Actividad reciente": eventos reales del usuario (por `usuario_hash`),
  últimos 8. Dot 7px semántico: celeste `#38bdf8` entrada, verde `#34d399`
  sync ok, rojo `#fb7185` sync con error, ámbar `#fbbf24` nota creada, violeta
  `#a78bfa` consentimiento. Texto 12.5px `--tx2` + tiempo relativo mono 10px
  `--tx4` ("hace 4 min", "ayer", "hace 3 días").
- R18. Pie: ícono refresh + "Aula virtual: {ok · hace X / error · hace X /
  nunca conectado}" mono 10.5px, desde `credenciales.meta.ultimaVerificacion`.
  (El prototipo dice "Scraper del aula virtual"; en la app el término de todo
  el copy es "aula virtual", se mantiene la consistencia.)

**Datos y eventos**
- R19. `lib/admin-metricas.ts` (SOLO SERVIDOR, `adminClient`): una función
  `metricasAdmin()` que arma todo el dataset del panel en pocas queries
  (perfiles + credenciales + counts agrupados + eventos recientes). Los
  cálculos puros (estado por umbrales, XP, texto de última actividad, tiempo
  relativo, agregados) van en `lib/admin-calculos.ts` **con tests**.
- R20. `crearBloque` registra `registrarEvento('nota_creada', userId,
  { curso: <nombre de la materia> })` — metadata, jamás el contenido. Alimenta
  "Actividad reciente" y el dot ámbar de R17.

## 4. Fuera de alcance

- Acciones de administración (bloquear, purgar, invitar) — el diseño no las
  tiene; van con la fase de invitaciones.
- Tracking de navegación/páginas vistas, duración de sesión, dispositivo,
  versión. Decisión de privacidad, no deuda.
- Polling/tiempo real. Auto-refresh queda para cuando haga falta.
- `/demo` público (fase vidriera); acá solo queda el seed sintético de dev.

## 5. Desviaciones que aparecieron implementando

- `usuariosPermitidos()` seguía en `app/actions-sesion.ts` de la etapa
  pre-multiusuario: se mantuvo (belt & suspenders con el flujo Supabase).
- El seed demo vive en `lib/admin-demo.ts` y lo usa la página solo si
  `!adminConfigurado() && NODE_ENV !== 'production'` (R2), marcado con un badge
  "DEMO" en el header para que una captura nunca se confunda con datos reales.
- `slideIn`/`pulso` se agregaron a `globals.css` dentro de
  `@media (prefers-reduced-motion: no-preference)` (R5/R12).
- Los umbrales de estado quedaron como constantes exportadas
  (`MIN_ONLINE = 30`, `HORAS_INACTIVO = 24`) para testearlos sin duplicar.

## 6. Verificación

- `npx tsc --noEmit`, `npx next lint`, `npx vitest run` — verdes.
- Tests de `lib/admin-calculos.ts`: estado por umbrales (bordes exactos),
  `xpTotal` (0, 1, 5, 10, 25, 50, valores intermedios), tiempo relativo,
  agregados de stats, texto de última actividad.
- Captura del panel en dev (seed demo) a 1440×900, oscuro y claro, comparada
  contra la captura del prototipo: header, stats, tabla, aside.
- `/admin` sin ser admin → 404 (verificado con la guarda unit-testeada).
