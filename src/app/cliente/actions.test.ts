import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const services = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  updatePassword: vi.fn(),
}));
vi.mock("@/services/portal/auth", () => services);

/** `redirect()` do Next lança um erro de controlo; simulado aqui com o destino. */
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
  newPasswordAction,
  recoveryAction,
  signInAction,
  signOutAction,
  signUpAction,
} from "./actions";
import { IDLE_STATE } from "./_lib/form-state";

// Valores FICTÍCIOS.
const PASSWORD = "Fict1ciaSegura";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const failure = (kind: string, fieldErrors?: Record<string, string>) => ({
  ok: false,
  error: { kind, message: { "pt-AO": `msg-ao-${kind}`, "pt-BR": `msg-br-${kind}` }, fieldErrors },
});

function enablePortal() {
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
}

beforeEach(() => {
  for (const fn of Object.values(services)) fn.mockReset();
  enablePortal();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RedirectSignal);
  return (error as RedirectSignal).location;
}

describe("portal desligado (P1)", () => {
  it.each([
    ["signInAction", () => signInAction(IDLE_STATE, form({ email: "a@b.test", password: "x" }))],
    ["signUpAction", () => signUpAction(IDLE_STATE, form({}))],
    ["recoveryAction", () => recoveryAction(IDLE_STATE, form({ email: "a@b.test" }))],
    ["newPasswordAction", () => newPasswordAction(IDLE_STATE, form({}))],
  ])("%s → indisponível, sem chamar o serviço", async (_name, run) => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    const state = await run();
    expect(state).toMatchObject({ status: "error" });
    expect((state as { message: string }).message).toMatch(/indisponível/);
    for (const fn of Object.values(services)) expect(fn).not.toHaveBeenCalled();
  });

  it("signOutAction → não faz nada nem redirecciona", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    await expect(signOutAction()).resolves.toBeUndefined();
    expect(services.signOut).not.toHaveBeenCalled();
  });
});

describe("signInAction", () => {
  it("sucesso → redirecciona para o destino seguro", async () => {
    services.signIn.mockResolvedValue({ ok: true, value: { userId: "u" } });
    const location = await redirectOf(
      signInAction(
        IDLE_STATE,
        form({ email: "a@b.test", password: PASSWORD, next: "/cliente/pedidos" }),
      ),
    );
    expect(location).toBe("/cliente/pedidos");
    expect(services.signIn).toHaveBeenCalledWith({ email: "a@b.test", password: PASSWORD });
  });

  it.each([
    "https://evil.example/cliente",
    "//evil.example",
    "/\\evil.example",
    "/cliente/../contactos",
    "/contactos",
    "",
  ])("REDIRECCIONAMENTO externo/inválido %j → /cliente", async (next) => {
    services.signIn.mockResolvedValue({ ok: true, value: { userId: "u" } });
    expect(
      await redirectOf(signInAction(IDLE_STATE, form({ email: "a@b.test", password: "x", next }))),
    ).toBe("/cliente");
  });

  it("redirect() não é engolido por try/catch (o sinal propaga-se)", async () => {
    services.signIn.mockResolvedValue({ ok: true, value: { userId: "u" } });
    await expect(
      signInAction(IDLE_STATE, form({ email: "a", password: "b" })),
    ).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("erro → mensagem resolvida, e-mail mantido, palavra-passe NUNCA devolvida", async () => {
    services.signIn.mockResolvedValue(failure("invalid_credentials"));
    const state = await signInAction(IDLE_STATE, form({ email: "a@b.test", password: PASSWORD }));
    expect(state).toEqual({
      status: "error",
      message: "msg-ao-invalid_credentials",
      fieldErrors: {},
      values: { email: "a@b.test" },
    });
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });

  it("erros por campo são traduzidos (códigos fechados → texto)", async () => {
    services.signIn.mockResolvedValue(failure("invalid_input", { email: "invalid_email" }));
    const state = await signInAction(IDLE_STATE, form({ email: "x", password: "" }));
    expect(state).toMatchObject({ fieldErrors: { email: "Indique um e-mail válido." } });
  });
});

describe("signUpAction", () => {
  const data = {
    fullName: "Ana Fictícia",
    company: "",
    email: "ana@e2e.example.test",
    password: PASSWORD,
    passwordConfirmation: PASSWORD,
    locale: "pt-BR",
  };

  it("idioma vem do servidor, não do formulário", async () => {
    services.signUp.mockResolvedValue({ ok: true, value: { status: "check_email" } });
    await signUpAction(IDLE_STATE, form(data));
    expect(services.signUp).toHaveBeenCalledWith(expect.objectContaining({ locale: "pt-AO" }));
  });

  it("SEM ENUMERAÇÃO: sucesso tem mensagem condicional, idêntica para qualquer e-mail", async () => {
    services.signUp.mockResolvedValue({ ok: true, value: { status: "check_email" } });
    const a = await signUpAction(IDLE_STATE, form(data));
    const b = await signUpAction(IDLE_STATE, form({ ...data, email: "outro@e2e.example.test" }));
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: "success" });
    const message = (a as { message: string }).message;
    expect(message).toMatch(/^Pedido de registo recebido\. Se o endereço puder ser usado/);
    expect(message).not.toMatch(/já existe|não existe|registad[oa] com sucesso/i);
  });

  it("erro → sem palavras-passe no estado", async () => {
    services.signUp.mockResolvedValue(failure("weak_password"));
    const state = await signUpAction(IDLE_STATE, form(data));
    expect(state).toMatchObject({
      status: "error",
      values: { email: data.email, fullName: data.fullName, company: "" },
    });
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });
});

describe("recoveryAction", () => {
  it("resposta neutra e condicional", async () => {
    services.requestPasswordRecovery.mockResolvedValue({
      ok: true,
      value: { status: "check_email" },
    });
    const state = await recoveryAction(IDLE_STATE, form({ email: "a@b.test" }));
    expect(state).toMatchObject({ status: "success" });
    expect((state as { message: string }).message).toMatch(/^Se existir uma conta com este e-mail/);
  });

  it("indisponibilidade é reportada", async () => {
    services.requestPasswordRecovery.mockResolvedValue(failure("unavailable"));
    expect(await recoveryAction(IDLE_STATE, form({ email: "a@b.test" }))).toMatchObject({
      status: "error",
    });
  });
});

describe("newPasswordAction", () => {
  const data = { password: PASSWORD, passwordConfirmation: PASSWORD };

  it("SESSÃO NORMAL recusada pelo serviço → mensagem, sem redireccionar", async () => {
    services.updatePassword.mockResolvedValue(failure("recovery_required"));
    const state = await newPasswordAction(IDLE_STATE, form(data));
    expect(state).toMatchObject({ status: "error", message: "msg-ao-recovery_required" });
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
  });

  it("sucesso → entrada com aviso de palavra-passe alterada", async () => {
    services.updatePassword.mockResolvedValue({ ok: true, value: null });
    expect(await redirectOf(newPasswordAction(IDLE_STATE, form(data)))).toBe(
      "/cliente/entrar?aviso=palavra-passe-alterada",
    );
    expect(services.updatePassword).toHaveBeenCalledWith(data);
  });
});

describe("signOutAction", () => {
  it("sucesso → entrada com aviso de sessão terminada", async () => {
    services.signOut.mockResolvedValue({ ok: true, value: null });
    expect(await redirectOf(signOutAction())).toBe("/cliente/entrar?aviso=sessao-terminada");
  });

  it("falha → aviso de indisponibilidade", async () => {
    services.signOut.mockResolvedValue(failure("unavailable"));
    expect(await redirectOf(signOutAction())).toBe("/cliente/entrar?aviso=indisponivel");
  });

  it("não aceita argumentos (só POST por formulário)", () => {
    expect(signOutAction.length).toBe(0);
  });
});

describe("regras de código", () => {
  const source = readFileSync(join(process.cwd(), "src/app/cliente/actions.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("é um módulo de Server Actions", () => {
    expect(source.startsWith('"use server";')).toBe(true);
  });

  it("todas as acções chamam a barreira do portal", () => {
    const actions = code.match(/export async function \w+/g) ?? [];
    expect(actions).toHaveLength(5);
    expect(code.match(/portalUnavailable\(\)/g)?.length).toBe(1 + 5);
    expect(code).toContain("assertPortalEnabled()");
  });

  it("nenhum redirect() dentro de try", () => {
    const tryBlocks = code.match(/try \{[\s\S]*?\}\s*catch/g) ?? [];
    for (const block of tryBlocks) expect(block).not.toContain("redirect(");
  });

  it("sem acesso directo ao Supabase nem chaves privilegiadas", () => {
    expect(code).not.toMatch(/@supabase|createSupabase|service_role|sb_secret_|\.rpc\(|\.from\(/);
  });
});
