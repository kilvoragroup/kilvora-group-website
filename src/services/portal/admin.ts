import "server-only";

import {
  type AuditFilter,
  type RoleChange,
  parseAssignment,
  parseCancelProvisioning,
  parseProvision,
  parseReopen,
  parseRoleChange,
  parseStatusChange,
} from "@/domain/portal/admin";
import { mapPortalError } from "@/domain/portal/errors";
import type { FieldIssues } from "@/domain/portal/tickets";
import type { ProfileKind, ProfileStatus, StaffRole } from "@/domain/portal/types";
import { ADMIN_PROFILE_COLUMNS, ADMIN_ROLE_COLUMNS } from "@/lib/portal/columns";
import { assertPortalEnabled } from "@/lib/portal/portal-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { Outcome } from "./client-portal";

/**
 * Casos de uso da administração (A5). Quem chama já verificou o ADMIN com `aal2` na DAL.
 *
 * - Leituras sob a RLS da M3 (o admin `aal2` lê perfis e papéis); colunas explícitas.
 * - Escritas só pelas RPCs administrativas da M2, que voltam a exigir admin `aal2`, recusam
 *   auto-acções e o último admin, e gravam auditoria na mesma transacção.
 * - Sem chave privilegiada: o convite do Auth continua manual no Dashboard (D01, secção 4.2).
 */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const fail = <T>(error: unknown, issues?: FieldIssues): Outcome<T> => ({
  ok: false,
  error: mapPortalError(error),
  ...(issues ? { issues } : {}),
});
const invalid = <T>(issues: FieldIssues): Outcome<T> => fail({ code: "22023" }, issues);
const UNAVAILABLE = new TypeError("unavailable");
const LIMIT = 200;

async function openClient(): Promise<ServerClient | null> {
  try {
    assertPortalEnabled();
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

export type AdminProfile = {
  readonly id: string;
  readonly name: string | null;
  readonly status: ProfileStatus;
  readonly roles: readonly StaffRole[];
  readonly createdAt: string;
};

/** Perfis de um tipo (internos com os papéis activos; clientes sem papéis). */
export async function listProfiles(kind: ProfileKind): Promise<Outcome<AdminProfile[]>> {
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const [profiles, roles] = await Promise.all([
    client
      .from("profiles")
      .select(ADMIN_PROFILE_COLUMNS)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    kind === "interno"
      ? client.from("user_roles").select(ADMIN_ROLE_COLUMNS).is("revoked_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error) return fail(profiles.error);
  if (roles.error) return fail(roles.error);
  const byUser = new Map<string, StaffRole[]>();
  for (const row of roles.data ?? []) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.role]);
  }
  return ok(
    (profiles.data ?? []).map((row) => ({
      id: row.id,
      name: row.full_name,
      status: row.status,
      roles: [...(byUser.get(row.id) ?? [])].sort(),
      createdAt: row.created_at,
    })),
  );
}

/** Operadores elegíveis para atribuição: papel `operador` activo e perfil interno activo. */
export async function listActiveOperators(): Promise<
  Outcome<{ id: string; name: string | null }[]>
> {
  const team = await listProfiles("interno");
  if (!team.ok) return team;
  return ok(
    team.value
      .filter((profile) => profile.status === "activo" && profile.roles.includes("operador"))
      .map((profile) => ({ id: profile.id, name: profile.name })),
  );
}

function finish<T>(
  result: { data: unknown; error: unknown },
  read: (data: unknown) => T | null,
): Outcome<T> {
  if (result.error) return fail(result.error);
  const value = read(result.data);
  return value === null ? fail(null) : ok(value);
}

const accepted = () => true as const;

export async function assignTicket(raw: unknown): Promise<Outcome<true>> {
  const parsed = parseAssignment(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const result = await client.rpc("assign_ticket", {
    p_ticket_id: parsed.value.ticketId,
    ...(parsed.value.operatorId ? { p_operator_id: parsed.value.operatorId } : {}),
  });
  return finish(result, accepted);
}

export async function reopenTicket(raw: unknown): Promise<Outcome<true>> {
  const parsed = parseReopen(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const result = await client.rpc("reopen_ticket", {
    p_ticket_id: parsed.value.ticketId,
    p_reason: parsed.value.reason,
  });
  return finish(result, accepted);
}

export async function changeRole(raw: unknown): Promise<Outcome<RoleChange>> {
  const parsed = parseRoleChange(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const args = { p_user_id: parsed.value.userId, p_role: parsed.value.role };
  const result =
    parsed.value.change === "grant"
      ? await client.rpc("grant_role", args)
      : await client.rpc("revoke_role", args);
  return finish(result, () => parsed.value);
}

export async function setProfileStatus(raw: unknown): Promise<Outcome<true>> {
  const parsed = parseStatusChange(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const result = await client.rpc("admin_set_profile_status", {
    p_user_id: parsed.value.userId,
    p_status: parsed.value.status,
  });
  return finish(result, accepted);
}

/** Provisionamento (secção 4.2, passo 1). Devolve o `id` que o admin deve guardar (L2). */
export async function provisionStaff(raw: unknown): Promise<Outcome<{ id: number }>> {
  const parsed = parseProvision(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const result = await client.rpc("admin_provision_staff", { p_email: parsed.value.email });
  return finish(result, (data) =>
    typeof data === "number" && Number.isSafeInteger(data) ? { id: data } : null,
  );
}

export async function cancelProvisioning(raw: unknown): Promise<Outcome<true>> {
  const parsed = parseCancelProvisioning(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const result = await client.rpc("admin_cancel_staff_provisioning", {
    p_provisioning_id: parsed.value.provisioningId,
  });
  return finish(result, accepted);
}

export type AuditEntry = {
  readonly id: number;
  readonly occurredAt: string;
  readonly actorId: string | null;
  readonly actorAal: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
};

/** Auditoria (`admin_audit_log`, máximo 100 aqui). Só identificadores; nunca conteúdos. */
export async function getAuditLog(filter: AuditFilter): Promise<Outcome<AuditEntry[]>> {
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const { data, error } = await client.rpc("admin_audit_log", {
    ...(filter.entityType ? { p_entity_type: filter.entityType } : {}),
    ...(filter.entityId ? { p_entity_id: filter.entityId } : {}),
    p_limit: 100,
  });
  if (error) return fail(error);
  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      actorId: row.actor_id,
      actorAal: row.actor_aal,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before: row.before,
      after: row.after,
    })),
  );
}
