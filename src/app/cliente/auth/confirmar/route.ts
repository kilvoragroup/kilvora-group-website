import { type NextRequest, NextResponse } from "next/server";

import { clientRoutes } from "@/config/navigation";
import { isPortalEnabled } from "@/config/portal";
import { NEW_PASSWORD_PATH, PORTAL_HOME, safeNext } from "@/lib/portal/auth-urls";
import { completeEmailLink } from "@/services/portal/auth";

/**
 * Callback dos links enviados por e-mail (confirmação de registo e recuperação), A2-B3.
 *
 * - Portal desligado → 404, sem ler parâmetros nem contactar o Supabase.
 * - Parâmetros validados no serviço (`completeEmailLink`): `code` (PKCE) ou `token_hash` + `type`.
 * - O fluxo de recuperação é decidido pelos claims VERIFICADOS da nova sessão (`amr` `recovery`
 *   ≤ 600 s), nunca por `redirectType` nem por `next`.
 * - Destinos sempre internos: `safeNext()`; a nova palavra-passe só é destino de uma
 *   recuperação provada.
 * - Erros devolvidos pelo GoTrue no URL (`error`, `error_code`) → aviso neutro, sem os ecoar.
 * - Os cookies de sessão são gravados pelo cliente de servidor (`cookies()`); a resposta nunca
 *   fica em caches partilhadas.
 */

function redirectTo(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin), 303);
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  return response;
}

const notice = (value: string) => `${clientRoutes.signIn}?aviso=${encodeURIComponent(value)}`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isPortalEnabled()) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const params = request.nextUrl.searchParams;
  if (params.has("error") || params.has("error_code")) {
    return redirectTo(request, notice("link-invalido"));
  }

  const result = await completeEmailLink({
    code: params.get("code"),
    tokenHash: params.get("token_hash"),
    type: params.get("type"),
  });

  if (!result.ok) {
    return redirectTo(
      request,
      notice(result.error.kind === "unavailable" ? "indisponivel" : "link-invalido"),
    );
  }

  if (result.value.flow === "recovery") return redirectTo(request, NEW_PASSWORD_PATH);

  // Confirmação: destino pedido, mas nunca a nova palavra-passe sem recuperação provada.
  const next = safeNext(params.get("next"));
  return redirectTo(request, next.startsWith(NEW_PASSWORD_PATH) ? PORTAL_HOME : next);
}
