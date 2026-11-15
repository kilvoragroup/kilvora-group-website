import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos gerados pelo Playwright (relatórios HTML com o visualizador de traces):
    // nunca código-fonte.
    "playwright-report/**",
    "test-results/**",
    "e2e-portal-results/**",
  ]),
]);

export default eslintConfig;
