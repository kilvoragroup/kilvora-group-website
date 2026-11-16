import "server-only";

import type { PtLocale } from "@/content/types";
import { type PortalError, mapPortalError } from "@/domain/portal/errors";
import { accountUpdateSchema, profileUpdateSchema, uuidSchema } from "@/domain/portal/schemas";
import {
  type CancelInput,
  type FieldIssues,
  createdTicketSchema,
  messageAuthor,
  parseCancel,
  parseMessage,
  parseNewTicket,
} from "@/domain/portal/tickets";
import type {
  EventVisibility,
  MemberRole,
  PortalLocale,
  TicketEventType,
  TicketStatus,
  TicketType,
} from "@/domain/portal/types";
import { toPortalLocale } from "@/domain/portal/types";
import {
  ACCOUNT_SELF_COLUMNS,
  CLIENT_TICKET_DETAIL_COLUMNS,
  CLIENT_TICKET_LIST_COLUMNS,
  MEMBERSHIP_SELF_COLUMNS,
  PROFILE_SELF_COLUMNS,
  TICKET_EVENT_COLUMNS,
  TICKET_MESSAGE_COLUMNS,
} from "@/lib/portal/columns";
import { assertPortalEnabled } from "@/lib/portal/portal-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Casos de uso da área do cliente (A3). Independentes da interface.
 *
 * - Quem chama (Server Action ou página) já verificou o cliente na DAL (`requireClient` /
 *   `checkClientAccess`, portão S2) e passa o `viewerId` verificado.
 * - Só o cliente Supabase de servidor com a sessão do utilizador e a chave publishable: leituras
 *   sob a RLS da M3, escritas pelas RPCs da M2 ou pelo UPDATE de colunas concedido pela M3.
 *   Nenhuma chave privilegiada; nenhum filtro por conta vindo do cliente — o isolamento entre
 *   contas é decidido pela base (portão S4).
 * - Colunas explícitas; nunca `select("*")`. `evidence_ref` e notas internas nunca são lidos.
 * - Devolvem sempre um `Outcome`; nunca lançam por erros esperados nem chamam `redirect()`.
 * - Sucesso só depois da resposta da base (regra 2.2.6).
 */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type Failure = { readonly error: PortalError; readonly issues?: FieldIssues };
export type Outcome<T> =
  { readonly ok: true; readonly value: T } | ({ readonly ok: false } & Failure);

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

// ---------------------------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------------------------

export type TicketSummary = {
  readonly id: string;
  readonly reference: string;
  readonly type: TicketType;
  readonly subject: string;
  readonly status: TicketStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TicketMessageView = {
  readonly id: number;
  readonly author: "self" | "team";
  readonly body: string;
  readonly createdAt: string;
};

export type TicketEventView = {
  readonly id: number;
  readonly type: TicketEventType;
  readonly fromStatus: TicketStatus | null;
  readonly toStatus: TicketStatus | null;
  readonly reason: string | null;
  readonly createdAt: string;
};

export type TicketDetail = TicketSummary & {
  readonly description: string;
  readonly closedAt: string | null;
  readonly messages: readonly TicketMessageView[];
  readonly events: readonly TicketEventView[];
};

const CLIENT_VISIBILITY: EventVisibility = "cliente";
const LIST_LIMIT = 100;

/** Pedidos visíveis ao cliente (a RLS limita às contas de que é membro activo). */
export async function listClientTickets(): Promise<Outcome<TicketSummary[]>> {
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);
  const { data, error } = await client
    .from("tickets")
    .select(CLIENT_TICKET_LIST_COLUMNS)
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  );
}

/**
 * Detalhe de um pedido, com mensagens e histórico visível ao cliente.
 * `null` = «não encontrado» neutro: inexistente, de outra conta ou identificador inválido
 * (nunca se distingue, regra 2.2.6 / portão S4).
 */
export async function getClientTicket(
  ticketId: string,
  viewerId: string,
): Promise<Outcome<TicketDetail | null>> {
  if (!uuidSchema.safeParse(ticketId).success) return ok(null);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);

  const [ticketResult, messagesResult, eventsResult] = await Promise.all([
    client.from("tickets").select(CLIENT_TICKET_DETAIL_COLUMNS).eq("id", ticketId).maybeSingle(),
    client
      .from("ticket_messages")
      .select(TICKET_MESSAGE_COLUMNS)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("ticket_events")
      .select(TICKET_EVENT_COLUMNS)
      .eq("ticket_id", ticketId)
      // Defesa em profundidade: a RLS (restritiva) já esconde os eventos internos.
      .eq("visibility", CLIENT_VISIBILITY)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (ticketResult.error) return fail(ticketResult.error);
  const ticket = ticketResult.data;
  if (!ticket) return ok(null);
  if (messagesResult.error) return fail(messagesResult.error);
  if (eventsResult.error) return fail(eventsResult.error);

  return ok({
    id: ticket.id,
    reference: ticket.reference,
    type: ticket.type,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    closedAt: ticket.closed_at,
    messages: (messagesResult.data ?? []).map((row) => ({
      id: row.id,
      author: messageAuthor(row.author_id, viewerId),
      body: row.body,
      createdAt: row.created_at,
    })),
    events: (eventsResult.data ?? [])
      .filter((row) => row.visibility === CLIENT_VISIBILITY)
      .map((row) => ({
        id: row.id,
        type: row.event_type,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        reason: row.reason,
        createdAt: row.created_at,
      })),
  });
}

/** Cria um pedido pela RPC `create_ticket` (a conta é escolhida pela base). */
export async function createClientTicket(
  raw: unknown,
  locale: PtLocale,
): Promise<Outcome<{ id: string; reference: string }>> {
  const parsed = parseNewTicket(raw, locale);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);

  const { data, error } = await client.rpc("create_ticket", {
    p_type: parsed.value.type,
    p_subject: parsed.value.subject,
    p_description: parsed.value.description,
  });
  if (error) return fail(error);
  const created = createdTicketSchema.safeParse(data);
  if (!created.success) return fail(null);
  return ok(created.data);
}

/** Mensagem do cliente pela RPC `add_ticket_message`. */
export async function addClientMessage(raw: unknown): Promise<Outcome<{ id: number }>> {
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

/** Cancelamento pelo cliente: `change_ticket_status` com `p_expected_status` (regra 2.2.7). */
export async function cancelClientTicket(raw: unknown): Promise<Outcome<CancelInput>> {
  const parsed = parseCancel(raw);
  if (!parsed.ok) return invalid(parsed.issues);
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);

  const { error } = await client.rpc("change_ticket_status", {
    p_ticket_id: parsed.value.ticketId,
    p_to_status: "cancelado",
    p_expected_status: parsed.value.expectedStatus,
    ...(parsed.value.reason ? { p_reason: parsed.value.reason } : {}),
  });
  if (error) return fail(error);
  return ok(parsed.value);
}

// ---------------------------------------------------------------------------------------------
// Perfil e conta
// ---------------------------------------------------------------------------------------------

export type ClientProfile = {
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly locale: PortalLocale;
};

export type ClientAccount = {
  readonly id: string;
  readonly name: string;
  readonly country: string | null;
  readonly sector: string | null;
  readonly role: MemberRole;
};

export type ProfileAndAccount = {
  readonly profile: ClientProfile;
  readonly account: ClientAccount | null;
};

/** Perfil próprio e a conta activa (titular primeiro). */
export async function getClientProfileAndAccount(
  viewerId: string,
): Promise<Outcome<ProfileAndAccount | null>> {
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);

  const [profileResult, membershipResult] = await Promise.all([
    client.from("profiles").select(PROFILE_SELF_COLUMNS).eq("id", viewerId).maybeSingle(),
    client.from("account_members").select(MEMBERSHIP_SELF_COLUMNS).eq("user_id", viewerId),
  ]);
  if (profileResult.error) return fail(profileResult.error);
  if (membershipResult.error) return fail(membershipResult.error);
  const profile = profileResult.data;
  if (!profile) return ok(null);

  const memberships = [...(membershipResult.data ?? [])].sort(
    (a, b) => Number(b.member_role === "titular") - Number(a.member_role === "titular"),
  );

  let account: ClientAccount | null = null;
  if (memberships.length > 0) {
    const ids = memberships.map((m) => m.account_id);
    const { data, error } = await client
      .from("accounts")
      .select(ACCOUNT_SELF_COLUMNS)
      .in("id", ids)
      .eq("status", "activa");
    if (error) return fail(error);
    for (const membership of memberships) {
      const row = (data ?? []).find((item) => item.id === membership.account_id);
      if (row) {
        account = {
          id: row.id,
          name: row.name,
          country: row.country,
          sector: row.sector,
          role: membership.member_role,
        };
        break;
      }
    }
  }

  return ok({
    profile: {
      fullName: profile.full_name,
      phone: profile.phone,
      locale: toPortalLocale(profile.locale),
    },
    account,
  });
}

function issuesFrom(
  error: { issues: readonly { path: readonly PropertyKey[] }[] },
  keys: Readonly<Record<string, FieldIssues[string]>>,
): FieldIssues {
  const issues: FieldIssues = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? "");
    if (keys[name]) issues[name] = keys[name];
  }
  return issues;
}

function text(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

/**
 * Actualiza o perfil próprio (UPDATE concedido pela M3 a `full_name`, `phone`, `locale`).
 * Zero linhas afectadas = recusado pela RLS (por exemplo, perfil suspenso) → «não encontrado».
 */
export async function updateClientProfile(
  viewerId: string,
  raw: Record<string, unknown>,
): Promise<Outcome<ClientProfile>> {
  const parsed = profileUpdateSchema.safeParse({
    fullName: text(raw, "fullName"),
    phone: text(raw, "phone"),
    locale: text(raw, "locale"),
  });
  if (!parsed.success) {
    return invalid(
      issuesFrom(parsed.error, { fullName: "fullName", phone: "phone", locale: "locale" }),
    );
  }
  if (parsed.data.fullName === null) return invalid({ fullName: "fullName" });
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);

  const { data, error } = await client
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      locale: parsed.data.locale,
    })
    .eq("id", viewerId)
    .select("id");
  if (error) return fail(error);
  if (!data || data.length !== 1) return fail({ code: "PT404" });
  return ok(parsed.data);
}

/**
 * Actualiza a conta (UPDATE concedido pela M3 a `name`, `country`, `sector`; a RLS só deixa o
 * titular de uma conta activa). A conta é a do próprio, lida sob a RLS — nunca um identificador
 * vindo do formulário.
 */
export async function updateClientAccount(
  viewerId: string,
  raw: Record<string, unknown>,
): Promise<Outcome<{ name: string }>> {
  const parsed = accountUpdateSchema.safeParse({
    name: text(raw, "name"),
    country: text(raw, "country"),
    sector: text(raw, "sector"),
  });
  if (!parsed.success) {
    return invalid(
      issuesFrom(parsed.error, { name: "accountName", country: "country", sector: "sector" }),
    );
  }
  const client = await openClient();
  if (!client) return fail(UNAVAILABLE);

  const membership = await client
    .from("account_members")
    .select(MEMBERSHIP_SELF_COLUMNS)
    .eq("user_id", viewerId)
    .eq("member_role", "titular");
  if (membership.error) return fail(membership.error);
  const owned = membership.data ?? [];
  if (owned.length !== 1) return fail({ code: "42501" });

  const { data, error } = await client
    .from("accounts")
    .update({ name: parsed.data.name, country: parsed.data.country, sector: parsed.data.sector })
    .eq("id", owned[0].account_id)
    .select("id");
  if (error) return fail(error);
  if (!data || data.length !== 1) return fail({ code: "PT404" });
  return ok({ name: parsed.data.name });
}
