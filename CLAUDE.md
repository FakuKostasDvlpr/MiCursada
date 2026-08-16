# Mi Cursada

App personal (un solo usuario) para organizar una cursada nocturna. **Desktop-first y responsive**: >640px sidebar fija de 232px + contenido `max-width: 1150px`; ≤640px bottom nav + contenido `max-width: 720px`. El breakpoint se aplica con `min-[641px]:` en Tailwind.

## Stack
- Next.js 15 (App Router) + TypeScript estricto. **Sin `src/`** — `app/`, `lib/`, `components/` en la raíz. Alias `@/*`.
- Tailwind v4 (config en CSS vía `@theme` en `app/globals.css`, no hay `tailwind.config`).
- Supabase (`@supabase/supabase-js` + `@supabase/ssr`) para datos. `zod` para validación, `lucide-react` para íconos, `vitest` para tests.
- **Nada de librería de estado global** (ni Redux, ni Zustand). Estado de servidor + estado local de componentes.

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
