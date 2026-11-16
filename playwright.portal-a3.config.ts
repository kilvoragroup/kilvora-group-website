import { defineConfig, devices } from "@playwright/test";

import { loadLocalSupabase } from "./e2e-portal/support/local-supabase";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E REAIS da área do cliente (A3, portões S3/S4/S5), com configuração e preparação PRÓPRIAS
 * (decisão A3-FINAL-R3, opção B). A configuração e a preparação da A2
 * (`playwright.portal.config.ts`, `e2e-portal/global-*.ts`) não são usadas nem alteradas, e a
 * suite da A2 não vê esta pasta (`testDir: ./e2e-portal`).
 *
 * - Mesmo servidor de testes da A2: build próprio com o portal activo só aqui, Supabase LOCAL
 *   (loopback), porta 3100 (não executar em simultâneo com outras suites).
 * - Um trabalhador, em série, sem retries.
 * - Evidências em `e2e-portal-results/` (ignorada pelo Git): `output-a3/`, `report-a3/` e
 *   `evidence-a3/`.
 * - Só corre com `E2E_PORTAL_RUN=1` (ver `e2e-portal-a3/global-setup.ts`).
 */
const local = loadLocalSupabase();

export default defineConfig({
  testDir: "./e2e-portal-a3",
  testMatch: "**/*.spec.ts",
  outputDir: "./e2e-portal-results/output-a3",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  globalSetup: "./e2e-portal-a3/global-setup.ts",
  globalTeardown: "./e2e-portal-a3/global-teardown.ts",
  reporter: [["list"], ["html", { outputFolder: "e2e-portal-results/report-a3", open: "never" }]],
  use: {
    baseURL,
    locale: "pt-AO",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: undefined,
  },
  projects: [{ name: "portal-a3-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_PORTAL_ENABLED: "true",
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
      VERCEL_ENV: "",
    },
  },
});
