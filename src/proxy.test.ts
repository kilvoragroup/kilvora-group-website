import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  mocks.updateSession.mockReset();
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
