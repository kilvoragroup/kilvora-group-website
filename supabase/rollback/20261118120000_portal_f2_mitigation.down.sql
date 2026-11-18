-- =============================================================================
-- KILVORA GROUP — Portal de Clientes V1
-- Reversão da M4-BD (20261118120000_portal_f2_mitigation). APENAS AMBIENTE LOCAL.
-- Repõe o estado exacto da M3: sem gatilho de factos de convite, sem RPCs F2, sem
-- DELETE para portal_definer. Não altera nenhum objecto da M1–M3 (handle_new_user e
-- mark_user_invited nunca foram tocados pela M4). Perde apenas os factos de convite.
--
-- Execução (PowerShell), só com autorização expressa:
--   Get-Content -Encoding UTF8 supabase\rollback\20261118120000_portal_f2_mitigation.down.sql |
--     docker exec -i <contentor_db_local> psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f -
--   npx.cmd supabase migration repair --status reverted 20261118120000 --local
--
-- Regras: sem CASCADE, sem IF EXISTS, sem DROP OWNED BY, sem db reset.
-- Transacção única explícita: qualquer erro reverte tudo.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

do $guard$
begin
  if current_user <> 'postgres' then
    raise exception 'Reversão M4: executar como postgres (actual: %)', current_user;
  end if;
  if to_regclass('private.auth_invite_facts') is null
     or to_regprocedure('public.admin_remove_misclassified_registration(uuid,bigint)') is null then
    raise exception 'Reversão M4: a M4 não está aplicada';
  end if;
end
$guard$;

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

-- Tabela de factos (políticas e privilégios caem com a tabela; gatilhos próprios também).
drop policy portal_definer_select on private.auth_invite_facts;
drop policy portal_registrar_insert on private.auth_invite_facts;
drop policy portal_registrar_select on private.auth_invite_facts;
revoke all on private.auth_invite_facts from portal_definer, portal_registrar;
drop table private.auth_invite_facts;

do $verify$
begin
  if to_regclass('private.auth_invite_facts') is not null
     or to_regprocedure('private.record_auth_invite()') is not null
     or exists (select 1 from pg_catalog.pg_trigger where tgname = 'auth_user_invite_fact')
     or exists (select 1 from pg_catalog.pg_policies where policyname = 'portal_definer_delete')
     or has_table_privilege('portal_definer', 'public.profiles', 'DELETE')
     or has_table_privilege('portal_definer', 'public.accounts', 'DELETE')
     or has_table_privilege('portal_definer', 'public.account_members', 'DELETE')
     or has_column_privilege('portal_definer', 'public.profiles', 'created_at', 'SELECT')
     or has_column_privilege('portal_definer', 'public.accounts', 'created_by', 'SELECT') then
    raise exception 'Reversão M4: verificação final falhou';
  end if;
end
$verify$;

commit;
