-- =============================================================================
-- KILVORA GROUP — Portal V1 — Testes pgTAP da M1 (estrutura e privilégios)
-- Cobertura: S1–S6, R-ROLE1–R-ROLE3, R-RLS3, D-ACL, R-MEM, R-PRIV0.
-- Executar: npx.cmd supabase test db   (transacção revertida no fim)
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(42);

-- -----------------------------------------------------------------------------
-- Dados de teste (como postgres, dono das tabelas)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'm1-cliente-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'm1-cliente-b@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'm1-staff@example.test');

insert into public.profiles (id, kind, full_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'cliente', 'Cliente A'),
  ('00000000-0000-4000-8000-0000000000b1', 'cliente', 'Cliente B'),
  ('00000000-0000-4000-8000-0000000000c1', 'interno', 'Staff');

insert into public.accounts (id, name, created_by) values
  ('00000000-0000-4000-8000-00000000aaaa', 'Conta X', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-00000000bbbb', 'Conta Y', '00000000-0000-4000-8000-0000000000b1');

insert into public.account_members (account_id, user_id, member_role) values
  ('00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000000a1', 'titular'),
  ('00000000-0000-4000-8000-00000000bbbb', '00000000-0000-4000-8000-0000000000b1', 'titular');

insert into public.tickets (id, reference, account_id, requester_id, type, subject, description) values
  ('00000000-0000-4000-8000-0000000000f1', 'KG-2026-000001',
   '00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000000a1',
   'consultoria', 'Pedido de teste', 'Descrição do pedido de teste.');

insert into public.ticket_events (ticket_id, actor_id, event_type, to_status, visibility) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'created', 'recebido', 'cliente');
insert into public.ticket_messages (ticket_id, author_id, body) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'Mensagem de teste');
insert into public.ticket_internal_notes (ticket_id, author_id, body) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', 'Nota interna de teste');
insert into private.audit_log (action, entity_type, entity_id) values
  ('test_entry', 'system', 'm1');

-- -----------------------------------------------------------------------------
-- S1 / R-RLS3 — inventário e RLS
-- -----------------------------------------------------------------------------
select tables_are('public', array[
  'profiles', 'accounts', 'account_members', 'user_roles',
  'tickets', 'ticket_events', 'ticket_messages', 'ticket_internal_notes'],
  'S1: public contém exactamente as 8 tabelas do portal');

select tables_are('private', array['audit_log', 'ticket_transitions', 'staff_provisioning'],
  'S1: private contém exactamente as 3 tabelas internas');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity),
  8, 'R-RLS3: as 8 tabelas públicas têm RLS e FORCE RLS');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relkind = 'r' and c.relrowsecurity),
  3, 'S1: as 3 tabelas privadas têm RLS');

select is(
  (select count(*)::int from pg_policies where schemaname in ('public', 'private')),
  0, 'S1: M1 não define políticas (negação total)');

-- -----------------------------------------------------------------------------
-- S2 / R-PRIV0 — nenhum privilégio para PUBLIC, anon, authenticated, service_role
-- -----------------------------------------------------------------------------
select is_empty($$
  select c.oid::regclass::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where n.nspname in ('public', 'private')
    and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role')))
$$, 'R-PRIV0: sem ACL proibida em tabelas e sequências');

select is_empty($$
  select c.oid::regclass::text || '.' || att.attname
  from pg_attribute att join pg_class c on c.oid = att.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(att.attacl) a
  where n.nspname in ('public', 'private') and att.attacl is not null
    and (a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role')))
$$, 'R-PRIV0: sem ACL proibida em colunas');

select is_empty($$
  select p.oid::regprocedure::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and (p.proacl is null or exists (
      select 1 from aclexplode(p.proacl) a
      where a.grantee = 0 or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role'))))
$$, 'R-PRIV0: funções privadas sem EXECUTE para PUBLIC/anon/authenticated/service_role');

select is_empty($$
  select r from unnest(array['public', 'anon', 'authenticated', 'service_role']) r
  where has_schema_privilege(r, 'private', 'USAGE') or has_schema_privilege(r, 'private', 'CREATE')
$$, 'R-PRIV0: esquema private sem USAGE/CREATE para os papéis da API');

select is_empty($$
  select r.rolname || ' em ' || c.oid::regclass::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) as r(rolname)
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'S')
    and has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
$$, 'S2: has_table_privilege falso para todos os papéis da API');

set local role authenticated;
select throws_ok($$ select * from public.tickets $$, '42501', null,
  'S2: authenticated não lê tickets');
reset role;

set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null,
  'S2: anon não lê profiles');
reset role;

set local role service_role;
select throws_ok($$ select * from public.ticket_internal_notes $$, '42501', null,
  'S2: service_role não lê notas internas');
reset role;

-- -----------------------------------------------------------------------------
-- S3 — integridade referencial
-- -----------------------------------------------------------------------------
select throws_ok($$
  insert into public.tickets (reference, account_id, requester_id, type, subject, description)
  values ('KG-2026-000002', '00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000000b1',
          'consultoria', 'Cruzado', 'Requerente de outra conta.')
$$, '23503', null, 'S3: FK composta recusa requerente de outra conta');

select throws_ok($$
  insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000000ff')
$$, '23503', null, 'S3: perfil exige utilizador em auth.users');

select throws_ok($$
  delete from public.accounts where id = '00000000-0000-4000-8000-00000000aaaa'
$$, '23503', null, 'S3: ON DELETE RESTRICT protege contas com membros');

-- -----------------------------------------------------------------------------
-- S4 — restrições CHECK
-- -----------------------------------------------------------------------------
select throws_ok($$
  update public.tickets set status = 'concluido' where id = '00000000-0000-4000-8000-0000000000f1'
$$, '23514', null, 'S4: estado terminal exige closed_at');

select throws_ok($$
  update public.tickets set closed_at = now() where id = '00000000-0000-4000-8000-0000000000f1'
$$, '23514', null, 'S4: closed_at exige estado terminal');

select throws_ok($$
  insert into public.tickets (reference, account_id, requester_id, type, subject, description)
  values ('KG-26-1', '00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000000a1',
          'consultoria', 'Referência', 'Referência inválida.')
$$, '23514', null, 'S4: formato da referência validado');

select throws_ok($$
  update public.tickets set subject = repeat('x', 161) where id = '00000000-0000-4000-8000-0000000000f1'
$$, '23514', null, 'S4: assunto limitado a 160 caracteres');

select throws_ok($$
  insert into public.ticket_events (ticket_id, event_type, from_status, to_status, visibility)
  values ('00000000-0000-4000-8000-0000000000f1', 'status_changed', 'proposta_enviada', 'aceite', 'cliente')
$$, '23514', null, 'S4: aceitação de proposta exige evidence_ref (D10)');

select throws_ok($$
  insert into public.ticket_events (ticket_id, event_type, from_status, to_status, visibility)
  values ('00000000-0000-4000-8000-0000000000f1', 'reopened', 'cancelado', 'em_analise', 'cliente')
$$, '23514', null, 'S4: reabertura exige motivo (D12)');

-- -----------------------------------------------------------------------------
-- S5 — imutabilidade do histórico e da auditoria (mesmo para o dono)
-- -----------------------------------------------------------------------------
select throws_ok($$ update public.ticket_events set reason = 'x' $$, '42501', null, 'S5: ticket_events sem UPDATE');
select throws_ok($$ delete from public.ticket_events $$, '42501', null, 'S5: ticket_events sem DELETE');
select throws_ok($$ truncate public.ticket_events $$, '42501', null, 'S5: ticket_events sem TRUNCATE');
select throws_ok($$ update public.ticket_messages set body = 'x' $$, '42501', null, 'S5: ticket_messages sem UPDATE');
select throws_ok($$ delete from public.ticket_messages $$, '42501', null, 'S5: ticket_messages sem DELETE');
select throws_ok($$ update public.ticket_internal_notes set body = 'x' $$, '42501', null, 'S5: notas internas sem UPDATE');
select throws_ok($$ delete from public.ticket_internal_notes $$, '42501', null, 'S5: notas internas sem DELETE');
select throws_ok($$ update private.audit_log set action = 'tampered' $$, '42501', null, 'S5: audit_log sem UPDATE');
select throws_ok($$ delete from private.audit_log $$, '42501', null, 'S5: audit_log sem DELETE');
select throws_ok($$ truncate private.audit_log $$, '42501', null, 'S5: audit_log sem TRUNCATE');

-- -----------------------------------------------------------------------------
-- S6 — unicidade e anti-autoconcessão
-- -----------------------------------------------------------------------------
select throws_ok($$
  insert into public.account_members (account_id, user_id, member_role)
  values ('00000000-0000-4000-8000-00000000aaaa', '00000000-0000-4000-8000-0000000000b1', 'titular')
$$, '23505', null, 'S6: um único titular por conta');

insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'operador');
select throws_ok($$
  insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'operador')
$$, '23505', null, 'S6: um único papel activo por utilizador e papel');

select throws_ok($$
  insert into public.user_roles (user_id, role, granted_by)
  values ('00000000-0000-4000-8000-0000000000c1', 'admin', '00000000-0000-4000-8000-0000000000c1')
$$, '23514', null, 'S6: ninguém concede papéis a si próprio');

-- -----------------------------------------------------------------------------
-- R-ROLE1–3 e R-MEM — papéis dedicados
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_roles
   where rolname in ('portal_guard', 'portal_definer')
     and not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin or rolreplication or rolinherit)),
  2, 'R-ROLE1: papéis dedicados sem superuser, bypassrls, createrole, createdb, login, replication ou herança');

select is_empty($$
  select r.rolname || '<-' || m.rolname
  from pg_auth_members am join pg_roles r on r.oid = am.roleid join pg_roles m on m.oid = am.member
  where r.rolname in ('portal_guard', 'portal_definer') and (m.rolname <> 'postgres' or am.inherit_option)
$$, 'R-ROLE2: só postgres é membro, sempre sem herança');

select is_empty($$
  select m.rolname || '->' || r.rolname
  from pg_auth_members am join pg_roles r on r.oid = am.roleid join pg_roles m on m.oid = am.member
  where m.rolname in ('portal_guard', 'portal_definer')
$$, 'R-ROLE2: papéis dedicados não pertencem a nenhum papel');

select is(
  (select count(distinct r.rolname)::int
   from pg_auth_members am join pg_roles r on r.oid = am.roleid join pg_roles m on m.oid = am.member
   where r.rolname in ('portal_guard', 'portal_definer') and m.rolname = 'postgres' and am.set_option),
  2, 'R-MEM: postgres tem SET ROLE (sem herança) nos dois papéis');

select is_empty($$
  select 'class ' || oid::regclass::text from pg_class
   where relowner in (select oid from pg_roles where rolname in ('portal_guard', 'portal_definer'))
  union all
  select 'schema ' || nspname from pg_namespace
   where nspowner in (select oid from pg_roles where rolname in ('portal_guard', 'portal_definer'))
  union all
  select 'proc ' || oid::regprocedure::text from pg_proc
   where proowner in (select oid from pg_roles where rolname in ('portal_guard', 'portal_definer'))
  union all
  select 'type ' || oid::regtype::text from pg_type
   where typowner in (select oid from pg_roles where rolname in ('portal_guard', 'portal_definer'))
$$, 'R-ROLE3: papéis dedicados não são donos de nenhum objecto');

-- -----------------------------------------------------------------------------
-- D-ACL — privilégios por omissão inalterados (sem impacto em objectos alheios)
-- Linha de base local recolhida antes da M1 (27 entradas). Ambiente-específica.
-- -----------------------------------------------------------------------------
select is(
  (select md5(string_agg(
     pg_get_userbyid(d.defaclrole) || '|' || coalesce(n.nspname::text, '') || '|'
       || d.defaclobjtype::text || '|' || d.defaclacl::text,
     E'\n' order by pg_get_userbyid(d.defaclrole), n.nspname, d.defaclobjtype))
   from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace),
  'f8d1f848d87de7e8306fca864898853f',
  'D-ACL: pg_default_acl idêntico à linha de base anterior à M1');

select is_empty($$
  select d.oid::text from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'private'
     or d.defaclrole in (select oid from pg_roles where rolname in ('portal_guard', 'portal_definer'))
$$, 'D-ACL: nenhuma entrada de privilégios por omissão do portal');

select * from finish();
rollback;
