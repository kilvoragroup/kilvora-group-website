import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: { name: string; value: string; options: Record<string, unknown> }[],
    headers: Record<string, string>,
  ) => void;
};

const ssr = vi.hoisted(() => ({
  getClaims: vi.fn(),
  lastCookies: null as CookieMethods | null,
  lastArgs: null as unknown[] | null,
  lastCookieOptions: null as unknown,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    url: string,
    key: string,
    options: { cookies: CookieMethods; cookieOptions?: unknown },
  ) => {
    ssr.lastArgs = [url, key];
    ssr.lastCookieOptions = options.cookieOptions;
    ssr.lastCookies = options.cookies;
    return { auth: { getClaims: ssr.getClaims } };
  },
}));

import { updateSession } from "./proxy-session";

// Valores FICTÍCIOS.
const URL_LOCAL = "http://127.0.0.1:54321";
const KEY = "sb_publishable_ficticia_teste_000";
const USER = "00000000-0000-4000-8000-000000000001";

function request(path = "/cliente/pedidos", cookie?: string, origin = "http://localhost:3000") {
  return new NextRequest(`${origin}${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", KEY);
  ssr.getClaims.mockReset();
  ssr.lastCookies = null;
  ssr.lastArgs = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateSession", () => {
  it("sem configuração Supabase não cria cliente e devolve sessão null", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { response, session } = await updateSession(request());
    expect(session).toBeNull();
    expect(ssr.lastArgs).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("recusa configuração com chave secret (não cria cliente)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_ficticia");
    const { session } = await updateSession(request());
    expect(session).toBeNull();
    expect(ssr.lastArgs).toBeNull();
  });

  it("usa só a URL e a chave publishable", async () => {
    ssr.getClaims.mockResolvedValue({ data: null, error: null });
    await updateSession(request());
    expect(ssr.lastArgs).toEqual([URL_LOCAL, KEY]);
  });

  it("devolve sub e aal quando as claims são válidas", async () => {
    ssr.getClaims.mockResolvedValue({ data: { claims: { sub: USER, aal: "aal2" } }, error: null });
    const { session } = await updateSession(request());
    expect(session).toEqual({ userId: USER, aal: "aal2" });
  });

  it("aal ausente fica null", async () => {
    ssr.getClaims.mockResolvedValue({ data: { claims: { sub: USER } }, error: null });
    expect((await updateSession(request())).session).toEqual({ userId: USER, aal: null });
  });

  it.each([
    ["erro do Auth", { data: null, error: new Error("invalid") }],
    ["sem claims", { data: null, error: null }],
    ["sub vazio", { data: { claims: { sub: "" } }, error: null }],
    ["sub não textual", { data: { claims: { sub: 42 } }, error: null }],
  ])("%s → sessão null", async (_label, result) => {
    ssr.getClaims.mockResolvedValue(result);
    expect((await updateSession(request())).session).toBeNull();
  });

  it("falha de rede → sessão null, sem lançar", async () => {
    ssr.getClaims.mockRejectedValue(new Error("rede"));
    await expect(updateSession(request())).resolves.toMatchObject({ session: null });
  });

  it("lê os cookies do pedido", async () => {
    ssr.getClaims.mockResolvedValue({ data: null, error: null });
    await updateSession(request("/cliente", "sb-ficticio-auth-token=abc"));
    expect(ssr.lastCookies?.getAll()).toEqual([{ name: "sb-ficticio-auth-token", value: "abc" }]);
  });

  it("propaga os cookies renovados e os cabeçalhos anti-cache para a resposta", async () => {
    ssr.getClaims.mockImplementation(async () => {
      ssr.lastCookies?.setAll(
        [{ name: "sb-ficticio-auth-token", value: "novo", options: { httpOnly: true, path: "/" } }],
        { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" },
      );
      return { data: { claims: { sub: USER, aal: "aal1" } }, error: null };
    });
    const req = request();
    const { response, session } = await updateSession(req);
    expect(session).toEqual({ userId: USER, aal: "aal1" });
    expect(req.cookies.get("sb-ficticio-auth-token")?.value).toBe("novo");
    expect(response.cookies.get("sb-ficticio-auth-token")?.value).toBe("novo");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("cookieOptions.secure segue o URL do pedido", async () => {
    ssr.getClaims.mockResolvedValue({ data: null, error: null });
    await updateSession(request("/cliente", undefined, "https://kilvoragroup.com"));
    expect(ssr.lastCookieOptions).toEqual({ secure: true });
    await updateSession(request("/cliente", undefined, "http://localhost:3000"));
    expect(ssr.lastCookieOptions).toEqual({ secure: false });
    await updateSession(request("/cliente", undefined, "http://kilvoragroup.com"));
    expect(ssr.lastCookieOptions).toEqual({ secure: true });
  });

  it.each([
    [true, true],
    [false, false],
  ])("Set-Cookie com secure=%s → atributo Secure presente=%s", async (secure, present) => {
    ssr.getClaims.mockImplementation(async () => {
      ssr.lastCookies?.setAll(
        [
          {
            name: "sb-ficticio-auth-token",
            value: "novo",
            options: { path: "/", sameSite: "lax", httpOnly: false, maxAge: 34560000, secure },
          },
        ],
        {},
      );
      return { data: null, error: null };
    });
    const { response } = await updateSession(request());
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain("sb-ficticio-auth-token=novo");
    expect(header).toMatch(/Path=\//);
    expect(header.toLowerCase()).toContain("samesite=lax");
    expect(header).toContain("Max-Age=34560000");
    expect(header.toLowerCase()).not.toContain("httponly");
    expect(/;\s*Secure/i.test(header)).toBe(present);
  });
});
