import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseCookieOptions } from "./cookie-options";
import type { Database } from "./database.types";
import { tryGetSupabasePublicEnv } from "./env";

/** Sessão mínima vista pelo proxy. Serve só para decisões optimistas, nunca para autorizar. */
export type ProxySession = {
  readonly userId: string;
  readonly aal: string | null;
} | null;

export type UpdateSessionResult = {
  readonly response: NextResponse;
  readonly session: ProxySession;
};

/**
 * Renova a sessão Supabase (cookies) num pedido do proxy.
 *
 * - Sem configuração Supabase válida, não faz nada e devolve sessão `null`.
 * - `getClaims()` valida o JWT (localmente com chaves assimétricas, ou no servidor de Auth).
 *   Qualquer falha resulta em sessão `null`.
 * - Os cookies e cabeçalhos anti-cache que a biblioteca pede são copiados para a resposta.
 * - Cookies com `Secure` excepto em HTTP de loopback (ver `cookie-options.ts`); a origem é o URL
 *   do pedido.
 */
export async function updateSession(request: NextRequest): Promise<UpdateSessionResult> {
  let response = NextResponse.next({ request });

  const env = tryGetSupabasePublicEnv();
  if (!env) return { response, session: null };

  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookieOptions: supabaseCookieOptions(request.nextUrl),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims || typeof claims.sub !== "string" || claims.sub === "") {
      return { response, session: null };
    }
    const aal = typeof claims.aal === "string" ? claims.aal : null;
    return { response, session: { userId: claims.sub, aal } };
  } catch {
    return { response, session: null };
  }
}
