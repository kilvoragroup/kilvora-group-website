import { describe, expect, it } from "vitest";

import {
  AUTH_CALLBACK_PATH,
  NEW_PASSWORD_PATH,
  SiteUrlConfigError,
  authCallbackUrl,
  safeNext,
  siteOrigin,
} from "./auth-urls";

describe("siteOrigin", () => {
  it.each([
    ["https://kilvoragroup.com", "https://kilvoragroup.com"],
    ["https://kilvoragroup.com/", "https://kilvoragroup.com"],
    ["http://localhost:3100", "http://localhost:3100"],
    ["http://127.0.0.1:3000", "http://127.0.0.1:3000"],
  ])("%s → %s", (raw, expected) => {
    expect(siteOrigin(raw)).toBe(expected);
  });

  it("sem variável → http://localhost:3000 (desenvolvimento)", () => {
    expect(siteOrigin(undefined)).toBe("http://localhost:3000");
  });

  it.each([
    "http://kilvoragroup.com",
    "ftp://kilvoragroup.com",
    "javascript:alert(1)",
    "nao-e-url",
    "https://kilvoragroup.com/caminho",
    "https://kilvoragroup.com?x=1",
    "https://user:pass@kilvoragroup.com",
  ])("recusa %s", (raw) => {
    expect(() => siteOrigin(raw)).toThrow(SiteUrlConfigError);
  });
});

describe("safeNext", () => {
  it.each([
    ["/cliente", "/cliente"],
    ["/cliente/pedidos?estado=aberto", "/cliente/pedidos?estado=aberto"],
    [NEW_PASSWORD_PATH, NEW_PASSWORD_PATH],
    ["/interno/pedidos", "/interno/pedidos"],
  ])("aceita %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example/cliente",
    "//evil.example/cliente",
    "/\\evil.example",
    "\\\\evil.example",
    "/cliente/../contactos",
    "/cliente/./x",
    "/cliente/%2e%2e/contactos",
    "/cliente/%2F%2Fevil.example",
    "/cliente/%5Cevil",
    "/cliente\u0000",
    "/cliente/entrar",
    "/cliente/criar-conta",
    "/contactos",
    "javascript:alert(1)",
    "/cliente\nLocation: //evil",
  ])("recusa %j → /cliente", (input) => {
    expect(safeNext(input)).toBe("/cliente");
  });

  it("usa o fallback indicado", () => {
    expect(safeNext("//evil", NEW_PASSWORD_PATH)).toBe(NEW_PASSWORD_PATH);
  });
});

describe("authCallbackUrl", () => {
  it("usa a origem configurada e codifica o destino", () => {
    expect(authCallbackUrl("/cliente", "https://kilvoragroup.com")).toBe(
      `https://kilvoragroup.com${AUTH_CALLBACK_PATH}?next=%2Fcliente`,
    );
    expect(authCallbackUrl(NEW_PASSWORD_PATH, "http://localhost:3100")).toBe(
      `http://localhost:3100${AUTH_CALLBACK_PATH}?next=%2Fcliente%2Fnova-palavra-passe`,
    );
  });

  it("um destino malicioso é substituído pela área de cliente", () => {
    expect(authCallbackUrl("//evil.example", "https://kilvoragroup.com")).toBe(
      `https://kilvoragroup.com${AUTH_CALLBACK_PATH}?next=%2Fcliente`,
    );
  });
});
