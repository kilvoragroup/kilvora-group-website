# Testes E2E (Playwright — não instalado)

Pasta reservada para testes end-to-end. O Playwright ainda não está instalado nem configurado.

Quando for autorizado:

1. `npm.cmd install -D @playwright/test` e `npx.cmd playwright install`
2. Criar `playwright.config.ts` na raiz com `testDir: "./e2e"`
3. Adicionar o script `"test:e2e": "playwright test"`

Os testes unitários (Vitest) ignoram esta pasta.
