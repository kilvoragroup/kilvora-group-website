import { tryGetSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Interruptor do portal de clientes (decisão P1 da A2).
 *
 * O portal só está activo quando AMBAS as condições se verificam:
 * 1. `NEXT_PUBLIC_PORTAL_ENABLED` é exactamente `"true"`;
 * 2. a configuração pública do Supabase é válida (`tryGetSupabasePublicEnv`).
 *
 * Por omissão (variável ausente ou com qualquer outro valor) o portal está DESLIGADO: a
 * navegação institucional fica inalterada, `/cliente/*` dá 404, o proxy não contacta o
 * Supabase e as Server Actions recusam (`assertPortalEnabled`).
 *
 * O acesso directo a `process.env.NEXT_PUBLIC_*` faz com que o Next.js fixe o valor no build.
 * A leitura é feita dentro da função para que os testes possam alternar o valor.
 */

export const PORTAL_FLAG = "NEXT_PUBLIC_PORTAL_ENABLED";

/** Só a flag, sem verificar a configuração Supabase. */
export function isPortalFlagOn(): boolean {
  return process.env.NEXT_PUBLIC_PORTAL_ENABLED === "true";
}

/** Portal activo: flag ligada e configuração Supabase válida. */
export function isPortalEnabled(): boolean {
  return isPortalFlagOn() && tryGetSupabasePublicEnv() !== null;
}
