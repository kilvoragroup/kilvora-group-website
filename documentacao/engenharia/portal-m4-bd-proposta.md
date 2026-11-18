# M4-BD — Mitigação definitiva do F2

**Estado:** implementada e validada **só numa instância Supabase local isolada** (`kilvora_e2e_m4`). Não está aplicada na base local principal nem no Supabase alojado. Integração por autorização.
**Ficheiros:** `supabase/migrations/20261118120000_portal_f2_mitigation.sql`, `supabase/rollback/20261118120000_portal_f2_mitigation.down.sql`, `supabase/tests/database/m4_portal_f2.test.sql`.
**Origem:** `portal-m3-app.md` §4.6. O proprietário rejeitou a aceitação do risco F2 (A5-FINAL) e aprovou as correcções C1–C5 (revisão final F2).

## 1. Âmbito

| Parte | Conteúdo                                                                                                                                                                                     | Fecha                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| a)    | `admin_staff_provisioning_status(p_provisioning_id)`: estado (`pendente`, `consumido`, `cancelado`, `expirado`), e-mail mascarado e se foi provisionado pelo próprio admin. Só admin `aal2`. | L2                          |
| b)    | `admin_remove_misclassified_registration(p_user_id, p_provisioning_id)`: remove o perfil `cliente`, a conta pessoal e a associação de um registo mal classificado, com auditoria.            | F2                          |
| C1    | `private.auth_invite_facts` com o gatilho novo `auth_user_invite_fact` em `auth.users`. **`handle_new_user` e `mark_user_invited` não são alterados.**                                       | Origem confiável do convite |
| c)    | Guarda de domínio no registo público (§4.6 c).                                                                                                                                               | Fora do âmbito              |

## 2. Correcções C1–C5

- **C1 — Facto de convite:** o gatilho `AFTER UPDATE OF invited_at` (`old` nulo → `new` preenchido), igual ao de `mark_user_invited`, chama `private.record_auth_invite()`. É `SECURITY DEFINER`, o dono é `portal_registrar` e grava `(user_id, invited_at)`.
  - A tabela só aceita inserções (`reject_mutation` em `UPDATE`, `DELETE` e `TRUNCATE`), tem RLS e não é acessível pela API.
  - Não tem FK para `auth.users`, para que o utilizador possa ser apagado no Dashboard depois da correcção.
  - O registo público e o «Create new user» (sem `invited_at`) não gravam facto.
- **C2 — DELETE mínimo:** `DELETE` só para `portal_definer`, só em `profiles`, `accounts` e `account_members`. Cada política exige admin `aal2` **e** o alvo marcado na transacção (`kilvora.f2_target`); a de `profiles` exige também `kind = 'cliente'`, `status = 'suspenso'`, menos de 24 h e não ser o próprio admin. Sem marcação, nenhuma linha é apagada.
- **C3 — Concorrência:** bloqueios consultivos `kilvora.admin_set` e `kilvora.ticket_create:<uid>`; `FOR UPDATE` no perfil; cada `DELETE` tem de afectar exactamente 1 linha (`PT409 concurrent_change`). Uma segunda chamada devolve `PT404` neutro e não grava auditoria.
- **C4 — Perfil suspenso:** precondição obrigatória (suspender → corrigir).
- **C5 — Intervalo até apagar no Auth:**
  - procedimento na interface: suspender → corrigir → bloquear e apagar no Dashboard → voltar a provisionar;
  - sem perfil, a DAL e a RLS negam tudo (falha fechada) e a sessão expira em ≤ 1 h;
  - a FK `restrict` impede apagar no Auth antes da correcção.
  - Script `supabase/ops/f2_auth_orphans_status.sql` (só leitura): lista os utilizadores do Auth sem perfil e a acção pendente no Dashboard.

## 3. Guardas da RPC b) (por ordem)

1. **Quem chama:** admin com `aal2`, caso contrário `PT404`; não pode ser o próprio (`42501 self_action_forbidden`).
2. **O alvo:** perfil `cliente`, `suspenso`, criado há menos de 24 h (`PT422 not_eligible`).
3. **O convite:** existe o facto de convite para o alvo (`PT422 not_invited`).
4. **O provisionamento:** do mesmo admin, não consumido, criado antes do registo e há no máximo 7 dias; o e-mail pode ser diferente (`PT422 provisioning_mismatch`).
5. **A conta e a actividade:** uma única associação, numa conta criada pelo alvo e sem outros membros; sem pedidos, eventos, mensagens, notas, papéis nem referências de provisionamento (`PT409 has_activity`).
6. **A remoção:** `account_members` → `accounts` → `profiles`, com a auditoria `misclassified_registration_removed` (`before = {kind, account_id, provisioning_id}`, sem e-mail). A marcação é limpa no fim.

## 4. Validação (instância isolada `kilvora_e2e_m4`)

| Verificação                             | Resultado                                                                                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Homologação, só leitura (`--read-only`) | `postgres` é membro de `portal_registrar`, `portal_definer` e `portal_guard` (SET), tem TRIGGER em `auth.users` e CREATE em `public` e `private`, sem superutilizador; a M4 não está aplicada. Compatível com a migração (as mesmas operações que a M2 fez). |
| pgTAP com a M4                          | **313/313**: M1–M3 (262) mais M4 (51).                                                                                                                                                                                                                       |
| Reversão                                | Impressão estrutural (funções, donos, ACL, políticas, privilégios de tabela e coluna, gatilhos, esquemas) **idêntica à da M3** (194 linhas, zero diferenças); histórico M1–M3.                                                                               |
| M1–M3 depois da reversão                | **262/262**.                                                                                                                                                                                                                                                 |
| Voltar a aplicar                        | Aplica sem erros; **313/313**.                                                                                                                                                                                                                               |
| Concorrência                            | Com `kilvora.admin_set` tomado por outra sessão, a RPC espera; sem bloqueio, `PT404` imediato.                                                                                                                                                               |

Os testes da M4 cobrem:

- a classificação inalterada (REG-INV, REG-F2, REG-PUB), os factos de convite (F1–F6) e os privilégios (P1–P4);
- o contorno da marcação (G1–G9): pela API com qualquer papel, assumindo `portal_definer` sem admin, com `aal1`, sem marcação, com o alvo não suspenso, e por outras RPCs;
- as guardas (R1–R12), o sucesso e a idempotência com a auditoria (I1–I6) e o estado do provisionamento (S1–S3).

Os testes M1/M2 que enumeram objectos exactos passaram a reconhecer a M4 (`m4_applied()`), com o mesmo padrão condicional já usado para a M2 e a M3. A C18 continua estrita: só a RPC F2 usa `set_config`, e nunca para as variáveis `kilvora.signup_*`.

## 5. Adaptações da A5

- `database.types.ts` regenerado: só acréscimos, as 2 RPCs.
- 6 motivos de erro novos e o parser `parseMisclassifiedRemoval`, que exige confirmação explícita.
- Serviço: `getProvisioningStatus` e `removeMisclassifiedRegistration` (sucesso só com `{removed: true}`).
- Acções com a DAL admin `aal2`.
- `/interno/admin`:
  - consulta do provisionamento;
  - secção «Corrigir registo mal classificado (F2)», com os 4 passos e a confirmação;
  - identificador visível nos perfis.

## 6. Riscos residuais

- Os casos F2 criados com «Create new user» (sem convite) não são corrigíveis por esta RPC, por desenho. Ficam com a contenção §4.5.
- Ao integrar, a migração é aplicada a todos os ambientes pelo pipeline normal (CI com base nova). Para a homologação alojada é precisa uma autorização própria, com plano de reversão.
