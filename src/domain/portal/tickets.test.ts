import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  portalClient,
  ticketEventLabels,
  ticketStatusLabels,
  ticketTypeLabels,
} from "@/content/portal-client";
import { plans } from "@/content/websites";
import { Constants } from "@/lib/supabase/database.types";

import {
  CLIENT_CANCELLABLE_STATUSES,
  CLOSED_STATUSES,
  canClientCancel,
  composeDescription,
  createdTicketSchema,
  formatDateTime,
  isClosedStatus,
  messageAuthor,
  parseCancel,
  parseMessage,
  parseNewTicket,
  planBlock,
} from "./tickets";

// Valores FICTÍCIOS.
const TICKET = "00000000-0000-4000-8000-00000000000a";
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

const M2 = readFileSync(
  join(process.cwd(), "supabase/migrations/20261113115533_portal_functions.sql"),
  "utf8",
);

describe("estados do pedido", () => {
  it("os estados canceláveis coincidem com as transições `cliente` da M2", () => {
    const fromM2 = [...M2.matchAll(/\('(\w+)',\s*'cancelado',\s*'cliente'/g)].map((m) => m[1]);
    expect(fromM2.length).toBeGreaterThan(0);
    expect([...CLIENT_CANCELLABLE_STATUSES].sort()).toEqual([...fromM2].sort());
  });

  it("o cliente não tem outra transição além do cancelamento", () => {
    const clientRows = [...M2.matchAll(/\('(\w+)',\s*'(\w+)',\s*'cliente'/g)];
    expect(clientRows.every((m) => m[2] === "cancelado")).toBe(true);
  });

  it("estados encerrados não são canceláveis", () => {
    for (const status of CLOSED_STATUSES) {
      expect(isClosedStatus(status)).toBe(true);
      expect(canClientCancel(status)).toBe(false);
    }
    expect(canClientCancel("aceite")).toBe(false);
    expect(canClientCancel("recebido")).toBe(true);
  });
});

describe("textos", () => {
  it("cobrem todos os valores dos enums da base", () => {
    const enums = Constants.public.Enums;
    expect(Object.keys(ticketStatusLabels).sort()).toEqual([...enums.ticket_status].sort());
    expect(Object.keys(ticketTypeLabels).sort()).toEqual([...enums.ticket_type].sort());
    expect(Object.keys(ticketEventLabels).sort()).toEqual([...enums.ticket_event_type].sort());
  });

  it("a autoria do staff é «Equipa KILVORA» (D04)", () => {
    expect(portalClient.detail.team["pt-AO"]).toBe("Equipa KILVORA");
    expect(messageAuthor(USER, USER)).toBe("self");
    expect(messageAuthor(OTHER, USER)).toBe("team");
  });
});

describe("planos de website", () => {
  it("preserva os valores comerciais aprovados", () => {
    const values = plans.map((p) => [p.id, p.priceKz, p.maintenance.monthlyKz]);
    expect(values).toEqual([
      ["starter", 180_000, 25_000],
      ["business", 350_000, 50_000],
      ["premium", 650_000, 100_000],
    ]);
  });

  it("o bloco do plano tem os valores formatados e a confirmação comercial", () => {
    const block = planBlock("business", "pt-AO");
    expect(block).toContain("Business");
    expect(block).toContain("350.000 Kz");
    expect(block).toContain("50.000 Kz/mês");
    expect(block).toContain("sujeitos a confirmação comercial");
    expect(planBlock("starter", "pt-BR")).toContain("180.000 Kz");
    expect(planBlock("premium", "pt-AO")).toContain("100.000 Kz/mês");
  });

  it("sem plano, a descrição é só o texto do cliente", () => {
    expect(composeDescription("Texto do cliente.", null, "pt-AO")).toBe("Texto do cliente.");
  });
});

describe("parseNewTicket", () => {
  const base = {
    type: "desenvolvimento_websites",
    subject: "  Novo website  ",
    details: "Precisamos de um website institucional.",
  };

  it("aceita um pedido de website com plano e compõe a descrição", () => {
    const result = parseNewTicket({ ...base, planId: "premium" }, "pt-AO");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subject).toBe("Novo website");
    expect(result.value.description).toContain("650.000 Kz");
    expect(result.value.description.endsWith(base.details)).toBe(true);
  });

  it("plano vazio = a definir", () => {
    const result = parseNewTicket({ ...base, planId: "" }, "pt-AO");
    expect(result.ok && result.value.description).toBe(base.details);
  });

  it("recusa plano desconhecido ou em pedido que não é de website", () => {
    expect(parseNewTicket({ ...base, planId: "gold" }, "pt-AO")).toEqual({
      ok: false,
      issues: { planId: "plan" },
    });
    expect(parseNewTicket({ ...base, type: "consultoria", planId: "starter" }, "pt-AO")).toEqual({
      ok: false,
      issues: { planId: "planNotAllowed" },
    });
  });

  it("valida tipo, assunto e descrição", () => {
    const result = parseNewTicket({ type: "x", subject: "ab", details: "curto" }, "pt-AO");
    expect(result).toEqual({
      ok: false,
      issues: { type: "type", subject: "subject", details: "details" },
    });
  });

  it("a descrição composta respeita o limite de 5000 da M2", () => {
    const long = "a".repeat(4990);
    expect(parseNewTicket({ ...base, details: long }, "pt-AO").ok).toBe(true);
    expect(parseNewTicket({ ...base, details: long, planId: "starter" }, "pt-AO")).toEqual({
      ok: false,
      issues: { details: "details" },
    });
  });

  it("ignora campos inesperados (nunca há conta nem requerente vindos do cliente)", () => {
    const result = parseNewTicket(
      { ...base, accountId: OTHER, requesterId: OTHER, priceKz: 1 },
      "pt-AO",
    );
    expect(result.ok && Object.keys(result.value).sort()).toEqual([
      "description",
      "subject",
      "type",
    ]);
    expect(result.ok && result.value.description).not.toContain(" 1 Kz");
  });
});

describe("parseMessage e parseCancel", () => {
  it("mensagem: uuid obrigatório e corpo 1–5000 após btrim", () => {
    expect(parseMessage({ ticketId: "x", body: "Olá" }).ok).toBe(false);
    expect(parseMessage({ ticketId: TICKET, body: "   " })).toEqual({
      ok: false,
      issues: { body: "body" },
    });
    expect(parseMessage({ ticketId: TICKET, body: " Olá " })).toEqual({
      ok: true,
      value: { ticketId: TICKET, body: "Olá" },
    });
  });

  it("cancelamento: exige estado esperado cancelável; motivo opcional ≤ 1000", () => {
    expect(parseCancel({ ticketId: TICKET, expectedStatus: "concluido" }).ok).toBe(false);
    expect(parseCancel({ ticketId: "x", expectedStatus: "recebido" }).ok).toBe(false);
    expect(parseCancel({ ticketId: TICKET, expectedStatus: "recebido", reason: " " })).toEqual({
      ok: true,
      value: { ticketId: TICKET, expectedStatus: "recebido", reason: null },
    });
    expect(
      parseCancel({ ticketId: TICKET, expectedStatus: "recebido", reason: "a".repeat(1001) }),
    ).toEqual({ ok: false, issues: { reason: "reason" } });
  });
});

describe("utilitários", () => {
  it("valida a resposta de create_ticket", () => {
    expect(createdTicketSchema.safeParse({ id: TICKET, reference: "KG-2026-000001" }).success).toBe(
      true,
    );
    expect(createdTicketSchema.safeParse({ id: TICKET, reference: "X" }).success).toBe(false);
  });

  it("formata datas no fuso da variante", () => {
    expect(formatDateTime("2026-11-15T23:30:00Z", "pt-AO")).toContain("16");
    expect(formatDateTime("2026-11-15T23:30:00Z", "pt-BR")).toContain("15");
    expect(formatDateTime("inválida", "pt-AO")).toBe("");
  });
});
