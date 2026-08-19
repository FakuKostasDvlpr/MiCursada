import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    // El build standalone copia el proyecto (tests incluidos) adentro del
    // distDir: sin esto, después de un build cada test corre dos veces —
    // contra el código actual y contra la copia congelada en el artefacto.
    //
    // El glob va con `.next*` y no `.next`: el build "que no molesta al dev"
    // usa NEXT_DIST_DIR=.next-build (ver next.config.ts), que con el patrón
    // viejo se colaba igual y duplicaba toda la suite.
    exclude: ["**/node_modules/**", "**/.next*/**"],
  },
});
