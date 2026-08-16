import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autocontenido (.next/standalone) para armar una imagen Docker chica:
  // Next traza sólo las dependencias que realmente se usan en runtime.
  output: 'standalone',
};

export default nextConfig;
