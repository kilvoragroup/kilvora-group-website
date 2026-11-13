-- =============================================================================
-- KILVORA GROUP — Portal de Clientes V1
-- Reversão da M1 (20261113093521_portal_schema). APENAS AMBIENTE LOCAL.
--
-- Execução (PowerShell), só com autorização expressa:
--   Get-Content supabase\rollback\20261113093521_portal_schema.down.sql |
--     docker exec -i supabase_db_Kilvora_Group_Website psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
--   npx.cmd supabase migration repair --status reverted 20261113093521 --local
--
-- Com dados nas tabelas do portal, a reversão é recusada, salvo se for passado
-- explicitamente  -v allow_data_loss=1.
--
-- Regras: sem CASCADE, sem IF EXISTS, sem DROP OWNED BY, sem db reset.
-- Qualquer divergência face ao estado esperado faz o script falhar e, por correr
-- numa única transacção explícita (BEGIN … COMMIT), nada é alterado.
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
declare
  v_rows bigint;
begin
  if current_user <> 'postgres' then
    raise exception 'Reversão M1: executar como postgres (actual: %)', current_user;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Reversão M1: histórico de migrações inexistente';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261113093521') then
    raise exception 'Reversão M1: a versão 20261113093521 não está registada como aplicada';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261113093521') then
    raise exception 'Reversão M1: existem migrações posteriores aplicadas; reverter primeiro essas';
  end if;

  select (select count(*) from public.profiles)
       + (select count(*) from public.accounts)
       + (select count(*) from public.account_members)
       + (select count(*) from public.user_roles)
       + (select count(*) from public.tickets)
       + (select count(*) from public.ticket_events)
       + (select count(*) from public.ticket_messages)
       + (select count(*) from public.ticket_internal_notes)
       + (select count(*) from private.audit_log)
       + (select count(*) from private.ticket_transitions)
       + (select count(*) from private.staff_provisioning)
    into v_rows;
  if v_rows > 0 and coalesce(current_setting('kilvora.allow_data_loss', true), '') <> '1' then
    raise exception 'Reversão M1: % linha(s) nas tabelas do portal; usar -v allow_data_loss=1 para confirmar', v_rows;
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Tabelas (ordem inversa das dependências; os triggers caem com as tabelas)
-- -----------------------------------------------------------------------------
drop table public.ticket_internal_notes;
drop table public.ticket_messages;
drop table public.ticket_events;
drop table public.tickets;
drop table public.user_roles;
drop table public.account_members;
drop table private.staff_provisioning;
drop table public.accounts;
drop table public.profiles;
drop table private.audit_log;
drop table private.ticket_transitions;

-- -----------------------------------------------------------------------------
-- 2. Funções de trigger e sequência
-- -----------------------------------------------------------------------------
drop function private.reject_mutation();
drop function private.set_updated_at();
drop sequence private.ticket_reference_seq;

-- -----------------------------------------------------------------------------
-- 3. Tipos
-- -----------------------------------------------------------------------------
drop type private.transition_actor;
drop type public.event_visibility;
drop type public.ticket_event_type;
drop type public.ticket_status;
drop type public.ticket_type;
drop type public.staff_role;
drop type public.member_role;
drop type public.account_status;
drop type public.profile_status;
drop type public.profile_kind;

-- -----------------------------------------------------------------------------
-- 4. Esquema privado (falha se ainda contiver objectos)
-- -----------------------------------------------------------------------------
drop schema private;

-- -----------------------------------------------------------------------------
-- 5. Papéis dedicados — inventário explícito antes de DROP ROLE
--    A M1 não concede privilégios a estes papéis; só a pertença de postgres,
--    que DROP ROLE remove (não se revoga antes: perder-se-ia o ADMIN OPTION
--    necessário ao DROP ROLE).
-- -----------------------------------------------------------------------------
do $inventory$
declare
  v_list text;
begin
  -- Dependências partilhadas (propriedade, ACL, políticas) em qualquer base de dados.
  select string_agg(
           pg_catalog.format('%s: classid=%s objid=%s deptype=%s',
             coalesce(db.datname, '(global)'), d.classid::regclass, d.objid, d.deptype),
           '; ')
    into v_list
  from pg_catalog.pg_shdepend d
  left join pg_catalog.pg_database db on db.oid = d.dbid
  where d.refclassid = 'pg_catalog.pg_authid'::regclass
    and d.refobjid in (select oid from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer'));
  if v_list is not null then
    raise exception 'Reversão M1: dependências inesperadas dos papéis dedicados: %', v_list;
  end if;

  -- Entradas de privilégios por omissão que os referenciem.
  select string_agg(d.oid::text, ', ') into v_list
  from pg_catalog.pg_default_acl d
  where d.defaclrole in (select oid from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer'))
     or exists (select 1 from pg_catalog.aclexplode(d.defaclacl) a
                where a.grantee in (select oid from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer')));
  if v_list is not null then
    raise exception 'Reversão M1: privilégios por omissão referem os papéis dedicados: %', v_list;
  end if;

  -- Pertenças remanescentes (para além da concessão automática ao criador).
  select string_agg(r.rolname || '<-' || m.rolname, ', ') into v_list
  from pg_catalog.pg_auth_members am
  join pg_catalog.pg_roles r on r.oid = am.roleid
  join pg_catalog.pg_roles m on m.oid = am.member
  where (r.rolname in ('portal_guard', 'portal_definer') and m.rolname <> 'postgres')
     or m.rolname in ('portal_guard', 'portal_definer');
  if v_list is not null then
    raise exception 'Reversão M1: pertenças inesperadas: %', v_list;
  end if;
end
$inventory$;

drop role portal_definer;
drop role portal_guard;

-- -----------------------------------------------------------------------------
-- 6. Verificação final
-- -----------------------------------------------------------------------------
do $final$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer')) then
    raise exception 'Reversão M1: papéis dedicados ainda existem';
  end if;
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'private') then
    raise exception 'Reversão M1: esquema private ainda existe';
  end if;
  if exists (
    select 1 from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname in (
      'profile_kind', 'profile_status', 'account_status', 'member_role', 'staff_role',
      'ticket_type', 'ticket_status', 'ticket_event_type', 'event_visibility')
  ) then
    raise exception 'Reversão M1: tipos do portal ainda existem';
  end if;
end
$final$;

commit;
