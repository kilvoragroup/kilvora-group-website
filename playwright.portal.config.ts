import { defineConfig, devices } from "@playwright/test";

import { loadLocalSupabase } from "./e2e-portal/support/local-supabase";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E REAIS do portal de clientes (A2-B4), separados da suite institucional.
 *
 * - Pasta própria (`e2e-portal/`): a configuração institucional (`testDir: ./e2e`) nunca os
 *   apanha, e esta nunca apanha os institucionais.
 * - O portal só fica activo NESTE servidor de testes: `NEXT_PUBLIC_PORTAL_ENABLED=true` é
 *   passado apenas ao `webServer` (build próprio); a produção e a suite institucional não o veem.
 * - Supabase e Mailpit LOCAIS: só o URL da API e a chave publishable (P3), lidos em memória.
 * - Um trabalhador, em série: os cenários partilham utilizadores sintéticos e o Mailpit.
 * - Sem `storageState`: cada teste começa com um contexto de navegador limpo; nada é partilhado
 *   com a suite institucional.
 * - Evidências em `e2e-portal-results/` (ignorada pelo Git, ESLint e Prettier), com três
 *   subpastas irmãs: `output/` (capturas e traces; limpa pelo Playwright a cada execução do
 *   portal), `report/` (relatório HTML; limpo a cada execução do portal) e `evidence/`
 *   (contagens antes/depois; nunca limpa pelo Playwright). Fora de `test-results/` e de
 *   `playwright-report/`, que a suite institucional apaga por inteiro.
 * - Porta 3100 (já autorizada nos URLs de redireccionamento do Auth local). Não executar em
 *   simultâneo com a suite institucional (mesma porta e mesmo `.next`).
 * - Só corre com `E2E_PORTAL_RUN=1` (ver `e2e-portal/global-setup.ts`).
 */
const local = loadLocalSupabase();

export default defineConfig({
  testDir: "./e2e-portal",
  testMatch: "**/*.spec.ts",
  outputDir: "./e2e-portal-results/output",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  globalSetup: "./e2e-portal/global-setup.ts",
  globalTeardown: "./e2e-portal/global-teardown.ts",
  reporter: [["list"], ["html", { outputFolder: "e2e-portal-results/report", open: "never" }]],
  use: {
    baseURL,
    locale: "pt-AO",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: undefined,
  },
  projects: [{ name: "portal-chromium", use: { ...devices["Desktop Chrome"] } }],
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
      // Nunca Production: páginas não indexáveis neste servidor.
      VERCEL_ENV: "",
    },
  },
});
