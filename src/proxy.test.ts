import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateSession: vi.fn() }));

vi.mock("@/lib/supabase/proxy-session", () => ({ updateSession: mocks.updateSession }));

import { config, proxy } from "./proxy";

const USER = "00000000-0000-4000-8000-000000000001";

function request(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

function sessionResult(session: { userId: string; aal: string | null } | null) {
  const response = NextResponse.next();
  response.cookies.set("sb-ficticio-auth-token", "renovado", { path: "/" });
  return { response, session };
}

// Valores FICTÍCIOS: activam o portal nos testes que exercitam o proxy.
function enablePortal() {
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
}

beforeEach(() => {
  mocks.updateSession.mockReset();
  enablePortal();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("portal desligado (P1)", () => {
  it.each([
    ["flag ausente", () => vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "")],
    ["flag diferente de true", () => vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "1")],
    ["flag ligada sem Supabase", () => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")],
  ])("%s: não inicializa o Supabase, não redirecciona nem escreve cookies", async (_l, arrange) => {
    arrange();
    const res = await proxy(request("/cliente/pedidos"));
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBeNull();
  });
});

describe("config.matcher", () => {
  it("limita o proxy a /cliente/* e /interno/*", () => {
    expect(config.matcher).toEqual(["/cliente/:path*", "/interno/:path*"]);
  });
});

describe("proxy", () => {
  it("redirecciona sem sessão e conserva os cookies renovados", async () => {
    mocks.updateSession.mockResolvedValue(sessionResult(null));
    const res = await proxy(request("/cliente/pedidos"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/cliente/entrar?next=%2Fcliente%2Fpedidos",
    );
    expect(res.cookies.get("sb-ficticio-auth-token")?.value).toBe("renovado");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("deixa passar as rotas públicas sem sessão", async () => {
    mocks.updateSession.mockResolvedValue(sessionResult(null));
    const res = await proxy(request("/cliente/entrar"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("deixa passar com sessão, mesmo em /interno com aal1 (a DAL decide)", async () => {
    const result = sessionResult({ userId: USER, aal: "aal1" });
    mocks.updateSession.mockResolvedValue(result);
    const res = await proxy(request("/interno/pedidos"));
    expect(res).toBe(result.response);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
  });
});
