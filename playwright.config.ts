import { defineConfig, devices } from "@playwright/test";

import { e2eVercelEnv } from "./e2e/helpers";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * Testes de browser (W2-C). Executam apenas contra um servidor Next.js local,
 * construído e arrancado pelo próprio Playwright — nunca contra domínios públicos ou Vercel.
 * Evidências ficam em `test-results/` e `playwright-report/` (ignorados pelo Git).
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    locale: "pt-AO",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: baseURL,
    timeout: 300_000,
    // Nunca reutilizar um servidor já em execução: poderia ter sido construído para
    // outro ambiente e mascarar o comportamento SEO real.
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      // Ambiente definido explicitamente (não herdado do terminal). "none" = ausente.
      VERCEL_ENV: e2eVercelEnv === "none" ? "" : e2eVercelEnv,
    },
  },
});
