import { z } from "zod";

import { portalClient, type PortalFieldKey } from "@/content/portal-client";
import { resolve, type PtLocale } from "@/content/types";
import { formatKz, type PlanId, plans } from "@/content/websites";

import {
  charLength,
  createTicketSchema,
  pgBtrim,
  ticketStatusSchema,
  ticketTypeSchema,
  uuidSchema,
} from "./schemas";
import type { TicketStatus, TicketType } from "./types";

/**
 * Regras de domínio da área do cliente (A3). Sem I/O.
 *
 * A base é sempre a autoridade final (RPCs da M2 e RLS da M3). Estas regras servem para
 * validar cedo, compor o texto do pedido e decidir o que a interface apresenta.
 */

/** Estados finais (M1 `tickets_closed_consistent`). */
export const CLOSED_STATUSES: readonly TicketStatus[] = ["concluido", "recusado", "cancelado"];

/**
 * Estados a partir dos quais o cliente pode cancelar. Espelha as linhas `actor = 'cliente'` de
 * `private.ticket_transitions` (M2); a RPC volta a decidir com `p_expected_status`.
 */
export const CLIENT_CANCELLABLE_STATUSES: readonly TicketStatus[] = [
  "recebido",
  "em_analise",
  "aguarda_cliente",
  "em_preparacao_proposta",
  "proposta_enviada",
];

export function isClosedStatus(status: TicketStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

export function canClientCancel(status: TicketStatus): boolean {
  return CLIENT_CANCELLABLE_STATUSES.includes(status);
}

/** Tipo de pedido que aceita a escolha de um plano de website. */
export const WEBSITE_TICKET_TYPE: TicketType = "desenvolvimento_websites";

export const PLAN_IDS = plans.map((plan) => plan.id) as [PlanId, ...PlanId[]];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Bloco com o plano escolhido e os valores aprovados, no início da descrição do pedido.
 * Os valores vêm SEMPRE de `src/content/websites.ts` (nunca do formulário), com a indicação de
 * confirmação comercial. Fica gravado no pedido como fotografia do momento da escolha.
 */
export function planBlock(planId: PlanId, locale: PtLocale): string {
  const plan = plans.find((item) => item.id === planId);
  if (!plan) throw new Error(`Plano desconhecido: ${planId}`);
  const text = resolve(portalClient.planBlock, locale);
  return [
    `${text.plan}: ${plan.name} — ${resolve(plan.subtitle, locale)}`,
    `${text.development}: ${formatKz(plan.priceKz)}`,
    `${text.maintenance}: ${formatKz(plan.maintenance.monthlyKz)}${text.perMonth}`,
    text.notice,
  ].join("\n");
}

export type ComposedTicket = {
  readonly type: TicketType;
  readonly subject: string;
  readonly description: string;
};

/** Junta o bloco do plano (se houver) à descrição escrita pelo cliente. */
export function composeDescription(
  details: string,
  planId: PlanId | null,
  locale: PtLocale,
): string {
  if (!planId) return details;
  const label = resolve(portalClient.planBlock.details, locale);
  return `${planBlock(planId, locale)}\n\n${label}:\n${details}`;
}

export type FieldIssues = Partial<Record<string, PortalFieldKey>>;

export type Parsed<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: FieldIssues };

function form(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Entrada do formulário «Novo pedido» → pedido pronto para `create_ticket`.
 * - `planId` vazio = «a definir»; só é aceite em pedidos de website.
 * - A descrição final (bloco do plano + texto) tem de respeitar os limites da M2.
 */
export function parseNewTicket(raw: unknown, locale: PtLocale): Parsed<ComposedTicket> {
  const input = form(raw);
  const issues: FieldIssues = {};

  const type = ticketTypeSchema.safeParse(input.type);
  if (!type.success) issues.type = "type";

  const rawPlan = str(input.planId);
  let planId: PlanId | null = null;
  if (rawPlan !== "") {
    if (!isPlanId(rawPlan)) issues.planId = "plan";
    else if (type.success && type.data !== WEBSITE_TICKET_TYPE) issues.planId = "planNotAllowed";
    else planId = rawPlan;
  }

  const subject = pgBtrim(str(input.subject));
  if (charLength(subject) < 3 || charLength(subject) > 160) issues.subject = "subject";

  const details = pgBtrim(str(input.details));
  if (charLength(details) < 10) issues.details = "details";

  if (Object.keys(issues).length > 0 || !type.success) return { ok: false, issues };

  const composed = createTicketSchema.safeParse({
    type: type.data,
    subject,
    description: composeDescription(details, planId, locale),
  });
  if (!composed.success) return { ok: false, issues: { details: "details" } };
  return { ok: true, value: composed.data };
}

const messageSchema = z.object({ ticketId: uuidSchema, body: z.string() });

export function parseMessage(raw: unknown): Parsed<{ ticketId: string; body: string }> {
  const input = form(raw);
  const parsed = messageSchema.safeParse({ ticketId: input.ticketId, body: str(input.body) });
  if (!parsed.success) return { ok: false, issues: { ticketId: "required" } };
  const body = pgBtrim(parsed.data.body);
  if (charLength(body) < 1 || charLength(body) > 5000)
    return { ok: false, issues: { body: "body" } };
  return { ok: true, value: { ticketId: parsed.data.ticketId, body } };
}

export type CancelInput = {
  readonly ticketId: string;
  readonly expectedStatus: TicketStatus;
  readonly reason: string | null;
};

export function parseCancel(raw: unknown): Parsed<CancelInput> {
  const input = form(raw);
  const ticketId = uuidSchema.safeParse(input.ticketId);
  const expected = ticketStatusSchema.safeParse(input.expectedStatus);
  if (!ticketId.success || !expected.success || !canClientCancel(expected.data)) {
    return { ok: false, issues: { ticketId: "required" } };
  }
  const reason = pgBtrim(str(input.reason));
  if (charLength(reason) > 1000) return { ok: false, issues: { reason: "reason" } };
  return {
    ok: true,
    value: { ticketId: ticketId.data, expectedStatus: expected.data, reason: reason || null },
  };
}

/** Resposta da RPC `create_ticket` (`jsonb`): validada antes de ser usada. */
export const createdTicketSchema = z.object({
  id: uuidSchema,
  reference: z.string().regex(/^KG-[0-9]{4}-[0-9]{6}$/),
});

/**
 * Autoria de uma mensagem para o cliente (D04): o próprio vê «Você»; qualquer outro autor é
 * apresentado como «Equipa KILVORA». O cliente nunca recebe o identificador do autor.
 */
export function messageAuthor(authorId: string, viewerId: string): "self" | "team" {
  return authorId === viewerId ? "self" : "team";
}

const TIME_ZONES: Readonly<Record<PtLocale, string>> = {
  "pt-AO": "Africa/Luanda",
  "pt-BR": "America/Sao_Paulo",
};

/** Data e hora legíveis no fuso da variante (sem depender do fuso do servidor). */
export function formatDateTime(iso: string, locale: PtLocale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONES[locale],
  }).format(date);
}
