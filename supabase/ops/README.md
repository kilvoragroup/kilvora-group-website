# Operações controladas do portal (`supabase/ops/`)

Scripts executados **manualmente pelo proprietário**, como `postgres`, com autorização expressa para cada ambiente. Não são migrações e não fazem parte de `supabase test db`. Não há nenhum endpoint público equivalente.

## Arranque do primeiro administrador

| Ordem | Script                            | Efeito                                                                                             |
| ----- | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| 0     | `bootstrap_admin_status.sql`      | Só leitura: estado do arranque, provisionamentos (e-mail mascarado), e-mail confirmado, TOTP       |
| 1     | `bootstrap_admin_1_provision.sql` | Fase A: provisionamento de arranque (72 h), com auditoria. Requer `-v email=...`                   |
| —     | Dashboard → Invite user           | Convite ao mesmo e-mail, **só depois do COMMIT da fase A**                                         |
| —     | Primeiro acesso da pessoa         | Confirma o e-mail e regista TOTP                                                                   |
| 2     | `bootstrap_admin_2_grant.sql`     | Fase B: papel `admin`, `system_bootstrap` e auditoria numa só transacção; exige TOTP verificado    |
| (x)   | `bootstrap_admin_0_abort.sql`     | Só se o arranque foi consumido pela pessoa errada: suspende esse perfil e permite repetir a fase A |

Exemplo local (PowerShell):

```powershell
Get-Content -Encoding UTF8 supabase\ops\bootstrap_admin_status.sql |
  docker exec -i supabase_db_Kilvora_Group_Website psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f -
```

Garantias aplicadas pela base de dados (M2): no máximo um arranque (`private.system_bootstrap`), bloqueio consultivo `kilvora.admin_set`, coerência entre papel, arranque e auditoria verificada no COMMIT, e recusa de `granted_by`/`provisioned_by` nulos depois do arranque.

Depois do arranque, provisionar logo um segundo admin pela aplicação: não existe segundo arranque.

## Regras de operação

- Proibido `supabase db reset --linked` / `--db-url` nos ambientes do portal: os papéis do cluster sobrevivem e a M1 recusa adoptá-los (O1).
- Nenhum script aqui é executado por CI.
