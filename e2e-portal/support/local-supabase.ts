import { execSync } from "node:child_process";

/**
 * Configuração do Supabase LOCAL para os E2E do portal (decisão P3 da A2).
 *
 * Lê `supabase status -o env` em memória e guarda SÓ três valores: o URL da API, a chave
 * publishable e o URL do Mailpit. As restantes chaves da saída (`SECRET_KEY`,
 * `SERVICE_ROLE_KEY`, `JWT_SECRET`, `DB_URL`…) são ignoradas: nunca são lidas para variáveis,
 * escritas em ficheiros nem registadas. Nenhum valor aparece nas mensagens de erro.
 *
 * Recusa qualquer destino que não seja de loopback: os E2E nunca tocam o Supabase alojado.
 */

export type LocalSupabase = {
  readonly apiUrl: string;
  readonly publishableKey: string;
  readonly mailpitUrl: string;
};

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const WANTED = /^(API_URL|PUBLISHABLE_KEY|MAILPIT_URL)=(.*)$/;

let cached: LocalSupabase | null = null;

function loopbackUrl(raw: string | undefined, name: string): string {
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    throw new Error(`E2E portal: ${name} em falta ou inválido no Supabase local.`);
  }
  if (url.protocol !== "http:" || !LOOPBACK.has(url.hostname)) {
    throw new Error(`E2E portal: ${name} não é local (loopback). Execução recusada.`);
  }
  return url.origin;
}

/** Extrai só os três valores permitidos da saída de `supabase status -o env`. */
export function parseStatusEnv(output: string): LocalSupabase {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = WANTED.exec(line.trim());
    if (match) values.set(match[1], match[2].trim().replace(/^"|"$/g, ""));
  }
  const publishableKey = values.get("PUBLISHABLE_KEY") ?? "";
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error("E2E portal: chave publishable local em falta ou com formato inesperado.");
  }
  return {
    apiUrl: loopbackUrl(values.get("API_URL"), "API_URL"),
    publishableKey,
    mailpitUrl: loopbackUrl(values.get("MAILPIT_URL"), "MAILPIT_URL"),
  };
}

export function loadLocalSupabase(): LocalSupabase {
  if (cached) return cached;
  let output: string;
  try {
    output = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 120_000,
    });
  } catch {
    throw new Error("E2E portal: Supabase local indisponível (executar `npx.cmd supabase start`).");
  }
  cached = parseStatusEnv(output);
  return cached;
}
