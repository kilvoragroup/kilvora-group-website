-- =============================================================================
-- KILVORA GROUP — Portal de Clientes V1
-- Reversão da M3-BD (20261113212446_portal_api). APENAS AMBIENTE LOCAL.
-- Repõe o estado exacto da M2: sem políticas nem privilégios de tabela para os
-- papéis da API. Não altera dados nem objectos da M1/M2.
--
-- Execução (PowerShell), só com autorização expressa:
--   Get-Content -Encoding UTF8 supabase\rollback\20261113212446_portal_api.down.sql |
--     docker exec -i supabase_db_Kilvora_Group_Website psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f -
--   npx.cmd supabase migration repair --status reverted 20261113212446
--
-- Regras: sem CASCADE, sem IF EXISTS, sem DROP OWNED BY, sem db reset.
-- Transacção única explícita: qualquer erro reverte tudo.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
do $guard$
begin
  if current_user <> 'postgres' then
    raise exception 'Reversão M3: executar como postgres (actual: %)', current_user;
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Reversão M3: histórico de migrações inexistente';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261113212446') then
    raise exception 'Reversão M3: a versão 20261113212446 não está registada como aplicada';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261113212446') then
    raise exception 'Reversão M3: existem migrações posteriores aplicadas; reverter primeiro essas';
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Políticas TO authenticated (12)
-- -----------------------------------------------------------------------------
drop policy api_ticket_internal_notes_restrict on public.ticket_internal_notes;
drop policy api_ticket_internal_notes_select on public.ticket_internal_notes;
drop policy api_ticket_messages_select on public.ticket_messages;
drop policy api_ticket_events_restrict on public.ticket_events;
drop policy api_ticket_events_select on public.ticket_events;
drop policy api_tickets_select on public.tickets;
drop policy api_user_roles_select on public.user_roles;
drop policy api_account_members_select on public.account_members;
drop policy api_accounts_update_owner on public.accounts;
drop policy api_accounts_select on public.accounts;
drop policy api_profiles_update_self on public.profiles;
drop policy api_profiles_select on public.profiles;

-- -----------------------------------------------------------------------------
-- 2. Privilégios de authenticated (REVOKE em tabela remove também os de coluna)
-- -----------------------------------------------------------------------------
revoke all on table public.profiles from authenticated;
revoke all on table public.accounts from authenticated;
revoke all on table public.account_members from authenticated;
revoke all on table public.user_roles from authenticated;
revoke all on table public.tickets from authenticated;
revoke all on table public.ticket_events from authenticated;
revoke all on table public.ticket_messages from authenticated;
revoke all on table public.ticket_internal_notes from authenticated;
revoke usage on schema private from authenticated;

-- -----------------------------------------------------------------------------
-- 3. Verificação final: estado idêntico ao da M2
-- -----------------------------------------------------------------------------
do $final$
declare
  v_list text;
begin
  if exists (select 1 from pg_catalog.pg_policies
             where schemaname in ('public', 'private')
               and roles && array['public', 'anon', 'authenticated', 'service_role']::name[]) then
    raise exception 'Reversão M3: políticas remanescentes para papéis da API';
  end if;
  if (select count(*) from pg_catalog.pg_policies where schemaname in ('public', 'private')) <> 32 then
    raise exception 'Reversão M3: as 32 políticas dos papéis do portal não estão intactas';
  end if;
  select string_agg(distinct c.oid::regclass::text, ', ') into v_list
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and ((c.relkind = 'r' and pg_catalog.has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
         or (c.relkind = 'S' and pg_catalog.has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE')));
  if v_list is not null then
    raise exception 'Reversão M3: privilégios remanescentes de authenticated em %', v_list;
  end if;
  if pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'Reversão M3: authenticated ainda tem USAGE em private';
  end if;
end
$final$;

commit;
