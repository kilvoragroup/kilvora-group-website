import { NextResponse, type NextRequest } from "next/server";

import { isPortalEnabled } from "@/config/portal";
import { decideOptimisticRoute } from "@/lib/portal/route-guard";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Proxy do portal (Next.js 16). Corre só em `/cliente/*` e `/interno/*`; o website institucional
 * não passa por aqui.
 *
 * Faz apenas duas coisas: renova a sessão Supabase e redirecciona de forma optimista quem não
 * tem sessão. NÃO é uma barreira de autorização (portão S2): cada página e Server Action
 * verifica a sessão, o perfil, os papéis e o `aal` na DAL.
 *
 * Com o portal desligado (P1) não faz nada: não cria cliente Supabase, não escreve cookies e
 * não redirecciona. As rotas do portal dão então 404 pelo layout de `/cliente`.
 */
export async function proxy(request: NextRequest) {
  if (!isPortalEnabled()) return NextResponse.next();

  const { response, session } = await updateSession(request);
  const decision = decideOptimisticRoute(request.nextUrl.pathname, request.nextUrl.search, session);

  const result =
    decision.type === "redirect"
      ? NextResponse.redirect(new URL(decision.location, request.url))
      : response;

  if (result !== response) {
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
  }
  // Respostas do portal dependem da sessão: nunca em caches partilhadas (portão S3).
  result.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  return result;
}

export const config = {
  matcher: ["/cliente/:path*", "/interno/:path*"],
};
