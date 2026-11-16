import { charLength, pgBtrim, ticketStatusSchema, uuidSchema } from "./schemas";
import type { FieldIssues, Parsed } from "./tickets";
import type { TicketStatus } from "./types";

/**
 * Regras de domínio da consola interna (A4). Sem I/O.
 *
 * A matriz abaixo espelha as linhas `actor = 'staff'` de `private.ticket_transitions` (M2) e só
 * serve para a interface oferecer as opções certas. A RPC `change_ticket_status` volta a decidir
 * tudo (transição, motivo, evidência e `p_expected_status`). A reabertura (`actor = 'admin'`,
 * `reopen_ticket`) e a atribuição pertencem à A5.
 */

export type StaffTransition = {
  readonly from: TicketStatus;
  readonly to: TicketStatus;
  readonly requiresReason: boolean;
  readonly requiresEvidence: boolean;
};

const t = (
  from: TicketStatus,
  to: TicketStatus,
  requiresReason = false,
  requiresEvidence = false,
): StaffTransition => ({ from, to, requiresReason, requiresEvidence });

export const STAFF_TRANSITIONS: readonly StaffTransition[] = [
  t("recebido", "em_analise"),
  t("em_analise", "aguarda_cliente"),
  t("em_analise", "em_preparacao_proposta"),
  t("em_analise", "recusado", true),
  t("aguarda_cliente", "em_analise"),
  t("em_preparacao_proposta", "proposta_enviada"),
  t("em_preparacao_proposta", "em_analise"),
  t("proposta_enviada", "aceite", false, true),
  t("proposta_enviada", "recusado", false, true),
  t("proposta_enviada", "aguarda_cliente"),
  t("aceite", "concluido"),
  t("recebido", "cancelado", true),
  t("em_analise", "cancelado", true),
  t("aguarda_cliente", "cancelado", true),
  t("em_preparacao_proposta", "cancelado", true),
  t("proposta_enviada", "cancelado", true),
];

export function staffTransitionsFrom(status: TicketStatus): readonly StaffTransition[] {
  return STAFF_TRANSITIONS.filter((transition) => transition.from === status);
}

export function findStaffTransition(
  from: TicketStatus,
  to: TicketStatus,
): StaffTransition | undefined {
  return STAFF_TRANSITIONS.find((transition) => transition.from === from && transition.to === to);
}

function form(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export type TransitionInput = {
  readonly ticketId: string;
  readonly expectedStatus: TicketStatus;
  readonly toStatus: TicketStatus;
  readonly reason: string | null;
  readonly evidenceRef: string | null;
};

/**
 * Mudança de estado pelo staff. Valida cedo (transição conhecida, motivo e evidência quando a
 * M2 os exige, limites 1000/300); a base é a autoridade final.
 */
export function parseTransition(raw: unknown): Parsed<TransitionInput> {
  const input = form(raw);
  const ticketId = uuidSchema.safeParse(input.ticketId);
  const expected = ticketStatusSchema.safeParse(input.expectedStatus);
  if (!ticketId.success || !expected.success) {
    return { ok: false, issues: { ticketId: "required" } };
  }
  const to = ticketStatusSchema.safeParse(input.toStatus);
  const transition = to.success ? findStaffTransition(expected.data, to.data) : undefined;
  if (!to.success || !transition) return { ok: false, issues: { toStatus: "toStatus" } };

  const reason = pgBtrim(str(input.reason));
  const evidenceRef = pgBtrim(str(input.evidenceRef));
  const issues: FieldIssues = {};
  if (charLength(reason) > 1000) issues.reason = "reason";
  else if (transition.requiresReason && reason === "") issues.reason = "reasonRequired";
  if (charLength(evidenceRef) > 300) issues.evidenceRef = "evidenceRef";
  else if (transition.requiresEvidence && evidenceRef === "")
    issues.evidenceRef = "evidenceRequired";
  if (Object.keys(issues).length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      ticketId: ticketId.data,
      expectedStatus: expected.data,
      toStatus: to.data,
      reason: reason || null,
      evidenceRef: evidenceRef || null,
    },
  };
}

/** Nota interna (`add_internal_note`): corpo 1–5000 após `btrim`. */
export function parseInternalNote(raw: unknown): Parsed<{ ticketId: string; body: string }> {
  const input = form(raw);
  const ticketId = uuidSchema.safeParse(input.ticketId);
  if (!ticketId.success) return { ok: false, issues: { ticketId: "required" } };
  const body = pgBtrim(str(input.body));
  if (charLength(body) < 1 || charLength(body) > 5000)
    return { ok: false, issues: { body: "body" } };
  return { ok: true, value: { ticketId: ticketId.data, body } };
}

/** Código TOTP: exactamente 6 algarismos (espaços ignorados). */
export function parseTotpCode(raw: unknown): Parsed<{ code: string }> {
  const code = str(form(raw).code).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, issues: { code: "totp" } };
  return { ok: true, value: { code } };
}

/**
 * Autoria de uma mensagem na consola: o próprio, o requerente (cliente) ou outro membro do
 * staff. O staff vê o nome do requerente (RLS da M3); os restantes autores aparecem como
 * «Equipa KILVORA».
 */
export function staffMessageAuthor(
  authorId: string,
  viewerId: string,
  requesterId: string,
): "self" | "client" | "team" {
  if (authorId === viewerId) return "self";
  if (authorId === requesterId) return "client";
  return "team";
}
