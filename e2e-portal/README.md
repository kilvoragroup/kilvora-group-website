# E2E reais do portal de clientes (A2-B4)

Testes Playwright da autenticação do portal contra o **Supabase local** e o **Mailpit local**. São separados da suite institucional (`e2e/`, `playwright.config.ts`), que não os executa nem é alterada.

> **Criam contas sintéticas na base local.** Só correm com autorização expressa e `E2E_PORTAL_RUN=1`. Sem essa variável, o `globalSetup` recusa arrancar.

## Execução (só com autorização)

```powershell
npx.cmd supabase start          # stack local já existente; nunca "db reset"
$env:E2E_PORTAL_RUN = "1"
npm.cmd run test:e2e:portal
Remove-Item Env:E2E_PORTAL_RUN
```

Listar os cenários sem os executar: `npx.cmd playwright test -c playwright.portal.config.ts --list`.

Não correr em simultâneo com `npm run test:e2e`: as duas suites usam a porta 3100 e a pasta `.next`.

## Isolamento

| Aspecto                 | Garantia                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descoberta de testes    | A suite institucional usa `testDir: ./e2e` e esta `testDir: ./e2e-portal`; nenhuma vê os ficheiros da outra.                                                                                  |
| Portal activo           | `NEXT_PUBLIC_PORTAL_ENABLED=true` só no `webServer` desta configuração (build próprio). A produção, o Vercel e a suite institucional continuam com o portal desligado.                        |
| Supabase                | Só `API_URL` e `PUBLISHABLE_KEY`, lidos de `supabase status -o env` em memória e validados como loopback. Chaves privilegiadas da mesma saída são ignoradas e nunca guardadas nem registadas. |
| Sessões e armazenamento | Sem `storageState`; cada teste usa um contexto novo. Evidências em `e2e-portal-results/` (`output/`, `report/`, `evidence/`), fora das pastas que a suite institucional apaga.                |
| Base de dados (suporte) | `support/db.ts` só lê, com `default_transaction_read_only=on`.                                                                                                                                |
| Execução                | Um trabalhador, em série (utilizadores e caixa de correio partilhados).                                                                                                                       |

## Dados sintéticos

- E-mails `e2e-<execução>-<rótulo>@e2e.example.test` (domínio reservado, nunca entrega correio real).
- Palavras-passe aleatórias geradas em memória, nunca registadas.
- Nomes «E2E Teste A/B» e empresas «E2E Empresa A/B».
- O `globalSetup` recusa arrancar se já existirem contas `@e2e.example.test`.

## Integridade e limpeza

1. **Antes:** `globalSetup` regista as contagens de 18 tabelas (`e2e-portal-results/evidence/baseline.json`).
2. **Depois:** `globalTeardown` compara e regista as diferenças e o número de contas sintéticas (`e2e-portal-results/evidence/integrity.json`). **Não apaga nada.**
3. **Limpeza (D-B, manual e autorizada):** `sql/cleanup.sql`, numa única transacção, com guardas, ordem de remoção imposta pelas FK e verificações finais (zero contas sintéticas, zero órfãos no grafo do portal, utilizadores reais e `audit_log` inalterados). Qualquer falha desfaz tudo.
4. **Mailpit:** as mensagens dos endereços sintéticos podem ser removidas com `deleteMessagesFor` (`support/mailpit.ts`); não afecta a base.

### `private.audit_log` imutável (D-A, opção 1)

O trigger `audit_log_immutable` recusa `UPDATE` e `DELETE`. Cada registo sintético deixa uma linha `user_registered` permanente, com o id do utilizador e `{kind, account_id}` — **sem e-mail nem nome**. A limpeza não desactiva o trigger: o controlo de auditoria mantém-se intacto. O resíduo é contado no resumo da limpeza.
