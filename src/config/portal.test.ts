import { afterEach, describe, expect, it, vi } from "vitest";

import { assertPortalEnabled, PortalDisabledError } from "@/lib/portal/portal-guard";

import { isPortalEnabled, isPortalFlagOn } from "./portal";

// Valores FICTÍCIOS.
const URL_LOCAL = "http://127.0.0.1:54321";
const KEY = "sb_publishable_ficticia_teste_000";

function setEnv(flag: string | undefined, url = URL_LOCAL, key = KEY) {
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", flag);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPortalEnabled", () => {
  it("desligado por omissão (variável ausente)", () => {
    setEnv(undefined);
    expect(isPortalFlagOn()).toBe(false);
    expect(isPortalEnabled()).toBe(false);
  });

  it.each(["", "false", "1", "yes", "TRUE", "True", " true", "true "])(
    'só "true" liga a flag: %j → desligado',
    (value) => {
      setEnv(value);
      expect(isPortalEnabled()).toBe(false);
    },
  );

  it('"true" com configuração Supabase válida → ligado', () => {
    setEnv("true");
    expect(isPortalFlagOn()).toBe(true);
    expect(isPortalEnabled()).toBe(true);
  });

  it.each([
    ["sem URL", "", KEY],
    ["sem chave", URL_LOCAL, ""],
    ["chave secret", URL_LOCAL, "sb_secret_ficticia"],
    ["HTTP remoto", "http://exemplo.supabase.co", KEY],
  ])('"true" com configuração inválida (%s) → desligado', (_label, url, key) => {
    setEnv("true", url, key);
    expect(isPortalFlagOn()).toBe(true);
    expect(isPortalEnabled()).toBe(false);
  });
});

describe("assertPortalEnabled", () => {
  it("lança PortalDisabledError, com mensagem neutra, quando desligado", () => {
    setEnv(undefined);
    expect(() => assertPortalEnabled()).toThrow(PortalDisabledError);
    try {
      assertPortalEnabled();
    } catch (error) {
      expect((error as Error).message).toBe("Portal indisponível.");
      expect((error as Error).message).not.toMatch(/supabase|env|NEXT_PUBLIC/i);
    }
  });

  it("não lança quando ligado", () => {
    setEnv("true");
    expect(() => assertPortalEnabled()).not.toThrow();
  });
});
