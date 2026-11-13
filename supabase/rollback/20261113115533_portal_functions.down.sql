-- =============================================================================
-- KILVORA GROUP — Portal de Clientes V1
-- Reversão da M2 (20261113115533_portal_functions). APENAS AMBIENTE LOCAL.
-- Repõe o estado exacto da M1; não altera nem remove objectos da M1.
--
-- Execução (PowerShell), só com autorização expressa:
--   Get-Content -Encoding UTF8 supabase\rollback\20261113115533_portal_functions.down.sql |
--     docker exec -i supabase_db_Kilvora_Group_Website psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f -
--   npx.cmd supabase migration repair --status reverted 20261113115533
--
-- Se existir arranque concluído (system_bootstrap) a reversão é recusada, salvo
-- se for passado explicitamente  -v allow_data_loss=1.
--
-- Regras: sem CASCADE, sem IF EXISTS, sem DROP OWNED BY, sem db reset.
-- Transacção única explícita: qualquer erro reverte tudo.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

\if :{?allow_data_loss}
select pg_catalog.set_config('kilvora.allow_data_loss', :'allow_data_loss', true);
\endif

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
do $guard$
begin
  if current_user <> 'postgres' then
    raise exception 'Reversão M2: executar como postgres (actual: %)', current_user;
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Reversão M2: histórico de migrações inexistente';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261113115533') then
    raise exception 'Reversão M2: a versão 20261113115533 não está registada como aplicada';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261113115533') then
    raise exception 'Reversão M2: existem migrações posteriores aplicadas; reverter primeiro essas';
  end if;
  if exists (select 1 from private.system_bootstrap)
     and coalesce(current_setting('kilvora.allow_data_loss', true), '') <> '1' then
    raise exception 'Reversão M2: arranque concluído em system_bootstrap; usar -v allow_data_loss=1 para confirmar';
  end if;
  if (select count(*) from private.ticket_transitions) <> 24 then
    raise exception 'Reversão M2: matriz de transições divergente do estado da M2';
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Triggers de registo em auth.users (desbloqueia registos primeiro)
-- -----------------------------------------------------------------------------
drop trigger auth_user_created on auth.users;
drop trigger auth_user_invited on auth.users;

-- -----------------------------------------------------------------------------
-- 2. RPCs e funções internas do portal_definer / portal_registrar
-- -----------------------------------------------------------------------------
drop function public.staff_ticket_events(uuid);
drop function public.admin_audit_log(text, text, timestamptz, integer);
drop function public.admin_set_profile_status(uuid, public.profile_status);
drop function public.admin_cancel_staff_provisioning(bigint);
drop function public.admin_provision_staff(text);
drop function public.revoke_role(uuid, public.staff_role);
drop function public.grant_role(uuid, public.staff_role);
drop function public.assign_ticket(uuid, uuid);
drop function public.reopen_ticket(uuid, text);
drop function public.change_ticket_status(uuid, public.ticket_status, text, text, public.ticket_status);
drop function public.add_internal_note(uuid, text);
drop function public.add_ticket_message(uuid, text);
drop function public.create_ticket(public.ticket_type, text, text);
drop function private.handle_new_user();
drop function private.mark_user_invited();
drop function private.next_ticket_reference();
drop function private.write_audit(text, text, text, jsonb, jsonb);
drop function private.require_user();

-- -----------------------------------------------------------------------------
-- 3. Políticas (antes das funções auxiliares que referem)
-- -----------------------------------------------------------------------------
drop policy portal_registrar_insert on private.audit_log;
drop policy portal_registrar_update on private.staff_provisioning;
drop policy portal_registrar_select on private.staff_provisioning;
drop policy portal_registrar_insert on public.account_members;
drop policy portal_registrar_insert on public.accounts;
drop policy portal_registrar_insert on public.profiles;

drop policy portal_definer_update on private.staff_provisioning;
drop policy portal_definer_insert on private.staff_provisioning;
drop policy portal_definer_select on private.staff_provisioning;
drop policy portal_definer_select on private.ticket_transitions;
drop policy portal_definer_insert on private.audit_log;
drop policy portal_definer_select on private.audit_log;
drop policy portal_definer_insert on public.ticket_internal_notes;
drop policy portal_definer_select on public.ticket_internal_notes;
drop policy portal_definer_insert on public.ticket_messages;
drop policy portal_definer_select on public.ticket_messages;
drop policy portal_definer_insert on public.ticket_events;
drop policy portal_definer_select on public.ticket_events;
drop policy portal_definer_update on public.tickets;
drop policy portal_definer_insert on public.tickets;
drop policy portal_definer_select on public.tickets;
drop policy portal_definer_update on public.user_roles;
drop policy portal_definer_insert on public.user_roles;
drop policy portal_definer_select on public.user_roles;
drop policy portal_definer_select on public.account_members;
drop policy portal_definer_select on public.accounts;
drop policy portal_definer_update on public.profiles;
drop policy portal_definer_select on public.profiles;

drop policy portal_guard_read on public.tickets;
drop policy portal_guard_read on public.user_roles;
drop policy portal_guard_read on public.account_members;
drop policy portal_guard_read on public.profiles;

-- -----------------------------------------------------------------------------
-- 4. Triggers e objectos do arranque e de protecção
-- -----------------------------------------------------------------------------
drop trigger user_roles_bootstrap_coherence on public.user_roles;
drop trigger staff_provisioning_guard_bootstrap on private.staff_provisioning;
drop trigger user_roles_guard_bootstrap on public.user_roles;
drop trigger user_roles_enforce_target on public.user_roles;
drop trigger profiles_protect_state on public.profiles;
drop trigger tickets_protect_state on public.tickets;
drop table private.system_bootstrap;  -- os seus triggers caem com a tabela

drop function private.check_bootstrap_coherence();
drop function private.guard_bootstrap_nulls();
drop function private.enforce_staff_role_target();
drop function private.protect_profile_state();
drop function private.protect_ticket_state();

-- -----------------------------------------------------------------------------
-- 5. Funções auxiliares (portal_guard) e funções JWT
-- -----------------------------------------------------------------------------
drop function private.can_view_ticket(uuid);
drop function private.is_assigned(uuid);
drop function private.is_account_owner(uuid);
drop function private.is_account_member(uuid);
drop function private.is_admin();
drop function private.is_staff();
drop function private.jwt_role();
drop function private.jwt_aal();
drop function private.jwt_sub();
drop function private.jwt_claims();

-- -----------------------------------------------------------------------------
-- 6. Matriz de transições (dados carregados pela M2)
-- -----------------------------------------------------------------------------
delete from private.ticket_transitions;

-- -----------------------------------------------------------------------------
-- 7. Privilégios concedidos pela M2 (REVOKE em tabela remove também os de coluna)
-- -----------------------------------------------------------------------------
revoke all on table public.profiles from portal_guard, portal_definer, portal_registrar;
revoke all on table public.accounts from portal_definer, portal_registrar;
revoke all on table public.account_members from portal_guard, portal_definer, portal_registrar;
revoke all on table public.user_roles from portal_guard, portal_definer;
revoke all on table public.tickets from portal_guard, portal_definer;
revoke all on table public.ticket_events from portal_definer;
revoke all on table public.ticket_messages from portal_definer;
revoke all on table public.ticket_internal_notes from portal_definer;
revoke all on table private.audit_log from portal_definer, portal_registrar;
revoke all on table private.ticket_transitions from portal_definer;
revoke all on table private.staff_provisioning from portal_definer, portal_registrar;
revoke all on sequence private.ticket_reference_seq from portal_definer;
revoke all on schema private from portal_guard, portal_definer, portal_registrar;

-- -----------------------------------------------------------------------------
-- 8. Inventário e remoção de portal_registrar (sem revogar a pertença antes:
--    o DROP ROLE exige o ADMIN OPTION que essa pertença confere)
-- -----------------------------------------------------------------------------
do $inventory$
declare
  v_list text;
begin
  select string_agg(
           pg_catalog.format('%s: %s classid=%s objid=%s deptype=%s',
             coalesce(db.datname, '(global)'), r.rolname, d.classid::regclass, d.objid, d.deptype),
           '; ')
    into v_list
  from pg_catalog.pg_shdepend d
  join pg_catalog.pg_roles r on r.oid = d.refobjid
  left join pg_catalog.pg_database db on db.oid = d.dbid
  where d.refclassid = 'pg_catalog.pg_authid'::regclass
    and r.rolname in ('portal_guard', 'portal_definer', 'portal_registrar');
  if v_list is not null then
    raise exception 'Reversão M2: dependências remanescentes dos papéis do portal: %', v_list;
  end if;

  select string_agg(r.rolname || '<-' || m.rolname, ', ') into v_list
  from pg_catalog.pg_auth_members am
  join pg_catalog.pg_roles r on r.oid = am.roleid
  join pg_catalog.pg_roles m on m.oid = am.member
  where (r.rolname = 'portal_registrar' and m.rolname <> 'postgres')
     or m.rolname = 'portal_registrar';
  if v_list is not null then
    raise exception 'Reversão M2: pertenças inesperadas de portal_registrar: %', v_list;
  end if;
end
$inventory$;

drop role portal_registrar;

-- -----------------------------------------------------------------------------
-- 9. Verificação final: estado idêntico ao da M1
-- -----------------------------------------------------------------------------
do $final$
declare
  v_list text;
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'portal_registrar') then
    raise exception 'Reversão M2: portal_registrar ainda existe';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.oid not in ('private.set_updated_at()'::regprocedure, 'private.reject_mutation()'::regprocedure);
  if v_list is not null then
    raise exception 'Reversão M2: funções remanescentes: %', v_list;
  end if;
  if exists (select 1 from pg_catalog.pg_policies where schemaname in ('public', 'private')) then
    raise exception 'Reversão M2: políticas remanescentes';
  end if;
  if exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal) then
    raise exception 'Reversão M2: triggers remanescentes em auth.users';
  end if;
  if exists (select 1 from private.ticket_transitions) then
    raise exception 'Reversão M2: matriz de transições não vazia';
  end if;
  if to_regclass('private.system_bootstrap') is not null then
    raise exception 'Reversão M2: private.system_bootstrap ainda existe';
  end if;
end
$final$;

commit;
