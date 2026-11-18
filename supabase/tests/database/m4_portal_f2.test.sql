-- =============================================================================
-- KILVORA GROUP — Portal V1 — Testes pgTAP da M4-BD (mitigação F2)
-- Cobertura: factos de convite (F), privilégios mínimos (P), marcação do alvo não
-- contornável (G), guardas da correcção (R), idempotência e auditoria (I),
-- estado do provisionamento (S) e classificação inalterada (REG).
-- Pressupõe base sem arranque concluído (CI ou instância local isolada).
-- Executar: npx.cmd supabase test db   (transacção revertida no fim)
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

\set c_adm      '{"sub":"40000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal2"}'
\set c_adm_aal1 '{"sub":"40000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal1"}'
\set c_adm2     '{"sub":"40000000-0000-4000-8000-0000000000d2","role":"authenticated","aal":"aal2"}'
\set c_cs       '{"sub":"40000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}'
\set c_v4       '{"sub":"40000000-0000-4000-8000-0000000000f4","role":"authenticated","aal":"aal1"}'

select plan(51);

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
    v_state := sqlstate || ':' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('kilvora.f2_target', '', true);
  return v_state;
end
$fn$;

create function pg_temp.exists_profile(p_id uuid) returns boolean language sql as $$
  select exists (select 1 from public.profiles where id = p_id)
$$;

create function pg_temp.audit_count() returns bigint language sql as $$
  select count(*) from private.audit_log
$$;

-- -----------------------------------------------------------------------------
-- Fixtures: arranque do admin (D13), segundo admin, clientes e casos F2
-- -----------------------------------------------------------------------------
select ok(not exists (select 1 from private.system_bootstrap)
          and not exists (select 1 from public.user_roles where role = 'admin'),
  'BS-0: base sem arranque (pressuposto dos testes)');

insert into private.staff_provisioning (email_normalized, expires_at)
  values ('m4-adm@example.test', now() + interval '72 hours');
select pg_temp.new_user('40000000-0000-4000-8000-0000000000d1', 'm4-adm@example.test', '{}', true);
insert into private.audit_log (action, entity_type, entity_id, after)
  values ('bootstrap_admin_granted', 'user_role', '40000000-0000-4000-8000-0000000000d1', '{"method":"teste"}');
insert into public.user_roles (user_id, role) values ('40000000-0000-4000-8000-0000000000d1', 'admin');
insert into private.system_bootstrap (admin_user_id) values ('40000000-0000-4000-8000-0000000000d1');
set constraints all immediate;
set constraints all deferred;

-- Provisionamentos do ADM: segundo admin (consumido), P1 (pendente, e-mail com erro de digitação).
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  insert into ctx values
    ('p_adm2', public.admin_provision_staff('m4-adm2@example.test')::text),
    ('p1',     public.admin_provision_staff('m4-typo@example.test')::text),
    ('p_old',  public.admin_provision_staff('m4-old@example.test')::text)
$$), 'ok', 'fixture: o admin provisiona pessoal');
select pg_temp.new_user('40000000-0000-4000-8000-0000000000d2', 'm4-adm2@example.test', '{}', true);
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.grant_role('40000000-0000-4000-8000-0000000000d2', 'admin')
$$), 'ok', 'fixture: segundo admin');
select is(pg_temp.try_as('authenticated', :'c_adm2', $$
  insert into ctx values ('p_adm2_own', public.admin_provision_staff('m4-other@example.test')::text)
$$), 'ok', 'fixture: o segundo admin tem o seu próprio provisionamento');

-- Cliente auto-registado (sem convite) e vítimas F2 (convite sem provisionamento válido).
select pg_temp.new_user('40000000-0000-4000-8000-0000000000a1', 'm4-cs@example.test', '{"company":"CS"}');
select pg_temp.new_user('40000000-0000-4000-8000-0000000000f1', 'm4-tpyo@example.test', '{}', true);
select pg_temp.new_user('40000000-0000-4000-8000-0000000000f2', 'm4-v2@example.test', '{}', true);
select pg_temp.new_user('40000000-0000-4000-8000-0000000000f3', 'm4-v3@example.test', '{}', true);
select pg_temp.new_user('40000000-0000-4000-8000-0000000000f4', 'm4-v4@example.test', '{}', true);
select pg_temp.new_user('40000000-0000-4000-8000-0000000000f5', 'm4-v5@example.test', '{}', true);
select pg_temp.new_user('40000000-0000-4000-8000-0000000000f8', 'm4-v8@example.test', '{}', true);
select pg_temp.new_user('40000000-0000-4000-8000-0000000000f9', 'm4-v9@example.test', '{}', true);

-- =============================================================================
-- REG / F — classificação inalterada e factos de convite
-- =============================================================================
select ok((select kind from public.profiles where id = '40000000-0000-4000-8000-0000000000d2') = 'interno',
  'REG-INV: convite com provisionamento continua a dar interno');
select ok((select kind from public.profiles where id = '40000000-0000-4000-8000-0000000000f1') = 'cliente'
          and exists (select 1 from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f1'),
  'REG-F2: convite sem provisionamento válido continua a dar cliente com conta (F2)');
select ok((select kind from public.profiles where id = '40000000-0000-4000-8000-0000000000a1') = 'cliente',
  'REG-PUB: registo público continua a dar cliente');
select ok(exists (select 1 from private.auth_invite_facts where user_id = '40000000-0000-4000-8000-0000000000f1')
          and exists (select 1 from private.auth_invite_facts where user_id = '40000000-0000-4000-8000-0000000000d2'),
  'F1: o convite grava o facto (cliente F2 e interno)');
select ok(not exists (select 1 from private.auth_invite_facts where user_id = '40000000-0000-4000-8000-0000000000a1'),
  'F2: o registo público (ou «Create new user», sem invited_at) não grava facto');
select throws_ok($$ update private.auth_invite_facts set invited_at = now() $$, '42501', null,
  'F3: factos de convite imutáveis (UPDATE)');
select throws_ok($$ delete from private.auth_invite_facts $$, '42501', null,
  'F4: factos de convite imutáveis (DELETE)');
select is(left(pg_temp.try_as('authenticated', :'c_adm', $$ select count(*) from private.auth_invite_facts $$), 5),
  '42501', 'F5: os papéis da API não lêem os factos de convite');
select ok(pg_get_userbyid((select proowner from pg_proc where oid = 'private.record_auth_invite()'::regprocedure)) = 'portal_registrar'
          and pg_get_userbyid((select proowner from pg_proc where oid = 'private.handle_new_user()'::regprocedure)) = 'portal_registrar'
          and pg_get_userbyid((select proowner from pg_proc where oid = 'private.mark_user_invited()'::regprocedure)) = 'portal_registrar',
  'F6: gatilho novo de portal_registrar; handle_new_user e mark_user_invited intactos (mesmo dono)');

-- =============================================================================
-- P — privilégios mínimos
-- =============================================================================
select set_eq($$
  select table_schema || '.' || table_name from information_schema.table_privileges
  where grantee = 'portal_definer' and privilege_type = 'DELETE'
$$, array['public.profiles', 'public.accounts', 'public.account_members'],
  'P1: portal_definer só tem DELETE em profiles, accounts e account_members');
select is_empty($$
  select table_schema || '.' || table_name || ':' || grantee from information_schema.table_privileges
  where privilege_type in ('DELETE', 'TRUNCATE') and table_schema in ('public', 'private')
    and grantee in ('authenticated', 'anon', 'service_role', 'PUBLIC', 'portal_guard', 'portal_registrar')
$$, 'P2: nenhum outro papel tem DELETE/TRUNCATE nas tabelas do portal');
select set_eq($$
  select tablename::text || ':' || policyname::text from pg_policies where cmd = 'DELETE'
$$, array['profiles:portal_definer_delete', 'accounts:portal_definer_delete', 'account_members:portal_definer_delete'],
  'P3: só existem as 3 políticas DELETE de portal_definer');
select ok(has_function_privilege('authenticated', 'public.admin_remove_misclassified_registration(uuid,bigint)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.admin_remove_misclassified_registration(uuid,bigint)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.admin_remove_misclassified_registration(uuid,bigint)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'private.record_auth_invite()', 'EXECUTE'),
  'P4: EXECUTE só para authenticated nas RPCs; gatilho sem EXECUTE para a API');

-- Preparação: V9 elegível (suspenso) para as tentativas de contorno.
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.admin_set_profile_status('40000000-0000-4000-8000-0000000000f9', 'suspenso')
$$), 'ok', 'fixture: V9 suspenso');

-- =============================================================================
-- G — kilvora.f2_target não contorna a autorização
-- =============================================================================
select is(left(pg_temp.try_as('authenticated', :'c_cs', $$
  select set_config('kilvora.f2_target', '40000000-0000-4000-8000-0000000000f9', true);
  delete from public.profiles where id = '40000000-0000-4000-8000-0000000000f9'
$$), 5), '42501', 'G1: authenticated com o alvo marcado não pode apagar (sem privilégio)');
select is(left(pg_temp.try_as('authenticated', :'c_adm', $$
  select set_config('kilvora.f2_target', '40000000-0000-4000-8000-0000000000f9', true);
  delete from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9'
$$), 5), '42501', 'G2: nem um admin aal2 apaga directamente pela API');
select is(left(pg_temp.try_as('anon', null, $$
  select set_config('kilvora.f2_target', '40000000-0000-4000-8000-0000000000f9', true);
  delete from public.accounts
$$), 5), '42501', 'G3: anon não pode apagar');
select is(left(pg_temp.try_as('service_role', null, $$
  select set_config('kilvora.f2_target', '40000000-0000-4000-8000-0000000000f9', true);
  delete from public.profiles where id = '40000000-0000-4000-8000-0000000000f9'
$$), 5), '42501', 'G4: service_role não pode apagar');

-- Mesmo assumindo portal_definer (impossível pela API, C3 da M2), as políticas exigem tudo.
select 'pre: ' || pg_temp.try_as('portal_definer', :'c_cs', $$
  select set_config('kilvora.f2_target', '40000000-0000-4000-8000-0000000000f9', true);
  delete from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9';
  delete from public.profiles where id = '40000000-0000-4000-8000-0000000000f9'
$$);
select ok(pg_temp.exists_profile('40000000-0000-4000-8000-0000000000f9')
          and exists (select 1 from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9'),
  'G5: portal_definer com alvo marcado mas sem admin aal2 não apaga nada');
select 'pre: ' || pg_temp.try_as('portal_definer', :'c_adm_aal1', $$
  select set_config('kilvora.f2_target', '40000000-0000-4000-8000-0000000000f9', true);
  delete from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9'
$$);
select ok(exists (select 1 from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9'),
  'G6: admin com aal1 e alvo marcado não apaga nada');
select 'pre: ' || pg_temp.try_as('portal_definer', :'c_adm', $$
  delete from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9';
  delete from public.profiles where id = '40000000-0000-4000-8000-0000000000f2'
$$);
select ok(exists (select 1 from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9')
          and pg_temp.exists_profile('40000000-0000-4000-8000-0000000000f2'),
  'G7: admin aal2 sem alvo marcado não apaga nada');
select 'pre: ' || pg_temp.try_as('portal_definer', :'c_adm', $$
  select set_config('kilvora.f2_target', '40000000-0000-4000-8000-0000000000f2', true);
  delete from public.profiles where id = '40000000-0000-4000-8000-0000000000f2';
  delete from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9'
$$);
select ok(pg_temp.exists_profile('40000000-0000-4000-8000-0000000000f2')
          and exists (select 1 from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f9'),
  'G8: alvo marcado não suspenso não é apagado; outro utilizador também não');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select set_config('kilvora.f2_target', '40000000-0000-4000-8000-0000000000f9', true);
  select count(*) from public.admin_audit_log();
  select public.assign_ticket('00000000-0000-4000-8000-000000000000', null)
$$) like 'PT404%', true, 'G9a: outras RPCs com o alvo marcado correm normalmente (sem remoções)');
select ok(pg_temp.exists_profile('40000000-0000-4000-8000-0000000000f9')
          and pg_temp.exists_profile('40000000-0000-4000-8000-0000000000f2'),
  'G9b: nenhuma outra RPC apaga perfis, mesmo com o alvo marcado');

-- =============================================================================
-- R — guardas da correcção
-- =============================================================================
-- Preparação dos casos negativos.
update public.profiles set created_at = now() - interval '25 hours'
  where id = '40000000-0000-4000-8000-0000000000f3';
select is(pg_temp.try_as('authenticated', :'c_v4', $$
  select public.create_ticket('consultoria', 'Pedido V4', 'Descrição do pedido V4.')
$$), 'ok', 'fixture: V4 cria um pedido enquanto activo');
select is(pg_temp.try_as('authenticated', :'c_adm', $$
  select public.admin_set_profile_status(u, 'suspenso') from unnest(array[
    '40000000-0000-4000-8000-0000000000f1', '40000000-0000-4000-8000-0000000000f3',
    '40000000-0000-4000-8000-0000000000f4', '40000000-0000-4000-8000-0000000000f5',
    '40000000-0000-4000-8000-0000000000f8', '40000000-0000-4000-8000-0000000000a1']::uuid[]) u
$$), 'ok', 'fixture: vítimas e cliente auto-registado suspensos');
insert into public.account_members (account_id, user_id, member_role)
  select account_id, '40000000-0000-4000-8000-0000000000a1', 'membro'
  from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f8';

create function pg_temp.remove(p_claims text, p_user text, p_prov text) returns text language plpgsql as $fn$
begin
  return pg_temp.try_as('authenticated', p_claims, format(
    'select public.admin_remove_misclassified_registration(%L, %s)', p_user, p_prov));
end
$fn$;

select is(left(pg_temp.remove(:'c_cs', '40000000-0000-4000-8000-0000000000f1', (select v from ctx where k = 'p1')), 5),
  'PT404', 'R1: cliente não pode corrigir');
select is(left(pg_temp.remove(:'c_adm_aal1', '40000000-0000-4000-8000-0000000000f1', (select v from ctx where k = 'p1')), 5),
  'PT404', 'R2: admin sem aal2 não pode corrigir');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000d1', (select v from ctx where k = 'p1')),
  '42501:self_action_forbidden', 'R3: o admin não se corrige a si próprio');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000d2', (select v from ctx where k = 'p1')),
  'PT422:not_eligible', 'R4: perfil interno é recusado');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f2', (select v from ctx where k = 'p1')),
  'PT422:not_eligible', 'R5: cliente não suspenso é recusado (C4)');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f3', (select v from ctx where k = 'p1')),
  'PT422:not_eligible', 'R6: registo com mais de 24 h é recusado');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000a1', (select v from ctx where k = 'p1')),
  'PT422:not_invited', 'R7: cliente auto-registado (sem facto de convite) é recusado');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f5', (select v from ctx where k = 'p_adm2_own')),
  'PT422:provisioning_mismatch', 'R8: provisionamento de outro admin é recusado');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f5', (select v from ctx where k = 'p_adm2')),
  'PT422:provisioning_mismatch', 'R9: provisionamento consumido é recusado');
update private.staff_provisioning set created_at = now() - interval '8 days', expires_at = now() - interval '5 days'
  where id = (select v::bigint from ctx where k = 'p_old');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f5', (select v from ctx where k = 'p_old')),
  'PT422:provisioning_mismatch', 'R10: provisionamento com mais de 7 dias antes do registo é recusado');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f4', (select v from ctx where k = 'p1')),
  'PT409:has_activity', 'R11: registo com pedido é recusado');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f8', (select v from ctx where k = 'p1')),
  'PT409:has_activity', 'R12: conta com outro membro é recusada');

-- =============================================================================
-- I — sucesso, auditoria, idempotência
-- =============================================================================
insert into ctx values ('audit_before', pg_temp.audit_count()::text);
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f1', (select v from ctx where k = 'p1')),
  'ok', 'I1: correcção do registo F2 com provisionamento do mesmo admin (e-mail diferente)');
select ok(not pg_temp.exists_profile('40000000-0000-4000-8000-0000000000f1')
          and not exists (select 1 from public.account_members where user_id = '40000000-0000-4000-8000-0000000000f1')
          and not exists (select 1 from public.accounts where created_by = '40000000-0000-4000-8000-0000000000f1'),
  'I2: perfil, associação e conta pessoal removidos');
select ok(pg_temp.audit_count() = (select v::bigint + 1 from ctx where k = 'audit_before')
          and exists (select 1 from private.audit_log
                      where action = 'misclassified_registration_removed'
                        and entity_id = '40000000-0000-4000-8000-0000000000f1'
                        and actor_id = '40000000-0000-4000-8000-0000000000d1' and actor_aal = 'aal2'
                        and before ->> 'provisioning_id' = (select v from ctx where k = 'p1'))
          and exists (select 1 from private.audit_log
                      where action = 'user_registered' and entity_id = '40000000-0000-4000-8000-0000000000f1'),
  'I3: uma só auditoria nova (sem e-mail); user_registered preservado');
select ok(exists (select 1 from auth.users where id = '40000000-0000-4000-8000-0000000000f1')
          and exists (select 1 from private.auth_invite_facts where user_id = '40000000-0000-4000-8000-0000000000f1')
          and current_setting('kilvora.f2_target', true) is distinct from '40000000-0000-4000-8000-0000000000f1',
  'I4: utilizador do Auth e facto mantidos (passo manual); marcação limpa');
select is(pg_temp.remove(:'c_adm', '40000000-0000-4000-8000-0000000000f1', (select v from ctx where k = 'p1')),
  'PT404:not_found_or_forbidden', 'I5: segunda chamada → «não encontrado» neutro');
select ok(pg_temp.audit_count() = (select v::bigint + 1 from ctx where k = 'audit_before'),
  'I6: a segunda chamada não cria auditoria');

-- =============================================================================
-- S — estado do provisionamento (L2)
-- =============================================================================
select is(pg_temp.try_as('authenticated', :'c_adm', format($$
  insert into ctx select 's1', state || '|' || email_masked || '|' || provisioned_by_me
  from public.admin_staff_provisioning_status(%s) $$, (select v from ctx where k = 'p1'))), 'ok',
  'S1: admin consulta o estado');
select is((select v from ctx where k = 's1'), 'pendente|m***@example.test|true',
  'S2: estado pendente, e-mail mascarado, provisionado pelo próprio');
select is(left(pg_temp.try_as('authenticated', :'c_cs', format(
  'select * from public.admin_staff_provisioning_status(%s)', (select v from ctx where k = 'p1'))), 5),
  'PT404', 'S3: cliente não consulta provisionamentos');

select * from finish();
rollback;
