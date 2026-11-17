import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };

const fake = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; args: unknown[] }[],
  results: {} as Record<string, Result>,
  rpcResults: {} as Record<string, Result>,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  factoryCalls: 0,
}));

function builder(table: string) {
  const record = (op: string, args: unknown[]) => fake.calls.push({ table, op, args });
  const target: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "limit"]) {
    target[op] = (...args: unknown[]) => {
      record(op, args);
      return target;
    };
  }
  const result = () => fake.results[table] ?? { data: [], error: null };
  target.maybeSingle = () => Promise.resolve(result());
  target.then = (resolve: (value: Result) => unknown) => resolve(result());
  return target;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    fake.factoryCalls += 1;
    return {
      from: (table: string) => builder(table),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        fake.rpcCalls.push({ fn, args });
        return fake.rpcResults[fn] ?? { data: null, error: null };
      },
    };
  },
}));

import {
  addInternalNote,
  addStaffMessage,
  changeStaffTicketStatus,
  getStaffTicket,
  listStaffTickets,
} from "./staff-console";

// Valores FICTÍCIOS.
const STAFF = "00000000-0000-4000-8000-000000000099";
const CLIENT = "00000000-0000-4000-8000-000000000001";
const TICKET = "00000000-0000-4000-8000-00000000000a";
const ACCOUNT = "00000000-0000-4000-8000-0000000000c1";
const T0 = "2026-11-16T10:00:00Z";

beforeEach(() => {
  fake.calls = [];
  fake.results = {};
  fake.rpcResults = {};
  fake.rpcCalls = [];
  fake.factoryCalls = 0;
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
});

afterEach(() => vi.unstubAllEnvs());

describe("consola: interruptor e leituras", () => {
  it("portal desligado → indisponível, sem cliente Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    for (const result of await Promise.all([
      listStaffTickets(),
      getStaffTicket(TICKET, STAFF),
      addStaffMessage({ ticketId: TICKET, body: "Olá" }),
      addInternalNote({ ticketId: TICKET, body: "Nota" }),
      changeStaffTicketStatus({
        ticketId: TICKET,
        expectedStatus: "recebido",
        toStatus: "em_analise",
      }),
    ])) {
      expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    }
    expect(fake.factoryCalls).toBe(0);
  });

  it("lista: sem filtro de atribuição na aplicação (a RLS decide), sem descrição", async () => {
    fake.results.tickets = {
      data: [
        {
          id: TICKET,
          reference: "KG-2026-000001",
          type: "desenvolvimento_websites",
          subject: "Website",
          status: "em_analise",
          assigned_operator_id: null,
          updated_at: T0,
        },
      ],
      error: null,
    };
    const result = await listStaffTickets();
    expect(result.ok && result.value[0]).toMatchObject({ assigned: false });
    expect(fake.calls.some((c) => c.op === "eq")).toBe(false);
    const select = fake.calls.find((c) => c.op === "select");
    expect(String(select?.args[0])).not.toContain("description");
  });

  it("pedido não atribuído/inexistente → null neutro; id inválido sem contactar a base", async () => {
    expect(await getStaffTicket("x", STAFF)).toEqual({ ok: true, value: null });
    expect(fake.factoryCalls).toBe(0);
    fake.results.tickets = { data: null, error: null };
    expect(await getStaffTicket(TICKET, STAFF)).toEqual({ ok: true, value: null });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("detalhe: evidência só por staff_ticket_events; autoria; notas próprias", async () => {
    fake.results.tickets = {
      data: {
        id: TICKET,
        reference: "KG-2026-000001",
        account_id: ACCOUNT,
        requester_id: CLIENT,
        type: "desenvolvimento_websites",
        subject: "Website",
        description: "Descrição",
        status: "proposta_enviada",
        assigned_operator_id: STAFF,
        created_at: T0,
        updated_at: T0,
        closed_at: null,
      },
      error: null,
    };
    fake.results.profiles = {
      data: { id: CLIENT, full_name: "Cliente", phone: "+244 923 000 000" },
      error: null,
    };
    fake.results.accounts = {
      data: { id: ACCOUNT, name: "Empresa", country: "AO", sector: null },
      error: null,
    };
    fake.results.ticket_messages = {
      data: [
        { id: 1, ticket_id: TICKET, author_id: CLIENT, body: "Pergunta", created_at: T0 },
        { id: 2, ticket_id: TICKET, author_id: STAFF, body: "Resposta", created_at: T0 },
      ],
      error: null,
    };
    fake.results.ticket_internal_notes = {
      data: [{ id: 1, ticket_id: TICKET, author_id: STAFF, body: "Nota", created_at: T0 }],
      error: null,
    };
    fake.rpcResults.staff_ticket_events = {
      data: [
        {
          id: 9,
          ticket_id: TICKET,
          actor_id: STAFF,
          event_type: "status_changed",
          from_status: "em_preparacao_proposta",
          to_status: "proposta_enviada",
          reason: null,
          evidence_ref: "PROP-1",
          visibility: "cliente",
          created_at: T0,
        },
      ],
      error: null,
    };

    const result = await getStaffTicket(TICKET, STAFF);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.value) return;
    expect(result.value.requester).toEqual({ name: "Cliente", phone: "+244 923 000 000" });
    expect(result.value.messages.map((m) => m.author)).toEqual(["client", "self"]);
    expect(result.value.notes[0].mine).toBe(true);
    expect(result.value.events[0].evidenceRef).toBe("PROP-1");
    expect(fake.rpcCalls).toEqual([{ fn: "staff_ticket_events", args: { p_ticket_id: TICKET } }]);
    // Nunca lê ticket_events directamente (a coluna evidence_ref não é concedida).
    expect(fake.calls.some((c) => c.table === "ticket_events")).toBe(false);
  });
});

describe("consola: escritas pelas RPCs", () => {
  it("transição com p_expected_status, motivo e evidência", async () => {
    const result = await changeStaffTicketStatus({
      ticketId: TICKET,
      expectedStatus: "proposta_enviada",
      toStatus: "aceite",
      evidenceRef: "PROP-1",
    });
    expect(result.ok).toBe(true);
    expect(fake.rpcCalls[0]).toEqual({
      fn: "change_ticket_status",
      args: {
        p_ticket_id: TICKET,
        p_to_status: "aceite",
        p_expected_status: "proposta_enviada",
        p_evidence_ref: "PROP-1",
      },
    });
  });

  it("transição inválida → nenhuma RPC", async () => {
    const result = await changeStaffTicketStatus({
      ticketId: TICKET,
      expectedStatus: "em_analise",
      toStatus: "recusado",
    });
    expect(result).toMatchObject({ ok: false, issues: { reason: "reasonRequired" } });
    expect(fake.factoryCalls).toBe(0);
  });

  it("pedido não atribuído (PT404) e conflito (PT409) → mensagens neutras", async () => {
    fake.rpcResults.add_internal_note = {
      data: null,
      error: { code: "PT404", message: "not_found_or_forbidden" },
    };
    expect(await addInternalNote({ ticketId: TICKET, body: "Nota" })).toMatchObject({
      ok: false,
      error: { kind: "not_found" },
    });
    fake.rpcResults.change_ticket_status = {
      data: null,
      error: { code: "PT409", message: "status_conflict" },
    };
    expect(
      await changeStaffTicketStatus({
        ticketId: TICKET,
        expectedStatus: "recebido",
        toStatus: "em_analise",
      }),
    ).toMatchObject({ ok: false, error: { reason: "status_conflict" } });
  });

  it("mensagem e nota: só sucesso com id numérico devolvido pela base", async () => {
    fake.rpcResults.add_ticket_message = { data: 7, error: null };
    expect(await addStaffMessage({ ticketId: TICKET, body: "Olá" })).toEqual({
      ok: true,
      value: { id: 7 },
    });
    fake.rpcResults.add_internal_note = { data: null, error: null };
    expect(await addInternalNote({ ticketId: TICKET, body: "Nota" })).toMatchObject({
      ok: false,
      error: { kind: "unexpected" },
    });
  });
});
