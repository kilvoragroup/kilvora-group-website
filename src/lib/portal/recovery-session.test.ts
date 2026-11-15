import { describe, expect, it } from "vitest";

import {
  CLOCK_SKEW_SECONDS,
  RECOVERY_WINDOW_SECONDS,
  checkRecoverySession,
  isFreshRecoverySession,
} from "./recovery-session";

// Identificadores FICTÍCIOS.
const NOW = new Date("2026-11-14T10:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);
const base = {
  sub: "00000000-0000-4000-8000-000000000001",
  session_id: "00000000-0000-4000-8000-0000000000aa",
  aal: "aal1",
};
const claims = (amr: unknown, extra: object = {}) => ({ ...base, amr, ...extra });

describe("constantes", () => {
  it("janela de 600 s e tolerância de 60 s", () => {
    expect(RECOVERY_WINDOW_SECONDS).toBe(600);
    expect(CLOCK_SKEW_SECONDS).toBe(60);
  });
});

describe("recuperação recente aceite", () => {
  it.each([0, 1, 300, 600])("há %i s → aceite", (age) => {
    expect(isFreshRecoverySession(claims([{ method: "recovery", timestamp: T - age }]), NOW)).toBe(
      true,
    );
  });

  it("tolera até 60 s no futuro (relógio)", () => {
    expect(isFreshRecoverySession(claims([{ method: "recovery", timestamp: T + 60 }]), NOW)).toBe(
      true,
    );
  });

  it("aceita quando há outros métodos na mesma sessão", () => {
    const amr = [
      { method: "token_refresh", timestamp: T - 5 },
      { method: "recovery", timestamp: T - 30 },
    ];
    expect(checkRecoverySession(claims(amr), NOW)).toEqual({ fresh: true, recoveredAt: T - 30 });
  });
});

describe("sessão normal recusada", () => {
  it.each([
    [[{ method: "password", timestamp: T - 10 }]],
    [[{ method: "otp", timestamp: T - 10 }]],
    [[{ method: "email/signup", timestamp: T - 10 }]],
    [[{ method: "token_refresh", timestamp: T - 10 }]],
    [[{ method: "magiclink", timestamp: T - 10 }]],
    [[]],
  ])("amr %j → no_recovery", (amr) => {
    expect(checkRecoverySession(claims(amr), NOW)).toEqual({ fresh: false, reason: "no_recovery" });
  });
});

describe("recuperação expirada recusada", () => {
  it("601 s → expired", () => {
    expect(checkRecoverySession(claims([{ method: "recovery", timestamp: T - 601 }]), NOW)).toEqual(
      { fresh: false, reason: "expired" },
    );
  });

  it("recuperação antiga numa sessão renovada continua expirada", () => {
    const amr = [
      { method: "recovery", timestamp: T - 3600 },
      { method: "token_refresh", timestamp: T - 1 },
    ];
    expect(isFreshRecoverySession(claims(amr), NOW)).toBe(false);
  });
});

describe("claims falsificados, incompletos ou desconhecidos recusados", () => {
  it("timestamp no futuro além da tolerância → future", () => {
    expect(checkRecoverySession(claims([{ method: "recovery", timestamp: T + 61 }]), NOW)).toEqual({
      fresh: false,
      reason: "future",
    });
    expect(
      isFreshRecoverySession(claims([{ method: "recovery", timestamp: T + 86400 * 365 }]), NOW),
    ).toBe(false);
  });

  it.each([
    ["sem timestamp", [{ method: "recovery" }]],
    ["timestamp em texto", [{ method: "recovery", timestamp: String(T) }]],
    ["timestamp decimal", [{ method: "recovery", timestamp: T + 0.5 }]],
    ["timestamp zero", [{ method: "recovery", timestamp: 0 }]],
    ["timestamp negativo", [{ method: "recovery", timestamp: -1 }]],
    ["timestamp NaN", [{ method: "recovery", timestamp: Number.NaN }]],
    ["timestamp Infinity", [{ method: "recovery", timestamp: Number.POSITIVE_INFINITY }]],
  ])("%s → malformed", (_label, amr) => {
    expect(checkRecoverySession(claims(amr), NOW)).toEqual({ fresh: false, reason: "malformed" });
  });

  it.each([
    ["formato textual RFC 8176 (sem timestamp)", ["recovery"]],
    ["método com maiúsculas", [{ method: "RECOVERY", timestamp: T }]],
    ["método parecido", [{ method: "recovery ", timestamp: T }]],
    ["entrada nula", [null]],
    ["entrada em lista", [["recovery", T]]],
  ])("%s → recusado", (_label, amr) => {
    expect(isFreshRecoverySession(claims(amr), NOW)).toBe(false);
  });

  it.each([
    ["amr ausente", undefined],
    ["amr objecto", { method: "recovery", timestamp: T }],
    ["amr texto", "recovery"],
  ])("%s → malformed", (_label, amr) => {
    expect(checkRecoverySession(claims(amr), NOW)).toEqual({ fresh: false, reason: "malformed" });
  });

  it.each([
    ["nulo", null],
    ["indefinido", undefined],
    ["texto", "claims"],
    ["lista", []],
    ["sem sub", { session_id: base.session_id, amr: [{ method: "recovery", timestamp: T }] }],
    ["sub vazio", { ...base, sub: "", amr: [{ method: "recovery", timestamp: T }] }],
    ["sem session_id", { sub: base.sub, amr: [{ method: "recovery", timestamp: T }] }],
    [
      "session_id numérico",
      { ...base, session_id: 1, amr: [{ method: "recovery", timestamp: T }] },
    ],
  ])("claims %s → no_claims", (_label, value) => {
    expect(checkRecoverySession(value, NOW)).toEqual({ fresh: false, reason: "no_claims" });
  });

  it("o resultado nunca contém dados dos claims", () => {
    const result = checkRecoverySession(claims([{ method: "password", timestamp: T }]), NOW);
    expect(JSON.stringify(result)).not.toContain(base.sub);
    expect(JSON.stringify(result)).not.toContain(base.session_id);
  });
});
