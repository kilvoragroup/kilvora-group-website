import { describe, expect, it } from "vitest";

import { decideClientAccess, decideStaffAccess } from "./access";
import { type Viewer, toAal, toPortalLocale } from "./types";

function viewer(overrides: {
  kind?: Viewer["profile"]["kind"];
  status?: Viewer["profile"]["status"];
  roles?: Viewer["roles"];
  aal?: Viewer["session"]["aal"];
}): Viewer {
  return {
    session: { userId: "u1", aal: overrides.aal === undefined ? "aal1" : overrides.aal },
    profile: {
      id: "u1",
      kind: overrides.kind ?? "cliente",
      status: overrides.status ?? "activo",
      fullName: null,
      locale: "pt-AO",
    },
    roles: overrides.roles ?? [],
  };
}

describe("decideClientAccess", () => {
  it("aceita cliente activo, com aal1 ou aal2", () => {
    expect(decideClientAccess(viewer({}))).toEqual({ allowed: true });
    expect(decideClientAccess(viewer({ aal: "aal2" }))).toEqual({ allowed: true });
  });

  it.each([
    [null, "unauthenticated"],
    [viewer({ kind: "interno" }), "wrong_kind"],
    [viewer({ kind: "interno", roles: ["admin"], aal: "aal2" }), "wrong_kind"],
    [viewer({ status: "suspenso" }), "inactive"],
    [viewer({ status: "anonimizado" }), "inactive"],
  ] as const)("recusa %#", (input, reason) => {
    expect(decideClientAccess(input)).toEqual({ allowed: false, reason });
  });
});

describe("decideStaffAccess", () => {
  const staff = (o: Parameters<typeof viewer>[0] = {}) =>
    viewer({ kind: "interno", roles: ["operador"], aal: "aal2", ...o });

  it("aceita interno activo com papel e aal2", () => {
    expect(decideStaffAccess(staff())).toEqual({ allowed: true });
    expect(decideStaffAccess(staff({ roles: ["admin"] }))).toEqual({ allowed: true });
  });

  it("exige kind interno: um cliente com papel (impossível na base) é recusado", () => {
    expect(decideStaffAccess(staff({ kind: "cliente" }))).toEqual({
      allowed: false,
      reason: "wrong_kind",
    });
  });

  it("exige perfil activo", () => {
    expect(decideStaffAccess(staff({ status: "suspenso" }))).toEqual({
      allowed: false,
      reason: "inactive",
    });
  });

  it("exige papel activo", () => {
    expect(decideStaffAccess(staff({ roles: [] }))).toEqual({
      allowed: false,
      reason: "role_missing",
    });
  });

  it("restringe aos papéis pedidos", () => {
    expect(decideStaffAccess(staff(), ["admin"])).toEqual({
      allowed: false,
      reason: "role_missing",
    });
    expect(decideStaffAccess(staff({ roles: ["admin"] }), ["admin"])).toEqual({ allowed: true });
    expect(decideStaffAccess(staff({ roles: ["admin"] }), [])).toEqual({
      allowed: false,
      reason: "role_missing",
    });
  });

  it("exige aal2 (aal1 ou ausente → mfa_required)", () => {
    expect(decideStaffAccess(staff({ aal: "aal1" }))).toEqual({
      allowed: false,
      reason: "mfa_required",
    });
    expect(decideStaffAccess(staff({ aal: null }))).toEqual({
      allowed: false,
      reason: "mfa_required",
    });
  });

  it("só revela mfa_required a quem cumpre as restantes condições", () => {
    expect(decideStaffAccess(viewer({ aal: "aal1" }))).toEqual({
      allowed: false,
      reason: "wrong_kind",
    });
    expect(decideStaffAccess(staff({ roles: [], aal: "aal1" }))).toEqual({
      allowed: false,
      reason: "role_missing",
    });
  });

  it("sem sessão → unauthenticated", () => {
    expect(decideStaffAccess(null)).toEqual({ allowed: false, reason: "unauthenticated" });
  });
});

describe("conversões", () => {
  it("toAal aceita só aal1 e aal2", () => {
    expect(toAal("aal1")).toBe("aal1");
    expect(toAal("aal2")).toBe("aal2");
    for (const value of ["aal3", "", null, undefined, 2]) expect(toAal(value)).toBeNull();
  });

  it("toPortalLocale usa pt-AO por omissão", () => {
    expect(toPortalLocale("pt-BR")).toBe("pt-BR");
    expect(toPortalLocale("pt-AO")).toBe("pt-AO");
    expect(toPortalLocale("en")).toBe("pt-AO");
  });
});
