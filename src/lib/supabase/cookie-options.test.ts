import { createBrowserClient } from "@supabase/ssr";
import { describe, expect, it } from "vitest";

import { isSecureCookieContext, originFromHeaders, supabaseCookieOptions } from "./cookie-options";

// Valores FICTÍCIOS.
const URL_LOCAL = "http://127.0.0.1:54321";
const KEY = "sb_publishable_ficticia_teste_000";

/** Opções por omissão do @supabase/ssr 0.12.7 que têm de ser preservadas. */
const PRESERVED = { path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 * 24 * 60 * 60 };

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("isSecureCookieContext", () => {
  it.each([
    [{ protocol: "https:", hostname: "kilvoragroup.com" }, true],
    [{ protocol: "https:", hostname: "localhost" }, true],
    [{ protocol: "HTTPS:", hostname: "exemplo.vercel.app" }, true],
    [{ protocol: "http:", hostname: "localhost" }, false],
    [{ protocol: "http:", hostname: "LOCALHOST" }, false],
    [{ protocol: "http:", hostname: "127.0.0.1" }, false],
    [{ protocol: "http:", hostname: "[::1]" }, false],
    [{ protocol: "http:", hostname: "kilvoragroup.com" }, true],
    [{ protocol: "http:", hostname: "localhost.evil.example" }, true],
    [{ protocol: "http:", hostname: "192.168.1.10" }, true],
    [null, true],
  ])("%j → secure=%s", (origin, expected) => {
    expect(isSecureCookieContext(origin)).toBe(expected);
    expect(supabaseCookieOptions(origin)).toEqual({ secure: expected });
  });
});

describe("originFromHeaders", () => {
  it("usa x-forwarded-proto e x-forwarded-host (primeiro valor)", () => {
    expect(
      originFromHeaders(
        headers({ "x-forwarded-proto": "https, http", "x-forwarded-host": "kilvoragroup.com" }),
      ),
    ).toEqual({ protocol: "https:", hostname: "kilvoragroup.com" });
  });

  it("usa host quando não há x-forwarded-host e retira a porta", () => {
    expect(
      originFromHeaders(headers({ "x-forwarded-proto": "http", host: "localhost:3000" })),
    ).toEqual({ protocol: "http:", hostname: "localhost" });
  });

  it.each([
    [{}],
    [{ host: "localhost:3000" }],
    [{ "x-forwarded-proto": "http" }],
    [{ "x-forwarded-proto": "http", host: "exemplo com espaço" }],
  ])("dados insuficientes ou inválidos → null (Secure) %#", (values) => {
    const origin = originFromHeaders(headers(values));
    expect(origin).toBeNull();
    expect(isSecureCookieContext(origin)).toBe(true);
  });
});

describe("junção real das opções pelo @supabase/ssr 0.12.7", () => {
  async function writtenOptions(secure: boolean) {
    const written: { name: string; options: Record<string, unknown> }[] = [];
    const client = createBrowserClient(URL_LOCAL, KEY, {
      isSingleton: false,
      cookieOptions: supabaseCookieOptions(
        secure
          ? { protocol: "https:", hostname: "kilvoragroup.com" }
          : { protocol: "http:", hostname: "localhost" },
      ),
      cookies: {
        getAll: () => [],
        setAll: (cookies) => {
          for (const { name, options } of cookies) written.push({ name, options: { ...options } });
        },
      },
    });
    const storage = (
      client.auth as unknown as { storage: { setItem(k: string, v: string): Promise<void> } }
    ).storage;
    await storage.setItem("sb-ficticio-auth-token", "valor-ficticio");
    expect(written).toHaveLength(1);
    return written[0].options;
  }

  it("HTTPS: Secure=true e restantes opções preservadas", async () => {
    expect(await writtenOptions(true)).toEqual({ ...PRESERVED, secure: true });
  });

  it("HTTP localhost: Secure=false e restantes opções preservadas", async () => {
    expect(await writtenOptions(false)).toEqual({ ...PRESERVED, secure: false });
  });
});
