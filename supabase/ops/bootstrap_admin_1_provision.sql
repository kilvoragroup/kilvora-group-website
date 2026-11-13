-- =============================================================================
-- KILVORA GROUP — Portal V1 — Arranque do primeiro admin · FASE A (provisionamento)
-- Executar como postgres, com autorização expressa para o ambiente:
--   ... psql -X -v ON_ERROR_STOP=1 -v email=pessoa@dominio -f bootstrap_admin_1_provision.sql
-- Depois: convidar o mesmo e-mail pelo Dashboard (Authentication > Invite user)
-- SÓ depois do COMMIT desta fase.
-- =============================================================================
\set ON_ERROR_STOP on

\if :{?email}
\else
  \echo 'ERRO: indicar -v email=...'
  \quit
\endif

begin;

select pg_catalog.set_config('kilvora.bootstrap_email', lower(btrim(:'email')), true);
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));

do $guard$
begin
  if current_user <> 'postgres' then
    raise exception 'Fase A: executar como postgres';
  end if;
  if exists (select 1 from private.system_bootstrap) then
    raise exception 'Fase A: o arranque já foi concluído';
  end if;
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'Fase A: já existe ou existiu um admin; usar admin_provision_staff';
  end if;
  if current_setting('kilvora.bootstrap_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Fase A: e-mail inválido';
  end if;
end
$guard$;

-- I1: provisionamento de arranque expirado e não consumido deste e-mail é
-- removido (não pode ser cancelado sem autor), com auditoria sem o e-mail.
with removed as (
  delete from private.staff_provisioning
  where email_normalized = current_setting('kilvora.bootstrap_email')
    and provisioned_by is null and consumed_at is null and cancelled_at is null
    and expires_at <= now()
  returning id, created_at, expires_at
)
insert into private.audit_log (action, entity_type, entity_id, before)
select 'bootstrap_provision_expired_removed', 'staff_provisioning', id::text,
       jsonb_build_object('created_at', created_at, 'expires_at', expires_at)
from removed;

-- O trigger guard_bootstrap_nulls revalida as condições de unicidade.
with created as (
  insert into private.staff_provisioning (email_normalized, expires_at)
  values (current_setting('kilvora.bootstrap_email'), now() + interval '72 hours')
  returning id
)
insert into private.audit_log (action, entity_type, entity_id, after)
select 'bootstrap_provisioned', 'staff_provisioning', id::text,
       jsonb_build_object('expires_in_hours', 72, 'method', 'owner_sql')
from created;

select pg_catalog.set_config('kilvora.bootstrap_email', '', true);

commit;

\echo 'Fase A concluída. Enviar agora o convite pelo Dashboard para o mesmo e-mail.'
