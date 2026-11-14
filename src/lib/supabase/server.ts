import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { originFromHeaders, supabaseCookieOptions } from "./cookie-options";
import type { Database } from "./database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 *
 * - Usa só a chave publishable e a sessão do utilizador (cookies); a autorização é feita pela
 *   RLS e pelas RPCs da base, e pela DAL (A1-B3).
 * - Criar um cliente novo por pedido; nunca o partilhar entre pedidos.
 * - Lê `cookies()`: com `cacheComponents`, quem o chama tem de estar atrás de `<Suspense>` e
 *   nunca dentro de `use cache`.
 * - Cookies com `Secure` excepto em HTTP de loopback (ver `cookie-options.ts`); a origem vem
 *   dos cabeçalhos do pedido.
 */
export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();
  const origin = originFromHeaders(await headers());

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: supabaseCookieOptions(origin),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não podem escrever cookies; a renovação da sessão é feita pelo
          // proxy (`src/proxy.ts`). Em Server Actions e Route Handlers a escrita funciona.
        }
      },
    },
  });
}
