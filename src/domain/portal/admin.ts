import { z } from "zod";

import { charLength, pgBtrim, uuidSchema } from "./schemas";
import type { FieldIssues, Parsed } from "./tickets";
import type { ProfileStatus, StaffRole } from "./types";

/**
 * Regras de domínio da administração (A5). Sem I/O. Validação cedo das entradas das RPCs
 * administrativas da M2; a base é a autoridade final (admin com `aal2`, auto-acção proibida,
 * último admin, alvo interno activo, provisionamento único por e-mail).
 */

function form(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const ticketOnly = (input: Record<string, unknown>) => uuidSchema.safeParse(input.ticketId);

/** Atribuição: operador (uuid) ou vazio = retirar a atribuição. */
export function parseAssignment(
  raw: unknown,
): Parsed<{ ticketId: string; operatorId: string | null }> {
  const input = form(raw);
  const ticketId = ticketOnly(input);
  if (!ticketId.success) return { ok: false, issues: { ticketId: "required" } };
  const rawOperator = str(input.operatorId);
  if (rawOperator === "") return { ok: true, value: { ticketId: ticketId.data, operatorId: null } };
  const operator = uuidSchema.safeParse(rawOperator);
  if (!operator.success) return { ok: false, issues: { operatorId: "operator" } };
  return { ok: true, value: { ticketId: ticketId.data, operatorId: operator.data } };
}

/** Reabertura (D12): motivo obrigatório, até 1000 caracteres. */
export function parseReopen(raw: unknown): Parsed<{ ticketId: string; reason: string }> {
  const input = form(raw);
  const ticketId = ticketOnly(input);
  if (!ticketId.success) return { ok: false, issues: { ticketId: "required" } };
  const reason = pgBtrim(str(input.reason));
  if (reason === "") return { ok: false, issues: { reason: "reasonRequired" } };
  if (charLength(reason) > 1000) return { ok: false, issues: { reason: "reason" } };
  return { ok: true, value: { ticketId: ticketId.data, reason } };
}

const roleSchema = z.enum(["operador", "admin"]);

export type RoleChange = {
  readonly userId: string;
  readonly role: StaffRole;
  readonly change: "grant" | "revoke";
};

export function parseRoleChange(raw: unknown): Parsed<RoleChange> {
  const input = form(raw);
  const userId = uuidSchema.safeParse(input.userId);
  const role = roleSchema.safeParse(input.role);
  const change = input.change === "grant" || input.change === "revoke" ? input.change : null;
  if (!userId.success || !role.success || !change) {
    return { ok: false, issues: { role: "role" } };
  }
  return { ok: true, value: { userId: userId.data, role: role.data, change } };
}

/** Estado do perfil: só `activo` ou `suspenso` (`anonimizado` é recusado pela M2). */
export function parseStatusChange(
  raw: unknown,
): Parsed<{ userId: string; status: Extract<ProfileStatus, "activo" | "suspenso"> }> {
  const input = form(raw);
  const userId = uuidSchema.safeParse(input.userId);
  const status = input.status === "activo" || input.status === "suspenso" ? input.status : null;
  if (!userId.success || !status) return { ok: false, issues: { status: "status" } };
  return { ok: true, value: { userId: userId.data, status } };
}

/** Mesmas regras de `admin_provision_staff`: minúsculas, sem espaços, 3–254, `a@b.c`. */
export function normaliseStaffEmail(value: string): string {
  return pgBtrim(value).toLowerCase();
}

export function parseProvision(raw: unknown): Parsed<{ email: string }> {
  const email = normaliseStaffEmail(str(form(raw).email));
  const valid =
    charLength(email) >= 3 && charLength(email) <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (!valid) return { ok: false, issues: { email: "email" } };
  return { ok: true, value: { email } };
}

export function parseCancelProvisioning(raw: unknown): Parsed<{ provisioningId: number }> {
  const value = str(form(raw).provisioningId).trim();
  const id = /^\d{1,15}$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, issues: { provisioningId: "provisioningId" } };
  }
  return { ok: true, value: { provisioningId: id } };
}

/** Tipos de entidade gravados por `private.write_audit` na M2 (filtro da auditoria). */
export const AUDIT_ENTITY_TYPES = ["ticket", "user_role", "profile", "staff_provisioning"] as const;

export type AuditFilter = { readonly entityType: string | null; readonly entityId: string | null };

export function parseAuditFilter(raw: unknown): AuditFilter {
  const input = form(raw);
  const type = str(input.tipo);
  const id = pgBtrim(str(input.id));
  return {
    entityType: (AUDIT_ENTITY_TYPES as readonly string[]).includes(type) ? type : null,
    entityId: id !== "" && charLength(id) <= 100 && /^[\w-]+$/.test(id) ? id : null,
  };
}

export type { FieldIssues };
