import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autocontenido (.next/standalone) para armar una imagen Docker chica:
  // Next traza sólo las dependencias que realmente se usan en runtime.
  output: 'standalone',
  // Un `next build` pisa el .next que está usando el `next dev` abierto, y el
  // dev server queda sirviendo server actions que ya no existen. Con
  // NEXT_DIST_DIR=.next-build el build va aparte y no molesta a nadie.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  
  // ✅ Agregá esta sección para permitir imágenes de Supabase
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'bhjachrwvujqfkgrscei.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/avatares/**',
        search: '',
      },
    ],
  },
};

export default nextConfig;