import type { LocalSupabase } from "./local-supabase";

/**
 * Chamadas DIRECTAS à API do GoTrue local, com a chave publishable (como faria um cliente
 * malicioso com a sessão de um utilizador). Usadas só para provar que o Auth recusa mudar a
 * palavra-passe a partir de uma sessão normal sem a palavra-passe actual
 * (`require_current_password = true`, A2-B2-R2). Nunca devolvem tokens para fora dos testes.
 */

function headers(local: LocalSupabase, accessToken?: string): HeadersInit {
  return {
    apikey: local.publishableKey,
    "content-type": "application/json",
    ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
  };
}

/** Sessão NORMAL (palavra-passe). Devolve o access token ou `null`. */
export async function passwordGrant(
  local: LocalSupabase,
  email: string,
  password: string,
): Promise<string | null> {
  const response = await fetch(`${local.apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: headers(local),
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: unknown };
  return typeof body.access_token === "string" ? body.access_token : null;
}

/** Tentativa de mudar a palavra-passe sem `current_password`. Devolve estado e código. */
export async function updatePasswordDirect(
  local: LocalSupabase,
  accessToken: string,
  password: string,
): Promise<{ status: number; code: string | null }> {
  const response = await fetch(`${local.apiUrl}/auth/v1/user`, {
    method: "PUT",
    headers: headers(local, accessToken),
    body: JSON.stringify({ password }),
  });
  let code: string | null = null;
  try {
    const body = (await response.json()) as { error_code?: unknown; code?: unknown };
    const value = body.error_code ?? body.code;
    code = typeof value === "string" ? value : null;
  } catch {
    code = null;
  }
  return { status: response.status, code };
}
