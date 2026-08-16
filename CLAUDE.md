# Mi Cursada

App personal (un solo usuario) para organizar una cursada nocturna. **Desktop-first y responsive**: >640px sidebar fija de 232px + contenido `max-width: 1150px`; ≤640px bottom nav + contenido `max-width: 720px`. El breakpoint se aplica con `min-[641px]:` en Tailwind.

## Stack
- Next.js 15 (App Router) + TypeScript estricto. **Sin `src/`** — `app/`, `lib/`, `components/` en la raíz. Alias `@/*`.
- Tailwind v4 (config en CSS vía `@theme` en `app/globals.css`, no hay `tailwind.config`).
- Supabase (`@supabase/supabase-js` + `@supabase/ssr`) para datos. `zod` para validación, `lucide-react` para íconos, `vitest` para tests.
- **Nada de librería de estado global** (ni Redux, ni Zustand). Estado de servidor + estado local de componentes.

## Autenticación
- Se entra con **el usuario y la contraseña del aula virtual** (Moodle): `app/actions-sesion.ts` pide el token a `/login/token.php`, lo guarda en `datos/moodle.json` y abre la sesión (cookie `cursada_sesion`, 30 días, hash en `datos/sesiones.json`).
- Todo lo que requiere estar adentro vive en el grupo `app/(app)/`, cuyo layout llama a `exigirSesion()`. `/login` queda afuera del grupo.
- **Toda Server Action y todo route handler chequean `hayAcceso()` por su cuenta** (son POST/GET que no pasan por el layout). Si agregás una action nueva, la guarda va sí o sí.
- El **logout redirige desde la propia action** (`redirect('/login')`): si solo revalida, el re-render de `(app)` se queda sin sesión y el redirect del layout sale como error de la action — el botón parece no hacer nada.
- El **instituto del perfil lo trae el aula virtual** (`sitename` del site info), al entrar y al verificar el token: no es un campo editable. Carrera, sede y turno sí son constantes de `lib/instituto.ts` (la API no los expone).
- `CURSADA_SIN_LOGIN=1` desactiva el login (dev / red privada). `NEXT_DIST_DIR=.next-build` sirve para buildear sin pisar el `.next` de un `next dev` abierto.
- Ni la contraseña ni el token del aula virtual vuelven nunca al cliente ni van a un log.

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
