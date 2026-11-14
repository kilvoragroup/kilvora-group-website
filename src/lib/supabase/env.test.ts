import { describe, expect, it } from "vitest";

import { SupabaseConfigError, getSupabasePublicEnv, tryGetSupabasePublicEnv } from "./env";

// Valores FICTÍCIOS: nenhum corresponde a uma credencial real.
const LOCAL_URL = "http://127.0.0.1:54321";
const PUBLISHABLE = "sb_publishable_ficticia_teste_000";

function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.assinatura-ficticia`;
}

function issueOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SupabaseConfigError);
    return (error as SupabaseConfigError).issue;
  }
  throw new Error("esperava-se SupabaseConfigError");
}

describe("getSupabasePublicEnv", () => {
  it("aceita a URL local e uma chave publishable", () => {
    expect(getSupabasePublicEnv({ url: LOCAL_URL, publishableKey: PUBLISHABLE })).toEqual({
      url: LOCAL_URL,
      publishableKey: PUBLISHABLE,
    });
  });

  it("aceita HTTPS remoto e remove a barra final", () => {
    const env = getSupabasePublicEnv({
      url: "https://exemplo.supabase.co/",
      publishableKey: PUBLISHABLE,
    });
    expect(env.url).toBe("https://exemplo.supabase.co");
  });

  it("aceita a chave anon legada (JWT com role anon)", () => {
    const key = fakeJwt({ role: "anon", iss: "supabase-demo" });
    expect(getSupabasePublicEnv({ url: LOCAL_URL, publishableKey: key }).publishableKey).toBe(key);
  });

  it("recusa chaves secret", () => {
    expect(
      issueOf(() => getSupabasePublicEnv({ url: LOCAL_URL, publishableKey: "sb_secret_ficticia" })),
    ).toBe("key_privileged");
  });

  it("recusa JWT com papel privilegiado ou diferente de anon", () => {
    for (const role of ["service_role", "authenticated", "postgres"]) {
      expect(
        issueOf(() => getSupabasePublicEnv({ url: LOCAL_URL, publishableKey: fakeJwt({ role }) })),
        role,
      ).toBe("key_privileged");
    }
  });

  it("recusa chaves com formato desconhecido", () => {
    for (const key of ["sb_publishable_", "qualquer-coisa", "a.b.c", fakeJwt({ sub: "x" })]) {
      expect(
        issueOf(() => getSupabasePublicEnv({ url: LOCAL_URL, publishableKey: key })),
        key,
      ).toBe("key_unrecognised");
    }
  });

  it("recusa variáveis em falta", () => {
    expect(
      issueOf(() => getSupabasePublicEnv({ url: undefined, publishableKey: PUBLISHABLE })),
    ).toBe("url_missing");
    expect(issueOf(() => getSupabasePublicEnv({ url: "  ", publishableKey: PUBLISHABLE }))).toBe(
      "url_missing",
    );
    expect(issueOf(() => getSupabasePublicEnv({ url: LOCAL_URL, publishableKey: "" }))).toBe(
      "key_missing",
    );
  });

  it("recusa URL inválida e HTTP fora do anfitrião local", () => {
    expect(
      issueOf(() => getSupabasePublicEnv({ url: "nao-e-url", publishableKey: PUBLISHABLE })),
    ).toBe("url_invalid");
    expect(
      issueOf(() =>
        getSupabasePublicEnv({ url: "ftp://exemplo.supabase.co", publishableKey: PUBLISHABLE }),
      ),
    ).toBe("url_invalid");
    expect(
      issueOf(() =>
        getSupabasePublicEnv({ url: "http://exemplo.supabase.co", publishableKey: PUBLISHABLE }),
      ),
    ).toBe("url_insecure");
  });

  it("nunca inclui os valores recebidos na mensagem de erro", () => {
    const secret = "sb_secret_valor_que_nao_pode_aparecer";
    try {
      getSupabasePublicEnv({ url: LOCAL_URL, publishableKey: secret });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret);
      expect(String((error as Error).message)).not.toContain(LOCAL_URL);
    }
  });

  it("lê process.env só quando é chamado", async () => {
    const before = { ...process.env };
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      // Importar o módulo sem variáveis não lança.
      await expect(import("./env")).resolves.toBeDefined();
      expect(tryGetSupabasePublicEnv()).toBeNull();

      process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_URL;
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
      expect(tryGetSupabasePublicEnv()).toEqual({ url: LOCAL_URL, publishableKey: PUBLISHABLE });
    } finally {
      process.env = before;
    }
  });
});

describe("tryGetSupabasePublicEnv", () => {
  it("devolve null em vez de lançar", () => {
    expect(
      tryGetSupabasePublicEnv({ url: LOCAL_URL, publishableKey: "sb_secret_ficticia" }),
    ).toBeNull();
  });
});
