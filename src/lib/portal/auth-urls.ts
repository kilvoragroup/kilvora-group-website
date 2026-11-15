import { safeReturnPath } from "./route-guard";

/**
 * URLs da autenticação do portal.
 *
 * - Os links enviados por e-mail usam sempre `NEXT_PUBLIC_SITE_URL` (fixado no build), nunca o
 *   cabeçalho `Host` do pedido. O GoTrue volta a validá-los contra a lista de URLs permitidos.
 * - Qualquer `next` passa por `safeNext`: só caminhos internos do portal, sem segmentos `.`/`..`
 *   nem codificações que os escondam.
 */

export const PORTAL_HOME = "/cliente";
export const AUTH_CALLBACK_PATH = "/cliente/auth/confirmar";
export const NEW_PASSWORD_PATH = "/cliente/nova-palavra-passe";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class SiteUrlConfigError extends Error {
  constructor() {
    super("URL do site inválido.");
    this.name = "SiteUrlConfigError";
  }
}

/**
 * Origem pública do site. HTTPS obrigatório, excepto em loopback (desenvolvimento e E2E).
 * Sem caminho, consulta nem fragmento.
 */
export function siteOrigin(raw: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const value = raw ?? "http://localhost:3000";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SiteUrlConfigError();
  }
  const secure = url.protocol === "https:";
  const localHttp = url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (!secure && !localHttp) throw new SiteUrlConfigError();
  if (url.username || url.password || url.search || url.hash) throw new SiteUrlConfigError();
  if (url.pathname !== "/" && url.pathname !== "") throw new SiteUrlConfigError();
  return url.origin;
}

const HIDDEN_TRAVERSAL = /%2e|%2f|%5c/i;

/**
 * Destino interno seguro depois da autenticação, ou `fallback`.
 * Acrescenta a `safeReturnPath` (A1) a recusa de segmentos `.`/`..` e das suas codificações.
 */
export function safeNext(
  candidate: string | null | undefined,
  fallback: string = PORTAL_HOME,
): string {
  const safe = safeReturnPath(candidate);
  if (!safe) return fallback;
  const [path] = safe.split(/[?#]/, 1);
  if (HIDDEN_TRAVERSAL.test(path)) return fallback;
  if (path.split("/").some((segment) => segment === "." || segment === "..")) return fallback;
  return safe;
}

/** URL absoluto do callback dos links por e-mail, com o destino seguro em `next`. */
export function authCallbackUrl(next: string, origin: string = siteOrigin()): string {
  const url = new URL(AUTH_CALLBACK_PATH, origin);
  url.searchParams.set("next", safeNext(next));
  return url.toString();
}
