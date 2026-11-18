import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const admin = vi.hoisted(() => ({
  assignTicket: vi.fn(),
  reopenTicket: vi.fn(),
  changeRole: vi.fn(),
  setProfileStatus: vi.fn(),
  provisionStaff: vi.fn(),
  cancelProvisioning: vi.fn(),
  getProvisioningStatus: vi.fn(),
  removeMisclassifiedRegistration: vi.fn(),
}));
vi.mock("@/services/portal/admin", () => admin);

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
  assignAction,
  cancelProvisioningAction,
  provisionAction,
  provisioningStatusAction,
  removeMisclassifiedAction,
  reopenAction,
  roleAction,
  statusAction,
} from "./admin-actions";
import { PORTAL_IDLE } from "../cliente/_lib/portal-form-state";

const ACTIONS = [
  [assignAction, admin.assignTicket],
  [reopenAction, admin.reopenTicket],
  [roleAction, admin.changeRole],
  [statusAction, admin.setProfileStatus],
  [provisionAction, admin.provisionStaff],
  [cancelProvisioningAction, admin.cancelProvisioning],
  [provisioningStatusAction, admin.getProvisioningStatus],
  [removeMisclassifiedAction, admin.removeMisclassifiedRegistration],
] as const;

const decision = (allowed: boolean, reason?: string) => ({
  viewer: null,
  decision: allowed ? { allowed: true } : { allowed: false, reason },
});

beforeEach(() => {
  for (const fn of Object.values(admin)) fn.mockReset();
  dal.checkStaffAccess.mockReset();
  cache.refresh.mockReset();
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
});

afterEach(() => vi.unstubAllEnvs());

describe("acções da administração", () => {
  it("exigem o papel admin na DAL", async () => {
    dal.checkStaffAccess.mockResolvedValue(decision(true));
    admin.assignTicket.mockResolvedValue({ ok: true, value: true });
    await assignAction(PORTAL_IDLE, new FormData());
    expect(dal.checkStaffAccess).toHaveBeenCalledWith(["admin"]);
  });

  it("operador (role_missing), cliente ou suspenso → recusa sem serviço", async () => {
    for (const reason of ["role_missing", "wrong_kind", "inactive"]) {
      dal.checkStaffAccess.mockResolvedValue(decision(false, reason));
      for (const [action, service] of ACTIONS) {
        expect((await action(PORTAL_IDLE, new FormData())).status).toBe("error");
        expect(service).not.toHaveBeenCalled();
      }
    }
  });

  it("sem aal2 → MFA; sem sessão → entrada; portal desligado → erro", async () => {
    dal.checkStaffAccess.mockResolvedValueOnce(decision(false, "mfa_required"));
    await expect(roleAction(PORTAL_IDLE, new FormData())).rejects.toThrow("REDIRECT:/interno/mfa");
    dal.checkStaffAccess.mockResolvedValueOnce(decision(false, "unauthenticated"));
    await expect(roleAction(PORTAL_IDLE, new FormData())).rejects.toThrow(
      "REDIRECT:/cliente/entrar",
    );
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    expect((await roleAction(PORTAL_IDLE, new FormData())).status).toBe("error");
    expect(admin.changeRole).not.toHaveBeenCalled();
  });

  it("sucesso → actualiza a página; o provisionamento mostra o id a guardar", async () => {
    dal.checkStaffAccess.mockResolvedValue(decision(true));
    admin.provisionStaff.mockResolvedValue({ ok: true, value: { id: 41 } });
    const state = await provisionAction(PORTAL_IDLE, new FormData());
    expect(state.status === "success" && state.message).toContain("41");
    expect(cache.refresh).toHaveBeenCalledTimes(1);
  });
});
