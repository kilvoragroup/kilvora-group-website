import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };

const fake = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  rpcResults: {} as Record<string, Result>,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  calls: [] as { table: string; op: string; args: unknown[] }[],
  factoryCalls: 0,
}));

function builder(table: string) {
  const target: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "limit", "is"]) {
    target[op] = (...args: unknown[]) => {
      fake.calls.push({ table, op, args });
      return target;
    };
  }
  target.then = (resolve: (value: Result) => unknown) =>
    resolve(fake.results[table] ?? { data: [], error: null });
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
  assignTicket,
  cancelProvisioning,
  changeRole,
  getAuditLog,
  listActiveOperators,
  listProfiles,
  provisionStaff,
  reopenTicket,
  setProfileStatus,
} from "./admin";

// Valores FICTÍCIOS.
const TICKET = "00000000-0000-4000-8000-00000000000a";
const OP = "00000000-0000-4000-8000-000000000011";
const OP_SUSPENDED = "00000000-0000-4000-8000-000000000012";
const ADMIN = "00000000-0000-4000-8000-000000000013";
const T0 = "2026-11-18T10:00:00Z";

beforeEach(() => {
  fake.results = {};
  fake.rpcResults = {};
  fake.rpcCalls = [];
  fake.calls = [];
  fake.factoryCalls = 0;
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
});

afterEach(() => vi.unstubAllEnvs());

describe("administração: leituras", () => {
  it("equipa com papéis activos; operadores elegíveis só activos com papel operador", async () => {
    fake.results.profiles = {
      data: [
        { id: OP, kind: "interno", status: "activo", full_name: "Op", created_at: T0 },
        { id: OP_SUSPENDED, kind: "interno", status: "suspenso", full_name: null, created_at: T0 },
        { id: ADMIN, kind: "interno", status: "activo", full_name: "Adm", created_at: T0 },
      ],
      error: null,
    };
    fake.results.user_roles = {
      data: [
        { user_id: OP, role: "operador" },
        { user_id: OP_SUSPENDED, role: "operador" },
        { user_id: ADMIN, role: "admin" },
      ],
      error: null,
    };
    expect(await listActiveOperators()).toEqual({ ok: true, value: [{ id: OP, name: "Op" }] });
    expect(fake.calls).toContainEqual({ table: "profiles", op: "eq", args: ["kind", "interno"] });
    expect(fake.calls).toContainEqual({
      table: "user_roles",
      op: "is",
      args: ["revoked_at", null],
    });
  });

  it("clientes: sem consulta de papéis", async () => {
    fake.results.profiles = { data: [], error: null };
    expect(await listProfiles("cliente")).toEqual({ ok: true, value: [] });
    expect(fake.calls.some((c) => c.table === "user_roles")).toBe(false);
  });

  it("portal desligado → indisponível, sem cliente", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    for (const result of await Promise.all([
      listProfiles("interno"),
      assignTicket({ ticketId: TICKET, operatorId: OP }),
      provisionStaff({ email: "a@b.test" }),
      getAuditLog({ entityType: null, entityId: null }),
    ])) {
      expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    }
    expect(fake.factoryCalls).toBe(0);
  });
});

describe("administração: RPCs da M2", () => {
  it("atribuir, retirar atribuição e reabrir com os argumentos exactos", async () => {
    expect((await assignTicket({ ticketId: TICKET, operatorId: OP })).ok).toBe(true);
    expect((await assignTicket({ ticketId: TICKET, operatorId: "" })).ok).toBe(true);
    expect((await reopenTicket({ ticketId: TICKET, reason: "Reavaliar" })).ok).toBe(true);
    expect(fake.rpcCalls).toEqual([
      { fn: "assign_ticket", args: { p_ticket_id: TICKET, p_operator_id: OP } },
      { fn: "assign_ticket", args: { p_ticket_id: TICKET } },
      { fn: "reopen_ticket", args: { p_ticket_id: TICKET, p_reason: "Reavaliar" } },
    ]);
  });

  it("papéis: grant_role / revoke_role; erros da base com motivo", async () => {
    await changeRole({ userId: OP, role: "operador", change: "grant" });
    fake.rpcResults.revoke_role = { data: null, error: { code: "PT409", message: "last_admin" } };
    const revoked = await changeRole({ userId: ADMIN, role: "admin", change: "revoke" });
    expect(revoked).toMatchObject({ ok: false, error: { reason: "last_admin" } });
    expect(fake.rpcCalls.map((c) => c.fn)).toEqual(["grant_role", "revoke_role"]);
  });

  it("estado do perfil e operador sem permissão (PT404) → neutro", async () => {
    fake.rpcResults.admin_set_profile_status = {
      data: null,
      error: { code: "PT404", message: "not_found_or_forbidden" },
    };
    expect(await setProfileStatus({ userId: OP, status: "suspenso" })).toMatchObject({
      ok: false,
      error: { kind: "not_found" },
    });
  });

  it("provisionamento devolve o id; resposta inválida nunca é sucesso", async () => {
    fake.rpcResults.admin_provision_staff = { data: 41, error: null };
    expect(await provisionStaff({ email: " Novo@Example.test " })).toEqual({
      ok: true,
      value: { id: 41 },
    });
    expect(fake.rpcCalls[0].args).toEqual({ p_email: "novo@example.test" });
    fake.rpcResults.admin_provision_staff = { data: "41", error: null };
    expect(await provisionStaff({ email: "novo@example.test" })).toMatchObject({ ok: false });
    expect(await cancelProvisioning({ provisioningId: "x" })).toMatchObject({
      ok: false,
      issues: { provisioningId: "provisioningId" },
    });
  });

  it("auditoria: filtro opcional e limite 100", async () => {
    fake.rpcResults.admin_audit_log = {
      data: [
        {
          id: 1,
          occurred_at: T0,
          actor_id: ADMIN,
          actor_aal: "aal2",
          action: "ticket_assigned",
          entity_type: "ticket",
          entity_id: TICKET,
          before: null,
          after: { assigned_operator_id: OP },
        },
      ],
      error: null,
    };
    const result = await getAuditLog({ entityType: "ticket", entityId: null });
    expect(result.ok && result.value[0].action).toBe("ticket_assigned");
    expect(fake.rpcCalls[0]).toEqual({
      fn: "admin_audit_log",
      args: { p_entity_type: "ticket", p_limit: 100 },
    });
  });
});
