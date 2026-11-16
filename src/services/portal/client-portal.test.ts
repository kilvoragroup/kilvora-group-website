import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };
type Call = { table: string; op: string; args: unknown[] };

/** Cliente Supabase FALSO: regista as chamadas e devolve o resultado configurado por tabela. */
const fake = vi.hoisted(() => ({
  calls: [] as Call[],
  results: {} as Record<string, Result | Result[]>,
  rpc: { data: null, error: null } as Result,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  factoryCalls: 0,
}));

function nextResult(table: string): Result {
  const entry = fake.results[table] ?? { data: [], error: null };
  if (Array.isArray(entry)) return entry.shift() ?? { data: [], error: null };
  return entry;
}

function builder(table: string) {
  const record = (op: string, args: unknown[]) => fake.calls.push({ table, op, args });
  const target: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "limit", "in", "update", "is"]) {
    target[op] = (...args: unknown[]) => {
      record(op, args);
      return target;
    };
  }
  target.maybeSingle = () => {
    record("maybeSingle", []);
    return Promise.resolve(nextResult(table));
  };
  target.then = (resolve: (value: Result) => unknown) => resolve(nextResult(table));
  return target;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    fake.factoryCalls += 1;
    return {
      from: (table: string) => {
        fake.calls.push({ table, op: "from", args: [] });
        return builder(table);
      },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        fake.rpcCalls.push({ fn, args });
        return fake.rpc;
      },
    };
  },
}));

import {
  addClientMessage,
  cancelClientTicket,
  createClientTicket,
  getClientProfileAndAccount,
  getClientTicket,
  listClientTickets,
  updateClientAccount,
  updateClientProfile,
} from "./client-portal";

// Valores FICTÍCIOS.
const USER = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000099";
const TICKET = "00000000-0000-4000-8000-00000000000a";
const ACCOUNT = "00000000-0000-4000-8000-0000000000c1";
const T0 = "2026-11-15T10:00:00Z";

function enablePortal() {
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
}

const selects = (table: string) =>
  fake.calls.filter((c) => c.table === table && c.op === "select").map((c) => String(c.args[0]));

beforeEach(() => {
  fake.calls = [];
  fake.results = {};
  fake.rpc = { data: null, error: null };
  fake.rpcCalls = [];
  fake.factoryCalls = 0;
  enablePortal();
});

afterEach(() => vi.unstubAllEnvs());

describe("interruptor do portal", () => {
  it("desligado → indisponível, sem criar cliente Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    const results = await Promise.all([
      listClientTickets(),
      getClientTicket(TICKET, USER),
      createClientTicket(
        { type: "consultoria", subject: "Assunto", details: "Descrição suficiente." },
        "pt-AO",
      ),
      addClientMessage({ ticketId: TICKET, body: "Olá" }),
      cancelClientTicket({ ticketId: TICKET, expectedStatus: "recebido" }),
      getClientProfileAndAccount(USER),
      updateClientProfile(USER, { fullName: "Ana", phone: "", locale: "pt-AO" }),
      updateClientAccount(USER, { name: "Empresa", country: "", sector: "" }),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    }
    expect(fake.factoryCalls).toBe(0);
  });
});

describe("leituras de pedidos (RLS)", () => {
  it("lista com colunas explícitas, sem identificadores de outros utilizadores", async () => {
    fake.results.tickets = {
      data: [
        {
          id: TICKET,
          reference: "KG-2026-000001",
          type: "consultoria",
          subject: "Assunto",
          status: "recebido",
          created_at: T0,
          updated_at: T0,
        },
      ],
      error: null,
    };
    const result = await listClientTickets();
    expect(result.ok && result.value[0].reference).toBe("KG-2026-000001");
    const [columns] = selects("tickets");
    expect(columns).not.toContain("*");
    for (const hidden of ["account_id", "requester_id", "assigned_operator_id"]) {
      expect(columns).not.toContain(hidden);
    }
    // Nenhum filtro por conta vindo da aplicação: o isolamento é da RLS.
    expect(fake.calls.some((c) => c.op === "eq")).toBe(false);
  });

  it("identificador inválido → «não encontrado» sem contactar a base", async () => {
    expect(await getClientTicket("../outro", USER)).toEqual({ ok: true, value: null });
    expect(fake.factoryCalls).toBe(0);
  });

  it("pedido de outra conta (a RLS não devolve linha) → null neutro", async () => {
    fake.results.tickets = { data: null, error: null };
    expect(await getClientTicket(TICKET, USER)).toEqual({ ok: true, value: null });
  });

  it("detalhe: autoria neutra do staff, eventos internos filtrados, sem evidence_ref", async () => {
    fake.results.tickets = {
      data: {
        id: TICKET,
        reference: "KG-2026-000001",
        type: "consultoria",
        subject: "Assunto",
        description: "Descrição",
        status: "em_analise",
        created_at: T0,
        updated_at: T0,
        closed_at: null,
      },
      error: null,
    };
    fake.results.ticket_messages = {
      data: [
        { id: 1, ticket_id: TICKET, author_id: USER, body: "Pergunta", created_at: T0 },
        { id: 2, ticket_id: TICKET, author_id: STAFF, body: "Resposta", created_at: T0 },
      ],
      error: null,
    };
    fake.results.ticket_events = {
      data: [
        {
          id: 1,
          ticket_id: TICKET,
          actor_id: USER,
          event_type: "created",
          from_status: null,
          to_status: "recebido",
          reason: null,
          visibility: "cliente",
          created_at: T0,
        },
        {
          id: 2,
          ticket_id: TICKET,
          actor_id: STAFF,
          event_type: "note_added",
          from_status: null,
          to_status: null,
          reason: null,
          visibility: "interno",
          created_at: T0,
        },
      ],
      error: null,
    };

    const result = await getClientTicket(TICKET, USER);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.value) return;
    expect(result.value.messages.map((m) => m.author)).toEqual(["self", "team"]);
    expect(result.value.events.map((e) => e.type)).toEqual(["created"]);

    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain(STAFF);
    expect(serialized).not.toContain("author_id");
    expect(selects("ticket_events")[0]).not.toContain("evidence_ref");
    expect(fake.calls.some((c) => c.table === "ticket_internal_notes")).toBe(false);
    expect(
      fake.calls.some(
        (c) => c.table === "ticket_events" && c.op === "eq" && c.args[0] === "visibility",
      ),
    ).toBe(true);
  });

  it("erro da base → mensagem neutra, sem detalhes internos", async () => {
    fake.results.tickets = {
      data: null,
      error: { code: "42501", message: "permission denied for table tickets" },
    };
    const result = await listClientTickets();
    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(JSON.stringify(result)).not.toContain("permission denied");
  });
});

describe("escritas pelas RPCs", () => {
  it("criar pedido: só tipo, assunto e descrição; plano com valores do conteúdo aprovado", async () => {
    fake.rpc = { data: { id: TICKET, reference: "KG-2026-000007" }, error: null };
    const result = await createClientTicket(
      {
        type: "desenvolvimento_websites",
        planId: "starter",
        subject: "Website",
        details: "Website para a minha empresa.",
        accountId: ACCOUNT,
      },
      "pt-AO",
    );
    expect(result).toEqual({ ok: true, value: { id: TICKET, reference: "KG-2026-000007" } });
    const [call] = fake.rpcCalls;
    expect(call.fn).toBe("create_ticket");
    expect(Object.keys(call.args).sort()).toEqual(["p_description", "p_subject", "p_type"]);
    expect(String(call.args.p_description)).toContain("180.000 Kz");
    expect(String(call.args.p_description)).toContain("sujeitos a confirmação comercial");
  });

  it("entrada inválida → nenhuma RPC", async () => {
    const result = await createClientTicket({ type: "x" }, "pt-AO");
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid_input" } });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.factoryCalls).toBe(0);
  });

  it("resposta inesperada da RPC → nunca indica sucesso", async () => {
    fake.rpc = { data: { id: "x" }, error: null };
    const result = await createClientTicket(
      { type: "consultoria", subject: "Assunto", details: "Descrição suficiente." },
      "pt-AO",
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "unexpected" } });
  });

  it("limite de pedidos em aberto (PT429) → motivo específico", async () => {
    fake.rpc = { data: null, error: { code: "PT429", message: "too_many_open_tickets" } };
    const result = await createClientTicket(
      { type: "consultoria", subject: "Assunto", details: "Descrição suficiente." },
      "pt-AO",
    );
    expect(result).toMatchObject({ ok: false, error: { reason: "too_many_open_tickets" } });
  });

  it("mensagem num pedido alheio (PT404) → «não encontrado» neutro", async () => {
    fake.rpc = { data: null, error: { code: "PT404", message: "not_found_or_forbidden" } };
    const result = await addClientMessage({ ticketId: TICKET, body: "Olá" });
    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(fake.rpcCalls[0]).toEqual({
      fn: "add_ticket_message",
      args: { p_ticket_id: TICKET, p_body: "Olá" },
    });
  });

  it("cancelar: sempre com p_expected_status e destino `cancelado`", async () => {
    const result = await cancelClientTicket({
      ticketId: TICKET,
      expectedStatus: "em_analise",
      reason: " Já não é necessário ",
      toStatus: "concluido",
    });
    expect(result.ok).toBe(true);
    expect(fake.rpcCalls[0]).toEqual({
      fn: "change_ticket_status",
      args: {
        p_ticket_id: TICKET,
        p_to_status: "cancelado",
        p_expected_status: "em_analise",
        p_reason: "Já não é necessário",
      },
    });
  });

  it("cancelar com estado alterado entretanto (PT409) → conflito", async () => {
    fake.rpc = { data: null, error: { code: "PT409", message: "status_conflict" } };
    const result = await cancelClientTicket({ ticketId: TICKET, expectedStatus: "recebido" });
    expect(result).toMatchObject({ ok: false, error: { reason: "status_conflict" } });
  });
});

describe("perfil e conta", () => {
  it("perfil: actualiza só as colunas concedidas, filtrado pelo próprio id", async () => {
    fake.results.profiles = { data: [{ id: USER }], error: null };
    const result = await updateClientProfile(USER, {
      fullName: " Ana Fictícia ",
      phone: "+244 923 000 000",
      locale: "pt-BR",
      kind: "interno",
      status: "activo",
    });
    expect(result.ok).toBe(true);
    const update = fake.calls.find((c) => c.table === "profiles" && c.op === "update");
    expect(Object.keys(update?.args[0] as object).sort()).toEqual(["full_name", "locale", "phone"]);
    expect(fake.calls).toContainEqual({ table: "profiles", op: "eq", args: ["id", USER] });
  });

  it("perfil: zero linhas (RLS recusou) → nunca indica sucesso", async () => {
    fake.results.profiles = { data: [], error: null };
    const result = await updateClientProfile(USER, {
      fullName: "Ana",
      phone: "",
      locale: "pt-AO",
    });
    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
  });

  it("perfil: nome vazio e telefone inválido → erros de campo, sem escrita", async () => {
    const result = await updateClientProfile(USER, {
      fullName: " ",
      phone: "abc",
      locale: "pt-AO",
    });
    expect(result).toMatchObject({ ok: false, issues: { phone: "phone" } });
    expect(fake.factoryCalls).toBe(0);
  });

  it("conta: quem não é titular → recusado, sem UPDATE", async () => {
    fake.results.account_members = { data: [], error: null };
    const result = await updateClientAccount(USER, { name: "Empresa", country: "ao", sector: "" });
    expect(result).toMatchObject({ ok: false, error: { kind: "forbidden" } });
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("conta: o titular actualiza a SUA conta (id lido sob RLS, nunca do formulário)", async () => {
    fake.results.account_members = {
      data: [{ account_id: ACCOUNT, member_role: "titular" }],
      error: null,
    };
    fake.results.accounts = { data: [{ id: ACCOUNT }], error: null };
    const result = await updateClientAccount(USER, {
      name: "Empresa",
      country: "ao",
      sector: "Comércio",
      id: "00000000-0000-4000-8000-0000000000ff",
    });
    expect(result.ok).toBe(true);
    const update = fake.calls.find((c) => c.table === "accounts" && c.op === "update");
    expect(update?.args[0]).toEqual({ name: "Empresa", country: "AO", sector: "Comércio" });
    expect(fake.calls).toContainEqual({ table: "accounts", op: "eq", args: ["id", ACCOUNT] });
  });

  it("perfil e conta: titular primeiro, só contas activas", async () => {
    fake.results.profiles = {
      data: { id: USER, full_name: "Ana", phone: null, locale: "pt-BR" },
      error: null,
    };
    fake.results.account_members = {
      data: [{ account_id: ACCOUNT, member_role: "titular" }],
      error: null,
    };
    fake.results.accounts = {
      data: [{ id: ACCOUNT, name: "Empresa", country: "AO", sector: null, status: "activa" }],
      error: null,
    };
    const result = await getClientProfileAndAccount(USER);
    expect(result).toEqual({
      ok: true,
      value: {
        profile: { fullName: "Ana", phone: null, locale: "pt-BR" },
        account: { id: ACCOUNT, name: "Empresa", country: "AO", sector: null, role: "titular" },
      },
    });
    expect(fake.calls).toContainEqual({ table: "accounts", op: "eq", args: ["status", "activa"] });
  });
});
