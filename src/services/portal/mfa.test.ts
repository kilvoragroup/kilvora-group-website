import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mfa = vi.hoisted(() => ({
  listFactors: vi.fn(),
  unenroll: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
}));
const factory = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    factory.calls += 1;
    return { auth: { mfa } };
  },
}));

import { getVerifiedTotpFactor, startTotpEnrollment, verifyTotp } from "./mfa";

// Valores FICTÍCIOS.
const FACTOR = "00000000-0000-4000-8000-0000000000f1";
const OLD = "00000000-0000-4000-8000-0000000000f0";
const factors = (all: { id: string; status: string }[]) => ({
  data: {
    all: all.map((f) => ({ ...f, factor_type: "totp" })),
    totp: all.filter((f) => f.status === "verified").map((f) => ({ ...f, factor_type: "totp" })),
  },
  error: null,
});

beforeEach(() => {
  for (const fn of Object.values(mfa)) fn.mockReset();
  factory.calls = 0;
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
});

afterEach(() => vi.unstubAllEnvs());

describe("MFA TOTP", () => {
  it("portal desligado → indisponível, sem cliente", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    expect(await getVerifiedTotpFactor()).toEqual({ ok: false, error: "unavailable" });
    expect(await startTotpEnrollment()).toEqual({ ok: false, error: "unavailable" });
    expect(factory.calls).toBe(0);
  });

  it("inscrição: remove factores não verificados e devolve QR e chave", async () => {
    mfa.listFactors.mockResolvedValue(factors([{ id: OLD, status: "unverified" }]));
    mfa.unenroll.mockResolvedValue({ data: { id: OLD }, error: null });
    mfa.enroll.mockResolvedValue({
      data: { id: FACTOR, totp: { qr_code: "data:image/svg+xml;qr", secret: "SEGREDO", uri: "x" } },
      error: null,
    });
    expect(await startTotpEnrollment()).toEqual({
      ok: true,
      value: { factorId: FACTOR, qrCode: "data:image/svg+xml;qr", secret: "SEGREDO" },
    });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: OLD });
    expect(mfa.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "Consola KILVORA",
    });
  });

  it("inscrição recusada se já existir factor verificado", async () => {
    mfa.listFactors.mockResolvedValue(factors([{ id: FACTOR, status: "verified" }]));
    expect(await startTotpEnrollment()).toEqual({ ok: false, error: "failed" });
    expect(mfa.enroll).not.toHaveBeenCalled();
    expect(await getVerifiedTotpFactor()).toEqual({ ok: true, value: { factorId: FACTOR } });
  });

  it("verificação: código ou factor inválidos → sem chamada ao Auth", async () => {
    expect(await verifyTotp({ factorId: FACTOR, code: "12a456" })).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect(await verifyTotp({ factorId: "x", code: "123456" })).toEqual({
      ok: false,
      error: "invalid_code",
    });
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("verificação: erro do Auth → invalid_code sem detalhes; sucesso → aal2", async () => {
    mfa.challengeAndVerify.mockResolvedValueOnce({
      data: null,
      error: { code: "mfa_verification_failed", message: "detalhe interno" },
    });
    expect(await verifyTotp({ factorId: FACTOR, code: "123456" })).toEqual({
      ok: false,
      error: "invalid_code",
    });
    mfa.challengeAndVerify.mockResolvedValueOnce({ data: {}, error: null });
    expect(await verifyTotp({ factorId: FACTOR, code: "123 456" })).toEqual({
      ok: true,
      value: { aal2: true },
    });
    expect(mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: FACTOR, code: "123456" });
  });
});
