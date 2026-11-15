/**
 * Prova de recuperação de acesso baseada nos claims do Supabase Auth (A2-B2-R2).
 *
 * Substitui a antiga marca não assinada. A prova é o claim `amr` do JWT emitido e assinado
 * pelo GoTrue: uma sessão aberta por um link de recuperação tem uma entrada
 * `{ method: "recovery", timestamp }` (Supabase Docs, «JWT Claims Reference»).
 *
 * Regras (falha fechada em qualquer dúvida):
 * - os claims têm de vir de `auth.getClaims()` (JWT verificado); quem chama é responsável por
 *   nunca passar claims descodificados sem verificação;
 * - `sub` e `session_id` presentes;
 * - pelo menos uma entrada `amr` com `method === "recovery"` e `timestamp` numérico inteiro;
 * - a recuperação ocorreu há no máximo 600 s;
 * - `timestamp` no futuro só é tolerado até 60 s (desvio de relógio);
 * - o formato textual do `amr` (RFC 8176, sem `timestamp`) não prova a frescura → recusado.
 *
 * Complemento obrigatório na plataforma: `require_current_password = true` no Auth, para que uma
 * sessão normal não consiga mudar a palavra-passe directamente na API sem a palavra-passe actual.
 */

export const RECOVERY_WINDOW_SECONDS = 600;
export const CLOCK_SKEW_SECONDS = 60;

export type RecoveryCheck =
  | { readonly fresh: true; readonly recoveredAt: number }
  | {
      readonly fresh: false;
      readonly reason: "no_claims" | "no_recovery" | "expired" | "future" | "malformed";
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Análise detalhada (para testes e diagnóstico). Não contém dados dos claims. */
export function checkRecoverySession(claims: unknown, now: Date = new Date()): RecoveryCheck {
  if (!isObject(claims)) return { fresh: false, reason: "no_claims" };
  const { sub, session_id: sessionId, amr } = claims;
  if (typeof sub !== "string" || sub === "" || typeof sessionId !== "string" || sessionId === "") {
    return { fresh: false, reason: "no_claims" };
  }
  if (!Array.isArray(amr)) return { fresh: false, reason: "malformed" };

  const current = Math.floor(now.getTime() / 1000);
  let sawRecovery = false;
  let sawExpired = false;
  let sawFuture = false;

  for (const entry of amr) {
    if (!isObject(entry) || entry.method !== "recovery") continue;
    sawRecovery = true;
    const timestamp = entry.timestamp;
    if (typeof timestamp !== "number" || !Number.isInteger(timestamp) || timestamp <= 0) continue;
    if (timestamp > current + CLOCK_SKEW_SECONDS) {
      sawFuture = true;
      continue;
    }
    if (timestamp < current - RECOVERY_WINDOW_SECONDS) {
      sawExpired = true;
      continue;
    }
    return { fresh: true, recoveredAt: timestamp };
  }

  if (sawFuture) return { fresh: false, reason: "future" };
  if (sawExpired) return { fresh: false, reason: "expired" };
  if (sawRecovery) return { fresh: false, reason: "malformed" };
  return { fresh: false, reason: "no_recovery" };
}

/** A sessão foi aberta por um link de recuperação há no máximo 600 s. */
export function isFreshRecoverySession(claims: unknown, now: Date = new Date()): boolean {
  return checkRecoverySession(claims, now).fresh;
}
