import { describe, expect, it } from "vitest";

import {
  decideOptimisticRoute,
  isPortalPath,
  isPublicPortalPath,
  publicPortalRoutes,
  safeReturnPath,
} from "./route-guard";

const SESSION = { userId: "00000000-0000-4000-8000-000000000001" };

describe("isPortalPath", () => {
  it.each([
    ["/cliente", true],
    ["/cliente/", true],
    ["/cliente/pedidos/1", true],
    ["/interno", true],
    ["/interno/pedidos", true],
    ["/", false],
    ["/clientes", false],
    ["/internos", false],
    ["/contactos", false],
    ["/areas/cliente", false],
  ])("%s → %s", (path, expected) => {
    expect(isPortalPath(path)).toBe(expected);
  });
});

describe("isPublicPortalPath", () => {
  it("inclui só entrada, registo e recuperação", () => {
    expect(publicPortalRoutes).toEqual([
      "/cliente/entrar",
      "/cliente/criar-conta",
      "/cliente/recuperar",
    ]);
    expect(isPublicPortalPath("/cliente/entrar")).toBe(true);
    expect(isPublicPortalPath("/cliente/entrar/")).toBe(true);
    expect(isPublicPortalPath("/cliente/recuperar/nova")).toBe(true);
    expect(isPublicPortalPath("/cliente/entrarx")).toBe(false);
    expect(isPublicPortalPath("/cliente")).toBe(false);
    expect(isPublicPortalPath("/interno/entrar")).toBe(false);
  });
});

describe("safeReturnPath", () => {
  it.each([
    ["/cliente/pedidos?x=1", "/cliente/pedidos?x=1"],
    ["/interno", "/interno"],
    [null, null],
    ["", null],
    ["cliente", null],
    ["//evil.example/cliente", null],
    ["https://evil.example/cliente", null],
    ["/\\evil.example", null],
    ["/cliente/\u0000", null],
    ["/contactos", null],
    ["/cliente/entrar", null],
    [`/cliente/${"a".repeat(600)}`, null],
  ])("%s → %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });
});

describe("decideOptimisticRoute", () => {
  it("não intervém fora do portal", () => {
    expect(decideOptimisticRoute("/", "", null)).toEqual({ type: "next" });
    expect(decideOptimisticRoute("/contactos", "", null)).toEqual({ type: "next" });
  });

  it("deixa passar as rotas públicas do portal, com ou sem sessão", () => {
    for (const path of publicPortalRoutes) {
      expect(decideOptimisticRoute(path, "", null)).toEqual({ type: "next" });
      expect(decideOptimisticRoute(path, "", SESSION)).toEqual({ type: "next" });
    }
  });

  it("deixa passar rotas protegidas com sessão (a autorização é da DAL)", () => {
    expect(decideOptimisticRoute("/cliente/pedidos", "", SESSION)).toEqual({ type: "next" });
    expect(decideOptimisticRoute("/interno", "", SESSION)).toEqual({ type: "next" });
  });

  it("redirecciona para a entrada sem sessão, preservando o destino", () => {
    expect(decideOptimisticRoute("/cliente/pedidos", "?estado=aberto", null)).toEqual({
      type: "redirect",
      location: "/cliente/entrar?next=%2Fcliente%2Fpedidos%3Festado%3Daberto",
    });
    expect(decideOptimisticRoute("/interno", "", null)).toEqual({
      type: "redirect",
      location: "/cliente/entrar?next=%2Finterno",
    });
  });

  it("omite o destino quando não é seguro", () => {
    expect(decideOptimisticRoute(`/cliente/${"a".repeat(600)}`, "", null)).toEqual({
      type: "redirect",
      location: "/cliente/entrar",
    });
  });
});
