-- =============================================================================
-- KILVORA GROUP — Portal V1 — Estado do arranque do primeiro administrador
-- SÓ LEITURA. Pode ser executado em qualquer momento, como postgres.
-- Não mostra e-mails completos nem segredos.
-- =============================================================================
\set ON_ERROR_STOP on

begin transaction read only;

\echo '== system_bootstrap'
select completed_at, admin_user_id, executed_by from private.system_bootstrap;

\echo '== Papéis admin (activos e revogados)'
select r.user_id, r.granted_by is null as arranque, r.granted_at, r.revoked_at, p.status
from public.user_roles r join public.profiles p on p.id = r.user_id
where r.role = 'admin'
order by r.granted_at;

\echo '== Provisionamentos de arranque (provisioned_by nulo)'
select sp.id,
       regexp_replace(sp.email_normalized, '^(.).*(@.*)$', '\1***\2') as email_mascarado,
       sp.created_at, sp.expires_at,
       sp.expires_at <= now() as expirado,
       sp.consumed_at, sp.consumed_user_id, sp.cancelled_at
from private.staff_provisioning sp
where sp.provisioned_by is null
order by sp.created_at;

\echo '== Candidato à fase B (quem consumiu o provisionamento de arranque)'
select p.id, p.kind, p.status,
       u.email_confirmed_at is not null as email_confirmado,
       exists (select 1 from auth.mfa_factors f
               where f.user_id = p.id and f.factor_type = 'totp' and f.status = 'verified') as totp_verificado
from private.staff_provisioning sp
join public.profiles p on p.id = sp.consumed_user_id
join auth.users u on u.id = p.id
where sp.provisioned_by is null and sp.consumed_at is not null;

commit;
