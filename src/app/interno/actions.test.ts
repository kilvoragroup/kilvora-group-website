import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const console_ = vi.hoisted(() => ({
  addStaffMessage: vi.fn(),
  addInternalNote: vi.fn(),
  changeStaffTicketStatus: vi.fn(),
}));
vi.mock("@/services/portal/staff-console", () => console_);

const mfa = vi.hoisted(() => ({ startTotpEnrollment: vi.fn(), verifyTotp: vi.fn() }));
vi.mock("@/services/portal/mfa", () => mfa);

const dal = vi.hoisted(() => ({
  checkStaffAccess: vi.fn(),
  consolePaths: { home: "/interno", mfa: "/interno/mfa" },
}));
vi.mock("@/lib/portal/dal", () => dal);

const cache = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => cache);
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`REDIRECT:${location}`);
  },
}));

import {
  internalNoteAction,
  staffMessageAction,
  startEnrollmentAction,
  transitionAction,
  verifyTotpAction,
} from "./actions";
import { PORTAL_IDLE } from "../cliente/_lib/portal-form-state";
import { MFA_IDLE } from "./_lib/mfa-state";

const decision = (allowed: boolean, reason?: string) => ({
  viewer: null,
  decision: allowed ? { allowed: true } : { allowed: false, reason },
});

const WRITE_ACTIONS = [
  [staffMessageAction, console_.addStaffMessage],
  [internalNoteAction, console_.addInternalNote],
  [transitionAction, console_.changeStaffTicketStatus],
] as const;

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  for (const fn of [...Object.values(console_), ...Object.values(mfa)]) fn.mockReset();
  dal.checkStaffAccess.mockReset();
  cache.refresh.mockReset();
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
});

afterEach(() => vi.unstubAllEnvs());

describe("acções de escrita da consola", () => {
  it("portal desligado → erro sem DAL nem serviço", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    for (const [action, service] of WRITE_ACTIONS) {
      expect((await action(PORTAL_IDLE, form())).status).toBe("error");
      expect(service).not.toHaveBeenCalled();
    }
    expect(dal.checkStaffAccess).not.toHaveBeenCalled();
  });

  it("staff sem aal2 → verificação TOTP; sem sessão → entrada", async () => {
    for (const [action, service] of WRITE_ACTIONS) {
      dal.checkStaffAccess.mockResolvedValueOnce(decision(false, "mfa_required"));
      await expect(action(PORTAL_IDLE, form())).rejects.toThrow("REDIRECT:/interno/mfa");
      dal.checkStaffAccess.mockResolvedValueOnce(decision(false, "unauthenticated"));
      await expect(action(PORTAL_IDLE, form())).rejects.toThrow("REDIRECT:/cliente/entrar");
      expect(service).not.toHaveBeenCalled();
    }
  });

  it("cliente ou interno sem papel → recusado, sem serviço", async () => {
    for (const reason of ["wrong_kind", "role_missing", "inactive"]) {
      dal.checkStaffAccess.mockResolvedValue(decision(false, reason));
      for (const [action, service] of WRITE_ACTIONS) {
        expect((await action(PORTAL_IDLE, form())).status).toBe("error");
        expect(service).not.toHaveBeenCalled();
      }
    }
  });

  it("autorizado → serviço e actualização da página só após sucesso", async () => {
    dal.checkStaffAccess.mockResolvedValue(decision(true));
    for (const [action, service] of WRITE_ACTIONS) {
      service.mockResolvedValueOnce({ ok: true, value: {} });
      expect((await action(PORTAL_IDLE, form({ ticketId: "x" }))).status).toBe("success");
    }
    expect(cache.refresh).toHaveBeenCalledTimes(3);
  });
});

describe("acções de MFA", () => {
  it("staff já com aal2 → consola; não staff → erro sem serviço", async () => {
    dal.checkStaffAccess.mockResolvedValueOnce(decision(true));
    await expect(startEnrollmentAction()).rejects.toThrow("REDIRECT:/interno");
    dal.checkStaffAccess.mockResolvedValueOnce(decision(false, "wrong_kind"));
    expect((await startEnrollmentAction()).status).toBe("error");
    dal.checkStaffAccess.mockResolvedValueOnce(decision(false, "wrong_kind"));
    expect((await verifyTotpAction(MFA_IDLE, form({ code: "123456" }))).status).toBe("error");
    expect(mfa.startTotpEnrollment).not.toHaveBeenCalled();
    expect(mfa.verifyTotp).not.toHaveBeenCalled();
  });

  it("inscrição e verificação para staff a quem falta o aal2", async () => {
    dal.checkStaffAccess.mockResolvedValue(decision(false, "mfa_required"));
    mfa.startTotpEnrollment.mockResolvedValue({
      ok: true,
      value: { factorId: "f", qrCode: "qr", secret: "s" },
    });
    expect(await startEnrollmentAction()).toEqual({
      status: "enrolling",
      factorId: "f",
      qrCode: "qr",
      secret: "s",
    });
    mfa.verifyTotp.mockResolvedValueOnce({ ok: false, error: "invalid_code" });
    expect((await verifyTotpAction(MFA_IDLE, form({ factorId: "f", code: "000000" }))).status).toBe(
      "error",
    );
    mfa.verifyTotp.mockResolvedValueOnce({ ok: true, value: { aal2: true } });
    await expect(
      verifyTotpAction(MFA_IDLE, form({ factorId: "f", code: "123456" })),
    ).rejects.toThrow("REDIRECT:/interno");
  });
});
