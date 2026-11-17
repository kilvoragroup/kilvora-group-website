import { defineConfig, devices } from "@playwright/test";

import { loadFixtures } from "./e2e-portal-a4/support";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E REAIS da consola interna e do MFA (A4, portões S3/S4/S5/S7), contra uma instância
 * Supabase LOCAL ISOLADA (`kilvora_e2e_a4`, API 127.0.0.1:55321), preparada por
 * `e2e-portal-a4/prepare.ts`. A instância principal (REG0) e as configurações da A2/A3 não são
 * usadas nem alteradas. Um trabalhador, em série, sem retries. Só com `E2E_PORTAL_RUN=1`.
 */
const fixtures = loadFixtures();

export default defineConfig({
  testDir: "./e2e-portal-a4",
  testMatch: "**/*.spec.ts",
  outputDir: "./e2e-portal-results/output-a4",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 150_000,
  globalSetup: "./e2e-portal-a4/global-setup.ts",
  globalTeardown: "./e2e-portal-a4/global-teardown.ts",
  reporter: [["list"], ["html", { outputFolder: "e2e-portal-results/report-a4", open: "never" }]],
  use: {
    baseURL,
    locale: "pt-AO",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: undefined,
  },
  projects: [{ name: "portal-a4-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_PORTAL_ENABLED: "true",
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: fixtures.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fixtures.publishableKey,
      VERCEL_ENV: "",
    },
  },
});
