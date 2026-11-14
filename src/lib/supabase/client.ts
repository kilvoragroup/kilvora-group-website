import { createBrowserClient } from "@supabase/ssr";

import { supabaseCookieOptions } from "./cookie-options";
import type { Database } from "./database.types";
import { getSupabasePublicEnv } from "./env";

/**
 * Cliente Supabase para Client Components.
 *
 * Usa só a chave publishable; a sessão vem dos cookies geridos pelo `@supabase/ssr`. No
 * navegador, `createBrowserClient` devolve sempre a mesma instância. Cookies com `Secure`
 * excepto em HTTP de loopback (ver `cookie-options.ts`); a origem é a da página.
 */
export function getSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  const origin = typeof window === "undefined" ? null : window.location;
  return createBrowserClient<Database>(url, publishableKey, {
    cookieOptions: supabaseCookieOptions(origin),
  });
}
