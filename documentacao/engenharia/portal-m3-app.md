# Portal V1 — M3-APP: decisões e plano de implementação

**Estado:** A0 aprovada; A1 integrada (`main` em `c5c7eab`, PR #12); **A2 concluída e validada localmente** na branch `feat/w3-b5-04-a2-auth`, por integrar (secção 9). Este documento regista as decisões aprovadas pelo proprietário.
**Base verificada:** `main` em `c5c7eab` (M1, M2, M3-BD e fundação A1 integradas; 262 testes pgTAP na CI).
**Fontes de verdade:** as migrações em [`supabase/migrations/`](../../supabase/migrations/) e os testes em [`supabase/tests/database/`](../../supabase/tests/database/). Se este documento divergir delas, prevalecem as migrações e os testes.

## 1. Decisões

| ID  | Decisão                                                                                               | Consequência para a V1                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D01 | Convites de pessoal feitos à mão no Supabase Dashboard.                                               | Não há chave secret nem Admin API do Auth na aplicação. Procedimento na secção 4.                               |
| D02 | A consola interna fica em `/interno/*`.                                                               | Zona própria, com layout próprio, `noindex`, bloqueada no `robots.txt` e fora do sitemap.                       |
| D03 | MFA TOTP opcional para clientes e obrigatório (`aal2`) para operadores e administradores.             | A consola exige `aal2`. Sem `aal2`, a RLS e as RPCs já negam o acesso interno.                                  |
| D04 | O nome público dos operadores é «Equipa KILVORA».                                                     | O cliente nunca vê o perfil do staff; a UI apresenta a autoria das mensagens do staff só como «Equipa KILVORA». |
| D05 | Notificações operacionais por e-mail ficam fora da V1. Mantêm-se os e-mails de autenticação.          | Mantêm-se a confirmação de registo, a recuperação, o convite e a alteração de e-mail. Nenhum outro e-mail.      |
| D06 | As limitações L2 e L4 são aceites. Não há M4-BD nesta etapa.                                          | Ver secção 3.                                                                                                   |
| D07 | Fixtures E2E só locais, sintéticas e isoladas, sem dados reais.                                       | Domínio `example.test`; só a base local; os testes deixam a base no estado inicial.                             |
| D08 | A GraphQL mantém-se, conforme a Q3, mas condicionada à validação de segurança G1–G8 antes do staging. | Portão GQL na secção 6. Qualquer fuga de dados bloqueia a progressão.                                           |
| D09 | O fornecedor SMTP e o domínio remetente ficam por decidir até antes do staging.                       | Bloqueia a A7.                                                                                                  |
| D10 | Idiomas pt-AO e pt-BR, com o mecanismo `v(ao, br)` que já existe.                                     | Sem idiomas novos. As mensagens de erro e os estados seguem o mesmo mecanismo.                                  |

Decisões anteriores que continuam em vigor:

- **Q1:** contrato por lista de colunas em `ticket_events`, sem `evidence_ref`.
- **Q2:** o operador atribuído vê o `phone` do requerente.
- **Q3:** a GraphQL mantém-se.
- **D2:** o operador só vê pedidos atribuídos.
- **D10 (M2):** evidência obrigatória em `aceite` e `recusado`.
- **D12:** só o admin reabre um pedido, com motivo.
- **D13:** arranque controlado do primeiro admin.

## 2. Arquitectura e âmbito da V1

### 2.1 Camadas

| Camada         | Localização prevista                                  | Responsabilidade                                                                                  |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Apresentação   | `src/app/cliente/*`, `src/app/interno/*`, componentes | Ecrãs, formulários e estados. Sem regras de autorização próprias.                                 |
| Domínio        | `src/domain/portal/*`                                 | Tipos, esquemas Zod, matriz de transições para a UI e mapeamento SQLSTATE → mensagem pt-AO/pt-BR. |
| Serviços       | `src/services/portal/*`                               | Casos de uso: pedidos, mensagens, consola, administração.                                         |
| Acesso a dados | `src/lib/supabase/*`, `src/lib/portal/dal.ts`         | Clientes Supabase (servidor e navegador) e a DAL: sessão, `sub`, `aal`, perfil e papéis.          |
| Proxy          | `src/proxy.ts`                                        | Só renova a sessão e faz redirecções optimistas. **Não é uma barreira de autorização.**           |

### 2.2 Regras

1. **Escritas só pelas RPCs da M2** (`supabase.rpc`), chamadas a partir de Server Actions. A M3 não dá INSERT nem DELETE a `authenticated`, e o UPDATE é limitado a `profiles` (`full_name`, `phone`, `locale`) e `accounts` (`name`, `country`, `sector`).
2. **Leituras sob a RLS da M3**, com a sessão do utilizador e só a chave publishable. Em `ticket_events` há uma única função de leitura com as colunas fixas `id, ticket_id, actor_id, event_type, from_status, to_status, reason, visibility, created_at`. Nunca se usa `select('*')`.
3. **`evidence_ref` só pela RPC `staff_ticket_events`**, e só na consola.
4. **Sessão:** cookies do `@supabase/ssr`. No servidor usa-se `auth.getClaims()` para obter `sub` e `aal`. Os papéis vêm de `user_roles`, nunca de `user_metadata`.
5. **`cacheComponents`:** o que depende da sessão fica atrás de `<Suspense>`. Proibido usar `use cache` ou `use cache: remote` com dados do utilizador; só `use cache: private`, quando justificado. Depois de cada escrita, a página é actualizada.
6. **Erros:** `PT404` dá «não encontrado» com uma mensagem neutra, sem distinguir «inexistente» de «sem acesso». Os restantes:
   - `PT409`: conflito;
   - `PT422`: regra de negócio;
   - `PT429`: limite;
   - `22023`: validação;
   - `42501`: sem sessão ou sem permissão;
   - `23514` e `23502`: integridade (mensagem genérica);
   - `PGRST116`: «não encontrado» neutro; `PGRST301` e `PGRST303`: sessão expirada.

   Nunca se mostra sucesso antes da resposta da RPC.

7. **Concorrência:** `change_ticket_status` usa sempre `p_expected_status`.
8. **Sem chave privilegiada na V1** (D01). Introduzir uma exige uma decisão nova.

### 2.3 Âmbito funcional

| Funcionalidade                                       | Cliente                                   | Operador (`aal2`)         | Admin (`aal2`)                     |
| ---------------------------------------------------- | ----------------------------------------- | ------------------------- | ---------------------------------- |
| Registo, entrada, recuperação                        | ✔                                         | entrada e recuperação     | entrada e recuperação              |
| MFA TOTP                                             | opcional                                  | obrigatório               | obrigatório                        |
| Pedidos                                              | os da conta; criar                        | só os atribuídos          | todos                              |
| Mensagens                                            | ler e escrever                            | atribuídos                | todos                              |
| Histórico                                            | eventos visíveis ao cliente, com `reason` | todos, sem `evidence_ref` | todos, sem `evidence_ref`          |
| `evidence_ref`                                       | ✘                                         | `staff_ticket_events`     | `staff_ticket_events`              |
| Cancelar                                             | ✔                                         | ✔ (motivo obrigatório)    | ✔                                  |
| Outras transições                                    | ✘                                         | as 16 do staff            | as 16 do staff; reabrir com motivo |
| Notas internas                                       | ✘                                         | atribuídos                | todas                              |
| Atribuição                                           | ✘                                         | ✘                         | `assign_ticket`                    |
| Perfil próprio                                       | ✔                                         | ✔                         | ✔                                  |
| Conta                                                | só o titular                              | ✘                         | ✘                                  |
| Papéis, provisionamento, estado do perfil, auditoria | ✘                                         | ✘                         | ✔                                  |

**Fora da V1:**

- notificações operacionais (D05);
- anexos;
- membros adicionais da conta (L4);
- listagem de provisionamentos (L2);
- anonimização (a RPC recusa `anonimizado`);
- Realtime;
- M3-APP em staging ou produção antes dos portões.

## 3. Lacunas L1–L4

| ID  | Lacuna                                                                                                    | Limitação aceite na V1                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1  | `admin_provision_staff` só regista o provisionamento; o convite (`invited_at`) exige a Admin API do Auth. | O convite é manual no Dashboard (D01), com o procedimento da secção 4.                                                                                                         |
| L2  | `private.staff_provisioning` não é legível pela API e não há RPC de listagem.                             | O admin guarda o `id` devolvido. A reconciliação faz-se por `admin_audit_log` (`staff_provisioned`, `staff_registered` com `provisioning_id`, `staff_provisioning_cancelled`). |
| L3  | A RLS de `profiles` não deixa o cliente ver o perfil do staff.                                            | A autoria aparece como «Equipa KILVORA» (D04). Não há alteração na base.                                                                                                       |
| L4  | O cliente só vê a própria associação e não há RPC para convidar membros.                                  | Contas com um só titular. Os membros existentes, criados só pela base, continuam a ser suportados pela RLS.                                                                    |

## 4. Provisionamento manual de pessoal (D01)

A criação do convite (Auth) e o registo do provisionamento (M2) são **operações separadas e não atómicas**. O comportamento abaixo foi verificado nas funções `admin_provision_staff`, `private.mark_user_invited` e `private.handle_new_user`.

### 4.1 Como a base de dados classifica um novo utilizador

- Quando o Auth cria um utilizador em `auth.users`, o trigger diferido `handle_new_user` classifica-o **nesse momento**.
- Para um **convite**, esse momento é o **envio** do convite, não a aceitação.
- O utilizador é classificado como `interno` só se se verificarem as duas condições:
  1. foi criado por **convite**: o GoTrue grava `invited_at` na mesma transacção, e o trigger `mark_user_invited` regista-o;
  2. existe um provisionamento **pendente** (sem `consumed_at` nem `cancelled_at`, com `expires_at` no futuro) para o **mesmo e-mail normalizado** (minúsculas, sem espaços).
- Em qualquer outro caso, o utilizador fica `cliente` e recebe uma conta pessoal.
- **`profiles.kind` é imutável**, mesmo para `postgres`. As FK `on delete restrict` impedem apagar o utilizador depois de criado o perfil.
- **Um erro de classificação não é reversível pela aplicação.**

### 4.1.1 Evidências (auditoria A0-R1, `main` em `f82afea`)

| Facto                                                                                                     | Referência                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin_provision_staff` só regista o e-mail com validade de 72 h e não cria utilizadores.                 | [M2 L1303](../../supabase/migrations/20261113115533_portal_functions.sql#L1303), [L1335](../../supabase/migrations/20261113115533_portal_functions.sql#L1335)                                                                                                                                                                                                                                                         |
| O convite é marcado por `mark_user_invited` (trigger `auth_user_invited`).                                | [M2 L766](../../supabase/migrations/20261113115533_portal_functions.sql#L766), [L874](../../supabase/migrations/20261113115533_portal_functions.sql#L874)                                                                                                                                                                                                                                                             |
| `kind` é definido uma vez, pelo constraint trigger diferido `auth_user_created`.                          | [M2 L791](../../supabase/migrations/20261113115533_portal_functions.sql#L791), [L881](../../supabase/migrations/20261113115533_portal_functions.sql#L881)                                                                                                                                                                                                                                                             |
| Condições de `interno`: convite com o mesmo par id+e-mail **e** um provisionamento válido.                | [M2 L817](../../supabase/migrations/20261113115533_portal_functions.sql#L817), [L837](../../supabase/migrations/20261113115533_portal_functions.sql#L837), [L842](../../supabase/migrations/20261113115533_portal_functions.sql#L842)                                                                                                                                                                                 |
| A política de inserção do `portal_registrar` repete a condição de forma independente.                     | [M2 L663–L675](../../supabase/migrations/20261113115533_portal_functions.sql#L663)                                                                                                                                                                                                                                                                                                                                    |
| `kind` é imutável, mesmo para `postgres` (trigger `profiles_protect_state`).                              | [M2 L318](../../supabase/migrations/20261113115533_portal_functions.sql#L318), [L352](../../supabase/migrations/20261113115533_portal_functions.sql#L352); teste E8 [L576](../../supabase/tests/database/m2_portal_functions.test.sql#L576)                                                                                                                                                                           |
| `profiles.id → auth.users` com `on delete restrict`; dependências também com `restrict`.                  | [M1 L123](../../supabase/migrations/20261113093521_portal_schema.sql#L123), [L147](../../supabase/migrations/20261113093521_portal_schema.sql#L147), [L162](../../supabase/migrations/20261113093521_portal_schema.sql#L162)                                                                                                                                                                                          |
| Um perfil `cliente` nunca recebe papel de staff; os helpers do staff exigem `kind = 'interno'`.           | [M2 L335](../../supabase/migrations/20261113115533_portal_functions.sql#L335), [L192](../../supabase/migrations/20261113115533_portal_functions.sql#L192), [L211](../../supabase/migrations/20261113115533_portal_functions.sql#L211)                                                                                                                                                                                 |
| A suspensão retira o acesso de cliente (os helpers exigem um perfil `activo`).                            | [M2 L228](../../supabase/migrations/20261113115533_portal_functions.sql#L228), [L246](../../supabase/migrations/20261113115533_portal_functions.sql#L246)                                                                                                                                                                                                                                                             |
| A única recuperação existente é `admin_set_profile_status`, que recusa `anonimizado`.                     | [M2 L1366](../../supabase/migrations/20261113115533_portal_functions.sql#L1366), [L1383](../../supabase/migrations/20261113115533_portal_functions.sql#L1383)                                                                                                                                                                                                                                                         |
| Testes de classificação fechada: público, par diferente, ordem errada, convite a um utilizador existente. | [REG-INV L323](../../supabase/tests/database/m2_portal_functions.test.sql#L323), [REG-PUB L470](../../supabase/tests/database/m2_portal_functions.test.sql#L470), [REG-IMM L480](../../supabase/tests/database/m2_portal_functions.test.sql#L480), [REG-PAIR L491](../../supabase/tests/database/m2_portal_functions.test.sql#L491), [REG-LATE L511](../../supabase/tests/database/m2_portal_functions.test.sql#L511) |

**Classificação do risco F2:**

| Dimensão                    | Nível                                                            |
| --------------------------- | ---------------------------------------------------------------- |
| Segurança                   | **baixo** (falha fechada, sem escalada)                          |
| Probabilidade               | **média** (processo manual e dependente de um e-mail exacto)     |
| Impacto operacional e dados | **médio** (irreversível, e-mail perdido, dados pessoais retidos) |

### 4.2 Sequência obrigatória

| Passo | Quem                      | Acção                                                                                      | Verificação                                                                                           |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1     | Admin (`aal2`) na consola | `admin_provision_staff(email)`. Guardar o `id` devolvido.                                  | Resposta com `id`. Em `admin_audit_log` aparece `staff_provisioned`.                                  |
| 2     | Proprietário no Dashboard | Confirmar que o e-mail **não existe** em Authentication → Users.                           | Se existir, não convidar: ver F4.                                                                     |
| 3     | Proprietário no Dashboard | **Invite user**, com o **mesmo** e-mail, **dentro de 72 h**. Nunca usar «Create new user». | O utilizador aparece como convidado.                                                                  |
| 4     | Admin na consola          | Confirmar a classificação.                                                                 | `admin_audit_log` mostra `staff_registered` com o `provisioning_id` do passo 1. O perfil é `interno`. |
| 5     | Novo membro do staff      | Aceitar o convite, definir a palavra-passe e inscrever o TOTP.                             | Entrada com `aal2`.                                                                                   |
| 6     | Admin (`aal2`)            | `grant_role(user_id, 'operador' \| 'admin')`.                                              | Sem erro. Em `admin_audit_log` aparece a concessão.                                                   |

O papel só deve ser concedido depois dos passos 4 e 5. Sem papel, um perfil `interno` não acede a nada interno.

### 4.3 Estados

| Estado | Descrição                                              | Acesso                                |
| ------ | ------------------------------------------------------ | ------------------------------------- |
| P0     | Sem provisionamento.                                   | —                                     |
| P1     | Provisionamento pendente (máximo 72 h).                | —                                     |
| P2     | Convidado e classificado: perfil `interno`, sem papel. | Nenhum.                               |
| P3     | Convite aceite, TOTP inscrito.                         | Só o próprio perfil.                  |
| P4     | Papel activo.                                          | Consola com `aal2`, conforme o papel. |

### 4.4 Inconsistências possíveis e recuperação segura

| ID  | Situação                                                                                                                       | Efeito                                                                     | Recuperação                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | A RPC do passo 1 falha.                                                                                                        | Nada é criado.                                                             | Corrigir a causa (`22023` e-mail inválido; `PT409` já provisionado) e repetir. **Não convidar.**                                                                          |
| F2  | Convite sem provisionamento, com provisionamento expirado ou cancelado, com e-mail diferente, ou criado com «Create new user». | Utilizador classificado como **cliente**, com conta pessoal. Irreversível. | Contenção parcial, procedimento F2 na secção 4.5. **Não restitui o e-mail nem elimina os dados pessoais.**                                                                |
| F3  | Provisionamento feito, convite não enviado.                                                                                    | Expira ao fim de 72 h.                                                     | Nenhuma acção. Um novo `admin_provision_staff` cancela automaticamente os expirados do mesmo e-mail. Para cancelar antes do prazo: `admin_cancel_staff_provisioning(id)`. |
| F4  | O e-mail já existe no Auth (por exemplo, um cliente).                                                                          | O convite não cria utilizador e o provisionamento fica pendente.           | `admin_cancel_staff_provisioning(id)`. O membro do staff usa outro e-mail. Não converter a conta existente.                                                               |
| F5  | Convidado (P2) nunca aceita.                                                                                                   | Perfil `interno` sem papel e sem acesso.                                   | Inofensivo. Se necessário, `admin_set_profile_status(user_id, 'suspenso')`.                                                                                               |
| F6  | Papel concedido antes da aceitação ou do TOTP.                                                                                 | Sem acesso efectivo enquanto não houver `aal2`.                            | Evitar. Se acontecer, `revoke_role` e reconceder no passo 6.                                                                                                              |
| F7  | Dois admins provisionam o mesmo e-mail.                                                                                        | O segundo recebe `PT409` (há bloqueio consultivo).                         | Usar o `id` do primeiro.                                                                                                                                                  |

### 4.5 Procedimento F2 (contenção actual)

1. **Suspender no portal:** o admin (`aal2`) executa `admin_set_profile_status(user_id, 'suspenso')`. Com isto, o perfil deixa de ver pedidos e a conta, e as RPCs de cliente passam a ser recusadas.
2. **Bloquear no Auth, em separado:** o proprietário bloqueia o utilizador no Supabase Dashboard (Authentication → Users → ban). A suspensão do portal **não** impede a autenticação: o utilizador continua a conseguir entrar e a ler o próprio perfil.
3. **Recomeçar com outro e-mail:** o membro do staff volta ao passo 1 da secção 4.2 com um endereço diferente.
4. **Registar a ocorrência:** id do utilizador, provisionamento, causa, data e responsáveis. A auditoria da base fica íntegra (`user_registered` e `profile_status_changed`).

**Limitações desta contenção:**

- **O e-mail não é restituído.** Fica reservado para sempre no Auth, porque não é possível apagar o utilizador (`restrict`).
- **A conta pessoal fica órfã.** Mantém-se `activa`, sem membros activos, e não há RPC para a arquivar.
- **Os dados pessoais ficam retidos.** O nome e o e-mail ficam guardados e não há anonimização (`anonimizado` é recusado). É um risco de conformidade (LPDP-AO e LGPD) que exige decisão do proprietário.

### 4.6 Mitigação definitiva proposta: M4-BD (pendente de auditoria e aprovação)

**Proposta, não implementação autorizada.** Exigirá especificação, migração e rollback próprios, testes pgTAP e aprovação por portão. Não altera D01–D10.

- **Imediata, sem código:** dupla verificação. Copiar o e-mail exacto da resposta da RPC, convidar logo a seguir, confirmar `staff_registered` em minutos e proibir «Create new user».
- **M4-BD a):** RPC de leitura do estado de um provisionamento por `id`, que fecha a L2.
- **M4-BD b):** eliminação controlada de um registo mal classificado, só quando:
  - o perfil é `cliente` e foi criado há menos de 24 h;
  - não tem pedidos, mensagens nem eventos;
  - é o único membro da conta pessoal;
  - existe um provisionamento correspondente do mesmo admin.

  A ordem é `account_members`, `accounts` e `profiles`, com auditoria; depois, o proprietário apaga o utilizador no Dashboard. **`kind` continua imutável:** corrige-se apagando e voltando a convidar, nunca convertendo.

- **M4-BD c), opcional:** guarda de domínio que recusa ou sinaliza o registo público com o domínio corporativo, prevenindo o F4.
- **Alternativa (exige rever a D01):** uma acção no servidor com a chave secret que provisiona e convida com o mesmo e-mail por construção, com compensação automática se o convite falhar.

### 4.7 Efeito do F2 no plano

- **Não bloqueia a A1–A4:** estas etapas não incluem provisionamento nem alterações na base.
- **Bloqueia a A5** e **qualquer provisionamento real de pessoal**, em qualquer ambiente, até que a mitigação definitiva (secção 4.6) seja aprovada e validada, ou que o proprietário aceite o risco expressamente por escrito.

**Por verificar na A5, em base local:** o comportamento do Dashboard ou do GoTrue ao reenviar um convite a um utilizador ainda não confirmado. A documentação deve ser actualizada com o resultado observado.

## 5. Plano de implementação A1–A8

Cada etapa usa uma branch e um PR próprios, exige os checks obrigatórios `Verify` e `Database (Supabase, pgTAP)` e termina com paragem e aprovação.

| Etapa  | Âmbito                                                                                                                                                                                   | Portão de saída                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **A0** | Este documento.                                                                                                                                                                          | Aprovação das decisões.                                                                                    |
| **A1** | Fundação: clientes Supabase, `proxy.ts` (só refresh e redirecção optimista), DAL, mapeador de erros, Zod, tipos gerados a partir da base local e testes unitários. **Sem UI do portal.** | S1, S2 e S6.                                                                                               |
| **A2** | Autenticação do cliente: `/cliente/entrar`, `/cliente/criar-conta`, `/cliente/recuperar`, callback de confirmação e saída. «Entrar» passa a disponível. E2E com o Mailpit local.         | S1, S2, S3 e E2E de sessões.                                                                               |
| **A3** | Portal do cliente: pedidos (listar, criar, detalhe), mensagens, histórico, cancelamento, perfil e conta.                                                                                 | S3, S4 e S5; E2E de isolamento AO/BR.                                                                      |
| **A4** | Consola em `/interno/*`: inscrição e verificação TOTP, pedidos atribuídos, notas, transições, evidência por RPC.                                                                         | S3, S4, S5 e S7; E2E de MFA.                                                                               |
| **A5** | Administração: atribuição, papéis, provisionamento (secção 4), estado dos perfis, auditoria.                                                                                             | S4, S5 e S7; E2E do admin; procedimento da secção 4 validado localmente; **F2 desbloqueado (secção 4.7)**. |
| **A6** | Validação da GraphQL G1–G8 **só localmente**, com `pg_graphql` activado mediante **autorização específica**. Endurecimento (CSP, cabeçalhos).                                            | Portão GQL.                                                                                                |
| **A7** | Staging: M1–M3 remotas, SMTP (D09), URLs de redireccionamento e testes completos remotos.                                                                                                | Autorização de alterações remotas e plano de rollback; GQL e SMTP aprovados.                               |
| **A8** | Produção.                                                                                                                                                                                | Autorização expressa.                                                                                      |

## 6. Portões de segurança e aceitação

| ID  | Portão                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Nenhum segredo no repositório nem no bundle (`.next/static`). Só `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no cliente.                 |
| S2  | Autorização na DAL de cada página e acção. O `proxy.ts` nunca é a única barreira.                                                                                |
| S3  | Nenhum dado de utilizador em cache partilhada. Teste E2E com dois utilizadores em sequência.                                                                     |
| S4  | Isolamento AO/BR: o acesso por URL directo ao recurso de outra conta dá «não encontrado» neutro.                                                                 |
| S5  | `evidence_ref` e notas internas nunca no HTML nem no payload RSC de clientes. `phone` só para o operador atribuído e o admin (Q2).                               |
| S6  | `npm run verify` verde; os 262 testes pgTAP continuam verdes; nenhuma migração alterada.                                                                         |
| S7  | Staff sem `aal2` é redireccionado para a verificação TOTP e não obtém dados internos (verificado também directamente na API).                                    |
| GQL | G1–G8 aprovados localmente, com evidência. **Qualquer fuga de dados bloqueia a progressão** e exige correcção autorizada antes de qualquer exposição em staging. |

Verificações GraphQL (A6):

| ID  | Verificação                                                              |
| --- | ------------------------------------------------------------------------ |
| G1  | `anon` não obtém nenhuma tabela.                                         |
| G2  | Isolamento AO/BR, incluindo por `node` ou id global e por relações.      |
| G3  | O operador só obtém pedidos atribuídos e perde o acesso na reatribuição. |
| G4  | Staff com `aal1` não obtém nada interno.                                 |
| G5  | `evidence_ref` está ausente do tipo e uma consulta explícita é recusada. |
| G6  | Notas internas inacessíveis ao cliente, mesmo por relações.              |
| G7  | Sem mutações de tabela para além das colunas UPDATE permitidas.          |
| G8  | Sem acesso a `private` nem a `audit_log`.                                |

**Aceitação comum a todas as etapas:**

- CI verde (`Verify` e `Database`);
- E2E do site institucional sem regressões;
- acessibilidade sem violações graves;
- relatório com evidências;
- rollback por reversão do PR (a M3-APP não altera a base).

## 7. Pendências

| Tema         | Pendência                                                                                                                                  | Bloqueia                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| SMTP         | Fornecedor e domínio remetente (D09), com SPF, DKIM e DMARC e os modelos de e-mail de autenticação em pt-AO e pt-BR.                       | A7                        |
| GraphQL      | Autorização para activar `pg_graphql` localmente; G1–G8; verificação de que a GraphQL remota tem o mesmo comportamento.                    | A6 e A7                   |
| Ambientes    | Projecto Supabase de staging; aplicação remota de M1–M3 com rollback; URLs de redireccionamento do Auth por ambiente; variáveis no Vercel. | A7                        |
| Produção     | Arranque do primeiro admin (D13) no ambiente remoto; política de cópias de segurança.                                                      | A8                        |
| F2 / M4-BD   | Auditoria e aprovação da mitigação (secção 4.6); decisão sobre a retenção de dados pessoais de registos mal classificados.                 | A5 e provisionamento real |
| Dependências | Qualquer biblioteca nova (por exemplo, geração de TOTP nos E2E) exige aprovação na etapa respectiva.                                       | A4                        |

**Riscos:**

| Risco                                            | Mitigação                                              |
| ------------------------------------------------ | ------------------------------------------------------ |
| Classificação irreversível do staff (F2)         | Secções 4.2, 4.5 e 4.6; bloqueador da A5 (secção 4.7). |
| Uso indevido de cache com dados do utilizador    | S3.                                                    |
| Tratar o `proxy.ts` como barreira de autorização | S2.                                                    |
| Exposição pela GraphQL                           | Portão GQL.                                            |
| Limite do SMTP por omissão do Supabase           | D09 antes do staging.                                  |

## 8. Critérios para autorizar a A1

1. A0 aprovada, com D01–D10 aceites.
2. `main` limpa e com os checks `Verify` e `Database` obrigatórios no ruleset.
3. Base local com M1–M3 aplicadas e 262/262 PASS.
4. Confirmação de que a A1 **não** inclui:
   - UI do portal;
   - alterações de base de dados;
   - dependências novas;
   - chaves privilegiadas;
   - GraphQL.
5. Plano de ficheiros da A1 apresentado e aprovado antes da escrita: clientes, `proxy.ts`, DAL, domínio e testes.
6. O F2 **não** bloqueia a A1 (secção 4.7). A A1 não pode incluir provisionamento de pessoal.

## 9. Estado de implementação: A1 e A2

### 9.1 A1 — Fundação (integrada, PR #12)

Clientes Supabase de servidor, navegador e proxy (`@supabase/ssr`, só a chave publishable, cookies `Secure` excepto em HTTP de loopback); `proxy.ts` (renovação de sessão e redireccionamento optimista, nunca autorização); DAL (`requireClient` e `requireStaff`, que exige `interno`, `activo`, papel em `user_roles` e `aal2`); mapeamento de erros; esquemas Zod; tipos gerados.

### 9.2 A2 — Autenticação do cliente (concluída localmente)

| ID  | Decisão                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Interruptor `NEXT_PUBLIC_PORTAL_ENABLED`, fixado no build e **desligado por omissão**; activo só com `"true"` e configuração Supabase válida. Desligado: navegação inalterada, `/cliente/*` com 404, proxy inerte e Server Actions recusadas.                                           |
| P2  | Links por e-mail com PKCE e modelos por omissão; o callback aceita `code` e `token_hash`. Modelos pt-AO/pt-BR na A7.                                                                                                                                                                    |
| P3  | E2E com o Supabase local: só `API_URL` e `PUBLISHABLE_KEY`, lidos em memória.                                                                                                                                                                                                           |
| P4  | Limite de e-mails sem alteração: sem SMTP próprio, o limite local não se aplica.                                                                                                                                                                                                        |
| P5  | MFA fora da A2 (A4).                                                                                                                                                                                                                                                                    |
| P6  | Registo com `full_name`, `company` (opcional) e `locale`.                                                                                                                                                                                                                               |
| P7  | Textos da autenticação marcados «Em validação».                                                                                                                                                                                                                                         |
| D-A | Aceite o resíduo imutável `user_registered` (sem dados pessoais) que os E2E deixam em `private.audit_log`; o trigger de imutabilidade nunca é desactivado.                                                                                                                              |
| D-B | Limpeza dos E2E só por `e2e-portal/sql/cleanup.sql`: manual, autorizada, numa transacção com guardas e verificações.                                                                                                                                                                    |
| D-C | **Revista (A2-B2-R2):** a prova de recuperação é o claim `amr` `recovery` do JWT verificado (≤ 600 s, tolerância de 60 s), e não uma marca da aplicação. `require_current_password = true` no Auth impede que uma sessão normal mude a palavra-passe na API sem a palavra-passe actual. |
| D-E | Configuração própria dos E2E do portal: `playwright.portal.config.ts`, `e2e-portal/` e evidências em `e2e-portal-results/`.                                                                                                                                                             |

**Implementação:**

- páginas `/cliente/entrar`, `/cliente/criar-conta`, `/cliente/recuperar`, `/cliente/nova-palavra-passe` e `/cliente` (mínima);
- Server Actions, todas com `assertPortalEnabled()`;
- callback `/cliente/auth/confirmar`: o fluxo é decidido pelos claims verificados e os destinos passam por `safeNext`;
- serviços em `src/services/portal/auth.ts`, sem `redirect()`;
- respostas neutras no registo, na entrada e na recuperação.

### 9.3 Resultados finais da A2

| Verificação                        | Resultado                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                   | 569/569 testes unitários; typecheck, lint, Prettier e build; 19 rotas institucionais estáticas.                                     |
| E2E institucionais                 | 38/38 (portal desligado).                                                                                                           |
| pgTAP                              | 262/262; migrações inalteradas.                                                                                                     |
| E2E reais do portal (B4-D)         | **12/12**: registo e confirmação, entrada e saída, sem enumeração, isolamento (S3), redireccionamentos, recuperação PKCE e cookies. |
| API directa do GoTrue (cenário 09) | Sessão normal sem palavra-passe actual recusada: `400 current_password_required`.                                                   |
| Recuperação PKCE (cenário 10)      | Aceite só com `amr` `recovery` verificado; a palavra-passe antiga deixa de funcionar e o link não pode ser reutilizado.             |
| Limpeza (B4-D-R1)                  | Zero utilizadores sintéticos; REG0 intacta; estrutura idêntica; 4 resíduos imutáveis em `private.audit_log` (D-A).                  |

### 9.4 Riscos residuais e pendências

| Tema                    | Pendência                                                                                                                                                 | Bloqueia |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Configuração alojada    | `require_current_password = true`, confirmações por e-mail, política de palavra-passe e URLs de redireccionamento iguais aos locais, no Supabase alojado. | A7       |
| Domínio e URL do site   | `NEXT_PUBLIC_SITE_URL` em HTTPS e `NEXT_PUBLIC_PORTAL_ENABLED` só no ambiente autorizado. O portal continua desligado em Production até à A7/A8.          | A7/A8    |
| Modelos de e-mail       | Modelos de autenticação em pt-AO/pt-BR (hoje em inglês) e fornecedor SMTP (D09).                                                                          | A7       |
| Autenticação            | MFA/TOTP e consola `/interno` (A4); até lá, staff que entre recebe 404 em `/cliente`. Chaves de assinatura assimétricas ainda inactivas.                  | A4       |
| Funcionalidades futuras | Pedidos, mensagens, conta e perfil (A3); administração e provisionamento (A5, F2).                                                                        | A3, A5   |
| E2E                     | Só locais, fora da CI. Cada execução deixa 2 resíduos imutáveis no `audit_log`. Intervalo mínimo de 5 minutos entre execuções.                            | —        |

### 9.5 A3 — Área do cliente (implementada localmente, por integrar)

Branch `feat/w3-a3-client-portal`. **Sem migrações, sem RPC nem permissões novas, sem dependências novas e sem alterações à A2** (só o tipo de `t()` foi alargado a `Text`).

| Camada   | Ficheiros                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conteúdo | `src/content/portal-client.ts` (pt-AO/pt-BR, provisório «Em validação»; autoria do staff «Equipa KILVORA», D04).                                                                                                       |
| Domínio  | `src/domain/portal/tickets.ts`: estados canceláveis (espelho das transições `cliente` da M2), composição do plano, validação.                                                                                          |
| Serviço  | `src/services/portal/client-portal.ts`: leituras sob RLS com colunas explícitas; escritas por `create_ticket`, `add_ticket_message`, `change_ticket_status` (com `p_expected_status`) e UPDATE das colunas concedidas. |
| Acções   | `src/app/cliente/portal-actions.ts`: interruptor → DAL (`checkClientAccess`) → serviço; `refresh()` só após sucesso.                                                                                                   |
| Páginas  | `/cliente` (pedidos), `/cliente/pedidos/novo`, `/cliente/pedidos/[id]` (detalhe, mensagens, histórico, cancelamento), `/cliente/conta`.                                                                                |

**Planos de website:** no tipo `desenvolvimento_websites` o cliente pode escolher Starter, Business ou Premium (ou «a definir»). O serviço grava no início da descrição um bloco com o plano e os valores lidos de `src/content/websites.ts` (180.000/350.000/650.000 Kz; manutenção 25.000/50.000/100.000 Kz/mês) e a indicação «sujeitos a confirmação comercial». O formulário nunca envia valores. Não há tabela de planos nem preço vinculativo (fotografia em texto, sem contrato de dados novo).

**Segurança:** o cliente nunca envia conta, requerente nem id de conta; o isolamento é da RLS (S4, provado pelos pgTAP X2/X3 e I da M2/M3). Identificador inválido, inexistente ou alheio → o mesmo 404. Sem `evidence_ref`, notas internas, `actor_id`, `author_id`, `requester_id` nem `assigned_operator_id` na interface (S5).

**`instant = false` em `/cliente/pedidos/[id]`:** rota dinâmica sem `generateStaticParams`; o cabeçalho do site lê `usePathname()` e, sem parâmetros conhecidos no build, o pré-render bloqueava (só com o portal activo).

**«Não encontrado» com HTTP 200:** com Cache Components, o `notFound()` decidido em tempo de pedido corre depois de o shell ser enviado; a resposta fica 200 com a página «não encontrado» e `noindex` (docs Next: `loading.md`, «Status codes»). O isolamento exige a mesma resposta neutra para pedido alheio, inexistente e identificador inválido — verificado no E2E A3-04. Um 404 HTTP exigiria verificar acesso no proxy, o que contraria a regra 2.1 (o proxy não é barreira de autorização).

**E2E A3 (S3/S4/S5): 9/9 PASS** (A3-FINAL-R3), com configuração e preparação próprias — `playwright.portal-a3.config.ts` e `e2e-portal-a3/` (`npm run test:e2e:portal:a3`, só com `E2E_PORTAL_RUN=1`); a infraestrutura E2E da A2 não foi alterada. Cenários: contas AO e BR distintas; pedido com plano de website; lista só com os próprios pedidos; acesso cruzado por URL com resposta neutra idêntica; Server Actions adulteradas (mensagem e cancelamento) recusadas; API directa (pedidos, mensagens, histórico, RPC, `evidence_ref`, notas internas); HTML e payload RSC sem campos internos; cancelamento pelo próprio; protecção de sessão e troca de utilizador no mesmo navegador.

**Resíduo aceite (só base local, imutável):** cada execução deixa 2 contas sintéticas (`a3a`, `a3b`) com pedidos, eventos e mensagens que a limpeza D-B não remove. O `globalSetup` da A3 aceita só as execuções registadas em `ACCEPTED_A3_RESIDUE_RUNS` e recusa qualquer outra conta sintética; confirma também a REG0. **Consequência:** o `globalSetup` da A2 recusa arrancar enquanto existirem contas sintéticas, pelo que os E2E da A2 ficam bloqueados na base local actual até nova decisão.

### 9.6 A4 — Consola interna e MFA (implementada localmente, E2E pendente)

Branch `feat/w3-a4-operator-console`. **Sem migrações, RPC, RLS, privilégios ou dependências novas; A2 inalterada.**

| Camada   | Ficheiros                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domínio  | `src/domain/portal/staff.ts`: espelho das 16 transições `staff` da M2 (testado contra a migração), validação de transição, nota e código TOTP.                                                         |
| Serviços | `src/services/portal/staff-console.ts` (leituras sob RLS; `evidence_ref` só por `staff_ticket_events`; RPCs da M2) e `src/services/portal/mfa.ts` (API MFA do Auth).                                   |
| DAL      | `requireConsoleStaff` (sem `aal2` → `/interno/mfa`; não staff → 404 neutro) e `requireStaffPendingMfa`.                                                                                                |
| Páginas  | `/interno` (atribuídos ou todos para o admin), `/interno/mfa` (inscrição e verificação TOTP), `/interno/pedidos/[id]` (requerente com `phone`, mensagens, notas, transições, histórico com evidência). |

Reabertura e atribuição ficam na A5. A entrada reutiliza `/cliente/entrar?next=/interno` (A2).

**E2E A4: 9/9 PASS** (A4-FINAL), numa instância Supabase LOCAL ISOLADA (`project_id = kilvora_e2e_a4`, portas 55xxx, volumes próprios, só M1–M3), sem tocar na instância principal (REG0 intacta, zero diferenças). Preparação única por `e2e-portal-a4/prepare.ts`: D13 (scripts `supabase/ops`, fases A e B) → convites pelo Auth → TOTP → `admin_provision_staff` → `grant_role('operador')`; a chave privilegiada local só existe em memória nesse processo. O op1 recebe o papel antes do TOTP (F6, sem acesso efectivo sem `aal2`) para o E2E testar a inscrição. Configuração própria: `playwright.portal-a4.config.ts` (`npm run test:e2e:portal:a4`, com `E2E_PORTAL_RUN=1` e `E2E_A4_FIXTURES`); TOTP gerado com `node:crypto` (sem dependências).

Cenários: `/interno` sem sessão → entrada; cliente → «não encontrado» na consola e na MFA; atribuição pelo admin só com `aal2`; op1 sem `aal2` redireccionado para a MFA e sem dados na API; inscrição TOTP (código errado recusado) até `aal2`; transições até `aceite` com evidência obrigatória; mensagem e nota interna; op1 sem acesso ao pedido não atribuído (UI e RPC); op2 sem acesso a pedidos de outro operador; admin vê todos, notas e evidência; cliente vê o progresso e a «Equipa KILVORA», sem notas, evidência, ids de staff nem `evidence_ref` (HTML, RSC e API).

**Resíduo (só na instância isolada):** 4 utilizadores sintéticos (admin, 2 operadores, 1 cliente), arranque D13, 2 pedidos com eventos, 1 mensagem, 1 nota e auditoria. A instância principal não tem arranque D13.

### 9.7 A5 — Administração (implementada localmente, por integrar)

Branch `feat/w3-a5-admin`. **Sem migrações, RPC, RLS, privilégios ou dependências novas; A1–A4 reutilizadas** (acréscimos: motivos de erro das RPCs administrativas em `errors.ts`, `assignedOperatorId` no detalhe da consola, instância isolada parametrizável nos auxiliares E2E da A4).

| Funcionalidade  | Implementação                                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equipa          | `/interno/admin`: perfis internos com papéis activos; dar papel (`grant_role`), retirar (`revoke_role`, com desatribuição automática dos pedidos do operador), suspender/reactivar (`admin_set_profile_status`). Sem acções sobre o próprio perfil. |
| Clientes        | Mesma página: suspender/reactivar (contenção F2, secção 4.5).                                                                                                                                                                                       |
| Provisionamento | `admin_provision_staff` (mostra o `id` a guardar, L2) e `admin_cancel_staff_provisioning`, com o aviso F2 e o procedimento da secção 4.2. O convite continua manual no Dashboard (D01).                                                             |
| Pedidos         | No detalhe da consola, só para o admin: atribuição/reatribuição/retirada (`assign_ticket`) e reabertura com motivo (`reopen_ticket`, D12).                                                                                                          |
| Auditoria       | `/interno/admin/auditoria`: `admin_audit_log` (100 entradas), filtro por tipo de entidade (lista da M2) e identificador.                                                                                                                            |

Todas as acções: interruptor → DAL `checkStaffAccess(["admin"])` (operador → recusa neutra; sem `aal2` → MFA) → RPC da M2 (admin `aal2`, auto-acção e último admin recusados, auditoria na mesma transacção).

**E2E A5: 9/9 PASS** numa instância Supabase local isolada própria (`kilvora_e2e_a5`, portas 56xxx), preparada com `e2e-portal-a4/prepare.ts` (`E2E_ISOLATED_PROJECT_ID`, `E2E_ISOLATED_API_URL`); configuração `playwright.portal-a5.config.ts` (`npm run test:e2e:portal:a5`). Base principal sem diferenças e REG0 intacta.

**F2 (secção 4.7):** a A5 inclui o provisionamento de pessoal. A integração e qualquer provisionamento real exigem a decisão do proprietário: aceitação escrita do risco F2 ou aprovação da M4-BD (secção 4.6).
