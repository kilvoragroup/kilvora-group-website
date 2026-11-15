import { describe, expect, it } from "vitest";

import { FIELD_MESSAGES, authFailure, isAccountExistsError, mapAuthError } from "./auth-errors";

const apiError = (code: string, status = 400, message = "detalhe interno do GoTrue") => ({
  name: "AuthApiError",
  code,
  status,
  message,
});

describe("mapAuthError", () => {
  it.each([
    ["invalid_credentials", "invalid_credentials"],
    ["user_banned", "invalid_credentials"],
    ["email_not_confirmed", "email_not_confirmed"],
    ["weak_password", "weak_password"],
    ["same_password", "same_password"],
    ["reauthentication_needed", "reauthentication_needed"],
    ["current_password_required", "recovery_required"],
    ["current_password_invalid", "recovery_required"],
    ["otp_expired", "link_invalid"],
    ["flow_state_not_found", "link_invalid"],
    ["flow_state_expired", "link_invalid"],
    ["bad_code_verifier", "link_invalid"],
    ["session_not_found", "session_missing"],
    ["refresh_token_already_used", "session_missing"],
    ["over_request_rate_limit", "rate_limited"],
    ["over_email_send_rate_limit", "rate_limited"],
    ["signup_disabled", "unavailable"],
    ["request_timeout", "unavailable"],
    ["user_already_exists", "unexpected"],
    ["email_exists", "unexpected"],
    ["codigo_desconhecido", "unexpected"],
    ["toString", "unexpected"],
  ])("código %s → %s", (code, kind) => {
    expect(mapAuthError(apiError(code)).kind).toBe(kind);
  });

  it.each([
    ["AuthRetryableFetchError", "unavailable"],
    ["AuthSessionMissingError", "session_missing"],
    ["AuthPKCECodeVerifierMissingError", "link_invalid"],
    ["AuthPKCEGrantCodeExchangeError", "link_invalid"],
    ["AuthWeakPasswordError", "weak_password"],
  ])("classe %s → %s", (name, kind) => {
    expect(mapAuthError({ name, message: "x" }).kind).toBe(kind);
  });

  it("estado HTTP: 0/5xx → unavailable; 429 → rate_limited", () => {
    expect(mapAuthError({ status: 0 }).kind).toBe("unavailable");
    expect(mapAuthError({ status: 503 }).kind).toBe("unavailable");
    expect(mapAuthError({ status: 429 }).kind).toBe("rate_limited");
    expect(mapAuthError({ status: 418 }).kind).toBe("unexpected");
  });

  it("falha de rede e valores inesperados", () => {
    expect(mapAuthError(new TypeError("fetch failed")).kind).toBe("unavailable");
    for (const value of [null, undefined, "erro", 1, {}]) {
      expect(mapAuthError(value).kind).toBe("unexpected");
    }
  });

  it("utilizador bloqueado é indistinguível de credenciais inválidas", () => {
    expect(mapAuthError(apiError("user_banned"))).toEqual(
      mapAuthError(apiError("invalid_credentials")),
    );
  });

  it("nunca devolve message, status nem código do Auth", () => {
    const secret = "User already registered: ana@example.test";
    for (const code of ["user_already_exists", "invalid_credentials", "weak_password", "xx"]) {
      const text = JSON.stringify(mapAuthError(apiError(code, 422, secret)));
      expect(text).not.toContain("ana@example.test");
      expect(text).not.toContain("registered");
      expect(text).not.toContain("422");
    }
  });

  it("todas as mensagens existem em pt-AO e pt-BR", () => {
    for (const kind of [
      "invalid_input",
      "invalid_credentials",
      "link_invalid",
      "recovery_required",
      "unavailable",
      "unexpected",
    ] as const) {
      const { message } = authFailure(kind);
      expect(message["pt-AO"].length).toBeGreaterThan(0);
      expect(message["pt-BR"].length).toBeGreaterThan(0);
    }
    for (const message of Object.values(FIELD_MESSAGES)) {
      expect(message["pt-AO"].length).toBeGreaterThan(0);
      expect(message["pt-BR"].length).toBeGreaterThan(0);
    }
  });
});

describe("isAccountExistsError", () => {
  it("reconhece só os códigos de conta existente", () => {
    expect(isAccountExistsError(apiError("user_already_exists"))).toBe(true);
    expect(isAccountExistsError(apiError("email_exists"))).toBe(true);
    expect(isAccountExistsError(apiError("invalid_credentials"))).toBe(false);
    expect(isAccountExistsError(null)).toBe(false);
  });
});
