import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const services = vi.hoisted(() => ({
  createClientTicket: vi.fn(),
  addClientMessage: vi.fn(),
  cancelClientTicket: vi.fn(),
  updateClientProfile: vi.fn(),
  updateClientAccount: vi.fn(),
}));
vi.mock("@/services/portal/client-portal", () => services);

const dal = vi.hoisted(() => ({ checkClientAccess: vi.fn() }));
vi.mock("@/lib/portal/dal", () => dal);

const cache = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => cache);

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`REDIRECT:${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));

import {
  addMessageAction,
  cancelTicketAction,
  createTicketAction,
  updateAccountAction,
  updateProfileAction,
} from "./portal-actions";
import { PORTAL_IDLE } from "./_lib/portal-form-state";

// Valores FICTÍCIOS.
const USER = "00000000-0000-4000-8000-000000000001";
const TICKET = "00000000-0000-4000-8000-00000000000a";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const viewer = (kind: "cliente" | "interno" = "cliente") => ({
  session: { userId: USER, aal: "aal1" },
  profile: { id: USER, kind, status: "activo", fullName: "Ana", locale: "pt-AO" },
  roles: [],
});

const allowed = () => ({ viewer: viewer(), decision: { allowed: true } });

const ACTIONS = [
  [createTicketAction, services.createClientTicket],
  [addMessageAction, services.addClientMessage],
  [cancelTicketAction, services.cancelClientTicket],
  [updateProfileAction, services.updateClientProfile],
  [updateAccountAction, services.updateClientAccount],
] as const;

beforeEach(() => {
  for (const fn of Object.values(services)) fn.mockReset();
  dal.checkClientAccess.mockReset();
  cache.refresh.mockReset();
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
});

afterEach(() => vi.unstubAllEnvs());

describe("barreiras comuns", () => {
  it("portal desligado → erro, sem DAL nem serviço", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    for (const [action, service] of ACTIONS) {
      const state = await action(PORTAL_IDLE, form({}));
      expect(state.status).toBe("error");
      expect(service).not.toHaveBeenCalled();
    }
    expect(dal.checkClientAccess).not.toHaveBeenCalled();
  });

  it("sem sessão → entrada", async () => {
    dal.checkClientAccess.mockResolvedValue({
      viewer: null,
      decision: { allowed: false, reason: "unauthenticated" },
    });
    for (const [action, service] of ACTIONS) {
      await expect(action(PORTAL_IDLE, form({}))).rejects.toThrow("REDIRECT:/cliente/entrar");
      expect(service).not.toHaveBeenCalled();
    }
  });

  it("perfil interno ou suspenso → recusado, sem serviço", async () => {
    for (const reason of ["wrong_kind", "inactive"]) {
      dal.checkClientAccess.mockResolvedValue({
        viewer: viewer("interno"),
        decision: { allowed: false, reason },
      });
      for (const [action, service] of ACTIONS) {
        const state = await action(PORTAL_IDLE, form({}));
        expect(state.status).toBe("error");
        expect(service).not.toHaveBeenCalled();
      }
    }
  });
});

describe("acções", () => {
  it("criar pedido → redirecciona para o detalhe só depois da resposta da base", async () => {
    dal.checkClientAccess.mockResolvedValue(allowed());
    services.createClientTicket.mockResolvedValue({
      ok: true,
      value: { id: TICKET, reference: "KG-2026-000001" },
    });
    await expect(
      createTicketAction(PORTAL_IDLE, form({ type: "consultoria", subject: "A", details: "B" })),
    ).rejects.toThrow(`REDIRECT:/cliente/pedidos/${TICKET}?aviso=criado`);
    expect(services.createClientTicket).toHaveBeenCalledWith(
      { type: "consultoria", planId: "", subject: "A", details: "B" },
      "pt-AO",
    );
  });

  it("erro do serviço → estado de erro com mensagens de campo e valores reenviados", async () => {
    dal.checkClientAccess.mockResolvedValue(allowed());
    services.createClientTicket.mockResolvedValue({
      ok: false,
      error: { kind: "invalid_input", message: { "pt-AO": "ao", "pt-BR": "br" } },
      issues: { subject: "subject" },
    });
    const state = await createTicketAction(PORTAL_IDLE, form({ subject: "ab" }));
    expect(state).toMatchObject({
      status: "error",
      message: "ao",
      values: { subject: "ab" },
    });
    expect(state.status === "error" && state.fieldErrors.subject).toContain("3 e 160");
    expect(cache.refresh).not.toHaveBeenCalled();
  });

  it("mensagem, cancelamento, perfil e conta → actualizam a página após sucesso", async () => {
    dal.checkClientAccess.mockResolvedValue(allowed());
    for (const [action, service] of ACTIONS.slice(1)) {
      service.mockResolvedValue({ ok: true, value: {} });
      const state = await action(PORTAL_IDLE, form({ ticketId: TICKET }));
      expect(state.status).toBe("success");
    }
    expect(cache.refresh).toHaveBeenCalledTimes(4);
    // Perfil e conta usam o id verificado pela DAL, nunca um campo do formulário.
    expect(services.updateClientProfile.mock.calls[0][0]).toBe(USER);
    expect(services.updateClientAccount.mock.calls[0][0]).toBe(USER);
  });
});
