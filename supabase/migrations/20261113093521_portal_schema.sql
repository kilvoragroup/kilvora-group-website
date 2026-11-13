-- =============================================================================
-- KILVORA GROUP — Portal de Clientes V1
-- M1: esquema, restrições, índices, RLS e revogação explícita de privilégios.
--
-- Referências: Plano Director v1.0 §6; arquitectura W3-B2-A1/A2/A3.
--
-- Princípios desta migração:
--   * Negação por omissão: RLS activa em todas as tabelas, FORCE nas 8 públicas,
--     sem políticas e sem GRANT a anon/authenticated/service_role/PUBLIC.
--   * REVOKE explícito por objecto (as permissões por omissão do Supabase em
--     `public` concedem tudo a anon/authenticated/service_role).
--   * Sem ALTER DEFAULT PRIVILEGES: não afecta objectos alheios ao portal.
--   * Papéis dedicados sem BYPASSRLS; nesta migração não recebem privilégios.
--   * Executada numa única transacção; qualquer falha reverte tudo.
--
-- Reversão: supabase/rollback/20261113093521_portal_schema.down.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
do $guard$
begin
  if current_user <> 'postgres' then
    raise exception 'M1: executar como postgres (actual: %)', current_user;
  end if;
  if current_setting('server_version_num')::int < 170000 then
    raise exception 'M1: requer PostgreSQL >= 17 (actual: %)', current_setting('server_version');
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer')) then
    raise exception 'M1: os papéis portal_guard/portal_definer já existem; não são adoptados';
  end if;
  if exists (select 1 from pg_catalog.pg_namespace where nspname = 'private') then
    raise exception 'M1: o esquema private já existe';
  end if;
end
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Papéis dedicados (sem LOGIN, sem BYPASSRLS, sem herança)
--    portal_guard   — dono das funções auxiliares das políticas (M2)
--    portal_definer — dono das RPCs e do trigger de registo (M2)
-- -----------------------------------------------------------------------------
create role portal_guard
  nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit;
create role portal_definer
  nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication noinherit;

comment on role portal_guard is
  'KILVORA portal: dono das funções auxiliares de autorização. Sem login, sem BYPASSRLS.';
comment on role portal_definer is
  'KILVORA portal: dono das RPCs SECURITY DEFINER. Sem login, sem BYPASSRLS.';

-- postgres precisa de SET ROLE (não de herança) para transferir a propriedade
-- das funções na M2.
grant portal_guard to postgres with inherit false, set true;
grant portal_definer to postgres with inherit false, set true;

-- -----------------------------------------------------------------------------
-- 2. Esquema privado (não exposto pela API)
-- -----------------------------------------------------------------------------
create schema private authorization postgres;
revoke all on schema private from public;
comment on schema private is
  'KILVORA portal: auditoria, matriz de transições, provisionamento e funções internas. Não exposto pela API.';

-- -----------------------------------------------------------------------------
-- 3. Tipos
-- -----------------------------------------------------------------------------
create type public.profile_kind as enum ('cliente', 'interno');
create type public.profile_status as enum ('activo', 'suspenso', 'anonimizado');
create type public.account_status as enum ('activa', 'arquivada');
create type public.member_role as enum ('titular', 'membro');
create type public.staff_role as enum ('operador', 'admin');
create type public.ticket_type as enum (
  'desenvolvimento_websites',
  'solucoes_digitais',
  'consultoria',
  'gestao',
  'formacao',
  'comercio',
  'demonstracao_core',
  'acesso_demo',
  'informacoes_hcm',
  'pedido_generico'
);
create type public.ticket_status as enum (
  'recebido',
  'em_analise',
  'aguarda_cliente',
  'em_preparacao_proposta',
  'proposta_enviada',
  'aceite',
  'recusado',
  'cancelado',
  'concluido'
);
create type public.ticket_event_type as enum (
  'created',
  'status_changed',
  'assigned',
  'unassigned',
  'reopened',
  'message_added',
  'note_added'
);
create type public.event_visibility as enum ('cliente', 'interno');
create type private.transition_actor as enum ('cliente', 'staff', 'admin');

-- -----------------------------------------------------------------------------
-- 4. Sequência das referências (KG-AAAA-NNNNNN)
-- -----------------------------------------------------------------------------
create sequence private.ticket_reference_seq
  as integer minvalue 1 maxvalue 999999 start 1 no cycle;
revoke all on sequence private.ticket_reference_seq from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Tabelas públicas (8). Cada uma: RLS + FORCE + REVOKE imediatos.
-- -----------------------------------------------------------------------------

-- 5.1 profiles — identidade e contacto (1:1 com auth.users)
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete restrict,
  kind        public.profile_kind   not null default 'cliente',
  status      public.profile_status not null default 'activo',
  full_name   text,
  phone       text,
  locale      text not null default 'pt-AO',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_full_name_len check (full_name is null or char_length(full_name) between 1 and 120),
  constraint profiles_phone_format check (phone is null or phone ~ '^\+?[0-9 ()-]{6,32}$'),
  constraint profiles_locale_valid check (locale in ('pt-AO', 'pt-BR'))
);
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on table public.profiles from public, anon, authenticated, service_role;
comment on table public.profiles is 'Perfil do utilizador. kind/status só mudam por funções administrativas (M2).';

-- 5.2 accounts — organização do cliente
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  country     text,
  sector      text,
  status      public.account_status not null default 'activa',
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint accounts_name_len check (char_length(name) between 1 and 160),
  constraint accounts_country_iso check (country is null or country ~ '^[A-Z]{2}$'),
  constraint accounts_sector_len check (sector is null or char_length(sector) between 1 and 80)
);
alter table public.accounts enable row level security;
alter table public.accounts force row level security;
revoke all on table public.accounts from public, anon, authenticated, service_role;
comment on table public.accounts is 'Conta (organização) do cliente. Uma por registo na V1 (D3).';

-- 5.3 account_members — associação utilizador ↔ conta
create table public.account_members (
  account_id   uuid not null references public.accounts (id) on delete restrict,
  user_id      uuid not null references public.profiles (id) on delete restrict,
  member_role  public.member_role not null default 'membro',
  created_at   timestamptz not null default now(),
  primary key (account_id, user_id)
);
alter table public.account_members enable row level security;
alter table public.account_members force row level security;
revoke all on table public.account_members from public, anon, authenticated, service_role;
comment on table public.account_members is 'Associação a contas. Um titular por conta; convites fora da V1.';

-- 5.4 user_roles — papéis internos (operador/admin)
create table public.user_roles (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete restrict,
  role        public.staff_role not null,
  granted_by  uuid references public.profiles (id) on delete restrict,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.profiles (id) on delete restrict,
  revoked_at  timestamptz,
  constraint user_roles_no_self_grant check (granted_by is null or granted_by <> user_id),
  constraint user_roles_revocation_consistent check ((revoked_at is null) = (revoked_by is null)),
  constraint user_roles_revoked_after_granted check (revoked_at is null or revoked_at >= granted_at)
);
alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;
revoke all on table public.user_roles from public, anon, authenticated, service_role;
revoke all on sequence public.user_roles_id_seq from public, anon, authenticated, service_role;
comment on table public.user_roles is
  'Papéis internos. granted_by nulo apenas no arranque controlado do primeiro admin (D13). Alvo interno validado na M2.';

-- 5.5 tickets — pedidos de serviço («Pedidos» na interface)
create table public.tickets (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null,
  account_id            uuid not null,
  requester_id          uuid not null,
  type                  public.ticket_type not null,
  subject               text not null,
  description           text not null,
  status                public.ticket_status not null default 'recebido',
  assigned_operator_id  uuid references public.profiles (id) on delete restrict,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  closed_at             timestamptz,
  constraint tickets_reference_key unique (reference),
  constraint tickets_reference_format check (reference ~ '^KG-[0-9]{4}-[0-9]{6}$'),
  constraint tickets_subject_len check (char_length(subject) between 3 and 160),
  constraint tickets_description_len check (char_length(description) between 10 and 5000),
  constraint tickets_closed_consistent check (
    (status in ('concluido', 'recusado', 'cancelado')) = (closed_at is not null)
  ),
  constraint tickets_no_self_assignment check (assigned_operator_id is null or assigned_operator_id <> requester_id),
  -- O requerente pertence sempre à conta do pedido.
  constraint tickets_requester_member_fk foreign key (account_id, requester_id)
    references public.account_members (account_id, user_id) on delete restrict
);
alter table public.tickets enable row level security;
alter table public.tickets force row level security;
revoke all on table public.tickets from public, anon, authenticated, service_role;
comment on table public.tickets is 'Pedidos. Estado e atribuição só mudam por RPC (M2).';

-- 5.6 ticket_events — histórico (só inserção)
create table public.ticket_events (
  id            bigint generated always as identity primary key,
  ticket_id     uuid not null references public.tickets (id) on delete restrict,
  actor_id      uuid references public.profiles (id) on delete restrict,
  event_type    public.ticket_event_type not null,
  from_status   public.ticket_status,
  to_status     public.ticket_status,
  reason        text,
  evidence_ref  text,
  visibility    public.event_visibility not null,
  created_at    timestamptz not null default now(),
  constraint ticket_events_reason_len check (reason is null or char_length(reason) between 1 and 1000),
  constraint ticket_events_evidence_len check (evidence_ref is null or char_length(evidence_ref) between 1 and 300),
  constraint ticket_events_status_shape check (
    event_type not in ('created', 'status_changed', 'reopened') or to_status is not null
  ),
  constraint ticket_events_change_has_origin check (
    event_type not in ('status_changed', 'reopened') or from_status is not null
  ),
  -- D10: aceitação/recusa de proposta exige referência à evidência.
  constraint ticket_events_proposal_evidence check (
    not (event_type = 'status_changed'
         and from_status = 'proposta_enviada'
         and to_status in ('aceite', 'recusado')
         and evidence_ref is null)
  ),
  -- D12: reabertura exige motivo.
  constraint ticket_events_reopen_reason check (event_type <> 'reopened' or reason is not null),
  constraint ticket_events_note_internal check (event_type <> 'note_added' or visibility = 'interno')
);
alter table public.ticket_events enable row level security;
alter table public.ticket_events force row level security;
revoke all on table public.ticket_events from public, anon, authenticated, service_role;
revoke all on sequence public.ticket_events_id_seq from public, anon, authenticated, service_role;
comment on table public.ticket_events is 'Histórico imutável dos pedidos. O cliente só vê visibility = cliente (M3).';

-- 5.7 ticket_messages — comunicações visíveis ao cliente (só inserção)
create table public.ticket_messages (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references public.tickets (id) on delete restrict,
  author_id   uuid not null references public.profiles (id) on delete restrict,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint ticket_messages_body_len check (char_length(body) between 1 and 5000)
);
alter table public.ticket_messages enable row level security;
alter table public.ticket_messages force row level security;
revoke all on table public.ticket_messages from public, anon, authenticated, service_role;
revoke all on sequence public.ticket_messages_id_seq from public, anon, authenticated, service_role;
comment on table public.ticket_messages is 'Mensagens visíveis ao cliente. Notas internas ficam em ticket_internal_notes.';

-- 5.8 ticket_internal_notes — notas internas (só inserção; nunca visíveis a clientes)
create table public.ticket_internal_notes (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references public.tickets (id) on delete restrict,
  author_id   uuid not null references public.profiles (id) on delete restrict,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint ticket_internal_notes_body_len check (char_length(body) between 1 and 5000)
);
alter table public.ticket_internal_notes enable row level security;
alter table public.ticket_internal_notes force row level security;
revoke all on table public.ticket_internal_notes from public, anon, authenticated, service_role;
revoke all on sequence public.ticket_internal_notes_id_seq from public, anon, authenticated, service_role;
comment on table public.ticket_internal_notes is 'Notas internas. Sem qualquer política para clientes (M3).';

-- -----------------------------------------------------------------------------
-- 6. Tabelas privadas (3). RLS activa (sem FORCE: dono postgres carrega dados).
-- -----------------------------------------------------------------------------

-- 6.1 audit_log — auditoria imutável, sem FK (sobrevive à anonimização)
create table private.audit_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_aal    text,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  constraint audit_log_actor_aal_valid check (actor_aal is null or actor_aal in ('aal1', 'aal2')),
  constraint audit_log_action_format check (action ~ '^[a-z][a-z_]{2,63}$'),
  constraint audit_log_entity_type_valid check (
    entity_type in ('profile', 'account', 'account_member', 'user_role', 'ticket', 'staff_provisioning', 'system')
  ),
  constraint audit_log_entity_id_len check (entity_id is null or char_length(entity_id) between 1 and 64),
  constraint audit_log_before_object check (before is null or jsonb_typeof(before) = 'object'),
  constraint audit_log_after_object check (after is null or jsonb_typeof(after) = 'object')
);
alter table private.audit_log enable row level security;
revoke all on table private.audit_log from public, anon, authenticated, service_role;
revoke all on sequence private.audit_log_id_seq from public, anon, authenticated, service_role;
comment on table private.audit_log is 'Auditoria imutável. Sem dados pessoais em before/after.';

-- 6.2 ticket_transitions — matriz de transições (dados carregados na M2)
create table private.ticket_transitions (
  from_status        public.ticket_status not null,
  to_status          public.ticket_status not null,
  actor              private.transition_actor not null,
  requires_reason    boolean not null default false,
  requires_evidence  boolean not null default false,
  primary key (from_status, to_status, actor),
  constraint ticket_transitions_distinct check (from_status <> to_status)
);
alter table private.ticket_transitions enable row level security;
revoke all on table private.ticket_transitions from public, anon, authenticated, service_role;
comment on table private.ticket_transitions is 'Matriz de transições autorizadas por actor.';

-- 6.3 staff_provisioning — provisionamento controlado de pessoal interno (P2)
create table private.staff_provisioning (
  id                bigint generated always as identity primary key,
  email_normalized  text not null,
  provisioned_by    uuid references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  consumed_at       timestamptz,
  consumed_user_id  uuid references public.profiles (id) on delete restrict,
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles (id) on delete restrict,
  constraint staff_provisioning_email_normalized check (
    email_normalized = lower(btrim(email_normalized))
    and char_length(email_normalized) between 3 and 254
    and email_normalized ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint staff_provisioning_expiry_window check (
    expires_at > created_at and expires_at <= created_at + interval '7 days'
  ),
  constraint staff_provisioning_consumed_consistent check ((consumed_at is null) = (consumed_user_id is null)),
  constraint staff_provisioning_cancelled_consistent check ((cancelled_at is null) = (cancelled_by is null)),
  constraint staff_provisioning_single_outcome check (consumed_at is null or cancelled_at is null)
);
alter table private.staff_provisioning enable row level security;
revoke all on table private.staff_provisioning from public, anon, authenticated, service_role;
revoke all on sequence private.staff_provisioning_id_seq from public, anon, authenticated, service_role;
comment on table private.staff_provisioning is
  'Provisionamento de pessoal interno por convite administrativo. provisioned_by nulo apenas no arranque (D13).';

-- -----------------------------------------------------------------------------
-- 7. Índices
-- -----------------------------------------------------------------------------
create index profiles_kind_status_idx on public.profiles (kind, status);
create index accounts_created_by_idx on public.accounts (created_by);
create unique index account_members_one_titular_idx
  on public.account_members (account_id) where member_role = 'titular';
create index account_members_user_idx on public.account_members (user_id);
create unique index user_roles_one_active_idx
  on public.user_roles (user_id, role) where revoked_at is null;
create index user_roles_granted_by_idx on public.user_roles (granted_by);
create index user_roles_revoked_by_idx on public.user_roles (revoked_by);
create index tickets_account_status_created_idx on public.tickets (account_id, status, created_at desc);
create index tickets_assigned_status_idx
  on public.tickets (assigned_operator_id, status) where assigned_operator_id is not null;
create index tickets_requester_created_idx on public.tickets (requester_id, created_at);
create index ticket_events_ticket_created_idx on public.ticket_events (ticket_id, created_at);
create index ticket_events_actor_idx on public.ticket_events (actor_id);
create index ticket_messages_ticket_created_idx on public.ticket_messages (ticket_id, created_at);
create index ticket_messages_author_created_idx on public.ticket_messages (author_id, created_at);
create index ticket_internal_notes_ticket_created_idx on public.ticket_internal_notes (ticket_id, created_at);
create index ticket_internal_notes_author_idx on public.ticket_internal_notes (author_id);
create index audit_log_entity_idx on private.audit_log (entity_type, entity_id);
create index audit_log_occurred_idx on private.audit_log (occurred_at);
create index audit_log_actor_idx on private.audit_log (actor_id);
create unique index staff_provisioning_one_pending_idx
  on private.staff_provisioning (email_normalized) where consumed_at is null and cancelled_at is null;
create index staff_provisioning_provisioned_by_idx on private.staff_provisioning (provisioned_by);
create index staff_provisioning_consumed_user_idx on private.staff_provisioning (consumed_user_id);
create index staff_provisioning_cancelled_by_idx on private.staff_provisioning (cancelled_by);

-- -----------------------------------------------------------------------------
-- 8. Triggers estruturais (SECURITY INVOKER, search_path vazio)
-- -----------------------------------------------------------------------------
create function private.set_updated_at()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$fn$;
revoke all on function private.set_updated_at() from public, anon, authenticated, service_role;

create function private.reject_mutation()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $fn$
begin
  raise exception using
    errcode = '42501',
    message = pg_catalog.format('%I.%I é só de inserção: %s recusado', tg_table_schema, tg_table_name, tg_op);
end
$fn$;
revoke all on function private.reject_mutation() from public, anon, authenticated, service_role;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function private.set_updated_at();
create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function private.set_updated_at();

create trigger ticket_events_immutable
  before update or delete on public.ticket_events
  for each row execute function private.reject_mutation();
create trigger ticket_events_no_truncate
  before truncate on public.ticket_events
  for each statement execute function private.reject_mutation();
create trigger ticket_messages_immutable
  before update or delete on public.ticket_messages
  for each row execute function private.reject_mutation();
create trigger ticket_messages_no_truncate
  before truncate on public.ticket_messages
  for each statement execute function private.reject_mutation();
create trigger ticket_internal_notes_immutable
  before update or delete on public.ticket_internal_notes
  for each row execute function private.reject_mutation();
create trigger ticket_internal_notes_no_truncate
  before truncate on public.ticket_internal_notes
  for each statement execute function private.reject_mutation();
create trigger audit_log_immutable
  before update or delete on private.audit_log
  for each row execute function private.reject_mutation();
create trigger audit_log_no_truncate
  before truncate on private.audit_log
  for each statement execute function private.reject_mutation();

-- -----------------------------------------------------------------------------
-- 9. Auto-verificação (aborta a migração se alguma garantia falhar)
-- -----------------------------------------------------------------------------
do $selfcheck$
declare
  v_public_tables  constant text[] := array[
    'profiles', 'accounts', 'account_members', 'user_roles',
    'tickets', 'ticket_events', 'ticket_messages', 'ticket_internal_notes'];
  v_private_tables constant text[] := array['audit_log', 'ticket_transitions', 'staff_provisioning'];
  v_forbidden      oid[];
  v_count          int;
  v_list           text;
begin
  select array_agg(oid) into v_forbidden
  from pg_catalog.pg_roles where rolname in ('anon', 'authenticated', 'service_role');
  v_forbidden := v_forbidden || 0::oid;  -- 0 = PUBLIC

  -- 9.1 RLS + FORCE nas 8 tabelas públicas
  select count(*) into v_count
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any (v_public_tables)
    and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity;
  if v_count <> 8 then
    raise exception 'M1 auto-verificação: RLS/FORCE em % de 8 tabelas públicas', v_count;
  end if;

  -- 9.2 RLS nas 3 tabelas privadas
  select count(*) into v_count
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relname = any (v_private_tables)
    and c.relkind = 'r' and c.relrowsecurity;
  if v_count <> 3 then
    raise exception 'M1 auto-verificação: RLS em % de 3 tabelas privadas', v_count;
  end if;

  -- 9.3 Nenhum privilégio de PUBLIC/anon/authenticated/service_role em relações
  --     (tabelas e sequências) do portal, incluindo privilégios de coluna.
  select string_agg(distinct c.oid::regclass::text, ', ') into v_list
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(c.relacl) a
  where (n.nspname = 'private' or (n.nspname = 'public' and (
           c.relname = any (v_public_tables) or c.relname like any (array['user_roles%', 'ticket_%']))))
    and a.grantee = any (v_forbidden);
  if v_list is not null then
    raise exception 'M1 auto-verificação: privilégios proibidos em %', v_list;
  end if;

  select string_agg(distinct c.oid::regclass::text || '.' || att.attname, ', ') into v_list
  from pg_catalog.pg_attribute att
  join pg_catalog.pg_class c on c.oid = att.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(att.attacl) a
  where n.nspname in ('public', 'private') and att.attacl is not null
    and a.grantee = any (v_forbidden);
  if v_list is not null then
    raise exception 'M1 auto-verificação: privilégios de coluna proibidos em %', v_list;
  end if;

  -- 9.4 Funções do esquema private sem EXECUTE para os papéis proibidos
  --     (proacl nulo significa EXECUTE para PUBLIC por omissão).
  select string_agg(p.oid::regprocedure::text, ', ') into v_list
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and (p.proacl is null
         or exists (select 1 from pg_catalog.aclexplode(p.proacl) a where a.grantee = any (v_forbidden)));
  if v_list is not null then
    raise exception 'M1 auto-verificação: EXECUTE proibido em %', v_list;
  end if;

  -- 9.5 Atributos dos papéis dedicados
  select string_agg(rolname, ', ') into v_list
  from pg_catalog.pg_roles
  where rolname in ('portal_guard', 'portal_definer')
    and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin or rolreplication or rolinherit);
  if v_list is not null then
    raise exception 'M1 auto-verificação: atributos indevidos em %', v_list;
  end if;

  -- 9.6 Membros: só postgres, sem herança e com SET
  select string_agg(r.rolname || '<-' || m.rolname, ', ') into v_list
  from pg_catalog.pg_auth_members am
  join pg_catalog.pg_roles r on r.oid = am.roleid
  join pg_catalog.pg_roles m on m.oid = am.member
  where r.rolname in ('portal_guard', 'portal_definer')
    and (m.rolname <> 'postgres' or am.inherit_option);
  if v_list is not null then
    raise exception 'M1 auto-verificação: membros ou herança indevidos: %', v_list;
  end if;

  select count(distinct r.rolname) into v_count
  from pg_catalog.pg_auth_members am
  join pg_catalog.pg_roles r on r.oid = am.roleid
  join pg_catalog.pg_roles m on m.oid = am.member
  where r.rolname in ('portal_guard', 'portal_definer') and m.rolname = 'postgres' and am.set_option;
  if v_count < 2 then
    raise exception 'M1 auto-verificação: postgres sem SET ROLE em ambos os papéis (% de 2)', v_count;
  end if;

  select string_agg(r.rolname || '->' || g.rolname, ', ') into v_list
  from pg_catalog.pg_auth_members am
  join pg_catalog.pg_roles r on r.oid = am.member
  join pg_catalog.pg_roles g on g.oid = am.roleid
  where r.rolname in ('portal_guard', 'portal_definer');
  if v_list is not null then
    raise exception 'M1 auto-verificação: papéis dedicados pertencem a outros papéis: %', v_list;
  end if;

  -- 9.7 Papéis dedicados não são donos de nada
  select count(*) into v_count from (
    select 1 from pg_catalog.pg_class where relowner in (select oid from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer'))
    union all
    select 1 from pg_catalog.pg_namespace where nspowner in (select oid from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer'))
    union all
    select 1 from pg_catalog.pg_proc where proowner in (select oid from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer'))
    union all
    select 1 from pg_catalog.pg_type where typowner in (select oid from pg_catalog.pg_roles where rolname in ('portal_guard', 'portal_definer'))
  ) owned;
  if v_count <> 0 then
    raise exception 'M1 auto-verificação: papéis dedicados são donos de % objecto(s)', v_count;
  end if;
end
$selfcheck$;
