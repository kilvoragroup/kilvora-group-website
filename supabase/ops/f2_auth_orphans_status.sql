-- =============================================================================
-- KILVORA GROUP — Portal V1 — F2 (M4-BD, C5): utilizadores do Auth sem perfil
-- SÓ LEITURA (transacção READ ONLY). Executar como postgres, manualmente:
--   Get-Content -Encoding UTF8 supabase\ops\f2_auth_orphans_status.sql |
--     docker exec -i <contentor_db> psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f -
--
-- Finalidade: depois de admin_remove_misclassified_registration, o utilizador do Auth
-- continua a existir até ser bloqueado e apagado no Supabase Dashboard (D01). Este
-- relatório mostra esses casos pendentes, para que o passo manual não seja esquecido.
--
-- Privacidade: sem e-mail, sem nome, sem metadados; identificador mascarado (8 primeiros
-- caracteres). Para localizar o utilizador no Dashboard, use o identificador da auditoria
-- (misclassified_registration_removed) na consola /interno/admin/auditoria.
-- =============================================================================

\set ON_ERROR_STOP on

begin transaction read only;

do $guard$
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'F2-C5: a transacção tem de ser só de leitura';
  end if;
end
$guard$;

-- Resumo
select 'auth_sem_perfil' as indicador, count(*) as total
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
union all
select 'auth_sem_perfil_corrigidos_f2', count(*)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
  and exists (select 1 from private.audit_log a
              where a.action = 'misclassified_registration_removed' and a.entity_id = u.id::text)
union all
select 'auth_sem_perfil_bloqueados', count(*)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
  and u.banned_until is not null and u.banned_until > now();

-- Detalhe (identificador mascarado; sem dados pessoais)
select left(u.id::text, 8) || '…'                                        as utilizador,
       u.created_at                                                       as criado_em,
       (u.invited_at is not null)                                         as convidado,
       (u.banned_until is not null and u.banned_until > now())            as bloqueado,
       a.occurred_at                                                      as corrigido_em,
       case
         when a.id is null then 'sem perfil sem correcção F2 registada: investigar'
         when u.banned_until is null or u.banned_until <= now() then 'BLOQUEAR e apagar no Dashboard'
         else 'apagar no Dashboard'
       end                                                                as accao
from auth.users u
left join lateral (
  select al.id, al.occurred_at from private.audit_log al
  where al.action = 'misclassified_registration_removed' and al.entity_id = u.id::text
  order by al.occurred_at desc limit 1
) a on true
where not exists (select 1 from public.profiles p where p.id = u.id)
order by u.created_at;

commit;
