-- =============================================================================
-- KILVORA GROUP — Portal V1 — Arranque do primeiro admin · FASE B (concessão)
-- Executar como postgres, com autorização expressa para o ambiente:
--   ... psql -X -v ON_ERROR_STOP=1 -f bootstrap_admin_2_grant.sql
-- Pré-requisitos: fase A concluída; convite aceite; e-mail confirmado; TOTP
-- registado e verificado pela pessoa. Papel, system_bootstrap e auditoria são
-- gravados na mesma transacção (coerência verificada por triggers diferidos).
-- =============================================================================
\set ON_ERROR_STOP on

begin;

select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));

do $grant$
declare
  v_target uuid;
  v_count  int;
begin
  if current_user <> 'postgres' then
    raise exception 'Fase B: executar como postgres';
  end if;
  if exists (select 1 from private.system_bootstrap) then
    raise exception 'Fase B: o arranque já foi concluído';
  end if;
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'Fase B: já existe ou existiu um admin';
  end if;

  select count(*), min(p.id::text)::uuid into v_count, v_target
  from private.staff_provisioning sp
  join public.profiles p on p.id = sp.consumed_user_id
  where sp.provisioned_by is null and sp.consumed_at is not null
    and p.kind = 'interno' and p.status = 'activo';
  if v_count <> 1 then
    raise exception 'Fase B: esperado exactamente 1 perfil interno activo que consumiu o arranque (encontrados: %)', v_count;
  end if;

  if not exists (select 1 from auth.users u where u.id = v_target and u.email_confirmed_at is not null) then
    raise exception 'Fase B: o e-mail do alvo ainda não foi confirmado';
  end if;
  if not exists (
    select 1 from auth.mfa_factors f
    where f.user_id = v_target and f.factor_type = 'totp' and f.status = 'verified'
  ) then
    raise exception 'Fase B: o alvo não tem um factor TOTP verificado (MFA obrigatório)';
  end if;

  insert into private.audit_log (action, entity_type, entity_id, after)
  values ('bootstrap_admin_granted', 'user_role', v_target::text,
          jsonb_build_object('method', 'owner_sql', 'executed_by', session_user));
  insert into public.user_roles (user_id, role) values (v_target, 'admin');
  insert into private.system_bootstrap (admin_user_id) values (v_target);
end
$grant$;

-- Verifica já a coerência (falha aqui, antes do COMMIT, com mensagem clara).
set constraints all immediate;

do $final$
begin
  if (select count(*) from public.user_roles where role = 'admin' and revoked_at is null) <> 1
     or (select count(*) from private.system_bootstrap) <> 1 then
    raise exception 'Fase B: estado final inesperado';
  end if;
end
$final$;

commit;

\echo 'Fase B concluída: primeiro admin activo. Provisionar já um segundo admin pela aplicação.'
