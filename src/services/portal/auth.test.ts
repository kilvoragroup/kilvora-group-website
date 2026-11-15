import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getClaims: vi.fn(),
  updateUser: vi.fn(),
}));
const factory = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    factory.calls += 1;
    return { auth };
  },
}));

import {
  completeEmailLink,
  getRecoveryState,
  requestPasswordRecovery,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "./auth";

// Valores FICTÍCIOS.
const USER = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-0000000000aa";
const PASSWORD = "Fict1ciaSegura";
const apiError = (code: string, status = 400) => ({
  name: "AuthApiError",
  code,
  status,
  message: `detalhe interno ${code}`,
});
const SIGN_UP = {
  fullName: "Ana Fictícia",
  company: "Empresa Fictícia",
  email: " Ana@E2E.Example.Test ",
  password: PASSWORD,
  passwordConfirmation: PASSWORD,
  locale: "pt-BR",
};

function enablePortal() {
  vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_ficticia_teste_000");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100");
}

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  factory.calls = 0;
  enablePortal();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("portal desligado (P1)", () => {
  it.each([
    ["signUp", () => signUp(SIGN_UP)],
    ["signIn", () => signIn({ email: "a@b.test", password: "x" })],
    ["signOut", () => signOut()],
    ["requestPasswordRecovery", () => requestPasswordRecovery({ email: "a@b.test" })],
    ["completeEmailLink", () => completeEmailLink({ code: "abcdefgh-1234" })],
    [
      "updatePassword",
      () => updatePassword({ password: PASSWORD, passwordConfirmation: PASSWORD }),
    ],
  ])("%s → unavailable, sem criar o cliente Supabase", async (_name, run) => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    const result = await run();
    expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    expect(factory.calls).toBe(0);
    for (const fn of Object.values(auth)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("signUp", () => {
  it("envia e-mail normalizado, metadados aprovados e o callback do site configurado", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: USER } }, error: null });
    expect(await signUp(SIGN_UP)).toEqual({ ok: true, value: { status: "check_email" } });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "ana@e2e.example.test",
      password: PASSWORD,
      options: {
        emailRedirectTo: "http://localhost:3100/cliente/auth/confirmar?next=%2Fcliente",
        data: { full_name: "Ana Fictícia", company: "Empresa Fictícia", locale: "pt-BR" },
      },
    });
  });

  it("ENUMERAÇÃO: conta nova e conta existente dão exactamente o mesmo resultado", async () => {
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: USER } }, error: null });
    const created = await signUp(SIGN_UP);
    auth.signUp.mockResolvedValueOnce({
      data: { user: null },
      error: apiError("user_already_exists", 422),
    });
    const exists = await signUp(SIGN_UP);
    auth.signUp.mockResolvedValueOnce({
      data: { user: null },
      error: apiError("email_exists", 422),
    });
    const exists2 = await signUp(SIGN_UP);
    expect(exists).toEqual(created);
    expect(exists2).toEqual(created);
  });

  it("dados inválidos → invalid_input com códigos por campo, sem chamar o Auth", async () => {
    const result = await signUp({ ...SIGN_UP, password: "fraca", passwordConfirmation: "outra" });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalid_input", fieldErrors: { password: "too_short" } },
    });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("nenhuma confirmação fictícia: outros erros do Auth são reportados", async () => {
    for (const [error, kind] of [
      [apiError("weak_password", 422), "weak_password"],
      [apiError("over_email_send_rate_limit", 429), "rate_limited"],
      [apiError("unexpected_failure", 500), "unavailable"],
      [apiError("desconhecido", 400), "unexpected"],
    ] as const) {
      auth.signUp.mockResolvedValueOnce({ data: { user: null }, error });
      expect(await signUp(SIGN_UP)).toMatchObject({ ok: false, error: { kind } });
    }
  });

  it("falha de rede → unavailable", async () => {
    auth.signUp.mockRejectedValue(new TypeError("fetch failed"));
    expect(await signUp(SIGN_UP)).toMatchObject({ ok: false, error: { kind: "unavailable" } });
  });

  it("NEXT_PUBLIC_SITE_URL inseguro → unavailable, sem chamar o Auth", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://kilvoragroup.com");
    expect(await signUp(SIGN_UP)).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe("signIn", () => {
  it("sucesso devolve só o id", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: USER, email: "a@b.test" }, session: { access_token: "x" } },
      error: null,
    });
    expect(await signIn({ email: " A@B.test ", password: PASSWORD })).toEqual({
      ok: true,
      value: { userId: USER },
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.test", password: PASSWORD });
  });

  it("credenciais erradas e utilizador bloqueado são indistinguíveis", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: apiError("invalid_credentials"),
    });
    const wrong = await signIn({ email: "a@b.test", password: "x" });
    auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: apiError("user_banned") });
    const banned = await signIn({ email: "a@b.test", password: "x" });
    expect(wrong).toMatchObject({ ok: false, error: { kind: "invalid_credentials" } });
    expect(banned).toEqual(wrong);
  });

  it("e-mail por confirmar, limite e sessão em falta", async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: apiError("email_not_confirmed"),
    });
    expect(await signIn({ email: "a@b.test", password: "x" })).toMatchObject({
      error: { kind: "email_not_confirmed" },
    });
    auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: apiError("over_request_rate_limit", 429),
    });
    expect(await signIn({ email: "a@b.test", password: "x" })).toMatchObject({
      error: { kind: "rate_limited" },
    });
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: USER }, session: null },
      error: null,
    });
    expect(await signIn({ email: "a@b.test", password: "x" })).toMatchObject({
      error: { kind: "unexpected" },
    });
  });
});

describe("signOut", () => {
  it("termina só a sessão local", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    expect(await signOut()).toEqual({ ok: true, value: null });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("sem sessão também é sucesso", async () => {
    auth.signOut.mockResolvedValue({ error: { name: "AuthSessionMissingError", message: "x" } });
    expect(await signOut()).toEqual({ ok: true, value: null });
  });

  it("indisponibilidade é reportada", async () => {
    auth.signOut.mockResolvedValue({ error: apiError("x", 503) });
    expect(await signOut()).toMatchObject({ ok: false, error: { kind: "unavailable" } });
  });
});

describe("requestPasswordRecovery", () => {
  it("usa o callback com destino de nova palavra-passe", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    expect(await requestPasswordRecovery({ email: " A@B.TEST " })).toEqual({
      ok: true,
      value: { status: "check_email" },
    });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.test", {
      redirectTo:
        "http://localhost:3100/cliente/auth/confirmar?next=%2Fcliente%2Fnova-palavra-passe",
    });
  });

  it("ENUMERAÇÃO: sucesso, limite por endereço e erros do Auth dão o mesmo resultado", async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const neutral = await requestPasswordRecovery({ email: "a@b.test" });
    for (const error of [
      apiError("over_email_send_rate_limit", 429),
      apiError("user_not_found", 404),
      apiError("desconhecido", 400),
    ]) {
      auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error });
      expect(await requestPasswordRecovery({ email: "a@b.test" })).toEqual(neutral);
    }
  });

  it("só a validação e a indisponibilidade são reportadas", async () => {
    expect(await requestPasswordRecovery({ email: "invalido" })).toMatchObject({
      error: { kind: "invalid_input" },
    });
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: apiError("x", 503) });
    expect(await requestPasswordRecovery({ email: "a@b.test" })).toMatchObject({
      error: { kind: "unavailable" },
    });
  });
});

const nowSeconds = () => Math.floor(Date.now() / 1000);
const recoveryClaims = (age = 5) => ({
  sub: USER,
  session_id: SESSION,
  aal: "aal1",
  amr: [{ method: "recovery", timestamp: nowSeconds() - age }],
});
const normalClaims = () => ({
  sub: USER,
  session_id: SESSION,
  aal: "aal1",
  amr: [{ method: "password", timestamp: nowSeconds() - 5 }],
});
const CODE = "0f9c2b3a-1d2e-4f5a-8b6c-7d8e9f0a1b2c";

describe("completeEmailLink", () => {
  it("PKCE de confirmação → confirmation (claims verificados sem recuperação)", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "jwt" }, redirectType: null },
      error: null,
    });
    auth.getClaims.mockResolvedValue({ data: { claims: normalClaims() }, error: null });
    expect(await completeEmailLink({ code: CODE })).toEqual({
      ok: true,
      value: { flow: "confirmation" },
    });
    expect(auth.getClaims).toHaveBeenCalledWith("jwt");
  });

  it("PKCE de recuperação com amr recovery recente → recovery", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "jwt-novo" }, redirectType: "recovery" },
      error: null,
    });
    auth.getClaims.mockResolvedValue({ data: { claims: recoveryClaims() }, error: null });
    expect(await completeEmailLink({ code: CODE })).toEqual({
      ok: true,
      value: { flow: "recovery" },
    });
    expect(auth.getClaims).toHaveBeenCalledWith("jwt-novo");
  });

  it("indicação de recuperação sem prova nos claims → link_invalid (falha fechada)", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "jwt" }, redirectType: "recovery" },
      error: null,
    });
    auth.getClaims.mockResolvedValue({ data: { claims: normalClaims() }, error: null });
    expect(await completeEmailLink({ code: CODE })).toMatchObject({
      ok: false,
      error: { kind: "link_invalid" },
    });
  });

  it("a decisão é dos claims, não da indicação do cliente", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "jwt" }, redirectType: null },
      error: null,
    });
    auth.getClaims.mockResolvedValue({ data: { claims: recoveryClaims() }, error: null });
    expect(await completeEmailLink({ code: CODE })).toEqual({
      ok: true,
      value: { flow: "recovery" },
    });
  });

  it("token_hash + type=recovery usa verifyOtp e exige a prova nos claims", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: "jwt" } }, error: null });
    auth.getClaims.mockResolvedValueOnce({ data: { claims: recoveryClaims() }, error: null });
    expect(
      await completeEmailLink({ tokenHash: "pkce_abcdef0123456789", type: "recovery" }),
    ).toEqual({ ok: true, value: { flow: "recovery" } });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "pkce_abcdef0123456789",
      type: "recovery",
    });
    auth.getClaims.mockResolvedValueOnce({ data: { claims: recoveryClaims(601) }, error: null });
    expect(
      await completeEmailLink({ tokenHash: "pkce_abcdef0123456789", type: "recovery" }),
    ).toMatchObject({ ok: false, error: { kind: "link_invalid" } });
  });

  it("claims não verificáveis → link_invalid", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "jwt" }, redirectType: null },
      error: null,
    });
    auth.getClaims.mockResolvedValue({ data: null, error: { name: "AuthInvalidJwtError" } });
    expect(await completeEmailLink({ code: CODE })).toMatchObject({
      error: { kind: "link_invalid" },
    });
  });

  it.each([
    [{}],
    [{ code: "curto" }],
    [{ code: "com espaço e símbolos!!" }],
    [{ code: "0f9c2b3a-1d2e", tokenHash: "abcdef0123456789", type: "signup" }],
    [{ tokenHash: "abcdef0123456789" }],
    [{ tokenHash: "abcdef0123456789", type: "invite" }],
    [{ tokenHash: "abcdef0123456789", type: "magiclink" }],
    [{ tokenHash: "<script>", type: "signup" }],
  ])("parâmetros inválidos %j → link_invalid, sem chamar o Auth", async (params) => {
    expect(await completeEmailLink(params)).toMatchObject({
      ok: false,
      error: { kind: "link_invalid" },
    });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: "AuthApiError", code: "flow_state_expired", status: 400 }, "link_invalid"],
    [{ name: "AuthApiError", code: "otp_expired", status: 403 }, "link_invalid"],
    [{ name: "AuthPKCECodeVerifierMissingError", message: "x" }, "link_invalid"],
    [{ name: "AuthApiError", code: "invalid_credentials", status: 400 }, "link_invalid"],
    [{ name: "AuthApiError", code: "x", status: 503 }, "unavailable"],
  ])("erro do Auth %# → %s", async (error, kind) => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error });
    expect(await completeEmailLink({ code: "0f9c2b3a-1d2e-4f5a" })).toMatchObject({
      error: { kind },
    });
  });
});

describe("updatePassword", () => {
  const input = { password: PASSWORD, passwordConfirmation: PASSWORD };

  it("sem sessão verificada → session_missing", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });
    expect(await updatePassword(input)).toMatchObject({ error: { kind: "session_missing" } });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("SESSÃO NORMAL recusada sem chamar o Auth", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: normalClaims() }, error: null });
    expect(await updatePassword(input)).toMatchObject({ error: { kind: "recovery_required" } });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("RECUPERAÇÃO EXPIRADA (601 s) recusada", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: recoveryClaims(601) }, error: null });
    expect(await updatePassword(input)).toMatchObject({ error: { kind: "recovery_required" } });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["amr no futuro", { ...recoveryClaims(), amr: [{ method: "recovery", timestamp: 9e9 }] }],
    ["amr textual sem timestamp", { ...recoveryClaims(), amr: ["recovery"] }],
    ["amr ausente", { sub: USER, session_id: SESSION }],
    ["sem session_id", { sub: USER, amr: recoveryClaims().amr }],
  ])("CLAIMS falsificados/incompletos (%s) recusados", async (_label, claims) => {
    auth.getClaims.mockResolvedValue({ data: { claims }, error: null });
    expect(await updatePassword(input)).toMatchObject({ error: { kind: "recovery_required" } });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("RECUPERAÇÃO RECENTE aceite: altera e termina a sessão local", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: recoveryClaims(30) }, error: null });
    auth.updateUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    expect(await updatePassword(input)).toEqual({ ok: true, value: null });
    expect(auth.getClaims).toHaveBeenCalledWith();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: PASSWORD });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each([
    [apiError("same_password", 422), "same_password"],
    [apiError("weak_password", 422), "weak_password"],
    [apiError("reauthentication_needed", 400), "reauthentication_needed"],
    [apiError("current_password_required", 400), "recovery_required"],
  ])("erro do Auth %# → %s, sem terminar a sessão", async (error, kind) => {
    auth.getClaims.mockResolvedValue({ data: { claims: recoveryClaims() }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error });
    expect(await updatePassword(input)).toMatchObject({ error: { kind } });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("política aplicada antes do Auth", async () => {
    expect(
      await updatePassword({ password: "fraca", passwordConfirmation: "fraca" }),
    ).toMatchObject({ error: { kind: "invalid_input" } });
    expect(auth.getClaims).not.toHaveBeenCalled();
  });
});

describe("regras de código", () => {
  const source = readFileSync(join(process.cwd(), "src/services/portal/auth.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("os serviços nunca chamam redirect() nem importam next/navigation", () => {
    expect(code).not.toMatch(/next\/navigation|\bredirect\(/);
  });

  it("sem chaves privilegiadas nem acesso directo à base", () => {
    expect(code).not.toMatch(
      /service_role|sb_secret_|SERVICE_ROLE|\.from\(|\.rpc\(|createClient\(/,
    );
  });

  it("sem marca de recuperação da aplicação nem cookies próprios", () => {
    expect(code).not.toMatch(/recovery-marker|RecoveryMarker|cookies\(|kg-portal-recovery/);
  });
});

describe("getRecoveryState", () => {
  it("portal desligado → unavailable, sem cliente", async () => {
    vi.stubEnv("NEXT_PUBLIC_PORTAL_ENABLED", "");
    expect(await getRecoveryState()).toBe("unavailable");
    expect(factory.calls).toBe(0);
  });

  it("sem claims verificados → session_missing", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: { name: "AuthSessionMissingError" } });
    expect(await getRecoveryState()).toBe("session_missing");
  });

  it("sessão normal → recovery_required", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: normalClaims() }, error: null });
    expect(await getRecoveryState()).toBe("recovery_required");
  });

  it("recuperação expirada → recovery_required", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: recoveryClaims(601) }, error: null });
    expect(await getRecoveryState()).toBe("recovery_required");
  });

  it("recuperação recente → ready", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: recoveryClaims(10) }, error: null });
    expect(await getRecoveryState()).toBe("ready");
  });

  it("falha de rede → unavailable", async () => {
    auth.getClaims.mockRejectedValue(new TypeError("fetch failed"));
    expect(await getRecoveryState()).toBe("unavailable");
  });
});
