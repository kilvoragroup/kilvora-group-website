-- =============================================================================
-- KILVORA GROUP — Portal de Clientes V1
-- Reversão da M4-BD (20261118120000_portal_f2_mitigation) — VARIANTE PARA O SUPABASE ALOJADO.
-- Mesmo efeito que 20261118120000_portal_f2_mitigation.down.sql (que se mantém para o psql
-- local), mas compatível com `supabase db query`: sem comandos do psql (`\set`); o ficheiro é
-- enviado como uma única mensagem e corre numa transacção explícita.
--
-- Papel: a CLI liga-se como `cli_login_postgres` (NOINHERIT, membro de `postgres` com SET).
-- `SET LOCAL ROLE postgres` assume `postgres` só nesta transacção; as guardas confirmam o papel
-- de sessão autorizado e o papel efectivo antes de qualquer alteração.
--
-- Execução, só com autorização expressa e plano aprovado:
--   npx.cmd supabase db query --remote=kxuxsmsqlbjpiccugquq -f supabase\rollback\20261118120000_portal_f2_mitigation.hosted.down.sql --yes
--   npx.cmd supabase migration repair --status reverted 20261118120000 --remote=kxuxsmsqlbjpiccugquq
--
-- Âmbito declarado da perda: só os factos de convite (`private.auth_invite_facts`, user_id e
-- invited_at, sem e-mail). A auditoria, os perfis, as contas e todos os outros dados ficam
-- intactos (verificado antes do COMMIT).
-- Regras: sem CASCADE, sem IF EXISTS, sem DROP OWNED BY, sem db reset. Qualquer erro reverte tudo.
-- =============================================================================

begin;

set local role postgres;

do $guard$
begin
  if session_user not in ('cli_login_postgres', 'postgres') then
    raise exception 'Reversão M4 (alojado): papel de sessão não autorizado (%)', session_user;
  end if;
  if current_user <> 'postgres' then
    raise exception 'Reversão M4 (alojado): executar como postgres (actual: %)', current_user;
  end if;
  if to_regclass('private.auth_invite_facts') is null
     or to_regprocedure('public.admin_remove_misclassified_registration(uuid,bigint)') is null
     or to_regprocedure('public.admin_staff_provisioning_status(bigint)') is null
     or to_regprocedure('private.record_auth_invite()') is null then
    raise exception 'Reversão M4 (alojado): a M4 não está aplicada (ou está incompleta)';
  end if;
end
$guard$;

-- Referência dos dados que NÃO podem mudar (verificada no fim, antes do COMMIT).
create temp table m4_rollback_before on commit drop as
  select (select count(*) from auth.users)               as auth_users,
         (select count(*) from public.profiles)          as profiles,
         (select count(*) from public.accounts)          as accounts,
         (select count(*) from public.account_members)   as account_members,
         (select count(*) from public.user_roles)        as user_roles,
         (select count(*) from public.tickets)           as tickets,
         (select count(*) from public.ticket_events)     as ticket_events,
         (select count(*) from public.ticket_messages)   as ticket_messages,
         (select count(*) from private.staff_provisioning) as staff_provisioning,
         (select count(*) from private.system_bootstrap) as system_bootstrap,
         (select count(*) from private.audit_log)        as audit_log,
         (select max(id) from private.audit_log)         as audit_max_id,
         (select count(*) from private.auth_invite_facts) as invite_facts_discarded;

-- Gatilho em auth.users e função de registo dos factos.
drop trigger auth_user_invite_fact on auth.users;
drop function private.record_auth_invite();

-- RPCs F2.
drop function public.admin_remove_misclassified_registration(uuid, bigint);
drop function public.admin_staff_provisioning_status(bigint);

-- Políticas e privilégios de portal_definer.
drop policy portal_definer_delete on public.profiles;
drop policy portal_definer_delete on public.accounts;
drop policy portal_definer_delete on public.account_members;
revoke delete on public.profiles from portal_definer;
revoke delete on public.accounts from portal_definer;
revoke delete on public.account_members from portal_definer;
revoke select (created_at) on public.profiles from portal_definer;
revoke select (created_by) on public.accounts from portal_definer;

-- Tabela de factos (perda declarada).
drop policy portal_definer_select on private.auth_invite_facts;
drop policy portal_registrar_insert on private.auth_invite_facts;
drop policy portal_registrar_select on private.auth_invite_facts;
revoke all on private.auth_invite_facts from portal_definer, portal_registrar;
drop table private.auth_invite_facts;

do $verify$
declare
  b record;
begin
  select * into b from m4_rollback_before;
  -- Estrutura: nenhum objecto ou privilégio da M4 residual.
  if to_regclass('private.auth_invite_facts') is not null
     or to_regprocedure('private.record_auth_invite()') is not null
     or to_regprocedure('public.admin_remove_misclassified_registration(uuid,bigint)') is not null
     or to_regprocedure('public.admin_staff_provisioning_status(bigint)') is not null
     or exists (select 1 from pg_catalog.pg_trigger where tgname = 'auth_user_invite_fact')
     or exists (select 1 from pg_catalog.pg_policies where policyname = 'portal_definer_delete')
     or has_table_privilege('portal_definer', 'public.profiles', 'DELETE')
     or has_table_privilege('portal_definer', 'public.accounts', 'DELETE')
     or has_table_privilege('portal_definer', 'public.account_members', 'DELETE')
     or has_column_privilege('portal_definer', 'public.profiles', 'created_at', 'SELECT')
     or has_column_privilege('portal_definer', 'public.accounts', 'created_by', 'SELECT') then
    raise exception 'Reversão M4 (alojado): verificação estrutural falhou';
  end if;
  -- Dados: nada fora do âmbito declarado foi alterado.
  if (select count(*) from auth.users) <> b.auth_users
     or (select count(*) from public.profiles) <> b.profiles
     or (select count(*) from public.accounts) <> b.accounts
     or (select count(*) from public.account_members) <> b.account_members
     or (select count(*) from public.user_roles) <> b.user_roles
     or (select count(*) from public.tickets) <> b.tickets
     or (select count(*) from public.ticket_events) <> b.ticket_events
     or (select count(*) from public.ticket_messages) <> b.ticket_messages
     or (select count(*) from private.staff_provisioning) <> b.staff_provisioning
     or (select count(*) from private.system_bootstrap) <> b.system_bootstrap
     or (select count(*) from private.audit_log) <> b.audit_log
     or (select max(id) from private.audit_log) is distinct from b.audit_max_id then
    raise exception 'Reversão M4 (alojado): dados fora do âmbito alterados';
  end if;
  raise notice 'Reversão M4 (alojado): concluída; factos de convite descartados: %', b.invite_facts_discarded;
end
$verify$;

commit;
