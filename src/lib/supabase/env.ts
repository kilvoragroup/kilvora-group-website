import { z } from "zod";

/**
 * Configuração pública do Supabase (URL + chave publishable).
 *
 * - Validação diferida: nada é lido nem validado ao importar o módulo, para que o build e os
 *   testes corram sem variáveis Supabase (por exemplo, na CI).
 * - Só são aceites chaves publicáveis: `sb_publishable_…` ou a chave `anon` legada (JWT com
 *   `role: "anon"`). Qualquer outra (secret, `service_role`, formato desconhecido) é recusada.
 * - As mensagens de erro nunca incluem os valores recebidos.
 */

export type SupabasePublicEnv = {
  readonly url: string;
  readonly publishableKey: string;
};

export type SupabaseEnvSource = {
  url: string | undefined;
  publishableKey: string | undefined;
};

export type SupabaseEnvIssue =
  | "url_missing"
  | "url_invalid"
  | "url_insecure"
  | "key_missing"
  | "key_privileged"
  | "key_unrecognised";

export class SupabaseConfigError extends Error {
  readonly issue: SupabaseEnvIssue;

  constructor(issue: SupabaseEnvIssue) {
    super(`Configuração Supabase inválida: ${issue}`);
    this.name = "SupabaseConfigError";
    this.issue = issue;
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PUBLISHABLE_PREFIX = "sb_publishable_";
const SECRET_PREFIX = "sb_secret_";

/** Lê o papel declarado numa chave JWT legada, sem a validar criptograficamente. */
function legacyJwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    // `atob` existe no navegador e no Node; `Buffer` não existe no navegador.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (payload && typeof payload === "object" && "role" in payload) {
      const role = (payload as { role: unknown }).role;
      return typeof role === "string" ? role : null;
    }
  } catch {
    return null;
  }
  return null;
}

function classifyKey(key: string): SupabaseEnvIssue | null {
  if (key.startsWith(SECRET_PREFIX)) return "key_privileged";
  if (key.startsWith(PUBLISHABLE_PREFIX)) {
    return key.length > PUBLISHABLE_PREFIX.length ? null : "key_unrecognised";
  }
  const role = legacyJwtRole(key);
  if (role === "anon") return null;
  if (role !== null) return "key_privileged";
  return "key_unrecognised";
}

function classifyUrl(raw: string): SupabaseEnvIssue | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "url_invalid";
  }
  if (parsed.protocol === "https:") return null;
  if (parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname)) return null;
  return parsed.protocol === "http:" ? "url_insecure" : "url_invalid";
}

const schema = z
  .object({
    url: z.string().trim().optional(),
    publishableKey: z.string().trim().optional(),
  })
  .transform((value, ctx) => {
    const fail = (issue: SupabaseEnvIssue) => {
      ctx.addIssue({ code: "custom", message: issue });
      return z.NEVER;
    };
    if (!value.url) return fail("url_missing");
    const urlIssue = classifyUrl(value.url);
    if (urlIssue) return fail(urlIssue);
    if (!value.publishableKey) return fail("key_missing");
    const keyIssue = classifyKey(value.publishableKey);
    if (keyIssue) return fail(keyIssue);
    return {
      url: value.url.replace(/\/+$/, ""),
      publishableKey: value.publishableKey,
    } satisfies SupabasePublicEnv;
  });

/**
 * Acesso directo a `process.env.NEXT_PUBLIC_*` (necessário para o Next.js os incorporar no
 * bundle do navegador). Avaliado só quando é chamado.
 */
function processEnvSource(): SupabaseEnvSource {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/** Valida a configuração; lança `SupabaseConfigError` (sem valores na mensagem) se for inválida. */
export function getSupabasePublicEnv(
  source: SupabaseEnvSource = processEnvSource(),
): SupabasePublicEnv {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const issue = result.error.issues[0]?.message as SupabaseEnvIssue | undefined;
  throw new SupabaseConfigError(issue ?? "url_invalid");
}

/** Igual a `getSupabasePublicEnv`, mas devolve `null` em vez de lançar (uso no proxy). */
export function tryGetSupabasePublicEnv(
  source: SupabaseEnvSource = processEnvSource(),
): SupabasePublicEnv | null {
  try {
    return getSupabasePublicEnv(source);
  } catch {
    return null;
  }
}
