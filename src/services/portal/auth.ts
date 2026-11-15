import "server-only";

import {
  type AuthFailure,
  type AuthOutcome,
  authFailure,
  isAccountExistsError,
  mapAuthError,
} from "@/domain/portal/auth-errors";
import {
  fieldErrorsOf,
  newPasswordSchema,
  recoveryRequestSchema,
  signInSchema,
  signUpSchema,
} from "@/domain/portal/auth-schemas";
import { NEW_PASSWORD_PATH, PORTAL_HOME, authCallbackUrl } from "@/lib/portal/auth-urls";
import { assertPortalEnabled } from "@/lib/portal/portal-guard";
import { isFreshRecoverySession } from "@/lib/portal/recovery-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Casos de uso da autenticação do portal (A2). Independentes da interface.
 *
 * - Usam só o cliente Supabase de servidor existente (chave publishable + cookies do
 *   utilizador). Nenhuma chave privilegiada, nenhuma consulta directa à base.
 * - Devolvem sempre um `AuthOutcome`; nunca lançam por erros esperados e NUNCA chamam
 *   `redirect()`: a acção (B3) decide a navegação depois de receber o resultado, fora de
 *   qualquer `try/catch`.
 * - Cada serviço verifica primeiro o interruptor do portal (P1): desligado → `unavailable`,
 *   sem criar o cliente Supabase.
 * - Sem enumeração de contas no registo e na recuperação.
 * - MFA fica fora da A2 (P5).
 * - Recuperação (R2): a prova é o claim `amr` `recovery` do JWT verificado pelo Auth
 *   (`isFreshRecoverySession`), nunca uma marca da aplicação. Na plataforma,
 *   `require_current_password = true` impede sessões normais de mudar a palavra-passe na API.
 */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const ok = <T>(value: T): AuthOutcome<T> => ({ ok: true, value });
const fail = <T>(error: AuthFailure): AuthOutcome<T> => ({ ok: false, error });

/** Interruptor e cliente. `null` → o serviço devolve `unavailable`. */
async function openClient(): Promise<ServerClient | null> {
  try {
    assertPortalEnabled();
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

/** Resultado neutro de registo e recuperação: nunca revela se o e-mail tem conta. */
export type CheckEmail = { readonly status: "check_email" };
const CHECK_EMAIL: CheckEmail = { status: "check_email" };

export async function signUp(raw: unknown): Promise<AuthOutcome<CheckEmail>> {
  const client = await openClient();
  if (!client) return fail(authFailure("unavailable"));

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return fail(authFailure("invalid_input", fieldErrorsOf(parsed.error)));
  const input = parsed.data;

  let emailRedirectTo: string;
  try {
    emailRedirectTo = authCallbackUrl(PORTAL_HOME);
  } catch {
    return fail(authFailure("unavailable"));
  }

  try {
    const { error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo,
        data: { full_name: input.fullName, company: input.company, locale: input.locale },
      },
    });
    // «Conta já existe» é a única resposta convertida em sucesso neutro (anti-enumeração; com
    // confirmações activas o GoTrue nem sequer a devolve). Qualquer outro erro é reportado:
    // nunca se indica «verifique o e-mail» sem o Auth ter aceite o pedido.
    if (error && !isAccountExistsError(error)) return fail(mapAuthError(error));
  } catch (error) {
    return fail(mapAuthError(error));
  }
  return ok(CHECK_EMAIL);
}

export type SignedIn = { readonly userId: string };

export async function signIn(raw: unknown): Promise<AuthOutcome<SignedIn>> {
  const client = await openClient();
  if (!client) return fail(authFailure("unavailable"));

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return fail(authFailure("invalid_input", fieldErrorsOf(parsed.error)));

  try {
    const { data, error } = await client.auth.signInWithPassword(parsed.data);
    if (error) return fail(mapAuthError(error));
    const userId = data.user?.id;
    if (!userId || !data.session) return fail(authFailure("unexpected"));
    return ok({ userId });
  } catch (error) {
    return fail(mapAuthError(error));
  }
}

export async function signOut(): Promise<AuthOutcome<null>> {
  const client = await openClient();
  if (!client) return fail(authFailure("unavailable"));
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error && mapAuthError(error).kind !== "session_missing") return fail(mapAuthError(error));
  } catch (error) {
    if (mapAuthError(error).kind !== "session_missing") return fail(mapAuthError(error));
  }
  return ok(null);
}

/**
 * Pedido de recuperação. A resposta é SEMPRE neutra, mesmo com erros do Auth (incluindo
 * limites por endereço, que revelariam a existência da conta). Só a validação e a
 * indisponibilidade do serviço são reportadas.
 */
export async function requestPasswordRecovery(raw: unknown): Promise<AuthOutcome<CheckEmail>> {
  const client = await openClient();
  if (!client) return fail(authFailure("unavailable"));

  const parsed = recoveryRequestSchema.safeParse(raw);
  if (!parsed.success) return fail(authFailure("invalid_input", fieldErrorsOf(parsed.error)));

  let redirectTo: string;
  try {
    redirectTo = authCallbackUrl(NEW_PASSWORD_PATH);
  } catch {
    return fail(authFailure("unavailable"));
  }

  try {
    const { error } = await client.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
    if (error && mapAuthError(error).kind === "unavailable")
      return fail(authFailure("unavailable"));
  } catch (error) {
    if (mapAuthError(error).kind === "unavailable") return fail(authFailure("unavailable"));
  }
  return ok(CHECK_EMAIL);
}

/** Parâmetros recebidos pelo callback (B3). */
export type EmailLinkParams = {
  readonly code?: string | null;
  readonly tokenHash?: string | null;
  readonly type?: string | null;
};

export type EmailLinkResult = {
  /**
   * `recovery` só quando os claims verificados da nova sessão provam uma recuperação recente
   * (`amr` `recovery` ≤ 600 s). O callback (B3) encaminha então para a nova palavra-passe.
   */
  readonly flow: "confirmation" | "recovery";
};

const CODE_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
const TOKEN_HASH_PATTERN = /^[A-Za-z0-9_-]{8,256}$/;
const OTP_TYPES = new Set(["signup", "email", "recovery", "email_change"]);

/**
 * Conclui um link recebido por e-mail: `code` (PKCE, por omissão) ou `token_hash` + `type`.
 *
 * O fluxo é decidido pelos claims VERIFICADOS da nova sessão (`getClaims(access_token)`), não
 * por indicações do cliente. Se o pedido indicar recuperação (`redirectType` do verificador PKCE
 * ou `type=recovery`) mas os claims não a provarem, o link é recusado (falha fechada).
 */
export async function completeEmailLink(
  params: EmailLinkParams,
): Promise<AuthOutcome<EmailLinkResult>> {
  const client = await openClient();
  if (!client) return fail(authFailure("unavailable"));

  const code = params.code ?? null;
  const tokenHash = params.tokenHash ?? null;
  const type = params.type ?? null;

  try {
    let accessToken: string | undefined;
    let claimedRecovery: boolean;

    if (code !== null && tokenHash === null) {
      if (!CODE_PATTERN.test(code)) return fail(authFailure("link_invalid"));
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) return fail(linkFailure(error));
      accessToken = data.session?.access_token;
      // Indicação do cliente (auth-js 2.118 devolve `redirectType` em execução, sem o declarar
      // no tipo público). Só serve para detectar incoerências; a decisão é dos claims.
      claimedRecovery = (data as { redirectType?: unknown }).redirectType === "recovery";
    } else if (tokenHash !== null && code === null && type !== null) {
      if (!TOKEN_HASH_PATTERN.test(tokenHash) || !OTP_TYPES.has(type)) {
        return fail(authFailure("link_invalid"));
      }
      const { data, error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "signup" | "email" | "recovery" | "email_change",
      });
      if (error) return fail(linkFailure(error));
      accessToken = data.session?.access_token;
      claimedRecovery = type === "recovery";
    } else {
      return fail(authFailure("link_invalid"));
    }

    if (!accessToken) return fail(authFailure("link_invalid"));

    const { data, error } = await client.auth.getClaims(accessToken);
    if (error || !data?.claims) return fail(authFailure("link_invalid"));

    const provenRecovery = isFreshRecoverySession(data.claims);
    if (claimedRecovery && !provenRecovery) return fail(authFailure("link_invalid"));
    return ok({ flow: provenRecovery ? "recovery" : "confirmation" });
  } catch (error) {
    return fail(linkFailure(error));
  }
}

/** Falhas de link: tudo o que não é indisponibilidade ou limite é «link inválido». */
function linkFailure(error: unknown): AuthFailure {
  const failure = mapAuthError(error);
  return failure.kind === "unavailable" || failure.kind === "rate_limited"
    ? failure
    : authFailure("link_invalid");
}

/**
 * Define a nova palavra-passe. Exige uma sessão cujos claims VERIFICADOS provem uma recuperação
 * recente (`amr` `recovery` ≤ 600 s). Sessões normais são recusadas sem chamar o Auth. Em caso
 * de sucesso termina a sessão local (o utilizador entra de novo).
 */
export async function updatePassword(raw: unknown): Promise<AuthOutcome<null>> {
  const client = await openClient();
  if (!client) return fail(authFailure("unavailable"));

  const parsed = newPasswordSchema.safeParse(raw);
  if (!parsed.success) return fail(authFailure("invalid_input", fieldErrorsOf(parsed.error)));

  try {
    const { data, error } = await client.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims) return fail(authFailure("session_missing"));
    if (!isFreshRecoverySession(claims)) return fail(authFailure("recovery_required"));

    const update = await client.auth.updateUser({ password: parsed.data.password });
    if (update.error) return fail(mapAuthError(update.error));
  } catch (error) {
    return fail(mapAuthError(error));
  }

  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // A palavra-passe já foi alterada; a sessão local expira de qualquer forma.
  }
  return ok(null);
}

/** Estado da sessão para a página de nova palavra-passe (mesma regra de `updatePassword`). */
export type RecoveryState = "ready" | "session_missing" | "recovery_required" | "unavailable";

/**
 * Indica se a sessão actual pode definir uma nova palavra-passe: claims verificados com
 * `amr` `recovery` há no máximo 600 s. Não altera nada.
 */
export async function getRecoveryState(): Promise<RecoveryState> {
  const client = await openClient();
  if (!client) return "unavailable";
  try {
    const { data, error } = await client.auth.getClaims();
    if (error || !data?.claims) return "session_missing";
    return isFreshRecoverySession(data.claims) ? "ready" : "recovery_required";
  } catch {
    return "unavailable";
  }
}
