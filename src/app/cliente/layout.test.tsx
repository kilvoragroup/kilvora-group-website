import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ClienteLayout, { metadata } from "./layout";

afterEach(() => {
  vi.unstubAllEnvs();
});

function enablePortal() {
  // Valores FICTÍCIOS.
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
}

describe("layout de /cliente", () => {
  it("portal desligado → 404 (notFound), sem renderizar o conteúdo", () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    expect(() => ClienteLayout({ children: "conteúdo" })).toThrow("NOT_FOUND");
  });

  it("flag ligada sem configuração Supabase → 404", () => {
    enablePortal();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => ClienteLayout({ children: "conteúdo" })).toThrow("NOT_FOUND");
  });

  it("portal ligado → renderiza o conteúdo", () => {
    enablePortal();
    expect(ClienteLayout({ children: "conteúdo" })).toBe("conteúdo");
  });

  it("nunca é indexável", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false, nocache: true });
  });
});
