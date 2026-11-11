# Testes E2E (Playwright)

Testes de browser executados com Chromium contra um servidor Next.js **local** (porta 3100), que é construído e arrancado pelo próprio Playwright (`playwright.config.ts`). Nunca são executados contra domínios públicos nem contra o Vercel.

```powershell
npx.cmd playwright install chromium   # uma vez por máquina
npm.cmd run test:e2e                  # executar
npm.cmd run test:e2e:ui               # modo interactivo
```

| Ficheiro                | Âmbito                                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| `navigation.spec.ts`    | Menus desktop/móvel, ARIA, teclado, navegação contextual, ligações sem 404 |
| `accessibility.spec.ts` | Skip link, ordem de tabulação, foco visível, movimento reduzido            |
| `responsive.spec.ts`    | 375/768/1440 px, overflow horizontal, preços e tabelas, alvos de toque     |
| `content.spec.ts`       | pt-AO, preços de Angola, noindex, WhatsApp, `/cliente/*`, `Docs/`          |

As evidências (`test-results/`, `playwright-report/`) são locais e ignoradas pelo Git. Os testes unitários (Vitest) ignoram esta pasta.
