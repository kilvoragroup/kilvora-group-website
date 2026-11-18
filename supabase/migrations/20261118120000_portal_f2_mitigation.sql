-- =============================================================================
-- KILVORA GROUP — Portal V1 — M4-BD: mitigação definitiva do F2
-- (documentacao/engenharia/portal-m4-bd-proposta.md, correcções C1–C5)
--
-- 1. private.auth_invite_facts: factos de convite IMUTÁVEIS, gravados por um gatilho
--    NOVO em auth.users (C1). handle_new_user e mark_user_invited NÃO são alterados.
-- 2. admin_staff_provisioning_status(id): estado de um provisionamento (fecha L2).
-- 3. admin_remove_misclassified_registration(user, provisionamento): remove o perfil
--    cliente, a conta pessoal e a associação de um registo mal classificado (F2),
--    com guardas estritas (C3, C4) e auditoria.
-- 4. DELETE mínimo para portal_definer em profiles/accounts/account_members, com
--    políticas presas ao alvo marcado na própria transacção (C2).
--
-- Sem alteração de dados existentes. Sem CASCADE. Reversão:
-- supabase/rollback/20261118120000_portal_f2_mitigation.down.sql (só local).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
do $guard$
begin
  if to_regprocedure('public.staff_ticket_events(uuid)') is null
     or to_regprocedure('private.handle_new_user()') is null
     or to_regprocedure('private.mark_user_invited()') is null then
    raise exception 'M4: a M2 não está aplicada';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies
                 where schemaname = 'public' and tablename = 'tickets' and policyname = 'api_tickets_select') then
    raise exception 'M4: a M3 não está aplicada';
  end if;
  if to_regclass('private.auth_invite_facts') is not null
     or to_regprocedure('public.admin_remove_misclassified_registration(uuid,bigint)') is not null
     or to_regprocedure('public.admin_staff_provisioning_status(bigint)') is not null
     or to_regprocedure('private.record_auth_invite()') is not null then
    raise exception 'M4: objectos da M4 já existem';
  end if;
  if exists (select 1 from pg_catalog.pg_policies
             where schemaname = 'public' and cmd = 'DELETE'
               and tablename in ('profiles', 'accounts', 'account_members')) then
    raise exception 'M4: já existem políticas DELETE nas tabelas de identidade';
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Factos de convite (C1): só inserção, imutáveis, sem FK (o utilizador do Auth
--    tem de poder ser apagado no Dashboard depois da correcção).
-- -----------------------------------------------------------------------------
create table private.auth_invite_facts (
  user_id     uuid primary key,
  invited_at  timestamptz not null,
  recorded_at timestamptz not null default now()
);
alter table private.auth_invite_facts enable row level security;
revoke all on table private.auth_invite_facts from public, anon, authenticated, service_role;
comment on table private.auth_invite_facts is
  'Factos de convite do Auth (M4-BD, C1): user_id e invited_at, gravados por gatilho. Imutável; sem e-mail.';

create trigger auth_invite_facts_immutable
  before update or delete on private.auth_invite_facts
  for each row execute function private.reject_mutation();
create trigger auth_invite_facts_no_truncate
  before truncate on private.auth_invite_facts
  for each statement execute function private.reject_mutation();

create function private.record_auth_invite()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $fn$
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' or tg_op <> 'UPDATE'
     or tg_when <> 'AFTER' or tg_level <> 'ROW' then
    raise exception using errcode = '42501', message = 'record_auth_invite: contexto de trigger inválido';
  end if;
  insert into private.auth_invite_facts (user_id, invited_at)
  values (new.id, new.invited_at)
  on conflict (user_id) do nothing;
  return null;
end
$fn$;
revoke all on function private.record_auth_invite() from public, anon, authenticated, service_role;

create trigger auth_user_invite_fact
  after update of invited_at on auth.users
  for each row
  when (old.invited_at is null and new.invited_at is not null)
  execute function private.record_auth_invite();

grant insert (user_id, invited_at) on private.auth_invite_facts to portal_registrar;
grant select (user_id) on private.auth_invite_facts to portal_registrar;  -- ON CONFLICT
create policy portal_registrar_insert on private.auth_invite_facts
  as permissive for insert to portal_registrar
  with check (pg_catalog.pg_trigger_depth() > 0);
create policy portal_registrar_select on private.auth_invite_facts
  as permissive for select to portal_registrar
  using (pg_catalog.pg_trigger_depth() > 0);

-- -----------------------------------------------------------------------------
-- 2. Privilégios mínimos de portal_definer (C2)
-- -----------------------------------------------------------------------------
grant select (user_id, invited_at) on private.auth_invite_facts to portal_definer;
create policy portal_definer_select on private.auth_invite_facts
  as permissive for select to portal_definer
  using (private.is_admin());

grant select (created_at) on public.profiles to portal_definer;
grant select (created_by) on public.accounts to portal_definer;
grant delete on public.profiles to portal_definer;
grant delete on public.accounts to portal_definer;
grant delete on public.account_members to portal_definer;

-- O alvo marcado (kilvora.f2_target) é só uma condição ADICIONAL: cada política exige
-- também admin aal2 e o estado elegível. Sem marcação → nenhuma linha.
create policy portal_definer_delete on public.profiles
  as permissive for delete to portal_definer
  using (
    private.is_admin()
    and id <> private.jwt_sub()
    and id = nullif(pg_catalog.current_setting('kilvora.f2_target', true), '')::uuid
    and kind = 'cliente'
    and status = 'suspenso'
    and created_at > pg_catalog.now() - interval '24 hours');

create policy portal_definer_delete on public.accounts
  as permissive for delete to portal_definer
  using (
    private.is_admin()
    and created_by = nullif(pg_catalog.current_setting('kilvora.f2_target', true), '')::uuid);

create policy portal_definer_delete on public.account_members
  as permissive for delete to portal_definer
  using (
    private.is_admin()
    and user_id = nullif(pg_catalog.current_setting('kilvora.f2_target', true), '')::uuid);

-- -----------------------------------------------------------------------------
-- 3. RPCs (dono final: portal_definer; SECURITY DEFINER; EXECUTE: authenticated)
-- -----------------------------------------------------------------------------
create function public.admin_staff_provisioning_status(p_provisioning_id bigint)
  returns table (id bigint, state text, email_masked text, created_at timestamptz,
                 expires_at timestamptz, consumed_user_id uuid, provisioned_by_me boolean)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_uid uuid := private.require_user();
begin
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  return query
    select sp.id,
           case when sp.consumed_at is not null then 'consumido'
                when sp.cancelled_at is not null then 'cancelado'
                when sp.expires_at <= pg_catalog.now() then 'expirado'
                else 'pendente' end,
           pg_catalog.left(sp.email_normalized, 1) || '***@' || pg_catalog.split_part(sp.email_normalized, '@', 2),
           sp.created_at, sp.expires_at, sp.consumed_user_id,
           sp.provisioned_by is not distinct from v_uid
    from private.staff_provisioning sp
    where sp.id = p_provisioning_id;
  if not found then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
end
$fn$;

create function public.admin_remove_misclassified_registration(p_user_id uuid, p_provisioning_id bigint)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_uid       uuid := private.require_user();
  v_profile   record;
  v_prov      record;
  v_account   uuid;
  v_rows      integer;
begin
  -- C3: serialização com as outras operações administrativas e com create_ticket do alvo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));
  if not private.is_admin() then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if p_user_id is null or p_provisioning_id is null then
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  if p_user_id = v_uid then
    raise exception using errcode = '42501', message = 'self_action_forbidden';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.ticket_create:' || p_user_id::text));

  select p.id, p.kind, p.status, p.created_at into v_profile
  from public.profiles p where p.id = p_user_id
  for update;
  if not found then
    -- Idempotência: uma segunda chamada não encontra o perfil e não audita nada.
    raise exception using errcode = 'PT404', message = 'not_found_or_forbidden';
  end if;
  -- C4: só um cliente suspenso, criado há menos de 24 h.
  if v_profile.kind <> 'cliente' or v_profile.status <> 'suspenso'
     or v_profile.created_at <= pg_catalog.now() - interval '24 hours' then
    raise exception using errcode = 'PT422', message = 'not_eligible';
  end if;
  -- C1: registo comprovadamente feito por convite do Auth.
  if not exists (select 1 from private.auth_invite_facts f where f.user_id = p_user_id) then
    raise exception using errcode = 'PT422', message = 'not_invited';
  end if;
  -- Provisionamento do MESMO admin, não consumido, criado antes do registo (≤ 7 dias).
  select sp.id, sp.provisioned_by, sp.created_at, sp.consumed_at into v_prov
  from private.staff_provisioning sp where sp.id = p_provisioning_id;
  if not found or v_prov.provisioned_by is distinct from v_uid or v_prov.consumed_at is not null
     or v_prov.created_at > v_profile.created_at
     or v_profile.created_at > v_prov.created_at + interval '7 days' then
    raise exception using errcode = 'PT422', message = 'provisioning_mismatch';
  end if;
  -- Conta pessoal: exactamente uma associação, numa conta criada pelo alvo, membro único.
  if (select count(*) from public.account_members m where m.user_id = p_user_id) <> 1
     or (select count(*) from public.accounts a where a.created_by = p_user_id) <> 1 then
    raise exception using errcode = 'PT409', message = 'has_activity';
  end if;
  select m.account_id into v_account
  from public.account_members m join public.accounts a on a.id = m.account_id
  where m.user_id = p_user_id and a.created_by = p_user_id;
  if v_account is null
     or exists (select 1 from public.account_members m where m.account_id = v_account and m.user_id <> p_user_id) then
    raise exception using errcode = 'PT409', message = 'has_activity';
  end if;
  -- Sem actividade nem referências.
  if exists (select 1 from public.tickets t
             where t.requester_id = p_user_id or t.account_id = v_account or t.assigned_operator_id = p_user_id)
     or exists (select 1 from public.ticket_events e where e.actor_id = p_user_id)
     or exists (select 1 from public.ticket_messages m where m.author_id = p_user_id)
     or exists (select 1 from public.ticket_internal_notes n where n.author_id = p_user_id)
     or exists (select 1 from public.user_roles r
                where r.user_id = p_user_id or r.granted_by = p_user_id or r.revoked_by = p_user_id)
     or exists (select 1 from private.staff_provisioning sp
                where sp.provisioned_by = p_user_id or sp.consumed_user_id = p_user_id or sp.cancelled_by = p_user_id) then
    raise exception using errcode = 'PT409', message = 'has_activity';
  end if;

  -- C2: marcação do alvo só nesta transacção, imediatamente antes das remoções.
  perform pg_catalog.set_config('kilvora.f2_target', p_user_id::text, true);
  delete from public.account_members where account_id = v_account and user_id = p_user_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception using errcode = 'PT409', message = 'concurrent_change'; end if;
  delete from public.accounts where id = v_account;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception using errcode = 'PT409', message = 'concurrent_change'; end if;
  delete from public.profiles where id = p_user_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception using errcode = 'PT409', message = 'concurrent_change'; end if;
  perform pg_catalog.set_config('kilvora.f2_target', '', true);

  perform private.write_audit('misclassified_registration_removed', 'profile', p_user_id::text,
                              pg_catalog.jsonb_build_object('kind', 'cliente', 'account_id', v_account,
                                                            'provisioning_id', p_provisioning_id),
                              null);
  return pg_catalog.jsonb_build_object('user_id', p_user_id, 'removed', true);
end
$fn$;

revoke all on function public.admin_staff_provisioning_status(bigint) from public, anon, authenticated, service_role;
revoke all on function public.admin_remove_misclassified_registration(uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.admin_staff_provisioning_status(bigint) to authenticated;
grant execute on function public.admin_remove_misclassified_registration(uuid, bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Transferência de propriedade (CREATE temporário no esquema, como na M2)
-- -----------------------------------------------------------------------------
grant create on schema public to portal_definer;
grant create on schema private to portal_registrar;
alter function public.admin_staff_provisioning_status(bigint) owner to portal_definer;
alter function public.admin_remove_misclassified_registration(uuid, bigint) owner to portal_definer;
alter function private.record_auth_invite() owner to portal_registrar;
revoke create on schema public from portal_definer;
revoke create on schema private from portal_registrar;

-- -----------------------------------------------------------------------------
-- 5. Auto-verificação
-- -----------------------------------------------------------------------------
do $selfcheck$
begin
  if pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc
       where oid = 'private.record_auth_invite()'::regprocedure)) <> 'portal_registrar'
     or pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc
       where oid = 'public.admin_remove_misclassified_registration(uuid,bigint)'::regprocedure)) <> 'portal_definer'
     or pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc
       where oid = 'public.admin_staff_provisioning_status(bigint)'::regprocedure)) <> 'portal_definer' then
    raise exception 'M4 auto-verificação: donos inesperados';
  end if;
  if exists (select 1 from pg_catalog.pg_proc p
             where p.oid in ('private.record_auth_invite()'::regprocedure,
                             'public.admin_remove_misclassified_registration(uuid,bigint)'::regprocedure,
                             'public.admin_staff_provisioning_status(bigint)'::regprocedure)
               and (not p.prosecdef or not coalesce(p.proconfig @> array['search_path=""'], false))) then
    raise exception 'M4 auto-verificação: SECURITY DEFINER/search_path';
  end if;
  if has_function_privilege('anon', 'public.admin_remove_misclassified_registration(uuid,bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.record_auth_invite()', 'EXECUTE') then
    raise exception 'M4 auto-verificação: EXECUTE indevido';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'DELETE')
     or has_table_privilege('authenticated', 'public.accounts', 'DELETE')
     or has_table_privilege('authenticated', 'public.account_members', 'DELETE')
     or has_table_privilege('authenticated', 'private.auth_invite_facts', 'SELECT')
     or has_table_privilege('anon', 'private.auth_invite_facts', 'SELECT')
     or has_table_privilege('service_role', 'private.auth_invite_facts', 'SELECT') then
    raise exception 'M4 auto-verificação: privilégios de tabela indevidos para papéis da API';
  end if;
  if has_schema_privilege('portal_definer', 'public', 'CREATE')
     or has_schema_privilege('portal_registrar', 'private', 'CREATE') then
    raise exception 'M4 auto-verificação: CREATE temporário não revogado';
  end if;
end
$selfcheck$;
