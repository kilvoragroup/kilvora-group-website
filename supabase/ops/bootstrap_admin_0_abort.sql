-- =============================================================================
-- KILVORA GROUP — Portal V1 — Arranque do primeiro admin · ABORTAR (antes da fase B)
-- Uso: o provisionamento de arranque foi consumido pela pessoa errada (ex.: erro
-- no e-mail). Suspende esse perfil e permite repetir a fase A com o e-mail
-- CORRECTO (um utilizador já existente não pode voltar a ser convertido).
-- Executar como postgres, com autorização expressa:
--   ... psql -X -v ON_ERROR_STOP=1 -f bootstrap_admin_0_abort.sql
-- =============================================================================
\set ON_ERROR_STOP on

begin;

select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kilvora.admin_set'));

do $abort$
declare
  v_target uuid;
  v_count  int;
begin
  if current_user <> 'postgres' then
    raise exception 'Abortar: executar como postgres';
  end if;
  if exists (select 1 from private.system_bootstrap) then
    raise exception 'Abortar: o arranque já foi concluído; usar as RPCs administrativas';
  end if;
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'Abortar: já existe ou existiu um admin';
  end if;

  select count(*), min(p.id::text)::uuid into v_count, v_target
  from private.staff_provisioning sp
  join public.profiles p on p.id = sp.consumed_user_id
  where sp.provisioned_by is null and sp.consumed_at is not null and p.status = 'activo';
  if v_count <> 1 then
    raise exception 'Abortar: esperado exactamente 1 perfil activo que consumiu o arranque (encontrados: %)', v_count;
  end if;

  update public.profiles set status = 'suspenso' where id = v_target;
  insert into private.audit_log (action, entity_type, entity_id, before, after)
  values ('bootstrap_aborted', 'profile', v_target::text,
          jsonb_build_object('status', 'activo'),
          jsonb_build_object('status', 'suspenso', 'method', 'owner_sql'));
end
$abort$;

commit;

\echo 'Arranque abortado: perfil suspenso. Repetir a fase A com o e-mail correcto.'
