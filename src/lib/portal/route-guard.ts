import { clientRoutes } from "@/config/navigation";

/**
 * Redireccionamento OPTIMISTA para as zonas do portal (`/cliente/*`, `/interno/*`).
 *
 * NÃO é um mecanismo de autorização. Só evita mostrar uma página protegida a quem claramente
 * não tem sessão. A autorização real é feita pela DAL em cada página e acção (A1-B3), e pela
 * RLS e pelas RPCs da base. Papéis, estado do perfil e `aal2` não são avaliados aqui.
 */

/** Rotas do portal acessíveis sem sessão (entrada, registo e recuperação). */
export const publicPortalRoutes: readonly string[] = [
  clientRoutes.signIn,
  clientRoutes.signUp,
  clientRoutes.recover,
];

const PROTECTED_PREFIXES = ["/cliente", "/interno"] as const;

export type OptimisticSession = { readonly userId: string } | null;

export type RouteDecision =
  { readonly type: "next" } | { readonly type: "redirect"; readonly location: string };

function normalise(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPortalPath(pathname: string): boolean {
  const path = normalise(pathname);
  return PROTECTED_PREFIXES.some((prefix) => isUnder(path, prefix));
}

export function isPublicPortalPath(pathname: string): boolean {
  const path = normalise(pathname);
  return publicPortalRoutes.some((route) => isUnder(path, route));
}

/**
 * Valida um destino de retorno: só caminhos internos do portal, sem esquema, sem `//`, sem
 * barras invertidas nem caracteres de controlo. Devolve `null` se não for seguro.
 */
export function safeReturnPath(candidate: string | null | undefined): string | null {
  if (!candidate || candidate.length > 512) return null;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) return null;
  const [path] = candidate.split(/[?#]/, 1);
  if (!isPortalPath(path) || isPublicPortalPath(path)) return null;
  return candidate;
}

export function decideOptimisticRoute(
  pathname: string,
  search: string,
  session: OptimisticSession,
): RouteDecision {
  if (!isPortalPath(pathname) || isPublicPortalPath(pathname)) return { type: "next" };
  if (session) return { type: "next" };

  const next = safeReturnPath(`${pathname}${search}`);
  const location = next
    ? `${clientRoutes.signIn}?next=${encodeURIComponent(next)}`
    : clientRoutes.signIn;
  return { type: "redirect", location };
}
