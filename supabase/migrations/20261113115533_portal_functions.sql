-- =============================================================================
-- KILVORA GROUP — Portal de Clientes V1
-- M2: identidade JWT, funções auxiliares (portal_guard), RPCs (portal_definer),
--     registro (portal_registrar), matriz de transições, protecções e arranque
--     do primeiro administrador.
--
-- Referências: W3-B2-2A, 2B, 2C e 2D (incl. correcções I1–I5).
-- Pré-requisito: M1 (20261113093521_portal_schema) aplicada.
--
-- Fora do âmbito (M3): políticas TO authenticated e GRANT de tabela à API.
-- Nesta migração, os papéis da API não recebem privilégios de tabela; só
-- EXECUTE nas RPCs, nas funções JWT e nas funções auxiliares.
--
-- Reversão: supabase/rollback/20261113115533_portal_functions.down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
do $guard$
begin
  if current_user <> 'postgres' then
    raise exception 'M2: executar como postgres (actual: %)', current_user;
  end if;
  if to_regnamespace('private') is null then
    raise exception 'M2: a M1 não está aplicada (esquema private inexistente)';
  end if;
  if (select count(*) from pg_catalog.pg_roles
      where rolname in ('portal_guard', 'portal_definer')
        and not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin or rolreplication or rolinherit)) <> 2 then
    raise exception 'M2: papéis portal_guard/portal_definer ausentes ou com atributos indevidos';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'portal_registrar') then
    raise exception 'M2: o papel portal_registrar já existe; não é adoptado';
  end if;
  if to_regprocedure('private.jwt_claims()') is not null
     or to_regclass('private.system_bootstrap') is not null then
    raise exception 'M2: objectos da M2 já existem';
  end if;
  if exists (select 1 from private.ticket_transitions) then
    raise exception 'M2: a matriz de transições não está vazia';
  end if;
  if exists (select 1 from pg_catalog.pg_policies where schemaname in ('public', 'private')) then
    raise exception 'M2: existem políticas inesperadas';
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Papel de registo (só utilizável dentro dos triggers de auth.users)
-- -----------------------------------------------------------------------------
create role portal_registrar
  nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit;
comment on role portal_registrar is
  'KILVORA portal: dono exclusivo dos triggers de registo em auth.users. Sem login, sem BYPASSRLS.';
grant portal_registrar to postgres with inherit false, set true;

-- -----------------------------------------------------------------------------
-- 2. Identidade a partir do JWT (SECURITY INVOKER; recusa limpa, nunca erro)
-- -----------------------------------------------------------------------------
create function private.jwt_claims()
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $fn$
declare
  v_raw    text := pg_catalog.current_setting('request.jwt.claims', true);
  v_claims jsonb;
begin
  if v_raw is null or v_raw = '' then
    return null;
  end if;
  begin
    v_claims := v_raw::jsonb;
  exception when others then
    return null;
  end;
  if pg_catalog.jsonb_typeof(v_claims) is distinct from 'object' then
    return null;
  end if;
  return v_claims;
end
$fn$;

create function private.jwt_sub()
  returns uuid
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $fn$
declare
  v_claims jsonb := private.jwt_claims();
  v_sub    text;
begin
  if v_claims is null or pg_catalog.jsonb_typeof(v_claims -> 'sub') is distinct from 'string' then
    return null;
  end if;
  v_sub := v_claims ->> 'sub';
  if v_sub !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_sub::uuid;
end
$fn$;

create function private.jwt_aal()
  returns text
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $fn$
declare
  v_claims jsonb := private.jwt_claims();
begin
  if v_claims is null or pg_catalog.jsonb_typeof(v_claims -> 'aal') is distinct from 'string' then
    return null;
  end if;
  if (v_claims ->> 'aal') in ('aal1', 'aal2') then
    return v_claims ->> 'aal';
  end if;
  return null;
end
$fn$;

create function private.jwt_role()
  returns text
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $fn$
declare
  v_claims jsonb := private.jwt_claims();
begin
  if v_claims is null or pg_catalog.jsonb_typeof(v_claims -> 'role') is distinct from 'string' then
    return null;
  end if;
  return v_claims ->> 'role';
end
$fn$;

revoke all on function private.jwt_claims() from public, anon, authenticated, service_role;
revoke all on function private.jwt_sub() from public, anon, authenticated, service_role;
revoke all on function private.jwt_aal() from public, anon, authenticated, service_role;
revoke all on function private.jwt_role() from public, anon, authenticated, service_role;
grant execute on function private.jwt_claims() to authenticated, portal_guard, portal_definer, portal_registrar;
grant execute on function private.jwt_sub() to authenticated, portal_guard, portal_definer, portal_registrar;
grant execute on function private.jwt_aal() to authenticated, portal_guard, portal_definer;
grant execute on function private.jwt_role() to authenticated, portal_guard, portal_definer;

-- -----------------------------------------------------------------------------
-- 3. portal_guard: leitura exclusiva das colunas de autorização
-- -----------------------------------------------------------------------------
grant usage on schema private to portal_guard;
grant select (id, kind, status) on public.profiles to portal_guard;
grant select (account_id, user_id, member_role) on public.account_members to portal_guard;
grant select (user_id, role, revoked_at) on public.user_roles to portal_guard;
grant select (id, account_id, assigned_operator_id) on public.tickets to portal_guard;

create policy portal_guard_read on public.profiles
  as permissive for select to portal_guard using (true);
create policy portal_guard_read on public.account_members
  as permissive for select to portal_guard using (true);
create policy portal_guard_read on public.user_roles
  as permissive for select to portal_guard using (true);
create policy portal_guard_read on public.tickets
  as permissive for select to portal_guard using (true);

-- -----------------------------------------------------------------------------
-- 4. Funções auxiliares (dono final: portal_guard). Todas boolean; avaliam
--    sempre quem chama (jwt_sub), nunca um utilizador passado por parâmetro.
-- -----------------------------------------------------------------------------
create function private.is_staff()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $fn$
  select coalesce(private.jwt_aal() = 'aal2', false)
     and exists (
       select 1
       from public.user_roles r
       join public.profiles p on p.id = r.user_id
       where r.user_id = private.jwt_sub()
         and r.revoked_at is null
         and r.role in ('operador', 'admin')
         and p.kind = 'interno'
         and p.status = 'activo');
$fn$;

create function private.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $fn$
  select coalesce(private.jwt_aal() = 'aal2', false)
     and exists (
       select 1
       from public.user_roles r
       join public.profiles p on p.id = r.user_id
       where r.user_id = private.jwt_sub()
         and r.revoked_at is null
         and r.role = 'admin'
         and p.kind = 'interno'
         and p.status = 'activo');
$fn$;

create function private.is_account_member(p_account_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $fn$
  select exists (
    select 1
    from public.account_members m
    join public.profiles p on p.id = m.user_id
    where m.account_id = p_account_id
      and m.user_id = private.jwt_sub()
      and p.kind = 'cliente'
      and p.status = 'activo');
$fn$;

create function private.is_account_owner(p_account_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $fn$
  select exists (
    select 1
    from public.account_members m
    join public.profiles p on p.id = m.user_id
    where m.account_id = p_account_id
      and m.user_id = private.jwt_sub()
      and m.member_role = 'titular'
      and p.kind = 'cliente'
      and p.status = 'activo');
$fn$;

create function private.is_assigned(p_ticket_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $fn$
  select private.is_staff()
     and exists (
       select 1 from public.tickets t
       where t.id = p_ticket_id
         and t.assigned_operator_id = private.jwt_sub());
$fn$;

create function private.can_view_ticket(p_ticket_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $fn$
  select exists (
    select 1 from public.tickets t
    where t.id = p_ticket_id
      and (private.is_account_member(t.account_id)
           or (t.assigned_operator_id = private.jwt_sub() and private.is_staff())
           or private.is_admin()));
$fn$;

revoke all on function private.is_staff() from public, anon, authenticated, service_role;
revoke all on function private.is_admin() from public, anon, authenticated, service_role;
revoke all on function private.is_account_member(uuid) from public, anon, authenticated, service_role;
revoke all on function private.is_account_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function private.is_assigned(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_view_ticket(uuid) from public, anon, authenticated, service_role;
grant execute on function private.is_staff() to authenticated, portal_definer;
grant execute on function private.is_admin() to authenticated, portal_definer;
grant execute on function private.is_account_member(uuid) to authenticated, portal_definer;
grant execute on function private.is_account_owner(uuid) to authenticated, portal_definer;
grant execute on function private.is_assigned(uuid) to authenticated, portal_definer;
grant execute on function private.can_view_ticket(uuid) to authenticated, portal_definer;

-- -----------------------------------------------------------------------------
-- 5. Triggers de protecção (SECURITY INVOKER, dono postgres, sem EXECUTE)
-- -----------------------------------------------------------------------------
create function private.protect_ticket_state()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  if current_user not in ('portal_definer', 'postgres') then
    raise exception using
      errcode = '42501',
      message = 'tickets: estado, atribuição e fecho só mudam através das RPCs do portal';
  end if;
  return new;
end
$fn$;

create function private.protect_profile_state()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  if new.kind is distinct from old.kind then
    raise exception using errcode = '42501', message = 'profiles.kind é imutável';
  end if;
  if new.status is distinct from old.status and current_user not in ('portal_definer', 'postgres') then
    raise exception using errcode = '42501', message = 'profiles.status só muda através das RPCs administrativas';
  end if;
  return new;
end
$fn$;

create function private.enforce_staff_role_target()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.kind = 'interno' and p.status = 'activo'
  ) then
    raise exception using errcode = '23514', message = 'user_roles: o alvo tem de ser um perfil interno activo';
  end if;
  return new;
end
$fn$;

revoke all on function private.protect_ticket_state() from public, anon, authenticated, service_role;
revoke all on function private.protect_profile_state() from public, anon, authenticated, service_role;
revoke all on function private.enforce_staff_role_target() from public, anon, authenticated, service_role;

create trigger tickets_protect_state
  before update of status, assigned_operator_id, closed_at on public.tickets
  for each row execute function private.protect_ticket_state();
create trigger profiles_protect_state
  before update of kind, status on public.profiles
  for each row execute function private.protect_profile_state();
create trigger user_roles_enforce_target
  before insert on public.user_roles
  for each row execute function private.enforce_staff_role_target();

-- -----------------------------------------------------------------------------
-- 6. Arranque do primeiro administrador (S3, B3, I1, I3, I4)
-- -----------------------------------------------------------------------------
create table private.system_bootstrap (
  singleton      boolean primary key default true,
  admin_user_id  uuid not null references public.profiles (id) on delete restrict,
  completed_at   timestamptz not null default now(),
  executed_by    text not null default session_user,
  constraint system_bootstrap_singleton check (singleton)
);
alter table private.system_bootstrap enable row level security;
revoke all on table private.system_bootstrap from public, anon, authenticated, service_role;
comment on table private.system_bootstrap is
  'Arranque do primeiro admin: no máximo uma linha, imutável. Só scripts do proprietário (supabase/ops).';

create trigger system_bootstrap_immutable
  before update or delete on private.system_bootstrap
  for each row execute function private.reject_mutation();
create trigger system_bootstrap_no_truncate
  before truncate on private.system_bootstrap
  for each statement execute function private.reject_mutation();

-- Valores nulos de granted_by/provisioned_by só no arranque, uma única vez.
create function private.guard_bootstrap_nulls()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  if tg_table_schema = 'public' and tg_table_name = 'user_roles' then
    if new.granted_by is not null then
      return new;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
    if new.role <> 'admin' then
      raise exception using errcode = '23514',
        message = 'user_roles: granted_by nulo só é permitido no arranque do primeiro admin';
    end if;
    if current_user <> 'postgres' then
      raise exception using errcode = '42501', message = 'user_roles: arranque reservado ao proprietário';
    end if;
    if exists (select 1 from private.system_bootstrap) then
      raise exception using errcode = '42501', message = 'user_roles: o arranque já foi concluído';
    end if;
    if exists (select 1 from public.user_roles r where r.role = 'admin') then
      raise exception using errcode = '42501', message = 'user_roles: já existe ou existiu um admin';
    end if;
    return new;

  elsif tg_table_schema = 'private' and tg_table_name = 'staff_provisioning' then
    if new.provisioned_by is not null then
      return new;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
    if current_user <> 'postgres' then
      raise exception using errcode = '42501', message = 'staff_provisioning: arranque reservado ao proprietário';
    end if;
    if exists (select 1 from private.system_bootstrap)
       or exists (select 1 from public.user_roles r where r.role = 'admin') then
      raise exception using errcode = '42501', message = 'staff_provisioning: o arranque já foi concluído';
    end if;
    if exists (
      select 1 from private.staff_provisioning sp
      where sp.provisioned_by is null and sp.consumed_at is null
        and sp.cancelled_at is null and sp.expires_at > pg_catalog.now()
    ) then
      raise exception using errcode = '42501',
        message = 'staff_provisioning: já existe um provisionamento de arranque pendente e válido';
    end if;
    if exists (
      select 1 from private.staff_provisioning sp
      join public.profiles p on p.id = sp.consumed_user_id
      where sp.provisioned_by is null and p.status <> 'suspenso'
    ) then
      raise exception using errcode = '42501',
        message = 'staff_provisioning: provisionamento de arranque já consumido por perfil não suspenso';
    end if;
    return new;
  end if;

  raise exception 'guard_bootstrap_nulls: tabela inesperada %.%', tg_table_schema, tg_table_name;
end
$fn$;
revoke all on function private.guard_bootstrap_nulls() from public, anon, authenticated, service_role;

create trigger user_roles_guard_bootstrap
  before insert on public.user_roles
  for each row execute function private.guard_bootstrap_nulls();
create trigger staff_provisioning_guard_bootstrap
  before insert on private.staff_provisioning
  for each row execute function private.guard_bootstrap_nulls();

-- Atomicidade do arranque: papel admin (granted_by nulo) + system_bootstrap +
-- auditoria, verificados no COMMIT.
create function private.check_bootstrap_coherence()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  if tg_table_schema = 'public' and tg_table_name = 'user_roles' then
    if not exists (select 1 from private.system_bootstrap b where b.admin_user_id = new.user_id) then
      raise exception using errcode = '23514',
        message = 'arranque incoerente: papel admin sem registo em system_bootstrap';
    end if;
    if not exists (
      select 1 from private.audit_log a
      where a.action = 'bootstrap_admin_granted' and a.entity_type = 'user_role'
        and a.entity_id = new.user_id::text
    ) then
      raise exception using errcode = '23514', message = 'arranque incoerente: auditoria em falta';
    end if;
  elsif tg_table_schema = 'private' and tg_table_name = 'system_bootstrap' then
    if not exists (
      select 1 from public.user_roles r
      where r.user_id = new.admin_user_id and r.role = 'admin'
        and r.granted_by is null and r.revoked_at is null
    ) then
      raise exception using errcode = '23514',
        message = 'arranque incoerente: system_bootstrap sem papel admin correspondente';
    end if;
  else
    raise exception 'check_bootstrap_coherence: tabela inesperada %.%', tg_table_schema, tg_table_name;
  end if;
  return null;
end
$fn$;
revoke all on function private.check_bootstrap_coherence() from public, anon, authenticated, service_role;

create constraint trigger user_roles_bootstrap_coherence
  after insert on public.user_roles
  deferrable initially deferred
  for each row
  when (new.granted_by is null)
  execute function private.check_bootstrap_coherence();
create constraint trigger system_bootstrap_coherence
  after insert on private.system_bootstrap
  deferrable initially deferred
  for each row
  execute function private.check_bootstrap_coherence();

-- -----------------------------------------------------------------------------
-- 7. Matriz de transições (24 linhas)
-- -----------------------------------------------------------------------------
insert into private.ticket_transitions (from_status, to_status, actor, requires_reason, requires_evidence) values
  -- cliente: só cancela (motivo opcional, D-M2-4)
  ('recebido',               'cancelado',              'cliente', false, false),
  ('em_analise',             'cancelado',              'cliente', false, false),
  ('aguarda_cliente',        'cancelado',              'cliente', false, false),
  ('em_preparacao_proposta', 'cancelado',              'cliente', false, false),
  ('proposta_enviada',       'cancelado',              'cliente', false, false),
  -- staff (operador atribuído ou admin)
  ('recebido',               'em_analise',             'staff',   false, false),
  ('em_analise',             'aguarda_cliente',        'staff',   false, false),
  ('em_analise',             'em_preparacao_proposta', 'staff',   false, false),
  ('em_analise',             'recusado',               'staff',   true,  false),
  ('aguarda_cliente',        'em_analise',             'staff',   false, false),
  ('em_preparacao_proposta', 'proposta_enviada',       'staff',   false, false),
  ('em_preparacao_proposta', 'em_analise',             'staff',   false, false),
  ('proposta_enviada',       'aceite',                 'staff',   false, true),
  ('proposta_enviada',       'recusado',               'staff',   false, true),
  ('proposta_enviada',       'aguarda_cliente',        'staff',   false, false),
  ('aceite',                 'concluido',              'staff',   false, false),
  ('recebido',               'cancelado',              'staff',   true,  false),
  ('em_analise',             'cancelado',              'staff',   true,  false),
  ('aguarda_cliente',        'cancelado',              'staff',   true,  false),
  ('em_preparacao_proposta', 'cancelado',              'staff',   true,  false),
  ('proposta_enviada',       'cancelado',              'staff',   true,  false),
  -- admin: reabertura com motivo (D12), só via reopen_ticket
  ('concluido',              'em_analise',             'admin',   true,  false),
  ('recusado',               'em_analise',             'admin',   true,  false),
  ('cancelado',              'em_analise',             'admin',   true,  false);

-- -----------------------------------------------------------------------------
-- 8. portal_definer: privilégios mínimos e políticas dependentes de quem chama
-- -----------------------------------------------------------------------------
grant usage on schema private to portal_definer;
grant usage on sequence private.ticket_reference_seq to portal_definer;

grant select (id, kind, status) on public.profiles to portal_definer;
grant update (status) on public.profiles to portal_definer;
grant select (id, status) on public.accounts to portal_definer;
grant select (account_id, user_id, member_role) on public.account_members to portal_definer;
grant select (id, user_id, role, granted_by, granted_at, revoked_by, revoked_at) on public.user_roles to portal_definer;
grant insert (user_id, role, granted_by) on public.user_roles to portal_definer;
grant update (revoked_at, revoked_by) on public.user_roles to portal_definer;
grant select on public.tickets to portal_definer;
grant insert (id, reference, account_id, requester_id, type, subject, description) on public.tickets to portal_definer;
grant update (status, assigned_operator_id, closed_at) on public.tickets to portal_definer;
grant select on public.ticket_events to portal_definer;
grant insert (ticket_id, actor_id, event_type, from_status, to_status, reason, evidence_ref, visibility)
  on public.ticket_events to portal_definer;
grant select on public.ticket_messages to portal_definer;
grant insert (ticket_id, author_id, body) on public.ticket_messages to portal_definer;
grant select (id, ticket_id, author_id, created_at) on public.ticket_internal_notes to portal_definer;
grant insert (ticket_id, author_id, body) on public.ticket_internal_notes to portal_definer;
grant select on private.audit_log to portal_definer;
grant insert (actor_id, actor_aal, action, entity_type, entity_id, before, after) on private.audit_log to portal_definer;
grant select on private.ticket_transitions to portal_definer;
grant select (id, email_normalized, provisioned_by, created_at, expires_at,
              consumed_at, consumed_user_id, cancelled_at, cancelled_by)
  on private.staff_provisioning to portal_definer;
grant insert (email_normalized, provisioned_by, expires_at) on private.staff_provisioning to portal_definer;
grant update (cancelled_at, cancelled_by) on private.staff_provisioning to portal_definer;  -- I2

create policy portal_definer_select on public.profiles
  as permissive for select to portal_definer
  using (id = private.jwt_sub() or private.is_staff());
create policy portal_definer_update on public.profiles
  as permissive for update to portal_definer
  using (private.is_admin() and id <> private.jwt_sub())
  with check (private.is_admin() and id <> private.jwt_sub());

create policy portal_definer_select on public.accounts
  as permissive for select to portal_definer
  using (private.is_account_member(id) or private.is_staff());

create policy portal_definer_select on public.account_members
  as permissive for select to portal_definer
  using (user_id = private.jwt_sub() or private.is_admin());

create policy portal_definer_select on public.user_roles
  as permissive for select to portal_definer
  using (user_id = private.jwt_sub() or private.is_admin());
create policy portal_definer_insert on public.user_roles
  as permissive for insert to portal_definer
  with check (private.is_admin() and user_id <> private.jwt_sub() and granted_by = private.jwt_sub());
create policy portal_definer_update on public.user_roles
  as permissive for update to portal_definer
  using (private.is_admin() and user_id <> private.jwt_sub())
  with check (private.is_admin() and user_id <> private.jwt_sub() and revoked_by = private.jwt_sub());

create policy portal_definer_select on public.tickets
  as permissive for select to portal_definer
  using (private.can_view_ticket(id));
create policy portal_definer_insert on public.tickets
  as permissive for insert to portal_definer
  with check (private.is_account_member(account_id) and requester_id = private.jwt_sub());
create policy portal_definer_update on public.tickets
  as permissive for update to portal_definer
  using (private.can_view_ticket(id))
  with check (private.can_view_ticket(id));

create policy portal_definer_select on public.ticket_events
  as permissive for select to portal_definer
  using ((visibility = 'cliente' and private.can_view_ticket(ticket_id))
         or private.is_assigned(ticket_id) or private.is_admin());
create policy portal_definer_insert on public.ticket_events
  as permissive for insert to portal_definer
  with check (actor_id is not distinct from private.jwt_sub()
              and private.can_view_ticket(ticket_id)
              and (visibility = 'cliente' or private.is_assigned(ticket_id) or private.is_admin()));

create policy portal_definer_select on public.ticket_messages
  as permissive for select to portal_definer
  using (author_id = private.jwt_sub() or private.can_view_ticket(ticket_id));
create policy portal_definer_insert on public.ticket_messages
  as permissive for insert to portal_definer
  with check (author_id = private.jwt_sub() and private.can_view_ticket(ticket_id));

create policy portal_definer_select on public.ticket_internal_notes
  as permissive for select to portal_definer
  using (author_id = private.jwt_sub() or private.is_admin());
create policy portal_definer_insert on public.ticket_internal_notes
  as permissive for insert to portal_definer
  with check (author_id = private.jwt_sub() and (private.is_assigned(ticket_id) or private.is_admin()));

create policy portal_definer_select on private.audit_log
  as permissive for select to portal_definer
  using (private.is_admin());
create policy portal_definer_insert on private.audit_log
  as permissive for insert to portal_definer
  with check (actor_id is not distinct from private.jwt_sub());

create policy portal_definer_select on private.ticket_transitions
  as permissive for select to portal_definer
  using (true);

create policy portal_definer_select on private.staff_provisioning
  as permissive for select to portal_definer
  using (private.is_admin());
create policy portal_definer_insert on private.staff_provisioning
  as permissive for insert to portal_definer
  with check (private.is_admin() and provisioned_by = private.jwt_sub());
create policy portal_definer_update on private.staff_provisioning
  as permissive for update to portal_definer
  using (private.is_admin())
  with check (private.is_admin() and cancelled_by = private.jwt_sub());

-- -----------------------------------------------------------------------------
-- 9. portal_registrar: privilégios e políticas só válidos dentro do trigger
--    (pg_trigger_depth > 0, sem JWT, ligados ao utilizador em registo)
-- -----------------------------------------------------------------------------
grant usage on schema private to portal_registrar;
grant insert (id, kind, status, full_name, locale) on public.profiles to portal_registrar;
grant insert (id, name, created_by) on public.accounts to portal_registrar;
grant insert (account_id, user_id, member_role) on public.account_members to portal_registrar;
grant select (id, email_normalized, expires_at, consumed_at, cancelled_at)
  on private.staff_provisioning to portal_registrar;
grant update (consumed_at, consumed_user_id) on private.staff_provisioning to portal_registrar;
grant insert (action, entity_type, entity_id, after) on private.audit_log to portal_registrar;

create policy portal_registrar_insert on public.profiles
  as permissive for insert to portal_registrar
  with check (
    pg_catalog.pg_trigger_depth() > 0
    and private.jwt_sub() is null
    and id = nullif(pg_catalog.current_setting('kilvora.signup_user_id', true), '')::uuid
    and status = 'activo'
    and (kind = 'cliente'
         or exists (
           select 1 from private.staff_provisioning sp
           where sp.email_normalized = nullif(pg_catalog.current_setting('kilvora.signup_email', true), '')
             and sp.consumed_at is null and sp.cancelled_at is null
             and sp.expires_at > pg_catalog.now())));

create policy portal_registrar_insert on public.accounts
  as permissive for insert to portal_registrar
  with check (
    pg_catalog.pg_trigger_depth() > 0
    and private.jwt_sub() is null
    and created_by = nullif(pg_catalog.current_setting('kilvora.signup_user_id', true), '')::uuid);

create policy portal_registrar_insert on public.account_members
  as permissive for insert to portal_registrar
  with check (
    pg_catalog.pg_trigger_depth() > 0
    and private.jwt_sub() is null
    and user_id = nullif(pg_catalog.current_setting('kilvora.signup_user_id', true), '')::uuid
    and member_role = 'titular');

create policy portal_registrar_select on private.staff_provisioning
  as permissive for select to portal_registrar
  using (
    pg_catalog.pg_trigger_depth() > 0
    and email_normalized = nullif(pg_catalog.current_setting('kilvora.signup_email', true), ''));

create policy portal_registrar_update on private.staff_provisioning
  as permissive for update to portal_registrar
  using (
    pg_catalog.pg_trigger_depth() > 0
    and email_normalized = nullif(pg_catalog.current_setting('kilvora.signup_email', true), '')
    and consumed_at is null and cancelled_at is null)
  with check (
    consumed_user_id = nullif(pg_catalog.current_setting('kilvora.signup_user_id', true), '')::uuid);

create policy portal_registrar_insert on private.audit_log
  as permissive for insert to portal_registrar
  with check (
    pg_catalog.pg_trigger_depth() > 0
    and actor_id is null
    and action in ('user_registered', 'staff_registered'));

-- -----------------------------------------------------------------------------
-- 10. Funções internas (dono final: portal_definer; SECURITY INVOKER; sem EXECUTE)
-- -----------------------------------------------------------------------------
create function private.require_user()
  returns uuid
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $fn$
declare
  v_uid uuid := private.jwt_sub();
begin
  if v_uid is null or private.jwt_role() is distinct from 'authenticated' then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  return v_uid;
end
$fn$;

create function private.write_audit(
  p_action text, p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb)
  returns void
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  insert into private.audit_log (actor_id, actor_aal, action, entity_type, entity_id, before, after)
  values (private.jwt_sub(), private.jwt_aal(), p_action, p_entity_type, p_entity_id, p_before, p_after);
end
$fn$;

create function private.next_ticket_reference()
  returns text
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  return 'KG-' || pg_catalog.to_char(pg_catalog.now(), 'YYYY') || '-'
      || pg_catalog.lpad(pg_catalog.nextval('private.ticket_reference_seq')::text, 6, '0');
end
$fn$;

revoke all on function private.require_user() from public, anon, authenticated, service_role;
revoke all on function private.write_audit(text, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.next_ticket_reference() from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11. Triggers de registo (dono final: portal_registrar; B2, I5)
-- -----------------------------------------------------------------------------
create function private.mark_user_invited()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_list text;
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' or tg_op <> 'UPDATE'
     or tg_when <> 'AFTER' or tg_level <> 'ROW' then
    raise exception using errcode = '42501', message = 'mark_user_invited: contexto de trigger inválido';
  end if;
  if new.email is null or pg_catalog.btrim(new.email) = '' then
    return null;
  end if;
  v_list := coalesce(pg_catalog.current_setting('kilvora.signup_invited', true), '');
  perform pg_catalog.set_config(
    'kilvora.signup_invited',
    v_list || ',' || new.id::text || '|' || pg_catalog.lower(pg_catalog.btrim(new.email)) || ',',
    true);
  return null;
end
$fn$;

create function private.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_email      text;
  v_invited    boolean;
  v_meta       jsonb;
  v_full_name  text;
  v_company    text;
  v_locale     text;
  v_prov_id    bigint;
  v_account_id uuid;
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' or tg_op <> 'INSERT'
     or tg_when <> 'AFTER' or tg_level <> 'ROW' then
    raise exception using errcode = '42501', message = 'handle_new_user: contexto de trigger inválido';
  end if;
  if new.email is null or pg_catalog.btrim(new.email) = '' then
    raise exception using errcode = '23502', message = 'registo sem e-mail não é suportado';
  end if;

  v_email := pg_catalog.lower(pg_catalog.btrim(new.email));
  -- I5: correspondência exacta utilizador + e-mail no marcador de convite.
  v_invited := pg_catalog.strpos(
                 coalesce(pg_catalog.current_setting('kilvora.signup_invited', true), ''),
                 ',' || new.id::text || '|' || v_email || ',') > 0;

  v_meta := case when pg_catalog.jsonb_typeof(new.raw_user_meta_data) = 'object'
                 then new.raw_user_meta_data else '{}'::jsonb end;
  -- Nunca se lêem papéis, kind ou is_admin dos metadados.
  v_full_name := nullif(pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(
                   pg_catalog.regexp_replace(coalesce(v_meta ->> 'full_name', ''), '[[:cntrl:]]', '', 'g')), 120)), '');
  v_company := nullif(pg_catalog.btrim(pg_catalog.left(pg_catalog.btrim(
                 pg_catalog.regexp_replace(coalesce(v_meta ->> 'company', ''), '[[:cntrl:]]', '', 'g')), 160)), '');
  v_locale := case when (v_meta ->> 'locale') = 'pt-BR' then 'pt-BR' else 'pt-AO' end;

  perform pg_catalog.set_config('kilvora.signup_user_id', new.id::text, true);
  perform pg_catalog.set_config('kilvora.signup_email', v_email, true);

  if v_invited then
    select sp.id into v_prov_id
    from private.staff_provisioning sp
    where sp.email_normalized = v_email
      and sp.consumed_at is null and sp.cancelled_at is null
      and sp.expires_at > pg_catalog.now()
    for update;
  end if;

  if v_prov_id is not null then
    insert into public.profiles (id, kind, status, full_name, locale)
    values (new.id, 'interno', 'activo', v_full_name, v_locale);
    update private.staff_provisioning
      set consumed_at = pg_catalog.now(), consumed_user_id = new.id
      where id = v_prov_id;
    insert into private.audit_log (action, entity_type, entity_id, after)
    values ('staff_registered', 'profile', new.id::text,
            pg_catalog.jsonb_build_object('kind', 'interno', 'provisioning_id', v_prov_id));
  else
    insert into public.profiles (id, kind, status, full_name, locale)
    values (new.id, 'cliente', 'activo', v_full_name, v_locale);
    v_account_id := pg_catalog.gen_random_uuid();
    insert into public.accounts (id, name, created_by)
    values (v_account_id, coalesce(v_company, 'Conta pessoal'), new.id);
    insert into public.account_members (account_id, user_id, member_role)
    values (v_account_id, new.id, 'titular');
    insert into private.audit_log (action, entity_type, entity_id, after)
    values ('user_registered', 'profile', new.id::text,
            pg_catalog.jsonb_build_object('kind', 'cliente', 'account_id', v_account_id));
  end if;

  perform pg_catalog.set_config('kilvora.signup_user_id', '', true);
  perform pg_catalog.set_config('kilvora.signup_email', '', true);
  return null;
end
$fn$;

revoke all on function private.mark_user_invited() from public, anon, authenticated, service_role;
revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;

-- Convite: o GoTrue grava invited_at por UPDATE na mesma transacção do INSERT.
create trigger auth_user_invited
  after update of invited_at on auth.users
  for each row
  when (old.invited_at is null and new.invited_at is not null)
  execute function private.mark_user_invited();

-- Criação: diferida para o COMMIT, depois do UPDATE do convite.
create constraint trigger auth_user_created
  after insert on auth.users
  deferrable initially deferred
  for each row
  execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- 12. RPCs (dono final: portal_definer; SECURITY DEFINER; EXECUTE: authenticated)
--     Erros: PT404 not_found_or_forbidden · PT409 conflito · PT422 regra ·
--            PT429 limite · 42501 autenticação/auto-acção · 22023 validação
-- -----------------------------------------------------------------------------
create function public.create_ticket(p_type public.ticket_type, p_subject text, p_description text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid     uuid := private.require_user();
  v_account uuid;
  v_subject text := pg_catalog.btrim(coalesce(p_subject, ''));
  v_desc    text := pg_catalog.btrim(coalesce(p_description, ''));
  v_id      uuid := pg_catalog.gen_random_uuid();
  v_ref     text;
begin
  if p_type is null then
    raise exception using errcode = '22023', message = 'invalid_type';
  end if;
  if pg_catalog.char_length(v_subject) not between 3 and 160 then
    raise exception using errcode = '22023', message = 'invalid_subject';
  end if;
  if pg_catalog.char_length(v_desc) not between 10 and 5000 then
    raise exception using errcode = '22023', message = 'invalid_description';
  end if;

  select m.account_id into v_account
  from public.account_members m
  join public.accounts a on a.id = m.account_id
  where m.user_id = v_uid and a.status = 'activa' and private.is_account_member(m.account_id)
  order by (m.member_role = 'titular') desc, m.account_id
  limit 1;
  if v_account is null then
    raise exception using errcode = '42501', message = 'no_active_account';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.ticket_create:' || v_uid::text));
  if (select count(*) from public.tickets t
      where t.requester_id = v_uid and t.created_at > pg_catalog.now() - interval '1 hour') >= 5 then
    raise exception using errcode = 'PT429', message = 'rate_limited';
  end if;
  if (select count(*) from public.tickets t
      where t.requester_id = v_uid and t.status not in ('concluido', 'recusado', 'cancelado')) >= 10 then
    raise exception using errcode = 'PT429', message = 'too_many_open_tickets';
  end if;

  v_ref := private.next_ticket_reference();
  insert into public.tickets (id, reference, account_id, requester_id, type, subject, description)
  values (v_id, v_ref, v_account, v_uid, p_type, v_subject, v_desc);
  insert into public.ticket_events (ticket_id, actor_id, event_type, to_status, visibility)
  values (v_id, v_uid, 'created', 'recebido', 'cliente');
  perform private.write_audit('ticket_created', 'ticket', v_id::text, null,
                              pg_catalog.jsonb_build_object('reference', v_ref, 'type', p_type));
  return pg_catalog.jsonb_build_object('id', v_id, 'reference', v_ref);
end
$fn$;

create function public.add_ticket_message(p_ticket_id uuid, p_body text)
  returns bigint
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid     uuid := private.require_user();
  v_body    text := pg_catalog.btrim(coalesce(p_body, ''));
  v_status  public.ticket_status;
  v_account uuid;
  v_id      bigint;
begin
  -- A3: autorização antes da validação do conteúdo (sem revelar nada a terceiros).
  -- O SELECT … FOR UPDATE seguinte, sob RLS, é a verificação autoritativa (sem TOCTOU).
  if not private.can_view_ticket(p_ticket_id) then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if pg_catalog.char_length(v_body) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid_body';
  end if;
  select t.status, t.account_id into v_status, v_account
  from public.tickets t where t.id = p_ticket_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if v_status in ('concluido', 'recusado', 'cancelado') then
    raise exception using errcode = 'PT409', message = 'ticket_closed';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.message:' || v_uid::text));
  if (select count(*) from public.ticket_messages m
      where m.author_id = v_uid and m.created_at > pg_catalog.now() - interval '1 hour') >= 30 then
    raise exception using errcode = 'PT429', message = 'rate_limited';
  end if;

  insert into public.ticket_messages (ticket_id, author_id, body)
  values (p_ticket_id, v_uid, v_body)
  returning id into v_id;
  insert into public.ticket_events (ticket_id, actor_id, event_type, visibility)
  values (p_ticket_id, v_uid, 'message_added', 'cliente');
  -- A1: auditoria na mesma transacção; só o identificador, nunca o conteúdo.
  perform private.write_audit('ticket_message_added', 'ticket', p_ticket_id::text, null,
                              pg_catalog.jsonb_build_object('message_id', v_id));

  if v_status = 'aguarda_cliente' and private.is_account_member(v_account) then
    update public.tickets set status = 'em_analise' where id = p_ticket_id;
    insert into public.ticket_events (ticket_id, actor_id, event_type, from_status, to_status, visibility)
    values (p_ticket_id, v_uid, 'status_changed', 'aguarda_cliente', 'em_analise', 'cliente');
    perform private.write_audit('ticket_status_changed', 'ticket', p_ticket_id::text,
                                pg_catalog.jsonb_build_object('status', 'aguarda_cliente'),
                                pg_catalog.jsonb_build_object('status', 'em_analise', 'actor', 'cliente_resposta'));
  end if;
  return v_id;
end
$fn$;

create function public.add_internal_note(p_ticket_id uuid, p_body text)
  returns bigint
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid  uuid := private.require_user();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_id   bigint;
begin
  if not (private.is_assigned(p_ticket_id) or private.is_admin())
     or not exists (select 1 from public.tickets t where t.id = p_ticket_id) then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if pg_catalog.char_length(v_body) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'invalid_body';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.note:' || v_uid::text));
  if (select count(*) from public.ticket_internal_notes n
      where n.author_id = v_uid and n.created_at > pg_catalog.now() - interval '1 hour') >= 60 then
    raise exception using errcode = 'PT429', message = 'rate_limited';
  end if;

  insert into public.ticket_internal_notes (ticket_id, author_id, body)
  values (p_ticket_id, v_uid, v_body)
  returning id into v_id;
  insert into public.ticket_events (ticket_id, actor_id, event_type, visibility)
  values (p_ticket_id, v_uid, 'note_added', 'interno');
  -- A2: auditoria na mesma transacção; só o identificador (a nota é confidencial e
  -- a auditoria só é legível por admin aal2). A política INSERT da nota revalida a
  -- atribuição no momento da escrita (sem TOCTOU).
  perform private.write_audit('ticket_note_added', 'ticket', p_ticket_id::text, null,
                              pg_catalog.jsonb_build_object('note_id', v_id));
  return v_id;
end
$fn$;

create function public.change_ticket_status(
  p_ticket_id uuid,
  p_to_status public.ticket_status,
  p_reason text default null,
  p_evidence_ref text default null,
  p_expected_status public.ticket_status default null)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid       uuid := private.require_user();
  v_from      public.ticket_status;
  v_account   uuid;
  v_actor     private.transition_actor;
  v_need_rsn  boolean;
  v_need_evd  boolean;
  v_reason    text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_evidence  text := nullif(pg_catalog.btrim(coalesce(p_evidence_ref, '')), '');
begin
  select t.status, t.account_id into v_from, v_account
  from public.tickets t where t.id = p_ticket_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if p_expected_status is not null and p_expected_status <> v_from then
    raise exception using errcode = 'PT409', message = 'status_conflict';
  end if;

  if private.is_assigned(p_ticket_id) or private.is_admin() then
    v_actor := 'staff';
  elsif private.is_account_member(v_account) then
    v_actor := 'cliente';
  else
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;

  select tt.requires_reason, tt.requires_evidence into v_need_rsn, v_need_evd
  from private.ticket_transitions tt
  where tt.from_status = v_from and tt.to_status = p_to_status and tt.actor = v_actor;
  if not found then
    raise exception using errcode = 'PT422', message = 'transition_not_allowed';
  end if;
  if v_need_rsn and v_reason is null then
    raise exception using errcode = 'PT422', message = 'reason_required';
  end if;
  if v_need_evd and v_evidence is null then
    raise exception using errcode = 'PT422', message = 'evidence_required';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_reason';
  end if;
  if v_evidence is not null and pg_catalog.char_length(v_evidence) > 300 then
    raise exception using errcode = '22023', message = 'invalid_evidence_ref';
  end if;

  update public.tickets
    set status = p_to_status,
        closed_at = case when p_to_status in ('concluido', 'recusado', 'cancelado') then pg_catalog.now() else null end
    where id = p_ticket_id;
  insert into public.ticket_events (ticket_id, actor_id, event_type, from_status, to_status, reason, evidence_ref, visibility)
  values (p_ticket_id, v_uid, 'status_changed', v_from, p_to_status, v_reason, v_evidence, 'cliente');
  perform private.write_audit('ticket_status_changed', 'ticket', p_ticket_id::text,
                              pg_catalog.jsonb_build_object('status', v_from),
                              pg_catalog.jsonb_build_object('status', p_to_status, 'actor', v_actor));
  return pg_catalog.jsonb_build_object('id', p_ticket_id, 'status', p_to_status);
end
$fn$;

create function public.reopen_ticket(p_ticket_id uuid, p_reason text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid    uuid := private.require_user();
  v_from   public.ticket_status;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  select t.status into v_from from public.tickets t where t.id = p_ticket_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if v_reason is null then
    raise exception using errcode = 'PT422', message = 'reason_required';
  end if;
  if pg_catalog.char_length(v_reason) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_reason';
  end if;
  if not exists (
    select 1 from private.ticket_transitions tt
    where tt.from_status = v_from and tt.to_status = 'em_analise' and tt.actor = 'admin'
  ) then
    raise exception using errcode = 'PT422', message = 'transition_not_allowed';
  end if;

  update public.tickets set status = 'em_analise', closed_at = null where id = p_ticket_id;
  insert into public.ticket_events (ticket_id, actor_id, event_type, from_status, to_status, reason, visibility)
  values (p_ticket_id, v_uid, 'reopened', v_from, 'em_analise', v_reason, 'cliente');
  perform private.write_audit('ticket_reopened', 'ticket', p_ticket_id::text,
                              pg_catalog.jsonb_build_object('status', v_from),
                              pg_catalog.jsonb_build_object('status', 'em_analise'));
  return pg_catalog.jsonb_build_object('id', p_ticket_id, 'status', 'em_analise');
end
$fn$;

create function public.assign_ticket(p_ticket_id uuid, p_operator_id uuid default null)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid       uuid := private.require_user();
  v_status    public.ticket_status;
  v_current   uuid;
  v_requester uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  select t.status, t.assigned_operator_id, t.requester_id into v_status, v_current, v_requester
  from public.tickets t where t.id = p_ticket_id
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if v_status in ('concluido', 'recusado', 'cancelado') then
    raise exception using errcode = 'PT409', message = 'ticket_closed';
  end if;
  if p_operator_id is not null then
    if p_operator_id = v_requester or not exists (
      select 1 from public.user_roles r
      join public.profiles p on p.id = r.user_id
      where r.user_id = p_operator_id and r.role = 'operador' and r.revoked_at is null
        and p.kind = 'interno' and p.status = 'activo'
    ) then
      raise exception using errcode = '22023', message = 'invalid_operator';
    end if;
  end if;
  if p_operator_id is not distinct from v_current then
    return pg_catalog.jsonb_build_object('id', p_ticket_id, 'assigned_operator_id', v_current);
  end if;

  update public.tickets set assigned_operator_id = p_operator_id where id = p_ticket_id;
  if v_current is not null then
    insert into public.ticket_events (ticket_id, actor_id, event_type, visibility)
    values (p_ticket_id, v_uid, 'unassigned', 'interno');
  end if;
  if p_operator_id is not null then
    insert into public.ticket_events (ticket_id, actor_id, event_type, visibility)
    values (p_ticket_id, v_uid, 'assigned', 'interno');
  end if;
  perform private.write_audit('ticket_assigned', 'ticket', p_ticket_id::text,
                              pg_catalog.jsonb_build_object('assigned_operator_id', v_current),
                              pg_catalog.jsonb_build_object('assigned_operator_id', p_operator_id));
  return pg_catalog.jsonb_build_object('id', p_ticket_id, 'assigned_operator_id', p_operator_id);
end
$fn$;

create function public.grant_role(p_user_id uuid, p_role public.staff_role)
  returns bigint
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
  v_id  bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if p_user_id = v_uid then
    raise exception using errcode = '42501', message = 'self_grant_forbidden';
  end if;
  if p_role is null or not exists (
    select 1 from public.profiles p where p.id = p_user_id and p.kind = 'interno' and p.status = 'activo'
  ) then
    raise exception using errcode = '22023', message = 'invalid_target';
  end if;
  if exists (
    select 1 from public.user_roles r
    where r.user_id = p_user_id and r.role = p_role and r.revoked_at is null
  ) then
    raise exception using errcode = 'PT409', message = 'role_already_active';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (p_user_id, p_role, v_uid)
  returning id into v_id;
  perform private.write_audit('role_granted', 'user_role', v_id::text, null,
                              pg_catalog.jsonb_build_object('user_id', p_user_id, 'role', p_role));
  return v_id;
end
$fn$;

create function public.revoke_role(p_user_id uuid, p_role public.staff_role)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid     uuid := private.require_user();
  v_role_id bigint;
  v_ticket  record;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if p_user_id = v_uid then
    raise exception using errcode = '42501', message = 'self_revoke_forbidden';
  end if;
  select r.id into v_role_id
  from public.user_roles r
  where r.user_id = p_user_id and r.role = p_role and r.revoked_at is null
  for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if p_role = 'admin' and (
    select count(*) from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.role = 'admin' and r.revoked_at is null and p.status = 'activo'
  ) <= 1 then
    raise exception using errcode = 'PT409', message = 'last_admin';
  end if;

  update public.user_roles set revoked_at = pg_catalog.now(), revoked_by = v_uid where id = v_role_id;

  if p_role = 'operador' then
    for v_ticket in
      select t.id from public.tickets t
      where t.assigned_operator_id = p_user_id
        and t.status not in ('concluido', 'recusado', 'cancelado')
      order by t.id
      for update
    loop
      update public.tickets set assigned_operator_id = null where id = v_ticket.id;
      insert into public.ticket_events (ticket_id, actor_id, event_type, reason, visibility)
      values (v_ticket.id, v_uid, 'unassigned', 'Papel de operador revogado', 'interno');
    end loop;
  end if;

  perform private.write_audit('role_revoked', 'user_role', v_role_id::text,
                              pg_catalog.jsonb_build_object('user_id', p_user_id, 'role', p_role), null);
end
$fn$;

create function public.admin_provision_staff(p_email text)
  returns bigint
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid   uuid := private.require_user();
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_id    bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if pg_catalog.char_length(v_email) not between 3 and 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode = '22023', message = 'invalid_email';
  end if;

  -- Provisionamentos expirados deste e-mail são cancelados (com autor).
  update private.staff_provisioning
    set cancelled_at = pg_catalog.now(), cancelled_by = v_uid
    where email_normalized = v_email and consumed_at is null and cancelled_at is null
      and expires_at <= pg_catalog.now();
  if exists (
    select 1 from private.staff_provisioning sp
    where sp.email_normalized = v_email and sp.consumed_at is null and sp.cancelled_at is null
  ) then
    raise exception using errcode = 'PT409', message = 'already_provisioned';
  end if;

  insert into private.staff_provisioning (email_normalized, provisioned_by, expires_at)
  values (v_email, v_uid, pg_catalog.now() + interval '72 hours')
  returning id into v_id;
  perform private.write_audit('staff_provisioned', 'staff_provisioning', v_id::text, null,
                              pg_catalog.jsonb_build_object('expires_in_hours', 72));
  return v_id;
end
$fn$;

create function public.admin_cancel_staff_provisioning(p_provisioning_id bigint)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  update private.staff_provisioning
    set cancelled_at = pg_catalog.now(), cancelled_by = v_uid
    where id = p_provisioning_id and consumed_at is null and cancelled_at is null;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  perform private.write_audit('staff_provisioning_cancelled', 'staff_provisioning', p_provisioning_id::text, null, null);
end
$fn$;

create function public.admin_set_profile_status(p_user_id uuid, p_status public.profile_status)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid    uuid := private.require_user();
  v_before public.profile_status;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if p_user_id = v_uid then
    raise exception using errcode = '42501', message = 'self_status_change_forbidden';
  end if;
  if p_status is null or p_status = 'anonimizado' then
    raise exception using errcode = '22023', message = 'status_not_supported';
  end if;
  select p.status into v_before from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if v_before = 'anonimizado' then
    raise exception using errcode = 'PT409', message = 'profile_anonymised';
  end if;
  if p_status <> 'activo'
     and exists (select 1 from public.user_roles r
                 where r.user_id = p_user_id and r.role = 'admin' and r.revoked_at is null)
     and (select count(*) from public.user_roles r
          join public.profiles p on p.id = r.user_id
          where r.role = 'admin' and r.revoked_at is null and p.status = 'activo') <= 1 then
    raise exception using errcode = 'PT409', message = 'last_admin';
  end if;

  update public.profiles set status = p_status where id = p_user_id;
  perform private.write_audit('profile_status_changed', 'profile', p_user_id::text,
                              pg_catalog.jsonb_build_object('status', v_before),
                              pg_catalog.jsonb_build_object('status', p_status));
end
$fn$;

create function public.admin_audit_log(
  p_entity_type text default null,
  p_entity_id text default null,
  p_since timestamptz default null,
  p_limit integer default 100)
  returns table (
    id bigint, occurred_at timestamptz, actor_id uuid, actor_aal text, action text,
    entity_type text, entity_id text, before jsonb, after jsonb)
  language plpgsql
  security definer
  set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_uid   uuid := private.require_user();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  return query
    select a.id, a.occurred_at, a.actor_id, a.actor_aal, a.action,
           a.entity_type, a.entity_id, a.before, a.after
    from private.audit_log a
    where (p_entity_type is null or a.entity_type = p_entity_type)
      and (p_entity_id is null or a.entity_id = p_entity_id)
      and (p_since is null or a.occurred_at >= p_since)
    order by a.occurred_at desc, a.id desc
    limit v_limit;
end
$fn$;

-- Única via de leitura de evidence_ref (excluída de authenticated na M3).
create function public.staff_ticket_events(p_ticket_id uuid)
  returns setof public.ticket_events
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid uuid := private.require_user();
begin
  if not (private.is_assigned(p_ticket_id) or private.is_admin()) then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  return query
    select e.* from public.ticket_events e
    where e.ticket_id = p_ticket_id
    order by e.created_at, e.id;
end
$fn$;

revoke all on function public.create_ticket(public.ticket_type, text, text) from public, anon, authenticated, service_role;
revoke all on function public.add_ticket_message(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.add_internal_note(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.change_ticket_status(uuid, public.ticket_status, text, text, public.ticket_status)
  from public, anon, authenticated, service_role;
revoke all on function public.reopen_ticket(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.assign_ticket(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.grant_role(uuid, public.staff_role) from public, anon, authenticated, service_role;
revoke all on function public.revoke_role(uuid, public.staff_role) from public, anon, authenticated, service_role;
revoke all on function public.admin_provision_staff(text) from public, anon, authenticated, service_role;
revoke all on function public.admin_cancel_staff_provisioning(bigint) from public, anon, authenticated, service_role;
revoke all on function public.admin_set_profile_status(uuid, public.profile_status) from public, anon, authenticated, service_role;
revoke all on function public.admin_audit_log(text, text, timestamptz, integer) from public, anon, authenticated, service_role;
revoke all on function public.staff_ticket_events(uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_ticket(public.ticket_type, text, text) to authenticated;
grant execute on function public.add_ticket_message(uuid, text) to authenticated;
grant execute on function public.add_internal_note(uuid, text) to authenticated;
grant execute on function public.change_ticket_status(uuid, public.ticket_status, text, text, public.ticket_status) to authenticated;
grant execute on function public.reopen_ticket(uuid, text) to authenticated;
grant execute on function public.assign_ticket(uuid, uuid) to authenticated;
grant execute on function public.grant_role(uuid, public.staff_role) to authenticated;
grant execute on function public.revoke_role(uuid, public.staff_role) to authenticated;
grant execute on function public.admin_provision_staff(text) to authenticated;
grant execute on function public.admin_cancel_staff_provisioning(bigint) to authenticated;
grant execute on function public.admin_set_profile_status(uuid, public.profile_status) to authenticated;
grant execute on function public.admin_audit_log(text, text, timestamptz, integer) to authenticated;
grant execute on function public.staff_ticket_events(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 13. Transferência de propriedade (A3: CREATE temporário no esquema)
-- -----------------------------------------------------------------------------
grant create on schema public to portal_definer;
grant create on schema private to portal_guard, portal_definer, portal_registrar;

alter function private.is_staff() owner to portal_guard;
alter function private.is_admin() owner to portal_guard;
alter function private.is_account_member(uuid) owner to portal_guard;
alter function private.is_account_owner(uuid) owner to portal_guard;
alter function private.is_assigned(uuid) owner to portal_guard;
alter function private.can_view_ticket(uuid) owner to portal_guard;

alter function private.require_user() owner to portal_definer;
alter function private.write_audit(text, text, text, jsonb, jsonb) owner to portal_definer;
alter function private.next_ticket_reference() owner to portal_definer;
alter function public.create_ticket(public.ticket_type, text, text) owner to portal_definer;
alter function public.add_ticket_message(uuid, text) owner to portal_definer;
alter function public.add_internal_note(uuid, text) owner to portal_definer;
alter function public.change_ticket_status(uuid, public.ticket_status, text, text, public.ticket_status) owner to portal_definer;
alter function public.reopen_ticket(uuid, text) owner to portal_definer;
alter function public.assign_ticket(uuid, uuid) owner to portal_definer;
alter function public.grant_role(uuid, public.staff_role) owner to portal_definer;
alter function public.revoke_role(uuid, public.staff_role) owner to portal_definer;
alter function public.admin_provision_staff(text) owner to portal_definer;
alter function public.admin_cancel_staff_provisioning(bigint) owner to portal_definer;
alter function public.admin_set_profile_status(uuid, public.profile_status) owner to portal_definer;
alter function public.admin_audit_log(text, text, timestamptz, integer) owner to portal_definer;
alter function public.staff_ticket_events(uuid) owner to portal_definer;

alter function private.mark_user_invited() owner to portal_registrar;
alter function private.handle_new_user() owner to portal_registrar;

revoke create on schema public from portal_definer;
revoke create on schema private from portal_guard, portal_definer, portal_registrar;

-- -----------------------------------------------------------------------------
-- 14. Auto-verificação (aborta a migração se alguma garantia falhar)
-- -----------------------------------------------------------------------------
do $selfcheck$
declare
  v_list  text;
  v_count int;
  v_roles constant text[] := array['portal_guard', 'portal_definer', 'portal_registrar'];
begin
  -- 14.1 Donos exactos
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and pg_catalog.pg_get_userbyid(p.proowner) <> case
      when p.proname in ('is_staff', 'is_admin', 'is_account_member', 'is_account_owner', 'is_assigned', 'can_view_ticket')
        then 'portal_guard'
      when p.proname in ('mark_user_invited', 'handle_new_user')
        then 'portal_registrar'
      when p.proname in ('require_user', 'write_audit', 'next_ticket_reference', 'create_ticket', 'add_ticket_message',
                         'add_internal_note', 'change_ticket_status', 'reopen_ticket', 'assign_ticket', 'grant_role',
                         'revoke_role', 'admin_provision_staff', 'admin_cancel_staff_provisioning',
                         'admin_set_profile_status', 'admin_audit_log', 'staff_ticket_events')
        then 'portal_definer'
      else 'postgres' end;
  if v_list is not null then
    raise exception 'M2 auto-verificação: donos inesperados em %', v_list;
  end if;

  -- 14.2 SECURITY DEFINER nunca de postgres e sempre com search_path vazio
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and ((p.prosecdef and pg_catalog.pg_get_userbyid(p.proowner) <> all (v_roles))
         or not coalesce(p.proconfig @> array['search_path=""'], false));
  if v_list is not null then
    raise exception 'M2 auto-verificação: definer/search_path indevido em %', v_list;
  end if;

  -- 14.3 Nenhum EXECUTE para PUBLIC, anon ou service_role (proacl nulo = PUBLIC)
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and (p.proacl is null or exists (
      select 1 from pg_catalog.aclexplode(p.proacl) a
      where a.grantee = 0
         or a.grantee in (select oid from pg_catalog.pg_roles where rolname in ('anon', 'service_role'))));
  if v_list is not null then
    raise exception 'M2 auto-verificação: EXECUTE proibido em %', v_list;
  end if;

  -- 14.4 authenticated executa exactamente 23 funções (13 RPCs + 4 JWT + 6 auxiliares)
  select count(*) into v_count
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_count <> 23 then
    raise exception 'M2 auto-verificação: authenticated executa % funções (esperado 23)', v_count;
  end if;

  -- 14.5 Sem CREATE nos esquemas para os papéis do portal
  select string_agg(r || ' em ' || s, ', ') into v_list
  from unnest(v_roles) r cross join unnest(array['public', 'private']) s
  where pg_catalog.has_schema_privilege(r, s, 'CREATE');
  if v_list is not null then
    raise exception 'M2 auto-verificação: CREATE indevido: %', v_list;
  end if;

  -- 14.6 portal_registrar: atributos e membros
  if (select count(*) from pg_catalog.pg_roles where rolname = 'portal_registrar'
      and not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin or rolreplication or rolinherit)) <> 1 then
    raise exception 'M2 auto-verificação: atributos indevidos em portal_registrar';
  end if;
  if exists (
    select 1 from pg_catalog.pg_auth_members am
    join pg_catalog.pg_roles r on r.oid = am.roleid
    join pg_catalog.pg_roles m on m.oid = am.member
    where (r.rolname = 'portal_registrar' and (m.rolname <> 'postgres' or am.inherit_option))
       or m.rolname = 'portal_registrar'
  ) then
    raise exception 'M2 auto-verificação: pertenças indevidas de portal_registrar';
  end if;

  -- 14.7 Triggers de registo em auth.users
  select count(*) into v_count from pg_catalog.pg_trigger
  where tgrelid = 'auth.users'::regclass and not tgisinternal
    and tgname in ('auth_user_created', 'auth_user_invited');
  if v_count <> 2 then
    raise exception 'M2 auto-verificação: triggers de registo em auth.users: % de 2', v_count;
  end if;

  -- 14.8 Matriz de transições
  if (select count(*) from private.ticket_transitions) <> 24 then
    raise exception 'M2 auto-verificação: matriz de transições incompleta';
  end if;

  -- 14.9 Nenhuma política para os papéis da API (ficam para a M3)
  select string_agg(schemaname || '.' || tablename || ':' || policyname, ', ') into v_list
  from pg_catalog.pg_policies
  where schemaname in ('public', 'private')
    and roles && array['public', 'anon', 'authenticated', 'service_role']::name[];
  if v_list is not null then
    raise exception 'M2 auto-verificação: políticas para papéis da API: %', v_list;
  end if;

  -- 14.10 Nenhum privilégio de tabela para os papéis da API (ficam para a M3)
  select string_agg(distinct c.oid::regclass::text, ', ') into v_list
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['public', 'anon', 'authenticated', 'service_role']) r
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'S')
    and pg_catalog.has_table_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if v_list is not null then
    raise exception 'M2 auto-verificação: privilégios de tabela para a API em %', v_list;
  end if;

  -- 14.11 Papéis do portal sem privilégios em tabelas do esquema auth
  select string_agg(distinct r || ' em ' || c.oid::regclass::text, ', ') into v_list
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join unnest(v_roles) r
  where n.nspname = 'auth' and c.relkind in ('r', 'v', 'S')
    and pg_catalog.has_table_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  if v_list is not null then
    raise exception 'M2 auto-verificação: privilégios em auth: %', v_list;
  end if;

  -- 14.12 Privilégios por omissão não referem o portal
  if exists (
    select 1 from pg_catalog.pg_default_acl d
    left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'private'
       or d.defaclrole in (select oid from pg_catalog.pg_roles where rolname = any (v_roles))
  ) then
    raise exception 'M2 auto-verificação: privilégios por omissão referem o portal';
  end if;
end
$selfcheck$;
