-- =============================================================================================
-- Limpeza dos dados SINTÉTICOS dos E2E do portal (A2-B4) — base LOCAL apenas.
--
-- NÃO É EXECUTADO AUTOMATICAMENTE. Execução manual, só com autorização expressa (decisão D-B),
-- depois de rever o relatório `e2e-portal-results/evidence/integrity.json`:
--
--   docker exec -i supabase_db_Kilvora_Group_Website \
--     psql -U postgres -d postgres -X -1 -v ON_ERROR_STOP=1 -v confirm=APAGAR_E2E_LOCAL -f - \
--     < e2e-portal/sql/cleanup.sql
--
-- Garantias:
-- * Uma única transacção (`-1`): qualquer guarda ou verificação falhada desfaz TUDO.
-- * Âmbito fechado: só utilizadores `e2e-<execução>-<rótulo>@e2e.example.test`.
-- * Guardas: nenhum desses perfis é `interno`, tem papéis, provisionamentos, pedidos,
--   mensagens, eventos ou notas; cada conta pessoal tem um único membro (o próprio).
-- * Ordem de remoção imposta pelas FK `restrict`: account_members → accounts → profiles →
--   tabelas do Auth sem FK → auth.users (cascata: identities, sessions → refresh_tokens e
--   mfa_amr_claims, mfa_factors, one_time_tokens).
-- * `private.audit_log` é IMUTÁVEL (trigger `audit_log_immutable`) e NÃO é tocado: as linhas
--   `user_registered` destes utilizadores ficam como resíduo permanente. Contêm só o id do
--   utilizador e `{kind, account_id}` — sem e-mail nem nome (decisão D-A, opção 1).
-- * Verificações finais na mesma transacção: zero utilizadores sintéticos, zero órfãos no grafo
--   de FK do portal, utilizadores não sintéticos e `audit_log` inalterados.
-- =============================================================================================

\if :{?confirm}
\else
  \echo 'Recusado: falta -v confirm=APAGAR_E2E_LOCAL'
  \quit 3
\endif

select (:'confirm' = 'APAGAR_E2E_LOCAL') as confirmed \gset
\if :confirmed
\else
  \echo 'Recusado: confirmação inválida.'
  \quit 3
\endif

create temp table e2e_users on commit drop as
  select u.id, lower(u.email) as email
  from auth.users u
  where lower(u.email) ~ '^e2e-[a-z0-9]+-[a-z0-9]+@e2e\.example\.test$';

create temp table e2e_accounts on commit drop as
  select a.id from public.accounts a where a.created_by in (select id from e2e_users);

create temp table e2e_before on commit drop as
  select
    (select count(*) from auth.users where id not in (select id from e2e_users)) as other_users,
    (select count(*) from private.audit_log) as audit_rows,
    (select count(*) from e2e_users) as synthetic_users;

-- ---------------------------------------------------------------------------------------------
-- Guardas (abortam e desfazem tudo)
-- ---------------------------------------------------------------------------------------------
do $guards$
declare
  ids uuid[] := array(select id from e2e_users);
begin
  if exists (select 1 from public.profiles where id = any(ids) and kind <> 'cliente') then
    raise exception 'guarda: perfil sintético não é cliente';
  end if;
  if exists (select 1 from public.user_roles
             where user_id = any(ids) or granted_by = any(ids) or revoked_by = any(ids)) then
    raise exception 'guarda: perfil sintético com papéis';
  end if;
  if exists (select 1 from private.staff_provisioning
             where provisioned_by = any(ids) or consumed_user_id = any(ids)
                or cancelled_by = any(ids)) then
    raise exception 'guarda: perfil sintético em provisionamentos';
  end if;
  if exists (select 1 from private.system_bootstrap where admin_user_id = any(ids)) then
    raise exception 'guarda: perfil sintético no arranque do sistema';
  end if;
  if exists (select 1 from public.tickets
             where requester_id = any(ids) or assigned_operator_id = any(ids)
                or account_id in (select id from e2e_accounts)) then
    raise exception 'guarda: perfil sintético com pedidos';
  end if;
  if exists (select 1 from public.ticket_events where actor_id = any(ids))
     or exists (select 1 from public.ticket_messages where author_id = any(ids))
     or exists (select 1 from public.ticket_internal_notes where author_id = any(ids)) then
    raise exception 'guarda: perfil sintético com histórico, mensagens ou notas';
  end if;
  if exists (select 1 from public.account_members m
             where m.account_id in (select id from e2e_accounts) and not (m.user_id = any(ids))) then
    raise exception 'guarda: conta sintética com membros não sintéticos';
  end if;
  if exists (select 1 from public.account_members m
             where m.user_id = any(ids) and m.account_id not in (select id from e2e_accounts)) then
    raise exception 'guarda: utilizador sintético membro de conta não sintética';
  end if;
end
$guards$;

-- ---------------------------------------------------------------------------------------------
-- Remoção (ordem imposta pelas FK)
-- ---------------------------------------------------------------------------------------------
delete from public.account_members where account_id in (select id from e2e_accounts);
delete from public.accounts where id in (select id from e2e_accounts);
delete from public.profiles where id in (select id from e2e_users);

delete from auth.flow_state where user_id in (select id from e2e_users);
delete from auth.refresh_tokens where user_id in (select id::text from e2e_users);
delete from auth.audit_log_entries
  where payload::text ~ 'e2e-[a-z0-9]+-[a-z0-9]+@e2e\.example\.test';
delete from auth.users where id in (select id from e2e_users);

-- ---------------------------------------------------------------------------------------------
-- Verificações (abortam e desfazem tudo)
-- ---------------------------------------------------------------------------------------------
do $checks$
declare
  ids uuid[] := array(select id from e2e_users);
  b record;
begin
  select * into b from e2e_before;

  if exists (select 1 from auth.users where id = any(ids)) then
    raise exception 'verificação: utilizadores sintéticos remanescentes';
  end if;
  if (select count(*) from auth.users) <> b.other_users then
    raise exception 'verificação: utilizadores não sintéticos alterados';
  end if;
  if (select count(*) from private.audit_log) <> b.audit_rows then
    raise exception 'verificação: audit_log alterado (deve ser imutável)';
  end if;

  -- Resíduos do Auth ligados aos ids removidos.
  if exists (select 1 from auth.identities where user_id = any(ids))
     or exists (select 1 from auth.sessions where user_id = any(ids))
     or exists (select 1 from auth.mfa_factors where user_id = any(ids))
     or exists (select 1 from auth.one_time_tokens where user_id = any(ids))
     or exists (select 1 from auth.flow_state where user_id = any(ids)) then
    raise exception 'verificação: resíduos no Auth';
  end if;

  -- Integridade referencial do portal (órfãos em todo o grafo, não só nos sintéticos).
  if exists (select 1 from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id))
     or exists (select 1 from public.accounts a where not exists (select 1 from public.profiles p where p.id = a.created_by))
     or exists (select 1 from public.account_members m where not exists (select 1 from public.accounts a where a.id = m.account_id))
     or exists (select 1 from public.account_members m where not exists (select 1 from public.profiles p where p.id = m.user_id))
     or exists (select 1 from public.user_roles r where not exists (select 1 from public.profiles p where p.id = r.user_id))
     or exists (select 1 from public.tickets t where not exists (select 1 from public.profiles p where p.id = t.requester_id))
     or exists (select 1 from public.tickets t where not exists (select 1 from public.accounts a where a.id = t.account_id)) then
    raise exception 'verificação: órfãos no grafo do portal';
  end if;
end
$checks$;

-- Resumo (sem e-mails nem ids).
select
  (select synthetic_users from e2e_before) as utilizadores_sinteticos_removidos,
  (select count(*) from private.audit_log a
     where a.action = 'user_registered'
       and a.entity_id in (select id::text from e2e_users)) as residuo_audit_log_imutavel;
