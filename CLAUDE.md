# Mi Cursada

App para organizar una cursada nocturna, multiusuario (Vercel + Supabase) con fallback a modo local de un solo usuario cuando no hay `.env.local`. **Desktop-first y responsive**: >640px sidebar fija de 232px + contenido `max-width: 1150px`; ≤640px bottom nav + contenido `max-width: 720px`. El breakpoint se aplica con `min-[641px]:` en Tailwind.

## Stack
- Next.js 15 (App Router) + TypeScript estricto. **Sin `src/`** — `app/`, `lib/`, `components/` en la raíz. Alias `@/*`.
- Tailwind v4 (config en CSS vía `@theme` en `app/globals.css`, no hay `tailwind.config`).
- Supabase (`@supabase/supabase-js` + `@supabase/ssr`) para datos, Auth (usuario sombra) y Storage (avatares). `zod` para validación, `lucide-react` para íconos, `vitest` para tests.
- La **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) es solo de servidor, nunca `NEXT_PUBLIC_`: la usa `adminClient()` (`lib/supabase/admin.ts`) para el alta del usuario sombra, `credenciales`, el sync compartido, `eventos` y el borrado de cuenta.
- El token del aula virtual se cifra con AES-256-GCM (`lib/cifrado.ts`) antes de guardarse; la clave de 32 bytes en base64 vive en `CURSADA_TOKEN_KEY`.
- **Nada de librería de estado global** (ni Redux, ni Zustand). Estado de servidor + estado local de componentes.

## Autenticación
- Se entra con **el usuario y la contraseña del aula virtual** (Moodle): `app/actions-sesion.ts` pide el token a `/login/token.php`.
- **Modo Supabase (multiusuario, con `.env.local`/env de Vercel configurado)**: el login abre un puente (`lib/supabase/puente.ts`) que busca o crea un **usuario sombra** en Supabase Auth (email sintético `moodle-{userid}@micursada.local`, `app_metadata.moodle_id`) y **acuña la sesión del lado del servidor** (`generateLink({ type: 'magiclink' })` + `verifyOtp`), sin que nadie tenga contraseña de Supabase. Las cookies las pone `@supabase/ssr`. Con la sesión puesta, `auth.uid()` funciona en Postgres → **RLS real** en cada query. El token del aula se cifra y se guarda en `credenciales`.
- **Modo local (fallback de desarrollo sin `.env.local`)**: la cookie propia `cursada_sesion` (`lib/sesion.ts`), 30 días, hash en `datos/sesiones.json`, token en `datos/moodle.json`. Un solo dueño por instancia.
- `lib/sesion-actual.ts` decide el modo con `supabaseConfigurado()`: `hayAcceso()`, `exigirSesion()`, `cerrarSesionActual()` resuelven a Supabase o a la cookie local según corresponda; el resto del código no necesita saber en cuál está.
- Todo lo que requiere estar adentro vive en el grupo `app/(app)/`, cuyo layout llama a `exigirSesion()`. `/login` (y `/consentimiento`, en modo Supabase) quedan afuera del grupo.
- **Toda Server Action y todo route handler chequean acceso por su cuenta** (son POST/GET que no pasan por el layout). En modo Supabase, además del acceso, las Server Actions que tocan datos del usuario chequean el **consentimiento** (`consintio()` en `lib/sesion-actual.ts`, o el helper `conUsuario()` de `app/actions.ts`) — el layout de `(app)` no alcanza a una action. Si agregás una action nueva, las guardas van sí o sí.
- El **logout redirige desde la propia action** (`redirect('/login')`): si solo revalida, el re-render de `(app)` se queda sin sesión y el redirect del layout sale como error de la action — el botón parece no hacer nada.
- El **instituto del perfil lo trae el aula virtual** (`sitename` del site info), al entrar y al verificar el token: no es un campo editable. Sede y turno son constantes de `lib/instituto.ts` (la API no los expone). **La carrera es editable por persona** en modo Supabase (columna `perfiles.carrera`, ver `components/perfil-vista.tsx`); en modo local sigue siendo la constante de `lib/instituto.ts`.
- **No hay variable de entorno que saltee el login**: una que lo saltee vuelve inalcanzable `/login` (cerrar sesión te devolvía a la app de una). `NEXT_DIST_DIR=.next-build` sirve para buildear sin pisar el `.next` de un `next dev` abierto.
- Ni la contraseña ni el token del aula virtual vuelven nunca al cliente ni van a un log.
- **Consentimiento obligatorio en el primer ingreso** (modo Supabase): `app/consentimiento/` pide `exigirSesion()` por su cuenta (vive fuera de `(app)` para no loopear con el redirect del layout) y muestra qué se guarda; sin aceptar no se entra. `aceptarConsentimiento` (`app/actions-sesion.ts`) escribe `perfiles.consentimiento_en` y dispara la carga inicial. **Borrar mi cuenta** (`borrarMiCuenta`) borra el usuario de Supabase Auth (cascada sobre `perfiles`, `credenciales`, `inscripciones` y todas las tablas personales) y el avatar del bucket; `eventos` queda (son hashes, no identifican).

## Esquema compartido y tablas solo-servidor (modo Supabase)
- El contenido del aula (`cursos`, `archivo_refs`, `avisos_curso`) es **compartido**: si cinco personas cursan la misma materia, existe una sola vez. Lo escribe únicamente el sync compartido (`lib/sync-compartido.ts`, service role); los usuarios solo tienen policy de `select`, condicionada a estar inscripto (`inscripciones`).
- Lo personal de cada persona (`horarios`, `materias_extra`, `bloques`, `avisos_estado`, `avisos_manuales`, `archivos_manuales`, `perfiles`) lleva RLS por `auth.uid()`.
- **`credenciales`, `eventos`, `archivo_refs` y `sync_log` son solo-servidor: sin policies para `anon`/`authenticated` (con `revoke` explícito), siempre via `adminClient()`.** Un cliente con la anon key no puede leerlas ni sabiendo la URL.
- **`archivo_refs` es una tabla global: el proxy `/api/archivo` busca la ref sin chequear inscripción, y la autorización real la hace Moodle al rechazar el token de quien no cursa esa materia.** El `ref` es opaco (`{cmid}:{indice}`), nunca una URL (evita SSRF), y la URL resuelta se valida contra el host de la credencial del usuario antes del fetch. Ninguna rama de error del proxy expone nombre, mime ni URL — solo mensajes genéricos (`No encontramos ese archivo`, `Archivo fuera del aula virtual`, etc.).
- Sync compartido: una vez por curso, no por persona — ventana de frescura de 6 h (`HORAS_FRESCO_COMPARTIDO` en `lib/sync-compartido.ts`). Además del sync al entrar/"Sincronizar ahora", hay un **cron diario** (`app/api/cron/sync/route.ts`, programado en `vercel.json`) protegido con `CRON_SECRET`, que solo sincroniza a quienes ya dieron consentimiento.

## Convenciones
- **Server Components por defecto.** `"use client"` solo cuando hay estado o interacción.
- **Server Actions** para todas las mutaciones.
- **Timezone fija: `America/Argentina/Buenos_Aires`** vía `date-fns-tz` — nunca usar la timezone del dispositivo ni `new Date()` pelado para lógica de fechas.
- Días de la semana: **1–6 con Lunes=1 … Sábado=6** (coincide con `getDay()`; domingo no se cursa).

## Tokens de diseño
- Fuente de verdad: **`HANDOFF.md`** (tabla de Design Tokens) y el prototipo `Mi Cursada.dc.html`. Las variables viven en `app/globals.css` (`:root` = oscuro default, `html[data-tema="claro"]` = claro) y están expuestas a Tailwind vía `@theme` (`bg-sup`, `text-tx2`, `border-bor`, etc.).
- **Crítico**: el ámbar de fondo de botones primarios/pills es SIEMPRE `--acc-bg: #fbbf24` con texto `--acc-fg: #221a00` en ambos temas. `--acc` (que en claro se oscurece a `#b45309`) es solo para texto/acentos.
- Sin sombras. Foco: `outline 2px solid #fbbf24, offset 2px`. Mínimo táctil 44px (clase `.tactil`). Kickers con la clase `.kicker`.
- `html, body` deben poder scrollear — nunca fijar `overflow: hidden` en ellos.
- Fuentes: Plus Jakarta Sans (sans, 400–800) y JetBrains Mono (mono), vía `next/font` en `app/layout.tsx` (`--font-jakarta`, `--font-jetbrains`).

## Copy
- Español rioplatense **con voseo** ("Anotá", "Cargá tus materias", "Hoy no cursás").
- Los textos son EXACTOS los del handoff — no parafrasear ni "corregir" a tuteo/neutro.
