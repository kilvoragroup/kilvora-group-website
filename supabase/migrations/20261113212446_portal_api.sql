-- =============================================================================
-- KILVORA GROUP — Portal de Clientes V1
-- M3-BD: exposição segura de leitura à API (PostgREST/GraphQL) para
--        `authenticated`, sob RLS; UPDATE limitado a 6 colunas.
--
-- Fonte de verdade: W3-B5-03 — Especificação Técnica M3-BD.
-- Decisões aplicadas: D2 (operador só pedidos atribuídos), D-M2-1 (`reason`
-- visível ao cliente; `evidence_ref` só por RPC), P3 (aal2 para todo o staff),
-- Q1 (contrato de lista de colunas em ticket_events; sem vista), Q2 (phone do
-- requerente visível ao operador atribuído), Q3 (GraphQL mantido).
--
-- Não cria tabelas, funções, triggers nem dados. Não altera M1 nem M2.
-- `anon`, `PUBLIC` e `service_role` continuam sem qualquer privilégio.
-- Escritas de negócio continuam exclusivamente nas RPCs da M2.
--
-- Reversão: supabase/rollback/20261113212446_portal_api.down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
do $guard$
begin
  if current_user <> 'postgres' then
    raise exception 'M3: executar como postgres (actual: %)', current_user;
  end if;
  if to_regprocedure('private.can_view_ticket(uuid)') is null
     or to_regprocedure('public.staff_ticket_events(uuid)') is null then
    raise exception 'M3: a M2 não está aplicada';
  end if;
  if exists (select 1 from pg_catalog.pg_policies
             where schemaname in ('public', 'private')
               and roles && array['public', 'anon', 'authenticated', 'service_role']::name[]) then
    raise exception 'M3: já existem políticas para papéis da API';
  end if;
  if pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE') then
    raise exception 'M3: authenticated já tem USAGE em private';
  end if;
  if exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             where n.nspname in ('public', 'private')
               and ((c.relkind = 'r'
                     and pg_catalog.has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
                    or (c.relkind = 'S'
                        and pg_catalog.has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE')))) then
    raise exception 'M3: authenticated já tem privilégios de tabela, coluna ou sequência';
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Esquema privado: só resolução de nomes, para as funções auxiliares das políticas
-- -----------------------------------------------------------------------------
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- 2. GRANT de leitura (todas as colunas, excepto ticket_events.evidence_ref)
-- -----------------------------------------------------------------------------
grant select on table public.profiles to authenticated;
grant select on table public.accounts to authenticated;
grant select on table public.account_members to authenticated;
grant select on table public.user_roles to authenticated;
grant select on table public.tickets to authenticated;
grant select (id, ticket_id, actor_id, event_type, from_status, to_status, reason, visibility, created_at)
  on table public.ticket_events to authenticated;
grant select on table public.ticket_messages to authenticated;
grant select on table public.ticket_internal_notes to authenticated;

-- -----------------------------------------------------------------------------
-- 3. GRANT de actualização limitada (6 colunas)
-- -----------------------------------------------------------------------------
grant update (full_name, phone, locale) on table public.profiles to authenticated;
grant update (name, country, sector) on table public.accounts to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Políticas RLS para authenticated (permissivas e restritivas)
--    Funções auxiliares sem argumentos em (select …): avaliação única por consulta.
--    Todos os ramos internos exigem aal2 (is_staff / is_admin / is_assigned).
-- -----------------------------------------------------------------------------
create policy api_profiles_select on public.profiles
  as permissive for select to authenticated
  using (
    id = (select private.jwt_sub())
    or (select private.is_admin())
    or ((select private.is_staff())
        and exists (select 1 from public.tickets t
                    where t.requester_id = profiles.id
                      and t.assigned_operator_id = (select private.jwt_sub()))));

create policy api_profiles_update_self on public.profiles
  as permissive for update to authenticated
  using (id = (select private.jwt_sub()) and status = 'activo')
  with check (id = (select private.jwt_sub()));

create policy api_accounts_select on public.accounts
  as permissive for select to authenticated
  using (
    private.is_account_member(id)
    or (select private.is_admin())
    or ((select private.is_staff())
        and exists (select 1 from public.tickets t
                    where t.account_id = accounts.id
                      and t.assigned_operator_id = (select private.jwt_sub()))));

create policy api_accounts_update_owner on public.accounts
  as permissive for update to authenticated
  using (private.is_account_owner(id) and status = 'activa')
  with check (private.is_account_owner(id) and status = 'activa');

create policy api_account_members_select on public.account_members
  as permissive for select to authenticated
  using (user_id = (select private.jwt_sub()) or (select private.is_admin()));

create policy api_user_roles_select on public.user_roles
  as permissive for select to authenticated
  using (user_id = (select private.jwt_sub()) or (select private.is_admin()));

create policy api_tickets_select on public.tickets
  as permissive for select to authenticated
  using (
    private.is_account_member(account_id)
    or (assigned_operator_id = (select private.jwt_sub()) and (select private.is_staff()))
    or (select private.is_admin()));

create policy api_ticket_events_select on public.ticket_events
  as permissive for select to authenticated
  using (
    (visibility = 'cliente' and private.can_view_ticket(ticket_id))
    or private.is_assigned(ticket_id)
    or (select private.is_admin()));

-- Restritiva: eventos internos nunca chegam a quem não é staff (aal2), mesmo
-- que uma futura política permissiva seja demasiado larga.
create policy api_ticket_events_restrict on public.ticket_events
  as restrictive for select to authenticated
  using (visibility = 'cliente' or (select private.is_staff()));

create policy api_ticket_messages_select on public.ticket_messages
  as permissive for select to authenticated
  using (private.can_view_ticket(ticket_id));

create policy api_ticket_internal_notes_select on public.ticket_internal_notes
  as permissive for select to authenticated
  using (private.is_assigned(ticket_id) or (select private.is_admin()));

-- Restritiva: notas internas só para staff (aal2), em qualquer circunstância.
create policy api_ticket_internal_notes_restrict on public.ticket_internal_notes
  as restrictive for select to authenticated
  using ((select private.is_staff()));

-- -----------------------------------------------------------------------------
-- 5. Auto-verificação (aborta a migração se alguma garantia falhar)
-- -----------------------------------------------------------------------------
do $selfcheck$
declare
  v_list  text;
  v_count int;
begin
  -- 5.1 Privilégios por coluna de authenticated: exactamente os especificados
  with expected as (
    select c.table_name::text as t, c.column_name::text as col, 'SELECT'::text as p
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in ('profiles', 'accounts', 'account_members', 'user_roles',
                           'tickets', 'ticket_messages', 'ticket_internal_notes')
    union all
    select 'ticket_events', x, 'SELECT'
    from unnest(array['id', 'ticket_id', 'actor_id', 'event_type', 'from_status',
                      'to_status', 'reason', 'visibility', 'created_at']) x
    union all
    select 'profiles', x, 'UPDATE' from unnest(array['full_name', 'phone', 'locale']) x
    union all
    select 'accounts', x, 'UPDATE' from unnest(array['name', 'country', 'sector']) x
  ),
  actual as (
    select cp.table_name::text as t, cp.column_name::text as col, cp.privilege_type::text as p
    from information_schema.column_privileges cp
    where cp.grantee = 'authenticated' and cp.table_schema in ('public', 'private')
  ),
  diff as (
    (select 'em falta: ' || t || '.' || col || ' ' || p from expected
     except select 'em falta: ' || t || '.' || col || ' ' || p from actual)
    union all
    (select 'a mais: ' || t || '.' || col || ' ' || p from actual
     except select 'a mais: ' || t || '.' || col || ' ' || p from expected)
  )
  select string_agg(d, '; ') into v_list from diff d(d);
  if v_list is not null then
    raise exception 'M3 auto-verificação: privilégios de coluna divergentes: %', v_list;
  end if;

  -- 5.2 authenticated sem INSERT/DELETE/TRUNCATE/REFERENCES/TRIGGER; nada em private
  select string_agg(distinct c.oid::regclass::text, ', ') into v_list
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and ((c.relkind = 'r'
          and (pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER')
               or pg_catalog.has_any_column_privilege('authenticated', c.oid, 'INSERT,REFERENCES')
               or (n.nspname = 'private'
                   and pg_catalog.has_any_column_privilege('authenticated', c.oid, 'SELECT,UPDATE'))))
         or (c.relkind = 'S'
             and pg_catalog.has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE')));
  if v_list is not null then
    raise exception 'M3 auto-verificação: privilégios indevidos de authenticated em %', v_list;
  end if;

  -- 5.3 PUBLIC, anon e service_role continuam sem nada
  select string_agg(distinct r || ' em ' || c.oid::regclass::text, ', ') into v_list
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['public', 'anon', 'service_role']) r
  where n.nspname in ('public', 'private')
    and ((c.relkind = 'r'
          and (pg_catalog.has_any_column_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
               or pg_catalog.has_table_privilege(r, c.oid, 'DELETE,TRUNCATE,TRIGGER')))
         or (c.relkind = 'S' and pg_catalog.has_sequence_privilege(r, c.oid, 'USAGE,SELECT,UPDATE')));
  if v_list is not null then
    raise exception 'M3 auto-verificação: privilégios para papéis não autenticados: %', v_list;
  end if;

  -- 5.4 Esquema private: USAGE só para authenticated (entre os papéis da API); CREATE para ninguém
  if not pg_catalog.has_schema_privilege('authenticated', 'private', 'USAGE')
     or pg_catalog.has_schema_privilege('authenticated', 'private', 'CREATE')
     or pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')
     or pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE')
     or pg_catalog.has_schema_privilege('public', 'private', 'USAGE') then
    raise exception 'M3 auto-verificação: privilégios indevidos no esquema private';
  end if;

  -- 5.5 Exactamente as 12 políticas TO authenticated (2 restritivas); nenhuma para outros papéis da API
  select count(*) into v_count from pg_catalog.pg_policies
  where schemaname = 'public' and roles = array['authenticated']::name[]
    and policyname in ('api_profiles_select', 'api_profiles_update_self', 'api_accounts_select',
                       'api_accounts_update_owner', 'api_account_members_select', 'api_user_roles_select',
                       'api_tickets_select', 'api_ticket_events_select', 'api_ticket_events_restrict',
                       'api_ticket_messages_select', 'api_ticket_internal_notes_select',
                       'api_ticket_internal_notes_restrict');
  if v_count <> 12 then
    raise exception 'M3 auto-verificação: % de 12 políticas para authenticated', v_count;
  end if;
  if (select count(*) from pg_catalog.pg_policies
      where schemaname in ('public', 'private')
        and roles && array['public', 'anon', 'authenticated', 'service_role']::name[]) <> 12 then
    raise exception 'M3 auto-verificação: políticas inesperadas para papéis da API';
  end if;
  if (select count(*) from pg_catalog.pg_policies
      where schemaname = 'public' and permissive = 'RESTRICTIVE'
        and policyname in ('api_ticket_events_restrict', 'api_ticket_internal_notes_restrict')) <> 2 then
    raise exception 'M3 auto-verificação: políticas restritivas em falta';
  end if;
  if exists (select 1 from pg_catalog.pg_policies
             where schemaname = 'public' and roles = array['authenticated']::name[]
               and cmd not in ('SELECT', 'UPDATE')) then
    raise exception 'M3 auto-verificação: política de authenticated com comando não permitido';
  end if;

  -- 5.6 RLS e FORCE intactos nas 8 tabelas públicas
  if (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity) <> 8 then
    raise exception 'M3 auto-verificação: RLS/FORCE em falta';
  end if;
end
$selfcheck$;
