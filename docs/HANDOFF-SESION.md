# Handoff de sesión — Mi Cursada

Documento para retomar el trabajo en otra sesión. Escrito el **16/08/2026**.
Pegá este archivo (o su ruta) al arrancar y el agente nuevo tiene todo el contexto.

> **Ojo, no confundir con `HANDOFF.md` de la raíz**, que es el handoff de *diseño*
> de Claude Design (tokens, pantallas, copy). Ese sigue siendo la fuente de verdad visual.

---

## 1. Qué es esto

App personal, mobile-first, para que **Facundo** organice su cursada nocturna en el
**Instituto de Tecnología ORT, sede Almagro**, carrera **Analista de Sistemas**,
comisión **1-1-A**, turno noche (**19:10–23:00, lunes a jueves**).

Se conecta al aula virtual (Moodle) por su API oficial y trae materias, materiales,
entregas y contenido. Todo el copy va en **español rioplatense con voseo**.

**Repos:**
- `C:\Users\facun\Documents\Cursada` — la app (Next.js 15). GitHub: `FakuKostasDvlpr/MiCursada`.
- `C:\Users\facun\Documents\cursada-sync` — CLI aparte que habla con Moodle (cursos, entregas,
  notas, novedades, exportar). Sigue siendo útil para consultas por terminal, pero **la app ya
  sincroniza sola**, así que no es necesario para el día a día.

---

## 2. Estado: qué funciona hoy

**Datos reales del aula virtual**, sincronizados desde la app: 7 materias, 46 unidades,
214 materiales, 92 archivos, 10 avisos.

| Pantalla | Estado |
|---|---|
| **Hoy** | Bento con próxima clase y cuenta regresiva, clases del día, avisos, footer de sync. Tile de **Asistencia** los días que cursa, con "Dar el presente" (se pone ámbar 10 min antes) y "Entrar a la clase" (Zoom de la comisión). |
| **Semana** | Grilla Lun–Sáb con los horarios reales. |
| **Materias** | Las 7, con color, profe y aula. No se crean a mano (vienen del sync); sí se editan profe/aula/color/horarios. |
| **Avisos** | Entregas reales; se marcan como hechos y se pueden crear propios. |
| **Detalle de materia** | Tabs **Curso · Notas · Archivos · Avisos**. |
| **Curso** | Unidades desplegables; cada material abre un acordeón con su contenido **dentro de la app** (texto, video de YouTube embebido, PDF en visor, adjuntos). |
| **Notas** | Editor con comandos `/` (texto, título, tarea, link, divisor), estados por bloque, y **bitácora agrupada por día** ("Hoy", "Ayer", fechas) con buscador. |
| **Perfil** | Nombre, instituto, foto (guardada en disco). |
| **Login** | Con las credenciales del aula virtual. |
| **Panel Aula virtual** | Indicador de estado del token, "Sincronizar ahora", conectar/desconectar. |

**Verificación:** 332 tests en verde (15 archivos), `tsc --noEmit` y `eslint` limpios.

---

## 3. Cómo correrlo

```bash
cd C:\Users\facun\Documents\Cursada
npm run dev            # http://localhost:3000
```

Se entra con **usuario y contraseña del aula virtual**. No hay variable para saltear el login
(se sacó a propósito en una sesión previa).

**Docker** (probado y funcionando):
```bash
docker compose up --build      # mismo puerto 3000, datos montados desde ./datos
```

---

## 4. Arquitectura y decisiones que conviene no revertir

**Sin base de datos.** El usuario descartó Supabase. Todo vive en archivos JSON en `datos/`.
El código igual conserva el camino Supabase completo (`lib/queries.ts`, `app/actions.ts`,
`supabase/migrations/`) y elige según haya variables de entorno. Eso hace barata la migración
futura a Vercel.

**Snapshot + overlays.** `datos/aula-virtual.json` es lo que viene de Moodle (se regenera en
cada sync). Todo lo que edita el usuario vive en overlays separados que **el sync nunca pisa**.
`lib/datos-locales.ts` los mergea al leer.

**Cliente Moodle de solo lectura.** `lib/moodle/cliente.ts` tiene una allowlist tipada +
guard de runtime. El token puede escribir en la cuenta real (entregar TPs, mandar mensajes),
así que el cliente es incapaz de llamar nada que no esté en la lista. **No agregar funciones
de escritura.**

**El token nunca llega al cliente.** Vive en `datos/moodle.json`, cifrado no, pero fuera de git.
Los archivos de Moodle exigen el token en la URL, así que se sirven por
`app/api/archivo/route.ts`, que los baja del lado servidor con un `ref` opaco (`{cmid}:{indice}`)
— **nunca aceptar una URL arbitraria ahí: sería SSRF**.

**Timezone fija** `America/Argentina/Buenos_Aires` (date-fns-tz). Días 1–6, Lunes=1.
Toda la lógica de fechas es pura y recibe `ahora` por parámetro (`lib/cursada.ts`,
`lib/bitacora.ts`), y los tests pasan en cualquier TZ de máquina.

---

## 5. Los datos (irreemplazables — leer antes de tocar `datos/`)

`datos/` está en `.gitignore`. **No se puede recuperar de ningún lado.**

| Archivo | Qué es | ¿Se regenera? |
|---|---|---|
| `moodle.json` | **El token del aula virtual** + última verificación | No. Se regenera solo re-logueando |
| `aula-virtual.json` | Snapshot del aula (materias, unidades, materiales) | Sí, con "Sincronizar ahora" |
| `aula-virtual-archivos.json` | Índice de refs para el proxy de archivos | Sí, con el sync |
| `horarios.json` | **Horarios cargados a mano** (leídos del PDF oficial) | No |
| `materias-extra.json` | Profe, aula y color por materia | No |
| `bloques.json` | **Las notas de clase** | No |
| `avisos-estado.json` | Qué avisos marcó como hechos | No |
| `perfil.json` + `avatar.png` | Perfil y foto | No |
| `sesiones.json` | Sesiones abiertas | Sí (re-login) |

**Regla para cualquier agente:** hacer backup en el scratchpad antes de tocar nada, y verificar
con SHA256 que los overlays quedaron byte-idénticos al terminar. Solo `aula-virtual*.json`
puede cambiar (por el sync) y `moodle.json` solo en `ultimaVerificacion`.

---

## 6. Advertencias operativas (aprendidas a los golpes)

1. **Nunca dos `next dev` sobre el mismo repo.** Comparten `.next` y lo corrompen: la app
   empieza a tirar 500 y "pantalla en blanco". Si pasa: matar todos los node de next,
   `rm -rf .next`, levantar uno solo.
2. **No correr `npm run build` con el dev server arriba** — pisa `.next` y lo rompe igual.
3. Para verificar con Playwright, **copiar el proyecto al scratchpad** con su propio `.next`
   (copiar `node_modules`; con junction Turbopack falla por symlinks) y `CURSADA_DATOS_DIR`
   apuntando a una **copia** de los datos.
4. Los `.sh` necesitan **finales de línea LF** (hay `.gitattributes` que lo fuerza).
5. Windows + Git Bash: las rutas son `C:\...` o `/c/...`. **No hay `/mnt/c`** salvo en WSL,
   y la distro por defecto de WSL del usuario es `docker-desktop` (sin bash): usar `-d Ubuntu`.

---

## 7. Lo que estaba en curso cuando paramos

El usuario pidió, en este orden, y **quedó sin implementar**:

### a) Videos: links de YouTube dentro del HTML → player embebido
Caso real: el módulo **"Videos explicativos de los ejercicios 1 y 2"** tiene un HTML con una
lista y dos links de texto (**"Uno"** y **"Dos"**) que apuntan a videos. Hoy se ven como links.
Deben convertirse en **dos iframes** de `youtube-nocookie`.
Dónde: `lib/moodle/contenido.ts`, después de sanitizar. Soportar `watch?v=`, `youtu.be/`,
`/embed/`, `/playlist?list=`, `/shorts/` y Vimeo. Varios links → varios players.
Formato sugerido: `<figure class="video"><iframe …></iframe><figcaption>{texto del link}</figcaption></figure>`.

### b) Preview de imágenes y reproductor de video propio
Medido sobre el snapshot: **25 archivos `video/mp4`** subidos al aula (no YouTube),
**29 imágenes** (24 png, 3 jpeg, 2 gif), 68 PDFs, 6 ZIPs.
- `image/*` → preview inline (hoy solo se descargan).
- `video/*` → `<video controls playsinline>` por el proxy. **Requiere soportar `Range`
  (HTTP 206) en `app/api/archivo/route.ts`**, si no el video no se puede adelantar.

### c) Estados de carga (pedido textual)
> "aprieto y luego descarga pero el usuario no sabe si descargó o no"

- Ver/previsualizar: skeleton o spinner con "Cargando…" hasta `onLoad`; si falla,
  "No se pudo cargar. Probá descargarlo."
- Descargar: botón a "Descargando…" (deshabilitado) con `fetch` + blob, y "Listo" ~2 s.

### d) SlideShare
Hay **1 solo** link a slideshare.net en todo el contenido. Se puede embeber con su iframe
estándar si el key se deriva de la URL; si no, dejarlo como link. Baja prioridad.

**Estado del árbol:** hay cambios sin commitear en `lib/moodle/contenido.ts`,
`lib/embebido.ts`, `components/materia-detalle.tsx`, `app/api/archivo/route.ts`,
`app/globals.css` y tests — trabajo parcial de estos puntos. Revisarlo antes de rehacer.

---

## 8. Backlog conocido

- **14 commits sin pushear** a `origin/main`.
- **Otra sesión trabajó en paralelo** en este repo (commits `d9efe10`, `93ee06c`, `f1aa65c`,
  `73eae30`, `7f0bd78`, `5b5318c`, `5990782`): login, logout, logo y "handoff v3". Si aparecen
  cambios inesperados en el árbol, puede ser eso.
- **Quizzes sin descripción**: `mod_quiz_get_quizzes_by_courses` falla para el lote entero por
  un quiz con Safe Exam Browser (`noconfigfilefound`). Habría que pedir curso por curso.
- **Drag & drop y vista Tablero (kanban)** de las notas: nunca se hicieron. El editor anda bien sin eso.
- **Fase 7 del plan original**: PWA (manifest, íconos, instalable), README propio y build final.
- URLs sueltas en el HTML de un profe quedan como texto no clickeable (módulo "Actividad" de
  Introducción a la Informática).
- El hint "Se abre en el aula virtual" quedó revisado, pero conviene chequear que no se
  duplique tras los cambios de la sección 7.

---

## 9. Restricciones que NO se negocian

**Asistencia: no se puede marcar desde la app, y no se debe intentar.** Verificado sobre las
417 funciones que expone la instancia: **ninguna es de attendance**. Forzarlo por el formulario
web sería (a) probablemente bloqueado por las protecciones del plugin (subnet/IP/QR),
(b) frágil, y (c) una herramienta para figurar en clase sin estar. La app **recuerda y
redirige**, nada más.

**No entregar TPs ni rendir cuestionarios automáticamente.** Se puede técnicamente
(`mod_assign_save_submission`, `mod_quiz_start_attempt`) pero: no hay subida de archivos en la
API (la mayoría de los TPs piden archivo), `submit_for_grading` suele ser irreversible, y hay
un examen con proctoring por cámara. Links directos sí; automatización no.

**El token es una credencial real.** Nunca imprimirlo (ni truncado), nunca mandarlo al cliente,
nunca guardarlo en git, nunca dejar pasar un `fileurl` (trae el token embebido) al snapshot ni
al navegador.

**Multiusuario**: si alguna vez se abre a los amigos, los tokens de terceros deben ir cifrados,
con consentimiento explícito y borrado de cuenta. Ver `docs/PLAN-VERCEL.md` §5.

---

## 10. Documentos relacionados

- `HANDOFF.md` (raíz) — handoff de **diseño**: tokens de color, pantallas, copy exacto. Fuente de verdad visual.
- `Mi Cursada.dc.html` (raíz) — prototipo hi-fi navegable.
- `CLAUDE.md` — convenciones del proyecto (RSC por defecto, Server Actions, TZ, voseo).
- `docs/PLAN-VERCEL.md` — plan para desplegar en Vercel con ~20 usuarios a costo $0,
  con modelo multiusuario, cifrado de tokens y panel de métricas.
- `cursada-sync/MOODLE-API-REFERENCE.md` — la API de Moodle y sus 8 trampas confirmadas
  (errores con HTTP 200, epoch en segundos, `duedate=0`, `fileurl` con token, etc.).
