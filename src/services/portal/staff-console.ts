import "server-only";

import { mapPortalError } from "@/domain/portal/errors";
import { uuidSchema } from "@/domain/portal/schemas";
import {
  type TransitionInput,
  parseInternalNote,
  parseTransition,
  staffMessageAuthor,
} from "@/domain/portal/staff";
import type { FieldIssues } from "@/domain/portal/tickets";
import { parseMessage } from "@/domain/portal/tickets";
import type {
  EventVisibility,
  TicketEventType,
  TicketStatus,
  TicketType,
} from "@/domain/portal/types";
import {
  STAFF_ACCOUNT_COLUMNS,
  STAFF_REQUESTER_COLUMNS,
  STAFF_TICKET_LIST_COLUMNS,
  TICKET_COLUMNS,
  TICKET_INTERNAL_NOTE_COLUMNS,
  TICKET_MESSAGE_COLUMNS,
} from "@/lib/portal/columns";
import { assertPortalEnabled } from "@/lib/portal/portal-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { Outcome } from "./client-portal";

/**
 * Casos de uso da consola interna (A4). Independentes da interface.
 *
 * - Quem chama já verificou o staff na DAL (`requireConsoleStaff` / `checkStaffAccess`, `aal2`).
 * - Só a sessão do utilizador e a chave publishable: a RLS da M3 limita o operador aos pedidos
 *   ATRIBUÍDOS (D2) e o admin vê todos; os helpers da base exigem `aal2` (D03, S7).
 * - Escritas só pelas RPCs da M2: `add_ticket_message`, `add_internal_note`,
 *   `change_ticket_status` (com `p_expected_status`). `evidence_ref` só por `staff_ticket_events`.
 * - Reabertura e atribuição ficam na A5.
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

async function openClient(): Promise<ServerClient | null> {
  try {
    assertPortalEnabled();
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

export type StaffTicketSummary = {
  readonly id: string;
  readonly reference: string;
  readonly type: TicketType;
  readonly subject: string;
  readonly status: TicketStatus;
  readonly assigned: boolean;
  readonly updatedAt: string;
};

export type StaffMessage = {
  readonly id: number;
  readonly author: "self" | "client" | "team";
  readonly body: string;
  readonly createdAt: string;
};

export type StaffNote = {
  readonly id: number;
  readonly mine: boolean;
  readonly body: string;
  readonly createdAt: string;
};

export type StaffEvent = {
  readonly id: number;
  readonly type: TicketEventType;
  readonly fromStatus: TicketStatus | null;
  readonly toStatus: TicketStatus | null;
  readonly reason: string | null;
  readonly evidenceRef: string | null;
  readonly visibility: EventVisibility;
  readonly createdAt: string;
};

export type StaffTicketDetail = {
  readonly id: string;
  readonly reference: string;
  readonly type: TicketType;
  readonly subject: string;
  readonly description: string;
  readonly status: TicketStatus;
  readonly createdAt: string;
  readonly closedAt: string | null;
  /** Operador atribuído (o admin precisa dele para a reatribuição, A5). */
  readonly assignedOperatorId: string | null;
  readonly requester: { name: string | null; phone: string | null } | null;
  readonly account: { name: string; country: string | null; sector: string | null } | null;
  readonly messages: readonly StaffMessage[];
  readonly notes: readonly StaffNote[];
  readonly events: readonly StaffEvent[];
};

const LIST_LIMIT = 200;

/** Pedidos visíveis ao staff: atribuídos ao operador, ou todos para o admin (RLS). */
export async function listStaffTickets(): Promise<Outcome<StaffTicketSummary[]>> {
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const { data, error } = await client
    .from("tickets")
    .select(STAFF_TICKET_LIST_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return fail(error);
  return ok(
    (data ?? []).map((row) => ({
      id: row.id,
      reference: row.reference,
      type: row.type,
      subject: row.subject,
      status: row.status,
      assigned: row.assigned_operator_id !== null,
      updatedAt: row.updated_at,
    })),
  );
}

/**
 * Detalhe para o staff. `null` = «não encontrado» neutro (não atribuído, inexistente ou id
 * inválido). Os eventos vêm de `staff_ticket_events` (com `evidence_ref`).
 */
export async function getStaffTicket(
  ticketId: string,
  viewerId: string,
): Promise<Outcome<StaffTicketDetail | null>> {
  if (!uuidSchema.safeParse(ticketId).success) return ok(null);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);

  const ticketResult = await client
    .from("tickets")
    .select(TICKET_COLUMNS)
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketResult.error) return fail(ticketResult.error);
  const ticket = ticketResult.data;
  if (!ticket) return ok(null);

  const [requester, account, messages, notes, events] = await Promise.all([
    client
      .from("profiles")
      .select(STAFF_REQUESTER_COLUMNS)
      .eq("id", ticket.requester_id)
      .maybeSingle(),
    client.from("accounts").select(STAFF_ACCOUNT_COLUMNS).eq("id", ticket.account_id).maybeSingle(),
    client
      .from("ticket_messages")
      .select(TICKET_MESSAGE_COLUMNS)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("ticket_internal_notes")
      .select(TICKET_INTERNAL_NOTE_COLUMNS)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    client.rpc("staff_ticket_events", { p_ticket_id: ticketId }),
  ]);
  for (const result of [requester, account, messages, notes, events]) {
    if (result.error) return fail(result.error);
  }

  return ok({
    id: ticket.id,
    reference: ticket.reference,
    type: ticket.type,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    createdAt: ticket.created_at,
    closedAt: ticket.closed_at,
    assignedOperatorId: ticket.assigned_operator_id,
    requester: requester.data
      ? { name: requester.data.full_name, phone: requester.data.phone }
      : null,
    account: account.data
      ? { name: account.data.name, country: account.data.country, sector: account.data.sector }
      : null,
    messages: (messages.data ?? []).map((row) => ({
      id: row.id,
      author: staffMessageAuthor(row.author_id, viewerId, ticket.requester_id),
      body: row.body,
      createdAt: row.created_at,
    })),
    notes: (notes.data ?? []).map((row) => ({
      id: row.id,
      mine: row.author_id === viewerId,
      body: row.body,
      createdAt: row.created_at,
    })),
    events: (events.data ?? []).map((row) => ({
      id: row.id,
      type: row.event_type,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      evidenceRef: row.evidence_ref,
      visibility: row.visibility,
      createdAt: row.created_at,
    })),
  });
}

/** Mensagem do staff para o cliente (`add_ticket_message`; a base exige atribuição ou admin). */
export async function addStaffMessage(raw: unknown): Promise<Outcome<{ id: number }>> {
  const parsed = parseMessage(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const { data, error } = await client.rpc("add_ticket_message", {
    p_ticket_id: parsed.value.ticketId,
    p_body: parsed.value.body,
  });
  if (error) return fail(error);
  if (typeof data !== "number") return fail(null);
  return ok({ id: data });
}

/** Nota interna (`add_internal_note`). */
export async function addInternalNote(raw: unknown): Promise<Outcome<{ id: number }>> {
  const parsed = parseInternalNote(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const { data, error } = await client.rpc("add_internal_note", {
    p_ticket_id: parsed.value.ticketId,
    p_body: parsed.value.body,
  });
  if (error) return fail(error);
  if (typeof data !== "number") return fail(null);
  return ok({ id: data });
}

/** Transição de estado pelo staff (`change_ticket_status`, sempre com `p_expected_status`). */
export async function changeStaffTicketStatus(raw: unknown): Promise<Outcome<TransitionInput>> {
  const parsed = parseTransition(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const value = parsed.value;
  const { error } = await client.rpc("change_ticket_status", {
    p_ticket_id: value.ticketId,
    p_to_status: value.toStatus,
    p_expected_status: value.expectedStatus,
    ...(value.reason ? { p_reason: value.reason } : {}),
    ...(value.evidenceRef ? { p_evidence_ref: value.evidenceRef } : {}),
  });
  if (error) return fail(error);
  return ok(value);
}
