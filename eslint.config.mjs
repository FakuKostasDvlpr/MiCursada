import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      // `.next*` y no solo `.next`: los builds de verificación usan
      // NEXT_DIST_DIR (.next-build, .next-verif…) y son código GENERADO. Sin
      // esto un build deja 2700 problemas ajenos y `npm run lint` no sirve
      // más para saber si nuestro código está limpio.
      ".next*/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Datos personales del aula virtual — no es código.
      "datos/**",
      // Salida de graphify (grafo de conocimiento), no es código nuestro.
      "graphify-out/**",
      // Export del handoff de diseño: JS vendorizado que no mantenemos.
      // Sin esto `npm run lint` tira 4 errores y 41 warnings ajenos y deja de
      // servir para ver si NUESTRO código está limpio.
      "design_handoff_mi_cursada/**",
      "Mi Cursada - App de estudio (1)/**",
    ],
  },
];

export default eslintConfig;
