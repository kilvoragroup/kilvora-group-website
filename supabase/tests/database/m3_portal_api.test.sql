-- =============================================================================
-- KILVORA GROUP — Portal V1 — Testes pgTAP da M3-BD (exposição à API)
-- Fonte: W3-B5-03. Cobertura: catálogo (C-*), X1–X8, MFA-1/2/3, S2-6, H1/H2,
-- positivos por perfil (P-CLI, P-OP, P-ADM, P-SEL).
-- Leituras sob outros papéis via pg_temp.val_as (valor escalar ou ERR:<sqlstate>)
-- e acções via pg_temp.try_as ('ok' ou sqlstate). Asserções sempre como postgres.
-- Independente do arranque real (admin de teste com granted_by preenchido).
-- Executar: npx.cmd supabase test db   (transacção revertida no fim)
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

\set c_anon     '{"role":"anon"}'
\set c_a        '{"sub":"30000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}'
\set c_a2       '{"sub":"30000000-0000-4000-8000-0000000000a2","role":"authenticated","aal":"aal1"}'
\set c_op1      '{"sub":"30000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal2"}'
\set c_op1_aal1 '{"sub":"30000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal1"}'
\set c_op2      '{"sub":"30000000-0000-4000-8000-0000000000c2","role":"authenticated","aal":"aal2"}'
\set c_adm      '{"sub":"30000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal2"}'
\set c_adm_aal1 '{"sub":"30000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal1"}'
\set c_int0     '{"sub":"30000000-0000-4000-8000-0000000000c0","role":"authenticated","aal":"aal2"}'

select plan(77);

-- -----------------------------------------------------------------------------
-- Utilitários (temporários)
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

create function pg_temp.val_as(p_role text, p_claims text, p_sql text)
  returns text language plpgsql as $fn$
declare
  v_result text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_result := 'ERR:' || sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_result;
end
$fn$;

-- -----------------------------------------------------------------------------
-- Dados de teste (como postgres)
-- -----------------------------------------------------------------------------
select pg_temp.new_user('30000000-0000-4000-8000-0000000000a1', 'm3-cliente-ao@example.test',
  '{"full_name":"Cliente AO M3","company":"Empresa AO M3"}');
select pg_temp.new_user('30000000-0000-4000-8000-0000000000b1', 'm3-cliente-br@example.test',
  '{"full_name":"Cliente BR M3","company":"Empresa BR M3","locale":"pt-BR"}');
select pg_temp.new_user('30000000-0000-4000-8000-0000000000a2', 'm3-membro@example.test',
  '{"full_name":"Membro M3"}');

insert into ctx values
  ('acc_a', (select account_id::text from public.account_members
             where user_id = '30000000-0000-4000-8000-0000000000a1' and member_role = 'titular')),
  ('acc_b', (select account_id::text from public.account_members
             where user_id = '30000000-0000-4000-8000-0000000000b1' and member_role = 'titular'));

-- A2: membro (não titular) da conta de A, apenas para X6.
insert into public.account_members (account_id, user_id, member_role)
  values ((select v::uuid from ctx where k = 'acc_a'), '30000000-0000-4000-8000-0000000000a2', 'membro');

-- Pessoal interno: provisionamento com autor (sem arranque) e convite.
insert into private.staff_provisioning (email_normalized, provisioned_by, expires_at)
select e, '30000000-0000-4000-8000-0000000000a1', now() + interval '72 hours'
from unnest(array['m3-op1@example.test', 'm3-op2@example.test', 'm3-adm@example.test', 'm3-int0@example.test']) e;
select pg_temp.new_user('30000000-0000-4000-8000-0000000000c1', 'm3-op1@example.test', '{}', true);
select pg_temp.new_user('30000000-0000-4000-8000-0000000000c2', 'm3-op2@example.test', '{}', true);
select pg_temp.new_user('30000000-0000-4000-8000-0000000000d1', 'm3-adm@example.test', '{}', true);
select pg_temp.new_user('30000000-0000-4000-8000-0000000000c0', 'm3-int0@example.test', '{}', true);

insert into public.user_roles (user_id, role, granted_by) values
  ('30000000-0000-4000-8000-0000000000d1', 'admin', '30000000-0000-4000-8000-0000000000c1'),
  ('30000000-0000-4000-8000-0000000000c1', 'operador', '30000000-0000-4000-8000-0000000000d1'),
  ('30000000-0000-4000-8000-0000000000c2', 'operador', '30000000-0000-4000-8000-0000000000d1');

-- Pedidos (RPC), atribuição, mensagem, nota, eventos com motivo e evidência.
select is(pg_temp.try_as('authenticated', :'c_a', $$
  insert into ctx select 'ta', public.create_ticket('consultoria', 'Pedido AO M3', 'Descrição do pedido AO M3.') ->> 'id'
$$), 'ok', 'SETUP-1: cliente AO cria o pedido TA (create_ticket)');
select is(pg_temp.try_as('authenticated', '{"sub":"30000000-0000-4000-8000-0000000000b1","role":"authenticated","aal":"aal1"}', $$
  insert into ctx select 'tb', public.create_ticket('formacao', 'Pedido BR M3', 'Descrição do pedido BR M3.') ->> 'id'
$$), 'ok', 'SETUP-2: cliente BR cria o pedido TB (create_ticket)');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.assign_ticket((select v::uuid from ctx where k = 'ta'), '30000000-0000-4000-8000-0000000000c1')
$$), 'ok', 'SETUP-3: admin atribui TA ao operador OP1');
select is(pg_temp.try_as('authenticated', :'c_a', $$
  select public.add_ticket_message((select v::uuid from ctx where k = 'ta'), 'Mensagem do cliente M3')
$$), 'ok', 'SETUP-4: cliente AO escreve mensagem em TA');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.add_internal_note((select v::uuid from ctx where k = 'ta'), 'Nota interna M3')
$$), 'ok', 'SETUP-5: OP1 cria nota interna em TA');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'em_analise')
$$), 'ok', 'SETUP-6: OP1 passa TA para em_analise');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'aguarda_cliente', 'Pedimos mais detalhes M3')
$$), 'ok', 'SETUP-7: OP1 passa TA para aguarda_cliente com motivo');
update public.tickets set status = 'proposta_enviada', closed_at = null
  where id = (select v::uuid from ctx where k = 'ta');
select is(pg_temp.try_as('authenticated', :'c_op1', $$
  select public.change_ticket_status((select v::uuid from ctx where k = 'ta'), 'aceite', null, 'EV-M3-001')
$$), 'ok', 'SETUP-8: OP1 aceita TA com evidence_ref');

select ok(
  (select count(*) from public.tickets where id in ((select v::uuid from ctx where k = 'ta'),
                                                    (select v::uuid from ctx where k = 'tb'))) = 2
  and exists (select 1 from public.ticket_internal_notes where ticket_id = (select v::uuid from ctx where k = 'ta'))
  and exists (select 1 from public.ticket_events
              where ticket_id = (select v::uuid from ctx where k = 'ta') and evidence_ref = 'EV-M3-001')
  and exists (select 1 from public.ticket_events
              where ticket_id = (select v::uuid from ctx where k = 'ta') and visibility = 'interno'),
  'SETUP: pedidos, nota, eventos internos e evidência criados pelas RPCs');

-- =============================================================================
-- C — Catálogo
-- =============================================================================
select set_eq($$
  select cp.table_name::text || '.' || cp.column_name::text || ':' || cp.privilege_type::text
  from information_schema.column_privileges cp
  where cp.grantee = 'authenticated' and cp.table_schema in ('public', 'private')
$$, $$
  select c.table_name::text || '.' || c.column_name::text || ':SELECT'
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('profiles', 'accounts', 'account_members', 'user_roles',
                         'tickets', 'ticket_messages', 'ticket_internal_notes')
  union all
  select 'ticket_events.' || x || ':SELECT'
  from unnest(array['id', 'ticket_id', 'actor_id', 'event_type', 'from_status',
                    'to_status', 'reason', 'visibility', 'created_at']) x
  union all
  select 'profiles.' || x || ':UPDATE' from unnest(array['full_name', 'phone', 'locale']) x
  union all
  select 'accounts.' || x || ':UPDATE' from unnest(array['name', 'country', 'sector']) x
$$, 'C-GRANT: privilégios de coluna de authenticated exactamente os especificados (sem evidence_ref)');

select is_empty($$
  select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and ((c.relkind = 'r'
          and (has_table_privilege('authenticated', c.oid, 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER')
               or has_any_column_privilege('authenticated', c.oid, 'INSERT,REFERENCES')
               or (n.nspname = 'private' and has_any_column_privilege('authenticated', c.oid, 'SELECT,UPDATE'))))
         or (c.relkind = 'S' and has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE')))
$$, 'C-TABLE: authenticated sem INSERT/DELETE/TRUNCATE/REFERENCES/TRIGGER, sem nada em private nem em sequências');

select is_empty($$
  select r || ' em ' || c.oid::regclass::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['public', 'anon', 'service_role']) r
  where n.nspname in ('public', 'private')
    and ((c.relkind = 'r' and (has_any_column_privilege(r, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
                               or has_table_privilege(r, c.oid, 'DELETE,TRUNCATE,TRIGGER')))
         or (c.relkind = 'S' and has_sequence_privilege(r, c.oid, 'USAGE,SELECT,UPDATE')))
  union all
  select r || ' USAGE private' from unnest(array['public', 'anon', 'service_role']) r
  where has_schema_privilege(r, 'private', 'USAGE')
$$, 'C-API0: PUBLIC, anon e service_role sem qualquer privilégio de tabela, sequência ou esquema');

select ok(has_schema_privilege('authenticated', 'private', 'USAGE')
          and not has_schema_privilege('authenticated', 'private', 'CREATE')
          and not has_schema_privilege('authenticated', 'public', 'CREATE'),
  'C-USAGE: authenticated com USAGE (sem CREATE) em private');

select set_eq($$ select policyname::text from pg_policies where 'authenticated' = any(roles) $$,
  array['api_profiles_select', 'api_profiles_update_self', 'api_accounts_select', 'api_accounts_update_owner',
        'api_account_members_select', 'api_user_roles_select', 'api_tickets_select', 'api_ticket_events_select',
        'api_ticket_events_restrict', 'api_ticket_messages_select', 'api_ticket_internal_notes_select',
        'api_ticket_internal_notes_restrict'],
  'C-POL: exactamente as 12 políticas para authenticated');

select set_eq($$ select tablename::text || ':' || policyname::text from pg_policies
                 where 'authenticated' = any(roles) and permissive = 'RESTRICTIVE' $$,
  array['ticket_events:api_ticket_events_restrict', 'ticket_internal_notes:api_ticket_internal_notes_restrict'],
  'C-RESTR: políticas restritivas em ticket_events e ticket_internal_notes');

-- =============================================================================
-- X1 — Anónimo
-- =============================================================================
select is_empty($$
  select t from unnest(array['profiles', 'accounts', 'account_members', 'user_roles', 'tickets',
                             'ticket_events', 'ticket_messages', 'ticket_internal_notes']) t
  where pg_temp.val_as('anon', '{"role":"anon"}', format('select count(*)::text from public.%I', t)) <> 'ERR:42501'
$$, 'X1: anon recebe 42501 em todas as tabelas do portal');

-- =============================================================================
-- X2 / X3 — Isolamento entre contas (cliente AO contra BR)
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(*)::text from public.tickets where id = (select v::uuid from ctx where k = 'tb') $$),
  '0', 'X2a: cliente AO não vê o pedido BR (id directo)');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(*)::text from public.ticket_messages where ticket_id = (select v::uuid from ctx where k = 'tb') $$),
  '0', 'X2b: cliente AO não vê mensagens do pedido BR');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(*)::text from public.ticket_events where ticket_id = (select v::uuid from ctx where k = 'tb') $$),
  '0', 'X2c: count(*) em ticket_events (sem colunas) devolve 0 para o pedido BR');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(id)::text from public.ticket_events where ticket_id = (select v::uuid from ctx where k = 'tb') $$),
  '0', 'X2d: cliente AO não vê eventos do pedido BR');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select (select count(*) from public.accounts where id = (select v::uuid from ctx where k = 'acc_b'))
          + (select count(*) from public.profiles where id = '30000000-0000-4000-8000-0000000000b1') $$),
  '0', 'X2e: cliente AO não vê conta nem perfil do cliente BR');

select is(pg_temp.val_as('authenticated', :'c_a', $$
  with u as (update public.accounts set name = 'Invasão M3'
             where id = (select v::uuid from ctx where k = 'acc_b') returning 1)
  select count(*)::text from u $$),
  '0', 'X3a: cliente AO não actualiza a conta do cliente BR (0 linhas)');
select is(pg_temp.val_as('authenticated', :'c_a', $$
  update public.profiles set kind = 'interno' where id = '30000000-0000-4000-8000-0000000000a1' returning 'x' $$),
  'ERR:42501', 'X3b: cliente não altera profiles.kind (coluna sem privilégio)');

-- =============================================================================
-- X4 / S2 — Notas e eventos internos, evidence_ref
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(*)::text from public.ticket_internal_notes where ticket_id = (select v::uuid from ctx where k = 'ta') $$),
  '0', 'X4a: cliente não vê notas internas do próprio pedido');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(id)::text from public.ticket_events
     where ticket_id = (select v::uuid from ctx where k = 'ta') and visibility = 'interno' $$),
  '0', 'X4b: cliente não vê eventos internos do próprio pedido');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(evidence_ref)::text from public.ticket_events $$),
  'ERR:42501', 'X4c: cliente não lê evidence_ref');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(*)::text from (select * from public.ticket_events) e $$),
  'ERR:42501', 'X4d: select * em ticket_events é recusado (inclui evidence_ref)');

-- =============================================================================
-- X5 — Sem escritas directas
-- =============================================================================
select is(pg_temp.try_as('authenticated', :'c_a', $$
  insert into public.tickets (reference, account_id, requester_id, type, subject, description)
  values ('KG-2000-933001', (select v::uuid from ctx where k = 'acc_a'), '30000000-0000-4000-8000-0000000000a1',
          'consultoria', 'Directo', 'Inserção directa recusada.') $$),
  '42501', 'X5a: cliente não insere pedidos directamente');
select is(pg_temp.try_as('authenticated', :'c_a', $$
  insert into public.ticket_messages (ticket_id, author_id, body)
  values ((select v::uuid from ctx where k = 'ta'), '30000000-0000-4000-8000-0000000000a1', 'Directo') $$),
  '42501', 'X5b: cliente não insere mensagens directamente');
select is(pg_temp.try_as('authenticated', :'c_a',
  $$ delete from public.tickets where id = (select v::uuid from ctx where k = 'ta') $$),
  '42501', 'X5c: cliente não apaga pedidos');
select is(pg_temp.try_as('authenticated', :'c_a',
  $$ update public.tickets set status = 'cancelado' where id = (select v::uuid from ctx where k = 'ta') $$),
  '42501', 'X5d: cliente não altera o estado directamente');

-- =============================================================================
-- X6 — Membro não titular
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_a2',
  $$ select count(*)::text from public.accounts where id = (select v::uuid from ctx where k = 'acc_a') $$),
  '1', 'X6a: membro lê a conta de que é membro');
select is(pg_temp.val_as('authenticated', :'c_a2', $$
  with u as (update public.accounts set name = 'Alterada por membro'
             where id = (select v::uuid from ctx where k = 'acc_a') returning 1)
  select count(*)::text from u $$),
  '0', 'X6b: membro não titular não actualiza a conta');

-- =============================================================================
-- P-OP / P-CLI / P-SEL — Positivos (antes da reatribuição)
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(*)::text from public.tickets where id = (select v::uuid from ctx where k = 'ta') $$),
  '1', 'P-OP1: operador atribuído vê o pedido');
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(*)::text from public.ticket_internal_notes where ticket_id = (select v::uuid from ctx where k = 'ta') $$),
  '1', 'P-OP2: operador atribuído vê as notas internas');
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(id)::text from public.ticket_events where ticket_id = (select v::uuid from ctx where k = 'ta') $$),
  (select count(*)::text from public.ticket_events where ticket_id = (select v::uuid from ctx where k = 'ta')),
  'P-OP3: operador atribuído vê todos os eventos (sem evidence_ref)');
select is(pg_temp.val_as('authenticated', :'c_op1', $$
  select evidence_ref from public.staff_ticket_events((select v::uuid from ctx where k = 'ta'))
  where evidence_ref is not null limit 1 $$),
  'EV-M3-001', 'P-OP4: evidence_ref só pela RPC staff_ticket_events');
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-0000000000a1' and phone is not distinct from phone $$),
  '1', 'X7e/Q2: operador atribuído lê o perfil do requerente (incl. phone)');
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(*)::text from public.profiles where id = '30000000-0000-4000-8000-0000000000b1' $$),
  '0', 'X7f: operador não lê perfis de clientes sem pedidos atribuídos');

select is(pg_temp.val_as('authenticated', :'c_a', $$
  select (select count(*) from public.profiles where id = '30000000-0000-4000-8000-0000000000a1')
       || ',' || (select count(*) from public.accounts where id = (select v::uuid from ctx where k = 'acc_a'))
       || ',' || (select count(*) from public.tickets)
       || ',' || (select count(*) from public.ticket_messages where ticket_id = (select v::uuid from ctx where k = 'ta')) $$),
  '1,1,1,1', 'P-CLI1: cliente vê o próprio perfil, a conta, só o seu pedido e as mensagens');
select is(pg_temp.val_as('authenticated', :'c_a', $$
  select count(id)::text from public.ticket_events
  where ticket_id = (select v::uuid from ctx where k = 'ta') and reason = 'Pedimos mais detalhes M3' $$),
  '1', 'P-CLI2/D-M2-1: cliente vê o motivo (reason) nos eventos cliente');
select is(pg_temp.val_as('authenticated', :'c_a', $$
  select count(id)::text from (
    select id, ticket_id, actor_id, event_type, from_status, to_status, reason, visibility, created_at
    from public.ticket_events where ticket_id = (select v::uuid from ctx where k = 'ta')) e $$),
  (select count(*)::text from public.ticket_events
   where ticket_id = (select v::uuid from ctx where k = 'ta') and visibility = 'cliente'),
  'P-SEL/Q1: lista explícita de colunas devolve exactamente os eventos cliente');
select is(pg_temp.val_as('authenticated', :'c_a', $$
  with u as (update public.profiles set full_name = 'Cliente AO Editado', phone = '+244 900 000 000', locale = 'pt-AO'
             where id = '30000000-0000-4000-8000-0000000000a1' returning 1)
  select count(*)::text from u $$),
  '1', 'P-CLI3: cliente actualiza full_name, phone e locale do próprio perfil');
select is(pg_temp.val_as('authenticated', :'c_a', $$
  with u as (update public.accounts set name = 'Empresa AO M3 Editada', country = 'AO', sector = 'Serviços'
             where id = (select v::uuid from ctx where k = 'acc_a') returning 1)
  select count(*)::text from u $$),
  '1', 'P-CLI4: titular actualiza name, country e sector da conta');
select is(pg_temp.val_as('authenticated', :'c_a', $$
  with u as (update public.profiles set full_name = 'Outro'
             where id = '30000000-0000-4000-8000-0000000000b1' returning 1)
  select count(*)::text from u $$),
  '0', 'X3c: cliente não actualiza o perfil de outro utilizador');

-- =============================================================================
-- X7 — Operador: só pedidos atribuídos (D2), com reatribuição
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_op2',
  $$ select count(*)::text from public.tickets where id = (select v::uuid from ctx where k = 'ta') $$),
  '0', 'X7a: operador sem atribuição não vê o pedido');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.assign_ticket((select v::uuid from ctx where k = 'ta'), '30000000-0000-4000-8000-0000000000c2')
$$), 'ok', 'SETUP-9: admin reatribui TA a OP2');
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(*)::text from public.tickets where id = (select v::uuid from ctx where k = 'ta') $$),
  '0', 'X7b: após reatribuição, o operador anterior deixa de ver o pedido');
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(*)::text from public.ticket_internal_notes where ticket_id = (select v::uuid from ctx where k = 'ta') $$),
  '0', 'X7c: após reatribuição, o operador anterior deixa de ver as notas');
select is(pg_temp.val_as('authenticated', :'c_op2',
  $$ select count(*)::text from public.tickets where id = (select v::uuid from ctx where k = 'ta') $$),
  '1', 'X7d: o novo operador atribuído vê o pedido');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.assign_ticket((select v::uuid from ctx where k = 'ta'), '30000000-0000-4000-8000-0000000000c1')
$$), 'ok', 'SETUP-10: admin devolve TA a OP1');

-- =============================================================================
-- X8 — Operador sem acesso administrativo
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_op1', $$ select count(*)::text from private.audit_log $$),
  'ERR:42501', 'X8a: operador não lê a auditoria');
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(*)::text from public.user_roles where user_id <> '30000000-0000-4000-8000-0000000000c1' $$),
  '0', 'X8b: operador não lê papéis de terceiros');
select is(pg_temp.val_as('authenticated', :'c_op1', $$ select count(*)::text from public.account_members $$),
  '0', 'X8c: operador não lê associações de contas');
select is(pg_temp.val_as('authenticated', :'c_op1',
  $$ select count(*)::text from public.tickets where id = (select v::uuid from ctx where k = 'tb') $$),
  '0', 'X8d: operador não vê pedidos não atribuídos de outras contas');

-- =============================================================================
-- MFA — aal2 obrigatório para leituras internas
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_op1_aal1', $$
  select (select count(*) from public.tickets)
       + (select count(*) from public.ticket_internal_notes)
       + (select count(id) from public.ticket_events where visibility = 'interno')
       + (select count(*) from public.profiles where id <> '30000000-0000-4000-8000-0000000000c1') $$),
  '0', 'MFA-1: operador aal1 não vê pedidos, notas, eventos internos nem perfis de terceiros');
select is(pg_temp.val_as('authenticated', :'c_adm_aal1', $$
  select (select count(*) from public.tickets)
       + (select count(*) from public.ticket_internal_notes)
       + (select count(*) from public.user_roles where user_id <> '30000000-0000-4000-8000-0000000000d1')
       + (select count(*) from public.profiles where id <> '30000000-0000-4000-8000-0000000000d1') $$),
  '0', 'MFA-2: admin aal1 não vê pedidos, notas, papéis nem perfis de terceiros');
select is(pg_temp.val_as('authenticated', :'c_int0', $$
  select (select count(*) from public.tickets)
       + (select count(*) from public.ticket_internal_notes)
       + (select count(id) from public.ticket_events)
       + (select count(*) from public.profiles where id <> '30000000-0000-4000-8000-0000000000c0') $$),
  '0', 'MFA-3: interno sem papel (aal2) não vê nada interno');
select is(pg_temp.val_as('authenticated', :'c_op1', $$
  select (select count(*) from public.tickets where id = (select v::uuid from ctx where k = 'ta'))
       + (select count(*) from public.ticket_internal_notes where ticket_id = (select v::uuid from ctx where k = 'ta')) $$),
  '2', 'MFA-4: o mesmo operador com aal2 vê o pedido e a nota (positivo)');

-- =============================================================================
-- S2-6 — Políticas restritivas resistem a uma permissiva demasiado larga
-- =============================================================================
create policy tmp_s26_notes on public.ticket_internal_notes for select to authenticated using (true);
create policy tmp_s26_events on public.ticket_events for select to authenticated using (true);
select is(pg_temp.val_as('authenticated', :'c_a', $$ select count(*)::text from public.ticket_internal_notes $$),
  '0', 'S2-6a: com permissiva USING (true), o cliente continua sem notas internas');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(id)::text from public.ticket_events where visibility = 'interno' $$),
  '0', 'S2-6b: com permissiva USING (true), o cliente continua sem eventos internos');
drop policy tmp_s26_events on public.ticket_events;
drop policy tmp_s26_notes on public.ticket_internal_notes;

-- =============================================================================
-- H1 / H2 — Imutabilidade do histórico e da auditoria pela API
-- =============================================================================
select is(pg_temp.try_as('authenticated', :'c_a',
  $$ update public.ticket_messages set body = 'alterada' where ticket_id = (select v::uuid from ctx where k = 'ta') $$),
  '42501', 'H1a: cliente não altera mensagens');
select is(pg_temp.try_as('authenticated', :'c_op1',
  $$ delete from public.ticket_internal_notes where ticket_id = (select v::uuid from ctx where k = 'ta') $$),
  '42501', 'H1b: operador não apaga notas');
select is(pg_temp.try_as('authenticated', :'c_adm',
  $$ update public.ticket_events set reason = 'x' where ticket_id = (select v::uuid from ctx where k = 'ta') $$),
  '42501', 'H1c: admin não altera eventos');
select is(pg_temp.val_as('authenticated', :'c_adm', $$ select count(*)::text from private.audit_log $$),
  'ERR:42501', 'H1d: admin não lê a auditoria directamente (só pela RPC)');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  insert into public.ticket_events (ticket_id, actor_id, event_type, to_status, visibility)
  values ((select v::uuid from ctx where k = 'ta'), '30000000-0000-4000-8000-0000000000d1', 'created', 'recebido', 'cliente') $$),
  '42501', 'H2: ninguém insere eventos directamente');

-- =============================================================================
-- P-ADM — Administrador aal2
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_adm', $$
  select count(*)::text from public.tickets
  where id in ((select v::uuid from ctx where k = 'ta'), (select v::uuid from ctx where k = 'tb')) $$),
  '2', 'P-ADM1: admin vê pedidos de todas as contas');
select is(pg_temp.val_as('authenticated', :'c_adm',
  $$ select count(*)::text from public.ticket_internal_notes where ticket_id = (select v::uuid from ctx where k = 'ta') $$),
  '1', 'P-ADM2: admin vê notas internas');
select is(pg_temp.val_as('authenticated', :'c_adm', $$
  select count(*)::text from public.profiles
  where id in ('30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000b1',
               '30000000-0000-4000-8000-0000000000c1') $$),
  '3', 'P-ADM3: admin vê perfis de clientes e staff');
select is(pg_temp.val_as('authenticated', :'c_adm', $$
  select count(*)::text from public.user_roles
  where user_id in ('30000000-0000-4000-8000-0000000000c1', '30000000-0000-4000-8000-0000000000c2') $$),
  '2', 'P-ADM4: admin vê papéis de terceiros');
select is(pg_temp.val_as('authenticated', :'c_adm', $$ select count(evidence_ref)::text from public.ticket_events $$),
  'ERR:42501', 'P-ADM5: nem o admin lê evidence_ref directamente');
select is(pg_temp.val_as('authenticated', :'c_adm', $$
  select (select count(*) from public.accounts
          where id in ((select v::uuid from ctx where k = 'acc_a'), (select v::uuid from ctx where k = 'acc_b')))
       + (select count(*) from public.account_members
          where account_id = (select v::uuid from ctx where k = 'acc_a')) $$),
  '4', 'P-ADM6: admin vê contas e associações (2 contas + titular e membro)');

-- =============================================================================
-- Perfis próprios e contas por staff
-- =============================================================================
select is(pg_temp.val_as('authenticated', :'c_op1', $$
  select count(*)::text from public.accounts where id = (select v::uuid from ctx where k = 'acc_a') $$),
  '1', 'P-OP5: operador atribuído vê a conta do pedido');
select is(pg_temp.val_as('authenticated', :'c_op1', $$
  select count(*)::text from public.accounts where id = (select v::uuid from ctx where k = 'acc_b') $$),
  '0', 'X7g: operador não vê contas sem pedidos atribuídos');
select is(pg_temp.val_as('authenticated', :'c_op1', $$
  with u as (update public.profiles set full_name = 'Operador M3'
             where id = '30000000-0000-4000-8000-0000000000c1' returning 1)
  select count(*)::text from u $$),
  '1', 'P-OP6: staff actualiza o próprio perfil');
select is(pg_temp.val_as('authenticated', :'c_op1', $$
  with u as (update public.accounts set name = 'Alterada por operador'
             where id = (select v::uuid from ctx where k = 'acc_a') returning 1)
  select count(*)::text from u $$),
  '0', 'X7h: operador não actualiza contas de clientes');
select is(pg_temp.val_as('authenticated', :'c_a',
  $$ select count(*)::text from public.user_roles $$),
  '0', 'P-CLI5: cliente não tem papéis e não vê papéis de terceiros');

select * from finish();
rollback;
