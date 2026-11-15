import { type LocalizedText, v } from "@/content/types";

import type { AuthFieldIssue, FieldErrors } from "./auth-schemas";

/**
 * Tradução dos erros do Supabase Auth (GoTrue / auth-js) para resultados neutros pt-AO/pt-BR.
 *
 * Regras:
 * - Nunca devolver `message`, `status` ou outros detalhes do Auth; só um `kind` de uma lista
 *   fechada e um texto fixo.
 * - Sem enumeração de contas: «utilizador já existe» nunca é mostrado (o serviço de registo
 *   trata-o como sucesso neutro); um utilizador bloqueado recebe o mesmo erro que credenciais
 *   inválidas.
 * - Códigos desconhecidos dão um erro genérico.
 */

export type AuthFailureKind =
  | "invalid_input"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "same_password"
  | "reauthentication_needed"
  | "recovery_required"
  | "link_invalid"
  | "session_missing"
  | "rate_limited"
  | "unavailable"
  | "unexpected";

export type AuthFailure = {
  readonly kind: AuthFailureKind;
  readonly message: LocalizedText;
  readonly fieldErrors?: FieldErrors;
};

export type AuthOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AuthFailure };

const MESSAGES: Readonly<Record<AuthFailureKind, LocalizedText>> = {
  invalid_input: v(
    "Alguns dados não são válidos. Reveja os campos assinalados.",
    "Alguns dados não são válidos. Revise os campos indicados.",
  ),
  invalid_credentials: v("E-mail ou palavra-passe incorrectos.", "E-mail ou senha incorretos."),
  email_not_confirmed: v(
    "Confirme o seu e-mail antes de entrar. Procure a mensagem de confirmação na sua caixa de correio.",
    "Confirme seu e-mail antes de entrar. Procure a mensagem de confirmação na sua caixa de entrada.",
  ),
  weak_password: v(
    "A palavra-passe não cumpre os requisitos de segurança.",
    "A senha não cumpre os requisitos de segurança.",
  ),
  same_password: v(
    "A nova palavra-passe tem de ser diferente da actual.",
    "A nova senha precisa ser diferente da atual.",
  ),
  reauthentication_needed: v(
    "Por segurança, peça um novo link de recuperação e tente novamente.",
    "Por segurança, solicite um novo link de recuperação e tente novamente.",
  ),
  recovery_required: v(
    "Para definir uma nova palavra-passe, use o link de recuperação enviado por e-mail.",
    "Para definir uma nova senha, use o link de recuperação enviado por e-mail.",
  ),
  link_invalid: v(
    "O link é inválido ou expirou. Peça um novo e abra-o neste navegador.",
    "O link é inválido ou expirou. Solicite um novo e abra-o neste navegador.",
  ),
  session_missing: v(
    "A sua sessão terminou. Entre novamente.",
    "Sua sessão terminou. Entre novamente.",
  ),
  rate_limited: v(
    "Demasiadas tentativas. Aguarde alguns minutos e tente novamente.",
    "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  ),
  unavailable: v(
    "O serviço está temporariamente indisponível. Tente novamente dentro de instantes.",
    "O serviço está temporariamente indisponível. Tente novamente em instantes.",
  ),
  unexpected: v(
    "Ocorreu um erro inesperado. Tente novamente.",
    "Ocorreu um erro inesperado. Tente novamente.",
  ),
};

/** Textos dos erros por campo (`AuthFieldIssue`). */
export const FIELD_MESSAGES: Readonly<Record<AuthFieldIssue, LocalizedText>> = {
  required: v("Campo obrigatório.", "Campo obrigatório."),
  invalid_email: v("Indique um e-mail válido.", "Informe um e-mail válido."),
  too_long: v("Texto demasiado longo.", "Texto longo demais."),
  too_short: v(
    "A palavra-passe deve ter pelo menos 12 caracteres.",
    "A senha deve ter pelo menos 12 caracteres.",
  ),
  missing_lowercase: v(
    "Inclua pelo menos uma letra minúscula.",
    "Inclua pelo menos uma letra minúscula.",
  ),
  missing_uppercase: v(
    "Inclua pelo menos uma letra maiúscula.",
    "Inclua pelo menos uma letra maiúscula.",
  ),
  missing_digit: v("Inclua pelo menos um algarismo.", "Inclua pelo menos um número."),
  mismatch: v("As palavras-passe não coincidem.", "As senhas não coincidem."),
  invalid_locale: v("Idioma inválido.", "Idioma inválido."),
};

export function authFailure(kind: AuthFailureKind, fieldErrors?: FieldErrors): AuthFailure {
  return fieldErrors
    ? { kind, message: MESSAGES[kind], fieldErrors }
    : { kind, message: MESSAGES[kind] };
}

/** Códigos do Auth por resultado. Os ausentes caem em `unexpected`. */
const KIND_BY_CODE: Readonly<Record<string, AuthFailureKind>> = {
  invalid_credentials: "invalid_credentials",
  user_banned: "invalid_credentials", // não revelar o bloqueio (procedimento F2)
  email_not_confirmed: "email_not_confirmed",
  weak_password: "weak_password",
  same_password: "same_password",
  reauthentication_needed: "reauthentication_needed",
  reauthentication_not_valid: "reauthentication_needed",
  reauth_nonce_missing: "reauthentication_needed",
  // `require_current_password = true` (R2): uma sessão normal sem a palavra-passe actual é
  // recusada pelo Auth. O portal nunca envia `current_password`; trata-se como «use o link».
  current_password_required: "recovery_required",
  current_password_invalid: "recovery_required",
  otp_expired: "link_invalid",
  flow_state_not_found: "link_invalid",
  flow_state_expired: "link_invalid",
  bad_code_verifier: "link_invalid",
  session_not_found: "session_missing",
  session_expired: "session_missing",
  refresh_token_not_found: "session_missing",
  refresh_token_already_used: "session_missing",
  bad_jwt: "session_missing",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "rate_limited",
  validation_failed: "invalid_input",
  email_address_invalid: "invalid_input",
  signup_disabled: "unavailable",
  email_provider_disabled: "unavailable",
  request_timeout: "unavailable",
  hook_timeout: "unavailable",
  hook_timeout_after_retry: "unavailable",
};

/** Erros de classes do auth-js identificadas pelo `name`. */
const KIND_BY_NAME: Readonly<Record<string, AuthFailureKind>> = {
  AuthRetryableFetchError: "unavailable",
  AuthSessionMissingError: "session_missing",
  AuthPKCECodeVerifierMissingError: "link_invalid",
  AuthPKCEGrantCodeExchangeError: "link_invalid",
  AuthWeakPasswordError: "weak_password",
  AuthInvalidCredentialsError: "invalid_credentials",
};

const ACCOUNT_EXISTS_CODES = new Set(["user_already_exists", "email_exists"]);

function read(source: object, key: string): unknown {
  return (source as Record<string, unknown>)[key];
}

/** O erro indica que o e-mail já tem conta. Nunca deve ser mostrado (enumeração). */
export function isAccountExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = read(error, "code");
  return typeof code === "string" && ACCOUNT_EXISTS_CODES.has(code);
}

export function mapAuthError(error: unknown): AuthFailure {
  if (!error || typeof error !== "object") return authFailure("unexpected");
  if (error instanceof TypeError) return authFailure("unavailable"); // `fetch` falhado

  const code = read(error, "code");
  if (typeof code === "string" && Object.hasOwn(KIND_BY_CODE, code)) {
    return authFailure(KIND_BY_CODE[code]);
  }
  const name = read(error, "name");
  if (typeof name === "string" && Object.hasOwn(KIND_BY_NAME, name)) {
    return authFailure(KIND_BY_NAME[name]);
  }
  const status = read(error, "status");
  if (typeof status === "number" && (status === 0 || status >= 500)) {
    return authFailure("unavailable");
  }
  if (status === 429) return authFailure("rate_limited");
  return authFailure("unexpected");
}
