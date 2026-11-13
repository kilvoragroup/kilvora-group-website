-- =============================================================================
-- KILVORA GROUP — Portal V1 — Testes pgTAP da M2 (funções, registo, arranque)
-- Cobertura: catálogo e privilégios (C), JWT (J), arranque (BS), registo (REG),
-- S1, escalada de privilégios (E), isolamento entre contas AO/BR (I), MFA (M),
-- transições (TR), limites (RL), revogação (REV), provisionamento e estado.
-- Pressupõe base local sem arranque concluído (estado após a M2).
-- As acções sob outros papéis correm através de pg_temp.try_as, que devolve o
-- SQLSTATE ('ok' em caso de sucesso); as asserções correm sempre como postgres.
-- Executar: npx.cmd supabase test db   (transacção revertida no fim)
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

\set c_a1       '{"sub":"20000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}'
\set c_b1       '{"sub":"20000000-0000-4000-8000-0000000000b1","role":"authenticated","aal":"aal1"}'
\set c_adm      '{"sub":"20000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal2"}'
\set c_adm_aal1 '{"sub":"20000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal1"}'
\set c_adm2     '{"sub":"20000000-0000-4000-8000-0000000000d2","role":"authenticated","aal":"aal2"}'
\set c_op1      '{"sub":"20000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal2"}'
\set c_op1_aal1 '{"sub":"20000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal1"}'
\set c_op2      '{"sub":"20000000-0000-4000-8000-0000000000c2","role":"authenticated","aal":"aal2"}'
\set c_int0     '{"sub":"20000000-0000-4000-8000-0000000000c0","role":"authenticated","aal":"aal2"}'

select plan(143);

-- -----------------------------------------------------------------------------
-- Utilitários de teste (temporários; revertidos com a transacção)
-- -----------------------------------------------------------------------------
create temp table ctx (k text primary key, v text);
grant all on ctx to public;

create function pg_temp.new_user(
  p_id uuid, p_email text, p_meta jsonb default '{}'::jsonb, p_invited boolean default false)
  returns void language plpgsql as $fn$
begin
  insert into auth.users (id, email, raw_user_meta_data) values (p_id, p_email, p_meta);
  if p_invited then
    update auth.users set invited_at = now() where id = p_id;
  end if;
  set constraints all immediate;
  set constraints all deferred;
end
$fn$;

create function pg_temp.try_as(p_role text, p_claims text, p_sql text)
  returns text language plpgsql as $fn$
declare
  v_state text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v_state := 'ok';
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_state;
end
$fn$;

-- =============================================================================
-- C — Catálogo e privilégios
-- =============================================================================
select is(
  (select count(*)::int from pg_roles where rolname = 'portal_registrar'
     and not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin or rolreplication or rolinherit)),
  1, 'C1/S1-1: portal_registrar sem superuser, bypassrls, createrole, createdb, login, replication ou herança');

select is_empty($$
  select r.rolname || '<-' || m.rolname
  from pg_auth_members am join pg_roles r on r.oid = am.roleid join pg_roles m on m.oid = am.member
  where (r.rolname = 'portal_registrar' and (m.rolname <> 'postgres' or am.inherit_option))
     or m.rolname = 'portal_registrar'
$$, 'C2/S1-1: só postgres é membro de portal_registrar, sem herança; o papel não pertence a nenhum outro');

select is_empty($$
  select r from unnest(array['portal_guard', 'portal_definer', 'portal_registrar']) r
  where pg_has_role('authenticator', r, 'MEMBER') or pg_has_role('authenticated', r, 'MEMBER')
     or pg_has_role('anon', r, 'MEMBER') or pg_has_role('service_role', r, 'MEMBER')
$$, 'C3: nenhum papel da API pode assumir os papéis do portal');

select set_eq($$ select p.proname::text from pg_proc p where pg_get_userbyid(p.proowner) = 'portal_registrar' $$,
  array['handle_new_user', 'mark_user_invited'],
  'C4/S1-1: portal_registrar é dono exactamente das 2 funções de trigger de registo');

select set_eq($$ select p.proname::text from pg_proc p where pg_get_userbyid(p.proowner) = 'portal_guard' $$,
  array['is_staff', 'is_admin', 'is_account_member', 'is_account_owner', 'is_assigned', 'can_view_ticket'],
  'C5/G2: portal_guard é dono exactamente das 6 funções auxiliares');

select set_eq($$ select p.proname::text from pg_proc p where pg_get_userbyid(p.proowner) = 'portal_definer' $$,
  array['require_user', 'write_audit', 'next_ticket_reference', 'create_ticket', 'add_ticket_message',
        'add_internal_note', 'change_ticket_status', 'reopen_ticket', 'assign_ticket', 'grant_role',
        'revoke_role', 'admin_provision_staff', 'admin_cancel_staff_provisioning',
        'admin_set_profile_status', 'admin_audit_log', 'staff_ticket_events'],
  'C6/G2: portal_definer é dono exactamente das 13 RPCs e 3 funções internas');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and pg_get_userbyid(p.proowner) not in ('portal_guard', 'portal_definer', 'portal_registrar')
$$, 'C7/R-FN1: nenhuma função SECURITY DEFINER pertence a postgres ou a outro papel');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and not coalesce(p.proconfig @> array['search_path=""'], false)
$$, 'C8/F1: todas as funções do portal têm search_path vazio');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and (p.proacl is null or exists (
      select 1 from aclexplode(p.proacl) a
      where a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'service_role'))))
$$, 'C9/F2: nenhuma função com EXECUTE para PUBLIC, anon ou service_role');

select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'EXECUTE')
$$, array['jwt_claims', 'jwt_sub', 'jwt_aal', 'jwt_role',
          'is_staff', 'is_admin', 'is_account_member', 'is_account_owner', 'is_assigned', 'can_view_ticket',
          'create_ticket', 'add_ticket_message', 'add_internal_note', 'change_ticket_status', 'reopen_ticket',
          'assign_ticket', 'grant_role', 'revoke_role', 'admin_provision_staff', 'admin_cancel_staff_provisioning',
          'admin_set_profile_status', 'admin_audit_log', 'staff_ticket_events'],
  'C10: authenticated executa exactamente as funções aprovadas');

select is_empty($$
  select p.proname::text from pg_proc p
  where pg_get_userbyid(p.proowner) = 'portal_guard' and p.prorettype <> 'boolean'::regtype
$$, 'C11/G1: as funções auxiliares devolvem boolean');

select is_empty($$
  select r || ' em ' || s from unnest(array['portal_guard', 'portal_definer', 'portal_registrar']) r
  cross join unnest(array['public', 'private']) s
  where has_schema_privilege(r, s, 'CREATE')
$$, 'C12/R-ROLE5: papéis do portal sem CREATE em public/private');

select is_empty($$
  select r || ' em ' || c.oid::regclass::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['portal_guard', 'portal_definer', 'portal_registrar']) r
  where n.nspname = 'auth' and c.relkind in ('r', 'v', 'S')
    and has_table_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
$$, 'C13/R-ROLE5: papéis do portal sem privilégios em tabelas do esquema auth');

select set_eq($$ select tgname::text from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal $$,
  array['auth_user_created', 'auth_user_invited'],
  'C14/S1-2: auth.users tem exactamente os 2 triggers de registo');

select ok(
  (select tgdeferrable and tginitdeferred from pg_trigger
   where tgrelid = 'auth.users'::regclass and tgname = 'auth_user_created'),
  'C14b/B2: auth_user_created é diferido para o COMMIT');

select results_eq($$
  select actor::text, count(*)::int from private.ticket_transitions group by actor order by actor::text
$$, $$ values ('admin'::text, 3), ('cliente'::text, 5), ('staff'::text, 16) $$,
  'C15: matriz de transições com 24 linhas (3 admin, 5 cliente, 16 staff)');

-- C16/D-ACL portátil: xmin (complementar; não detecta linhas apagadas nem
-- subtransacções), premissa do xmin partilhado e conteúdo. A garantia integral é a
-- comparação antes/depois com canários no CI (job db-tests).
select is_empty($$
  select 'xmin:' || d.oid::text from pg_default_acl d
  where d.xmin::text in (select m.xmin::text from supabase_migrations.schema_migrations m)
  union all
  select 'premissa:' || m.version from supabase_migrations.schema_migrations m
  where not exists (select 1 from pg_class c where c.xmin = m.xmin)
    and not exists (select 1 from pg_proc p where p.xmin = m.xmin)
    and not exists (select 1 from pg_namespace n where n.xmin = m.xmin)
    and not exists (select 1 from pg_type t where t.xmin = m.xmin)
  union all
  select 'acl:' || d.oid::text from pg_default_acl d
  where exists (select 1 from aclexplode(d.defaclacl) a
                where a.grantee in (select oid from pg_roles where rolname like 'portal\_%'))
$$, 'C16/D-ACL: M1/M2 não criam nem alteram privilégios por omissão, nem os concedem a papéis do portal');

select is_empty($$
  select schemaname || '.' || tablename || ':' || policyname from pg_policies
  where schemaname in ('public', 'private')
    and roles && array['public', 'anon', 'authenticated', 'service_role']::name[]
$$, 'C17: nenhuma política para os papéis da API (M3)');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosrc ilike '%set_config%'
    and pg_get_userbyid(p.proowner) <> 'portal_registrar'
$$, 'C18/REG-SC: set_config só existe nas funções do portal_registrar');

select set_eq($$
  select column_name::text from information_schema.column_privileges
  where grantee = 'portal_definer' and table_schema = 'private' and table_name = 'staff_provisioning'
    and privilege_type = 'UPDATE'
$$, array['cancelled_at', 'cancelled_by'],
  'C19/PRIV-I2: portal_definer só actualiza cancelled_at/cancelled_by em staff_provisioning');

select set_eq($$
  select column_name::text from information_schema.column_privileges
  where grantee = 'portal_registrar' and table_schema = 'private' and table_name = 'staff_provisioning'
    and privilege_type = 'UPDATE'
$$, array['consumed_at', 'consumed_user_id'],
  'C20/PRIV-I2: portal_registrar só actualiza consumed_at/consumed_user_id em staff_provisioning');

select is_empty($$
  select t from unnest(array['public.profiles', 'public.accounts', 'public.account_members']) t
  where has_any_column_privilege('portal_definer', t, 'INSERT')
$$, 'C21/S1-5: portal_definer não insere perfis, contas nem membros');

select is_empty($$
  select t || '.' || c from (values
    ('public.profiles', 'full_name'), ('public.profiles', 'phone'),
    ('public.tickets', 'subject'), ('public.tickets', 'description'),
    ('public.ticket_messages', 'body'), ('public.ticket_internal_notes', 'body')) v(t, c)
  where has_column_privilege('portal_guard', t, c, 'SELECT')
$$, 'C22/R-RLS4: portal_guard não lê colunas de dados pessoais nem conteúdos');

select is_empty($$
  select p.proname::text from pg_proc p
  where p.proname in ('grant_role', 'revoke_role', 'admin_set_profile_status', 'admin_provision_staff',
                      'admin_cancel_staff_provisioning', 'assign_ticket', 'guard_bootstrap_nulls')
    and p.prosrc not like '%kilvora.admin_set%'
$$, 'C23/BS-LOCK/I3: alterações ao conjunto de admins obtêm o bloqueio kilvora.admin_set');

-- =============================================================================
-- J — Identidade JWT (recusa limpa, nunca erro)
-- =============================================================================
select set_config('request.jwt.claims', '', true);
select ok(private.jwt_claims() is null and private.jwt_sub() is null and private.jwt_aal() is null
          and private.jwt_role() is null, 'J1/J2: claims ausentes ou vazias dão nulo');

select set_config('request.jwt.claims', '{malformado', true);
select ok(private.jwt_claims() is null and private.jwt_sub() is null, 'J3: JSON malformado dá nulo, sem erro');

select set_config('request.jwt.claims', '{"sub":"nao-e-uuid","aal":"aal2","role":"authenticated"}', true);
select ok(private.jwt_sub() is null and private.jwt_aal() = 'aal2', 'J4: sub inválido dá nulo');

select set_config('request.jwt.claims', '{"sub":["x"],"aal":{"x":1},"role":5}', true);
select ok(private.jwt_sub() is null and private.jwt_aal() is null and private.jwt_role() is null,
          'J5: tipos errados dão nulo');

select set_config('request.jwt.claims', :'c_a1', true);
select ok(private.jwt_sub() = '20000000-0000-4000-8000-0000000000a1' and private.jwt_aal() = 'aal1'
          and private.jwt_role() = 'authenticated', 'J6: claims válidas com aal1');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-0000000000b1', true);
select ok(private.jwt_sub() = '20000000-0000-4000-8000-0000000000a1', 'J7: request.jwt.claim.sub legado é ignorado');
select set_config('request.jwt.claim.sub', '', true);

select set_config('request.jwt.claims', '[1,2]', true);
select ok(private.jwt_claims() is null, 'J8: claims que não são objecto dão nulo');
select set_config('request.jwt.claims', '', true);

-- =============================================================================
-- BS — Arranque do primeiro administrador (base sem arranque)
-- =============================================================================
-- D2/BS-0: pré-condição explícita. O arranque é uma propriedade global e única;
-- estes testes exigem uma base sem arranque (CI ou local antes do arranque real).
-- Se a pré-condição falhar, a execução é interrompida com "Bail out!" (TAP),
-- sem saltar testes de segurança em silêncio. O pgTAP 1.3.3 não tem função
-- BAIL_OUT; a linha TAP é emitida directamente pelo psql.
select ok(
  not exists (select 1 from public.user_roles where role = 'admin')
  and not exists (select 1 from private.system_bootstrap)
  and not exists (select 1 from private.staff_provisioning
                  where provisioned_by is null and consumed_at is null and cancelled_at is null),
  'BS-0: base sem arranque (zero admins, system_bootstrap vazia, zero provisionamentos de arranque pendentes)');

select (exists (select 1 from public.user_roles where role = 'admin')
        or exists (select 1 from private.system_bootstrap)
        or exists (select 1 from private.staff_provisioning
                   where provisioned_by is null and consumed_at is null and cancelled_at is null)) as bs_blocked
\gset
\if :bs_blocked
\echo 'Bail out! BS-0: os testes de arranque exigem uma base sem arranque (zero admins, system_bootstrap vazia, zero provisionamentos de arranque pendentes). Executar em base nova (CI) ou antes do arranque real local.'
\quit
\endif

insert into private.staff_provisioning (email_normalized, created_at, expires_at)
  values ('m2-boot-old@example.test', now() - interval '4 days', now() - interval '1 day');

select lives_ok($$
  insert into private.staff_provisioning (email_normalized, expires_at)
  values ('m2-boot-adm0@example.test', now() + interval '72 hours')
$$, 'BS-2: provisionamento de arranque aceite apesar de um anterior expirado');

select throws_ok($$
  insert into private.staff_provisioning (email_normalized, expires_at)
  values ('m2-boot-x@example.test', now() + interval '72 hours')
$$, '42501', null, 'BS-1: segundo provisionamento de arranque com um pendente válido é recusado');

select pg_temp.new_user('20000000-0000-4000-8000-0000000000d0', 'm2-boot-adm0@example.test', '{}', true);
select ok(
  (select kind from public.profiles where id = '20000000-0000-4000-8000-0000000000d0') = 'interno'
  and not exists (select 1 from public.account_members where user_id = '20000000-0000-4000-8000-0000000000d0')
  and exists (select 1 from private.staff_provisioning
              where email_normalized = 'm2-boot-adm0@example.test'
                and consumed_user_id = '20000000-0000-4000-8000-0000000000d0'),
  'REG-INV/B2: convite com provisionamento cria interno sem conta e consome o provisionamento');

select throws_ok($$
  insert into private.staff_provisioning (email_normalized, expires_at)
  values ('m2-boot-x@example.test', now() + interval '72 hours')
$$, '42501', null, 'BS-3a: provisionamento consumido por perfil activo impede novo arranque');

update public.profiles set status = 'suspenso' where id = '20000000-0000-4000-8000-0000000000d0';
select lives_ok($$
  insert into private.staff_provisioning (email_normalized, expires_at)
  values ('m2-boot-adm@example.test', now() + interval '72 hours')
$$, 'BS-3b: após suspensão (abort), novo provisionamento de arranque é aceite');

select pg_temp.new_user('20000000-0000-4000-8000-0000000000d1', 'm2-boot-adm@example.test', '{}', true);

select throws_ok($$
  insert into public.user_roles (user_id, role) values ('20000000-0000-4000-8000-0000000000d1', 'admin');
  set constraints all immediate
$$, '23514', null, 'BS-5a: admin com granted_by nulo sem system_bootstrap falha no COMMIT');
set constraints all deferred;

select throws_ok($$
  insert into private.system_bootstrap (admin_user_id) values ('20000000-0000-4000-8000-0000000000d1');
  set constraints all immediate
$$, '23514', null, 'BS-5b: system_bootstrap sem papel admin correspondente falha no COMMIT');
set constraints all deferred;

select throws_ok($$
  insert into public.user_roles (user_id, role) values ('20000000-0000-4000-8000-0000000000d1', 'admin');
  insert into private.system_bootstrap (admin_user_id) values ('20000000-0000-4000-8000-0000000000d1');
  set constraints all immediate
$$, '23514', null, 'BS-5c: arranque sem auditoria falha no COMMIT');
set constraints all deferred;

select lives_ok($$
  insert into private.audit_log (action, entity_type, entity_id, after)
  values ('bootstrap_admin_granted', 'user_role', '20000000-0000-4000-8000-0000000000d1', '{"method":"teste"}');
  insert into public.user_roles (user_id, role) values ('20000000-0000-4000-8000-0000000000d1', 'admin');
  insert into private.system_bootstrap (admin_user_id) values ('20000000-0000-4000-8000-0000000000d1');
  set constraints all immediate
$$, 'BS-6: papel, system_bootstrap e auditoria na mesma transacção');
set constraints all deferred;

select ok(
  exists (select 1 from public.user_roles
          where user_id = '20000000-0000-4000-8000-0000000000d1' and role = 'admin'
            and granted_by is null and revoked_at is null)
  and (select admin_user_id from private.system_bootstrap) = '20000000-0000-4000-8000-0000000000d1',
  'BS-6b: o admin ADM do teste tem granted_by nulo e é o admin_user_id de system_bootstrap');

select throws_ok($$
  insert into public.user_roles (user_id, role) values ('20000000-0000-4000-8000-0000000000d1', 'admin')
$$, '42501', null, 'BS-7a: após o arranque, granted_by nulo é recusado mesmo a postgres');
select throws_ok($$
  insert into private.system_bootstrap (admin_user_id) values ('20000000-0000-4000-8000-0000000000d1')
$$, '23505', null, 'BS-7b: segunda linha em system_bootstrap é recusada');
select throws_ok($$
  insert into private.staff_provisioning (email_normalized, expires_at)
  values ('m2-boot-y@example.test', now() + interval '72 hours')
$$, '42501', null, 'BS-7c: após o arranque, provisioned_by nulo é recusado');
select throws_ok($$
  insert into public.user_roles (user_id, role) values ('20000000-0000-4000-8000-0000000000d1', 'operador')
$$, '23514', null, 'BS-7d: granted_by nulo nunca é aceite para operador');
select throws_ok($$ update private.system_bootstrap set executed_by = 'x' $$, '42501', null,
  'BS-7e: system_bootstrap é imutável');

select lives_ok($$
  with del as (
    delete from private.staff_provisioning
    where email_normalized = 'm2-boot-old@example.test' and provisioned_by is null
      and consumed_at is null and cancelled_at is null and expires_at <= now()
    returning id, created_at, expires_at)
  insert into private.audit_log (action, entity_type, entity_id, before)
  select 'bootstrap_provision_expired_removed', 'staff_provisioning', id::text,
         jsonb_build_object('created_at', created_at, 'expires_at', expires_at)
  from del
$$, 'BS-EXP/I1: provisionamento de arranque expirado é removido com auditoria');

-- =============================================================================
-- REG — Registo (clientes AO/BR, metadados maliciosos, convites)
-- =============================================================================
select pg_temp.new_user('20000000-0000-4000-8000-0000000000a1', 'm2-cliente-ao@example.test',
  '{"full_name":"Cliente AO","company":"Empresa AO"}');
select pg_temp.new_user('20000000-0000-4000-8000-0000000000b1', 'm2-cliente-br@example.test',
  '{"full_name":"Cliente BR","company":"Empresa BR","locale":"pt-BR"}');

select ok(
  (select kind = 'cliente' and locale = 'pt-AO' and status = 'activo' from public.profiles
   where id = '20000000-0000-4000-8000-0000000000a1')
  and exists (select 1 from public.account_members m join public.accounts a on a.id = m.account_id
              where m.user_id = '20000000-0000-4000-8000-0000000000a1'
                and m.member_role = 'titular' and a.name = 'Empresa AO'),
  'REG1: cliente AO com conta própria e titular');

select ok(
  (select locale from public.profiles where id = '20000000-0000-4000-8000-0000000000b1') = 'pt-BR'
  and (select a.name from public.account_members m join public.accounts a on a.id = m.account_id
       where m.user_id = '20000000-0000-4000-8000-0000000000b1') = 'Empresa BR'
  and (select account_id from public.account_members where user_id = '20000000-0000-4000-8000-0000000000a1')
      <> (select account_id from public.account_members where user_id = '20000000-0000-4000-8000-0000000000b1'),
  'REG2: cliente BR com conta distinta e locale pt-BR');

select pg_temp.new_user('20000000-0000-4000-8000-0000000000e1', 'm2-mal@example.test',
  '{"role":"admin","kind":"interno","is_admin":true}');
select ok(
  (select kind from public.profiles where id = '20000000-0000-4000-8000-0000000000e1') = 'cliente'
  and not exists (select 1 from public.user_roles where user_id = '20000000-0000-4000-8000-0000000000e1'),
  'REG-MAL: metadados com papel admin dão cliente sem papéis');

select pg_temp.new_user('20000000-0000-4000-8000-0000000000e2', 'm2-san@example.test',
  jsonb_build_object('full_name', E'Nome\x01\x7f' || repeat('x', 300)));
select ok(
  (select char_length(full_name) <= 120 and full_name !~ '[[:cntrl:]]' from public.profiles
   where id = '20000000-0000-4000-8000-0000000000e2'),
  'REG3: nome limpo de caracteres de controlo e cortado a 120');

select throws_ok($$ select pg_temp.new_user('20000000-0000-4000-8000-0000000000e4', null) $$,
  '23502', null, 'REG-NOMAIL: registo sem e-mail é recusado');

-- Provisionamento de pessoal pelo admin (aal2) e STAFF6
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.admin_provision_staff(e) from unnest(array[
    'm2-op1@example.test', 'm2-op2@example.test', 'm2-adm2@example.test', 'm2-int0@example.test',
    'm2-pub@example.test', 'm2-pair-1@example.test', 'm2-mu1@example.test', 'm2-imm@example.test',
    'm2-cliente-ao@example.test']) e
$$), 'ok', 'STAFF: admin aal2 provisiona pessoal (incl. e-mail de cliente existente — STAFF4 revisto)');

select is(pg_temp.try_as('authenticated', :'c_a1', $$ select public.admin_provision_staff('m2-x@example.test') $$),
  'PT404', 'STAFF6: cliente não provisiona pessoal');

select pg_temp.new_user('20000000-0000-4000-8000-0000000000c1', 'm2-op1@example.test', '{}', true);
select pg_temp.new_user('20000000-0000-4000-8000-0000000000c2', 'm2-op2@example.test', '{}', true);
select pg_temp.new_user('20000000-0000-4000-8000-0000000000d2', 'm2-adm2@example.test', '{}', true);
select pg_temp.new_user('20000000-0000-4000-8000-0000000000c0', 'm2-int0@example.test', '{}', true);

select is(
  (select count(*)::int from public.profiles
   where id in ('20000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000c2',
                '20000000-0000-4000-8000-0000000000d2', '20000000-0000-4000-8000-0000000000c0')
     and kind = 'interno'),
  4, 'STAFF2: convidados com provisionamento ficam internos');

select pg_temp.new_user('20000000-0000-4000-8000-0000000000f1', 'm2-pub@example.test');
select ok(
  (select kind from public.profiles where id = '20000000-0000-4000-8000-0000000000f1') = 'cliente'
  and exists (select 1 from private.staff_provisioning
              where email_normalized = 'm2-pub@example.test' and consumed_at is null),
  'REG-PUB/STAFF1: registo público com e-mail provisionado dá cliente e não consome');

insert into auth.users (id, email) values ('20000000-0000-4000-8000-0000000000f2', 'm2-imm@example.test');
set constraints all immediate;
update auth.users set invited_at = now() where id = '20000000-0000-4000-8000-0000000000f2';
set constraints all deferred;
select ok(
  (select kind from public.profiles where id = '20000000-0000-4000-8000-0000000000f2') = 'cliente'
  and exists (select 1 from private.staff_provisioning
              where email_normalized = 'm2-imm@example.test' and consumed_at is null),
  'REG-IMM: com SET CONSTRAINTS IMMEDIATE antes do convite, o resultado é cliente');

insert into auth.users (id, email) values ('20000000-0000-4000-8000-0000000000f3', 'm2-pair-1@example.test');
update auth.users set email = 'm2-pair-2@example.test', invited_at = now()
  where id = '20000000-0000-4000-8000-0000000000f3';
set constraints all immediate;
set constraints all deferred;
select ok(
  (select kind from public.profiles where id = '20000000-0000-4000-8000-0000000000f3') = 'cliente'
  and exists (select 1 from private.staff_provisioning
              where email_normalized = 'm2-pair-1@example.test' and consumed_at is null),
  'REG-PAIR/I5: id certo com e-mail diferente no convite dá cliente');

insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-0000000000f4', 'm2-mu1@example.test'),
  ('20000000-0000-4000-8000-0000000000f5', 'm2-mu2@example.test');
update auth.users set invited_at = now() where id = '20000000-0000-4000-8000-0000000000f4';
set constraints all immediate;
set constraints all deferred;
select ok(
  (select kind from public.profiles where id = '20000000-0000-4000-8000-0000000000f4') = 'interno'
  and (select kind from public.profiles where id = '20000000-0000-4000-8000-0000000000f5') = 'cliente',
  'REG-MULTI: na mesma transacção só o convidado provisionado fica interno');

update auth.users set invited_at = now() where id = '20000000-0000-4000-8000-0000000000a1';
set constraints all immediate;
set constraints all deferred;
select ok(
  (select kind from public.profiles where id = '20000000-0000-4000-8000-0000000000a1') = 'cliente'
  and exists (select 1 from private.staff_provisioning
              where email_normalized = 'm2-cliente-ao@example.test' and consumed_at is null),
  'REG-LATE/REG-REINV/STAFF5: convite a utilizador existente não converte nem consome');

select is_empty($$
  select p.id::text
  from public.profiles p
  where p.id::text like '20000000-0000-4000-8000-%'
    and (select count(*) from private.audit_log a
         where a.action = case p.kind when 'interno' then 'staff_registered' else 'user_registered' end
           and a.entity_type = 'profile' and a.entity_id = p.id::text) <> 1
$$, 'REG-AUD: cada perfil criado pelo teste tem exactamente uma auditoria de registo do tipo correcto');

-- S1 — portal_registrar inutilizável fora do trigger
select throws_ok($$ select private.handle_new_user() $$, '42501', null,
  'S1-3: handle_new_user não é executável directamente');

select set_config('kilvora.signup_user_id', '20000000-0000-4000-8000-0000000000e9', true);
select set_config('kilvora.signup_email', 'm2-forjado@example.test', true);
select is(pg_temp.try_as('portal_registrar', null, $$
  insert into public.profiles (id, kind, status) values ('20000000-0000-4000-8000-0000000000e9', 'cliente', 'activo')
$$), '42501', 'S1-4a: portal_registrar fora de trigger não insere perfis, mesmo com marcadores');
select is(pg_temp.try_as('portal_registrar', null, $$
  insert into public.accounts (id, name, created_by)
  values (gen_random_uuid(), 'Forjada', '20000000-0000-4000-8000-0000000000e9')
$$), '42501', 'S1-4b: portal_registrar fora de trigger não insere contas');
select set_config('kilvora.signup_user_id', '', true);
select set_config('kilvora.signup_email', '', true);

create temp table s16 (id int);
select throws_ok($$
  create trigger s16_reuse after insert on s16 for each row execute function private.handle_new_user()
$$, '42501', null, 'S1-6: handle_new_user não pode ser reutilizada noutro trigger');

-- =============================================================================
-- E — Papéis e escalada de privilégios
-- =============================================================================
select is(pg_temp.try_as('authenticated', :'c_adm',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000c1', 'operador') $$), 'ok',
  'G-1: admin aal2 concede operador a op1');
select is(pg_temp.try_as('authenticated', :'c_adm',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000c2', 'operador') $$), 'ok',
  'G-2: admin aal2 concede operador a op2');
select is(pg_temp.try_as('authenticated', :'c_adm',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000d2', 'admin') $$), 'ok',
  'G-3: admin aal2 concede admin a adm2');

select is(pg_temp.try_as('authenticated', :'c_adm',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000d1', 'operador') $$), '42501',
  'E1/T-ESC1: ninguém concede papéis a si próprio');
select is(pg_temp.try_as('authenticated', :'c_adm',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000a1', 'operador') $$), '22023',
  'E2/T-ESC3: papel para um cliente é recusado');
select is(pg_temp.try_as('authenticated', :'c_a1',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000c0', 'operador') $$), 'PT404',
  'E3/T-ESC4: cliente não concede papéis');
select is(pg_temp.try_as('authenticated', :'c_op1',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000c0', 'operador') $$), 'PT404',
  'E4/T-ESC4: operador não concede papéis');
select is(pg_temp.try_as('authenticated', :'c_adm_aal1',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000c0', 'operador') $$), 'PT404',
  'E5/T-ESC4: admin aal1 não concede papéis');
select is(pg_temp.try_as('authenticated', :'c_adm',
  $$ select public.grant_role('20000000-0000-4000-8000-0000000000c1', 'operador') $$), 'PT409',
  'E6: papel já activo é recusado');

select throws_ok($$ update public.profiles set kind = 'interno' where id = '20000000-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'E8/T-ESC5: profiles.kind é imutável, mesmo para postgres');
select throws_ok($$
  insert into public.user_roles (user_id, role, granted_by)
  values ('20000000-0000-4000-8000-0000000000a1', 'operador', '20000000-0000-4000-8000-0000000000d1')
$$, '23514', null, 'E9: papel interno exige perfil interno activo, mesmo por inserção directa');

-- =============================================================================
-- Pedidos, isolamento AO/BR e MFA
-- =============================================================================
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  insert into ctx select 'ta', public.create_ticket('consultoria', 'Pedido cliente AO', 'Descrição do pedido AO.') ->> 'id'
$$), 'ok', 'T-1: cliente AO cria pedido');
select is(pg_temp.try_as('authenticated', :'c_b1', $$
  insert into ctx select 'tb', public.create_ticket('formacao', 'Pedido cliente BR', 'Descrição do pedido BR.') ->> 'id'
$$), 'ok', 'T-2: cliente BR cria pedido');

select ok(
  (select t.reference ~ '^KG-[0-9]{4}-[0-9]{6}$' and t.status = 'recebido'
          and t.requester_id = '20000000-0000-4000-8000-0000000000a1'
   from public.tickets t where t.id = (select v::uuid from ctx where k = 'ta'))
  and exists (select 1 from public.ticket_events e
              where e.ticket_id = (select v::uuid from ctx where k = 'ta') and e.event_type = 'created')
  and exists (select 1 from private.audit_log a
              where a.action = 'ticket_created' and a.entity_id = (select v from ctx where k = 'ta')),
  'T-3: referência gerada no servidor, evento inicial e auditoria');

select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.assign_ticket((select v::uuid from ctx where k = 'ta'), '20000000-0000-4000-8000-0000000000c1')
$$), 'ok', 'A-1: admin atribui o pedido AO a op1');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.assign_ticket((select v::uuid from ctx where k = 'tb'), '20000000-0000-4000-8000-0000000000c2')
$$), 'ok', 'A-2: admin atribui o pedido BR a op2');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.assign_ticket((select v::uuid from ctx where k = 'ta'), '20000000-0000-4000-8000-0000000000a1')
$$), '22023', 'A-3: atribuição a um cliente é recusada');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.assign_ticket((select v::uuid from ctx where k = 'tb'), '20000000-0000-4000-8000-0000000000c1')
$$), 'PT404', 'A-4: operador não atribui pedidos');

select is(pg_temp.try_as('authenticated', :'c_b1', $$
  select public.add_ticket_message((select v::uuid from ctx where k = 'ta'), 'Intrusão')
$$), 'PT404', 'I-2: cliente BR não escreve no pedido AO');
select is(pg_temp.try_as('authenticated', :'c_b1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'cancelado')
$$), 'PT404', 'I-3: cliente BR não altera o estado do pedido AO');
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.add_internal_note((select v::uuid from ctx where k = 'ta'), 'Nota forjada')
$$), 'PT404', 'I-4/S2-4: cliente não cria notas internas, nem no próprio pedido');
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select * from public.staff_ticket_events((select v::uuid from ctx where k = 'ta'))
$$), 'PT404', 'I-5/S2-4: cliente não lê eventos internos nem evidência');
select is(pg_temp.try_as('authenticated', :'c_b1', $$
  select public.add_ticket_message('20000000-0000-4000-8000-00000000ffff', 'Sondagem')
$$), 'PT404', 'I-6/T15: pedido inexistente devolve o mesmo erro que pedido alheio');
select is(pg_temp.try_as('authenticated', :'c_a1', $$ select count(*) from public.tickets $$), '42501',
  'I-7: sem acesso directo às tabelas (políticas da API só na M3)');
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.add_ticket_message((select v::uuid from ctx where k = 'ta'), 'Mensagem do cliente AO')
$$), 'ok', 'I-8: cliente AO escreve no próprio pedido');
select ok(
  (select count(*) from private.audit_log a
   where a.action = 'ticket_message_added' and a.entity_id = (select v from ctx where k = 'ta')
     and a.after ? 'message_id' and not (a.after ? 'body')) = 1
  and not exists (select 1 from private.audit_log a where a.after::text like '%Mensagem do cliente AO%'),
  'A1: mensagem auditada uma vez, na mesma transacção, sem o conteúdo');
select is(pg_temp.try_as('authenticated', :'c_b1', $$
  select public.add_ticket_message((select v::uuid from ctx where k = 'ta'), '')
$$), 'PT404', 'A3: sem autorização, o erro é PT404 antes da validação do conteúdo');
select is(pg_temp.try_as('authenticated', :'c_op2', $$
  select public.add_internal_note((select v::uuid from ctx where k = 'ta'), 'Nota de operador alheio')
$$), 'PT404', 'I-9/X7: operador sem atribuição não cria notas');
select is(pg_temp.try_as('authenticated', :'c_op2', $$
  select * from public.staff_ticket_events((select v::uuid from ctx where k = 'ta'))
$$), 'PT404', 'I-10/X7: operador sem atribuição não lê eventos internos');

select is(pg_temp.try_as('authenticated', :'c_op1_aal1', $$
  select public.add_internal_note((select v::uuid from ctx where k = 'ta'), 'Nota sem MFA')
$$), 'PT404', 'M-1: operador aal1 não cria notas');
select is(pg_temp.try_as('authenticated', :'c_op1_aal1', $$
  select * from public.staff_ticket_events((select v::uuid from ctx where k = 'ta'))
$$), 'PT404', 'M-2: operador aal1 não lê eventos internos');
select is(pg_temp.try_as('authenticated', :'c_adm_aal1', $$
  select public.assign_ticket((select v::uuid from ctx where k = 'tb'), '20000000-0000-4000-8000-0000000000c1')
$$), 'PT404', 'M-3: admin aal1 não atribui pedidos');
select is(pg_temp.try_as('authenticated', :'c_adm_aal1', $$ select * from public.admin_audit_log() $$), 'PT404',
  'M-4: admin aal1 não lê a auditoria');
select is(pg_temp.try_as('authenticated', :'c_int0', $$
  select public.add_internal_note((select v::uuid from ctx where k = 'ta'), 'Nota sem papel')
$$), 'PT404', 'M-5: interno sem papel (aal2) não tem acesso');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.add_internal_note((select v::uuid from ctx where k = 'ta'), 'Nota legítima')
$$), 'ok', 'M-6: operador atribuído aal2 cria nota');
select ok(
  (select count(*) from private.audit_log a
   where a.action = 'ticket_note_added' and a.entity_id = (select v from ctx where k = 'ta')
     and a.after ? 'note_id' and not (a.after ? 'body')) = 1
  and not exists (select 1 from private.audit_log a where a.after::text like '%Nota legítima%'),
  'A2: nota auditada uma vez, sem o conteúdo confidencial');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select * from public.staff_ticket_events((select v::uuid from ctx where k = 'ta'))
$$), 'ok', 'M-7: operador atribuído aal2 lê eventos com evidência');
select is(pg_temp.try_as('authenticated', :'c_adm', $$ select * from public.admin_audit_log(null, null, null, 50) $$),
  'ok', 'M-8: admin aal2 lê a auditoria');

select ok(
  exists (select 1 from public.ticket_events e
          where e.ticket_id = (select v::uuid from ctx where k = 'ta')
            and e.event_type = 'note_added' and e.visibility = 'interno')
  and not exists (select 1 from public.ticket_events e
                  where e.event_type in ('note_added', 'assigned', 'unassigned') and e.visibility = 'cliente'),
  'S2-a: eventos de notas e atribuições são sempre internos');

-- E7: o trigger de protecção recusa alterações de estado fora das RPCs, mesmo
-- quando um papel da API tem privilégio e política (concedidos só neste teste).
grant select (id), update (status, closed_at) on public.tickets to authenticated;
create policy tmp_e7_select on public.tickets for select to authenticated using (true);
create policy tmp_e7_update on public.tickets for update to authenticated using (true) with check (true);
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  update public.tickets set status = 'concluido', closed_at = now() where id = (select v::uuid from ctx where k = 'ta')
$$), '42501', 'E7/T-ESC5: alteração directa de estado é recusada pelo trigger');
drop policy tmp_e7_update on public.tickets;
drop policy tmp_e7_select on public.tickets;
revoke select (id), update (status, closed_at) on public.tickets from authenticated;

-- =============================================================================
-- TR — Transições (exaustivo: 9 × 9 estados × actores cliente e staff)
-- =============================================================================
create temp table tr_result (actor text, from_s text, to_s text, expected boolean, got boolean);
do $tr$
declare
  v_ticket uuid := (select v::uuid from ctx where k = 'ta');
  v_from   public.ticket_status;
  v_to     public.ticket_status;
  v_actor  text;
  v_claims text;
  v_state  text;
begin
  foreach v_actor in array array['cliente', 'staff'] loop
    v_claims := case v_actor
      when 'cliente' then '{"sub":"20000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}'
      else '{"sub":"20000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal2"}' end;
    for v_from in select unnest(enum_range(null::public.ticket_status)) loop
      for v_to in select unnest(enum_range(null::public.ticket_status)) loop
        update public.tickets
          set status = v_from,
              closed_at = case when v_from in ('concluido', 'recusado', 'cancelado') then now() else null end,
              assigned_operator_id = '20000000-0000-4000-8000-0000000000c1'
          where id = v_ticket;
        v_state := pg_temp.try_as('authenticated', v_claims,
          format('select public.change_ticket_status(%L::uuid, %L::public.ticket_status, %L, %L, null)',
                 v_ticket, v_to, 'Motivo de teste', 'EV-TESTE'));
        insert into tr_result values (
          v_actor, v_from::text, v_to::text,
          exists (select 1 from private.ticket_transitions t
                  where t.from_status = v_from and t.to_status = v_to
                    and t.actor = v_actor::private.transition_actor),
          v_state = 'ok');
      end loop;
    end loop;
  end loop;
end
$tr$;

select is((select count(*)::int from tr_result where expected is distinct from got), 0,
  'T-TR1: as 162 combinações seguem exactamente a matriz (aceites e recusadas)');
select is((select count(*)::int from tr_result where got), 21,
  'T-TR1b: 21 transições aceites (5 cliente + 16 staff); reabertura só via reopen_ticket');

update public.tickets set status = 'proposta_enviada', closed_at = null,
       assigned_operator_id = '20000000-0000-4000-8000-0000000000c1'
  where id = (select v::uuid from ctx where k = 'ta');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'aceite')
$$), 'PT422', 'T-TR2a/D10: aceitação sem evidence_ref é recusada');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'cancelado')
$$), 'PT422', 'T-TR2b: cancelamento pelo staff exige motivo');
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'cancelado')
$$), 'ok', 'T-TR2c/D-M2-4: cliente cancela sem motivo');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.reopen_ticket((select v::uuid from ctx where k = 'ta'), '  ')
$$), 'PT422', 'T-TR2d/D12: reabertura sem motivo é recusada');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.reopen_ticket((select v::uuid from ctx where k = 'ta'), 'Tentativa de operador')
$$), 'PT404', 'T-TR2e: operador não reabre pedidos');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.reopen_ticket((select v::uuid from ctx where k = 'ta'), 'Cliente pediu reavaliação')
$$), 'ok', 'T-TR2f: admin aal2 reabre com motivo');

select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'aguarda_cliente', null, null, 'recebido')
$$), 'PT409', 'T-TR3: estado esperado divergente é recusado (concorrência)');

insert into ctx values
  ('ev0', (select count(*) from public.ticket_events where ticket_id = (select v::uuid from ctx where k = 'ta'))::text),
  ('au0', (select count(*) from private.audit_log where action = 'ticket_status_changed')::text);
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'aguarda_cliente', null, null, 'em_analise')
$$), 'ok', 'T-TR4a: transição válida com estado esperado');
select ok(
  (select count(*) from public.ticket_events where ticket_id = (select v::uuid from ctx where k = 'ta'))
    = (select v::bigint + 1 from ctx where k = 'ev0')
  and (select count(*) from private.audit_log where action = 'ticket_status_changed')
    = (select v::bigint + 1 from ctx where k = 'au0'),
  'T-TR4b: cada transição gera exactamente um evento e uma auditoria');

select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.add_ticket_message((select v::uuid from ctx where k = 'ta'), 'Resposta do cliente')
$$), 'ok', 'T-TR5a: resposta do cliente em aguarda_cliente');
select is((select status::text from public.tickets where id = (select v::uuid from ctx where k = 'ta')), 'em_analise',
  'T-TR5b: a resposta do cliente devolve o pedido a em_analise');

-- =============================================================================
-- RL — Limites operacionais
-- =============================================================================
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.create_ticket('gestao', 'Pedido adicional', 'Descrição de pedido adicional.') from generate_series(1, 4)
$$), 'ok', 'RL-1a: até 5 pedidos por hora');
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.create_ticket('gestao', 'Pedido excedente', 'Descrição de pedido excedente.')
$$), 'PT429', 'RL-1b/T-RL1: 6.º pedido na mesma hora é recusado');

insert into public.tickets (reference, account_id, requester_id, type, subject, description, created_at)
select 'KG-2000-' || lpad(g::text, 6, '0'),
       (select account_id from public.account_members where user_id = '20000000-0000-4000-8000-0000000000b1'),
       '20000000-0000-4000-8000-0000000000b1', 'comercio', 'Pedido antigo', 'Pedido antigo aberto.',
       now() - interval '2 hours'
from generate_series(1, 9) g;
select is(pg_temp.try_as('authenticated', :'c_b1', $$
  select public.create_ticket('comercio', 'Pedido a mais', 'Descrição do pedido a mais.')
$$), 'PT429', 'RL-2/T-RL1: 11.º pedido aberto é recusado');

insert into public.ticket_messages (ticket_id, author_id, body)
select (select v::uuid from ctx where k = 'ta'), '20000000-0000-4000-8000-0000000000a1', 'Mensagem de carga'
from generate_series(1, 30);
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.add_ticket_message((select v::uuid from ctx where k = 'ta'), 'Mensagem excedente')
$$), 'PT429', 'RL-3/T-RL1: 31.ª mensagem na hora é recusada');

insert into public.ticket_internal_notes (ticket_id, author_id, body)
select (select v::uuid from ctx where k = 'ta'), '20000000-0000-4000-8000-0000000000c1', 'Nota de carga'
from generate_series(1, 60);
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.add_internal_note((select v::uuid from ctx where k = 'ta'), 'Nota excedente')
$$), 'PT429', 'RL-4/D-M2-2: 61.ª nota na hora é recusada');

-- =============================================================================
-- REV — Revogação e último admin
-- =============================================================================
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.revoke_role('20000000-0000-4000-8000-0000000000c2', 'operador')
$$), 'ok', 'REV-1: admin revoga operador op2');
select ok(
  (select assigned_operator_id from public.tickets where id = (select v::uuid from ctx where k = 'tb')) is null
  and exists (select 1 from public.ticket_events e
              where e.ticket_id = (select v::uuid from ctx where k = 'tb')
                and e.event_type = 'unassigned' and e.visibility = 'interno'),
  'REV-2/T-REV1: revogar operador retira as atribuições abertas, com evento interno');
select is(pg_temp.try_as('authenticated', :'c_op2', $$
  select * from public.staff_ticket_events((select v::uuid from ctx where k = 'tb'))
$$), 'PT404', 'REV-3: operador revogado perde o acesso de imediato');

select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.revoke_role('20000000-0000-4000-8000-0000000000d2', 'admin')
$$), 'ok', 'BS-LAST-a: admin revoga o outro admin');
select is(pg_temp.try_as('authenticated', :'c_adm2', $$
  select public.revoke_role('20000000-0000-4000-8000-0000000000d1', 'admin')
$$), 'PT404', 'BS-LAST-b: admin revogado já não revoga; nunca ficam zero admins');
select ok(
  exists (select 1 from public.user_roles
          where user_id = '20000000-0000-4000-8000-0000000000d1' and role = 'admin' and revoked_at is null)
  and not exists (select 1 from public.user_roles
                  where user_id = '20000000-0000-4000-8000-0000000000d2' and role = 'admin' and revoked_at is null)
  and (select count(*) from public.user_roles r join public.profiles p on p.id = r.user_id
       where r.role = 'admin' and r.revoked_at is null and p.status = 'activo') >= 1,
  'BS-LAST-c: ADM continua activo, ADM2 deixou de o ser e existe pelo menos um admin activo');

-- =============================================================================
-- Provisionamento, estado de perfis e auditoria
-- =============================================================================
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  insert into ctx select 'pc', public.admin_provision_staff('m2-cancel@example.test')::text
$$), 'ok', 'PC-1: admin provisiona');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.admin_cancel_staff_provisioning((select v::bigint from ctx where k = 'pc'))
$$), 'ok', 'PC-2: admin cancela provisionamento pendente');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.admin_cancel_staff_provisioning((select v::bigint from ctx where k = 'pc'))
$$), 'PT404', 'PC-3: provisionamento já cancelado não volta a ser cancelado');
select is(pg_temp.try_as('authenticated', :'c_adm', $$ select public.admin_provision_staff('m2-op1@example.test') $$),
  'ok', 'PC-4: e-mail com provisionamento já consumido pode voltar a ser provisionado');

select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.admin_set_profile_status('20000000-0000-4000-8000-0000000000d1', 'suspenso')
$$), '42501', 'ST-1: admin não altera o próprio estado');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.admin_set_profile_status('20000000-0000-4000-8000-0000000000a1', 'anonimizado')
$$), '22023', 'ST-2: anonimização não é suportada nesta etapa (D11)');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.admin_set_profile_status('20000000-0000-4000-8000-0000000000a1', 'suspenso')
$$), 'ok', 'ST-3: admin suspende cliente');
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.create_ticket('consultoria', 'Pedido suspenso', 'Descrição de pedido suspenso.')
$$), '42501', 'ST-4: cliente suspenso não cria pedidos');
select is(pg_temp.try_as('authenticated', :'c_a1', $$
  select public.add_ticket_message((select v::uuid from ctx where k = 'ta'), 'Mensagem suspensa')
$$), 'PT404', 'ST-5: cliente suspenso perde acesso aos pedidos');

select is(pg_temp.try_as('authenticated', :'c_b1', $$ select * from public.admin_audit_log() $$), 'PT404',
  'AU-1: cliente não lê a auditoria');
select is_empty($$
  select id::text from private.audit_log
  where coalesce(before::text, '') like '%@%' or coalesce(after::text, '') like '%@%'
$$, 'AU-2: a auditoria não contém e-mails');
select is(pg_temp.try_as('authenticated', null, $$ select public.create_ticket('consultoria', 'Anónimo', 'Pedido anónimo.') $$),
  '42501', 'AU-3: chamada sem JWT é recusada (not_authenticated)');
select is(pg_temp.try_as('anon', '{"role":"anon"}', $$ select public.create_ticket('consultoria', 'Anónimo', 'Pedido anónimo.') $$),
  '42501', 'AU-4: anon não executa RPCs');

select * from finish();
rollback;
