import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` é resolvido pelo Next.js no build; no Vitest é substituído por um módulo vazio.
vi.mock("server-only", () => ({}));

type CookieMethods = {
  getAll: () => unknown;
  setAll: (cookies: { name: string; value: string; options: object }[]) => void;
};

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createBrowserClient: vi.fn(),
  cookieStore: {
    getAll: vi.fn(() => [{ name: "sb-ficticio-auth-token", value: "abc" }]),
    set: vi.fn(),
  },
  requestHeaders: {} as Record<string, string>,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
  createBrowserClient: mocks.createBrowserClient,
}));

vi.mock("next/headers", () => ({
  cookies: async () => mocks.cookieStore,
  headers: async () => ({ get: (name: string) => mocks.requestHeaders[name] ?? null }),
}));

import { getSupabaseBrowserClient } from "./client";
import { SupabaseConfigError } from "./env";
import { createSupabaseServerClient } from "./server";
import { createServerClient as proxyCreateServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { updateSession } from "./proxy-session";

// Valores FICTÍCIOS.
const URL_LOCAL = "http://127.0.0.1:54321";
const KEY = "sb_publishable_ficticia_teste_000";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_LOCAL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", KEY);
  mocks.createServerClient.mockReset().mockReturnValue({ kind: "server" });
  mocks.createBrowserClient.mockReset().mockReturnValue({ kind: "browser" });
  mocks.cookieStore.set.mockReset();
  mocks.requestHeaders = { "x-forwarded-proto": "http", host: "localhost:3000" };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const HTTPS_HEADERS = { "x-forwarded-proto": "https", "x-forwarded-host": "kilvoragroup.com" };

describe("createSupabaseServerClient", () => {
  it("cria o cliente só com a URL e a chave publishable", async () => {
    await expect(createSupabaseServerClient()).resolves.toEqual({ kind: "server" });
    const [url, key, options] = mocks.createServerClient.mock.calls[0];
    expect([url, key]).toEqual([URL_LOCAL, KEY]);
    expect(Object.keys(options).sort()).toEqual(["cookieOptions", "cookies"]);
    expect(options.cookieOptions).toEqual({ secure: false });
  });

  it("HTTPS → cookieOptions.secure = true", async () => {
    mocks.requestHeaders = HTTPS_HEADERS;
    await createSupabaseServerClient();
    expect(mocks.createServerClient.mock.calls[0][2].cookieOptions).toEqual({ secure: true });
  });

  it("HTTP localhost → cookieOptions.secure = false", async () => {
    await createSupabaseServerClient();
    expect(mocks.createServerClient.mock.calls[0][2].cookieOptions).toEqual({ secure: false });
  });

  it("sem cabeçalhos de origem → secure = true (falha segura)", async () => {
    mocks.requestHeaders = {};
    await createSupabaseServerClient();
    expect(mocks.createServerClient.mock.calls[0][2].cookieOptions).toEqual({ secure: true });
  });

  it("lê e escreve cookies através de next/headers", async () => {
    await createSupabaseServerClient();
    const { cookies } = mocks.createServerClient.mock.calls[0][2] as { cookies: CookieMethods };
    expect(cookies.getAll()).toEqual([{ name: "sb-ficticio-auth-token", value: "abc" }]);
    cookies.setAll([{ name: "a", value: "1", options: { path: "/" } }]);
    expect(mocks.cookieStore.set).toHaveBeenCalledWith("a", "1", { path: "/" });
  });

  it("ignora a falha de escrita em Server Components", async () => {
    mocks.cookieStore.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    await createSupabaseServerClient();
    const { cookies } = mocks.createServerClient.mock.calls[0][2] as { cookies: CookieMethods };
    expect(() => cookies.setAll([{ name: "a", value: "1", options: {} }])).not.toThrow();
  });

  it("recusa chaves privilegiadas antes de criar o cliente", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_ficticia");
    await expect(createSupabaseServerClient()).rejects.toBeInstanceOf(SupabaseConfigError);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});

describe("getSupabaseBrowserClient", () => {
  it("cria o cliente só com a URL e a chave publishable", () => {
    vi.stubGlobal("window", { location: { protocol: "http:", hostname: "localhost" } });
    expect(getSupabaseBrowserClient()).toEqual({ kind: "browser" });
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(URL_LOCAL, KEY, {
      cookieOptions: { secure: false },
    });
  });

  it("página HTTPS → cookieOptions.secure = true", () => {
    vi.stubGlobal("window", { location: { protocol: "https:", hostname: "kilvoragroup.com" } });
    getSupabaseBrowserClient();
    expect(mocks.createBrowserClient.mock.calls[0][2]).toEqual({ cookieOptions: { secure: true } });
  });

  it("sem window (pré-renderização) → secure = true", () => {
    getSupabaseBrowserClient();
    expect(mocks.createBrowserClient.mock.calls[0][2]).toEqual({ cookieOptions: { secure: true } });
  });

  it("falha fechado sem configuração", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => getSupabaseBrowserClient()).toThrow(SupabaseConfigError);
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });
});

describe("consistência dos três clientes", () => {
  it.each([
    [
      "HTTPS",
      HTTPS_HEADERS,
      { protocol: "https:", hostname: "kilvoragroup.com" },
      "https://kilvoragroup.com/cliente",
      true,
    ],
    [
      "HTTP localhost",
      { "x-forwarded-proto": "http", host: "localhost:3000" },
      { protocol: "http:", hostname: "localhost" },
      "http://localhost:3000/cliente",
      false,
    ],
  ])(
    "%s: servidor, navegador e proxy usam as mesmas opções",
    async (_label, reqHeaders, location, proxyUrl, secure) => {
      const proxyMock = vi.mocked(proxyCreateServerClient);
      mocks.createServerClient.mockReturnValue({
        kind: "server",
        auth: { getClaims: async () => ({ data: null, error: null }) },
      });

      mocks.requestHeaders = reqHeaders;
      await createSupabaseServerClient();
      vi.stubGlobal("window", { location });
      getSupabaseBrowserClient();
      await updateSession(new NextRequest(proxyUrl));

      const server = mocks.createServerClient.mock.calls[0][2].cookieOptions;
      const browser = mocks.createBrowserClient.mock.calls[0][2].cookieOptions;
      const proxy = proxyMock.mock.calls[1][2].cookieOptions;
      expect(server).toEqual({ secure });
      expect(browser).toEqual(server);
      expect(proxy).toEqual(server);
    },
  );
});
