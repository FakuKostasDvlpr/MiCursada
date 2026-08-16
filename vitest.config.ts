import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    // El build standalone copia el proyecto (tests incluidos) adentro de .next:
    // sin esto, después de `npm run build` cada test corre dos veces.
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
