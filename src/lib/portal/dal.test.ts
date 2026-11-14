import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type QueryResult = { data: unknown; error: unknown };

const state = vi.hoisted(() => ({
  claims: null as unknown,
  claimsError: null as unknown,
  claimsThrows: false,
  profile: { data: null, error: null } as QueryResult,
  roles: { data: [], error: null } as QueryResult,
  calls: [] as { table: string; method: string; args: unknown[] }[],
}));

function builder(table: string) {
  const record = (method: string, args: unknown[]) => state.calls.push({ table, method, args });
  const chain = {
    select: (...args: unknown[]) => (record("select", args), chain),
    eq: (...args: unknown[]) => (record("eq", args), chain),
    is: (...args: unknown[]) => {
      record("is", args);
      return Promise.resolve(state.roles);
    },
    maybeSingle: () => {
      record("maybeSingle", []);
      return Promise.resolve(state.profile);
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => {
        if (state.claimsThrows) throw new Error("rede");
        return { data: state.claims ? { claims: state.claims } : null, error: state.claimsError };
      },
    },
    from: (table: string) => {
      state.calls.push({ table, method: "from", args: [] });
      return builder(table);
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import {
  PortalDataError,
  checkStaffAccess,
  getSession,
  getViewer,
  requireClient,
  requireStaff,
} from "./dal";

const USER = "00000000-0000-4000-8000-000000000001";
const profileRow = (o: object = {}) => ({
  id: USER,
  kind: "cliente",
  status: "activo",
  full_name: "Cliente Fictício",
  locale: "pt-BR",
  ...o,
});

beforeEach(() => {
  state.claims = { sub: USER, aal: "aal1" };
  state.claimsError = null;
  state.claimsThrows = false;
  state.profile = { data: profileRow(), error: null };
  state.roles = { data: [], error: null };
  state.calls = [];
});

describe("getSession", () => {
  it("usa sub e aal das claims verificadas", async () => {
    expect(await getSession()).toEqual({ userId: USER, aal: "aal1" });
  });

  it.each([
    ["sem claims", () => (state.claims = null)],
    ["erro", () => (state.claimsError = new Error("x"))],
    ["sub vazio", () => (state.claims = { sub: "" })],
    ["falha de rede", () => (state.claimsThrows = true)],
  ])("%s → null", async (_label, arrange) => {
    arrange();
    expect(await getSession()).toBeNull();
  });

  it("aal desconhecido → null", async () => {
    state.claims = { sub: USER, aal: "aal3" };
    expect(await getSession()).toEqual({ userId: USER, aal: null });
  });
});

describe("getViewer", () => {
  it("lê o perfil próprio e os papéis activos com listas de colunas explícitas", async () => {
    state.profile = { data: profileRow({ kind: "interno" }), error: null };
    state.roles = { data: [{ role: "operador" }, { role: "operador" }], error: null };
    const viewer = await getViewer();
    expect(viewer).toEqual({
      session: { userId: USER, aal: "aal1" },
      profile: {
        id: USER,
        kind: "interno",
        status: "activo",
        fullName: "Cliente Fictício",
        locale: "pt-BR",
      },
      roles: ["operador"],
    });
    expect(state.calls).toEqual(
      expect.arrayContaining([
        { table: "profiles", method: "select", args: ["id, kind, status, full_name, locale"] },
        { table: "profiles", method: "eq", args: ["id", USER] },
        { table: "user_roles", method: "select", args: ["role"] },
        { table: "user_roles", method: "eq", args: ["user_id", USER] },
        { table: "user_roles", method: "is", args: ["revoked_at", null] },
      ]),
    );
    for (const call of state.calls.filter((c) => c.method === "select")) {
      expect(String(call.args[0])).not.toContain("*");
    }
  });

  it("ignora metadados do Auth: papéis só de user_roles", async () => {
    state.claims = {
      sub: USER,
      aal: "aal2",
      user_metadata: { role: "admin" },
      app_metadata: { roles: ["admin"] },
    };
    state.profile = { data: profileRow({ kind: "interno" }), error: null };
    expect((await getViewer())?.roles).toEqual([]);
  });

  it("descarta papéis desconhecidos", async () => {
    state.roles = { data: [{ role: "superuser" }, { role: "admin" }], error: null };
    expect((await getViewer())?.roles).toEqual(["admin"]);
  });

  it("sem sessão → null, sem consultar a base", async () => {
    state.claims = null;
    expect(await getViewer()).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it("perfil não visível → null", async () => {
    state.profile = { data: null, error: null };
    expect(await getViewer()).toBeNull();
  });

  it("erro da base → PortalDataError (falha fechada, sem detalhes)", async () => {
    state.roles = { data: null, error: { code: "XX000", message: "private.audit_log" } };
    const error = await getViewer().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PortalDataError);
    expect(String((error as Error).message)).not.toContain("private");
  });
});

describe("requireClient", () => {
  it("devolve o cliente activo", async () => {
    await expect(requireClient()).resolves.toMatchObject({ profile: { kind: "cliente" } });
  });

  it("sem sessão → redirecciona para a entrada", async () => {
    state.claims = null;
    await expect(requireClient()).rejects.toThrow("REDIRECT:/cliente/entrar");
  });

  it.each([
    ["interno", { kind: "interno" }],
    ["suspenso", { status: "suspenso" }],
  ])("%s → não encontrado neutro", async (_label, override) => {
    state.profile = { data: profileRow(override), error: null };
    await expect(requireClient()).rejects.toThrow("NOT_FOUND");
  });
});

describe("requireStaff", () => {
  beforeEach(() => {
    state.claims = { sub: USER, aal: "aal2" };
    state.profile = { data: profileRow({ kind: "interno" }), error: null };
    state.roles = { data: [{ role: "operador" }], error: null };
  });

  it("aceita interno activo com papel e aal2", async () => {
    await expect(requireStaff()).resolves.toMatchObject({ roles: ["operador"] });
  });

  it("exige o papel pedido", async () => {
    await expect(requireStaff(["admin"])).rejects.toThrow("NOT_FOUND");
  });

  it.each([
    ["aal1", () => (state.claims = { sub: USER, aal: "aal1" })],
    ["cliente", () => (state.profile = { data: profileRow(), error: null })],
    [
      "suspenso",
      () =>
        (state.profile = {
          data: profileRow({ kind: "interno", status: "suspenso" }),
          error: null,
        }),
    ],
    ["sem papel", () => (state.roles = { data: [], error: null })],
  ])("%s → não encontrado neutro", async (_label, arrange) => {
    arrange();
    await expect(requireStaff()).rejects.toThrow("NOT_FOUND");
  });

  it("checkStaffAccess distingue mfa_required para a consola (A4)", async () => {
    state.claims = { sub: USER, aal: "aal1" };
    const { decision } = await checkStaffAccess();
    expect(decision).toEqual({ allowed: false, reason: "mfa_required" });
  });

  it("sem sessão → redirecciona para a entrada", async () => {
    state.claims = null;
    await expect(requireStaff()).rejects.toThrow("REDIRECT:/cliente/entrar");
  });
});
