import type { NextConfig } from 'next';

// Host del Storage de Supabase, derivado del entorno y no escrito a mano: con
// el hostname hardcodeado, cambiar de proyecto rompe todos los avatares sin
// que nada avise. Sin Supabase configurado (dev local) no hay patrón que
// declarar — los avatares se sirven por /api/avatar desde disco.
function hostSupabase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const host = hostSupabase();

const nextConfig: NextConfig = {
  // Build autocontenido (.next/standalone) para armar una imagen Docker chica:
  // Next traza sólo las dependencias que realmente se usan en runtime.
  output: 'standalone',
  // Un `next build` pisa el .next que está usando el `next dev` abierto, y el
  // dev server queda sirviendo server actions que ya no existen. Con
  // NEXT_DIST_DIR=.next-build el build va aparte y no molesta a nadie.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  images: {
    // Avatares del bucket público `avatares`.
    //
    // OJO con `search`: NO va. Next compara la query string de forma exacta
    // (`pattern.search !== url.search` en match-remote-pattern.ts), así que
    // `search: ''` significa "solo URLs sin query string" y rechaza con 400
    // toda avatar_url — que siempre lleva el `?v=<timestamp>` que bustea el
    // caché al cambiar la foto. Omitido, cualquier query string pasa.
    remotePatterns: host
      ? [
          {
            protocol: 'https' as const,
            hostname: host,
            port: '',
            pathname: '/storage/v1/object/public/avatares/**',
          },
        ]
      : [],
  },
};

export default nextConfig;
