import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Opções comuns dos cookies de sessão Supabase, partilhadas pelos três clientes
 * (servidor, navegador e proxy).
 *
 * Só define `secure`. O `@supabase/ssr` 0.12.7 junta `DEFAULT_COOKIE_OPTIONS` (`path: "/"`,
 * `sameSite: "lax"`, `httpOnly: false`, `maxAge` de 400 dias) com estas opções e volta a impor
 * o `maxAge` por omissão; por isso `path`, `sameSite`, `httpOnly` e a duração mantêm-se.
 *
 * Regra (falha segura): `Secure` está sempre activo, excepto em HTTP num anfitrião de loopback
 * (`localhost`, `127.0.0.1`, `[::1]`), para o desenvolvimento local e os E2E funcionarem.
 * HTTP noutro anfitrião continua com `Secure`: o navegador recusa o cookie e não há sessão em
 * texto claro.
 */

export type RequestOrigin = {
  readonly protocol: string;
  readonly hostname: string;
};

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isSecureCookieContext(origin: RequestOrigin | null): boolean {
  if (!origin) return true;
  const protocol = origin.protocol.toLowerCase();
  const hostname = origin.hostname.toLowerCase();
  return !(protocol === "http:" && LOOPBACK_HOSTS.has(hostname));
}

export function supabaseCookieOptions(origin: RequestOrigin | null): CookieOptionsWithName {
  return { secure: isSecureCookieContext(origin) };
}

function firstValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

/**
 * Origem do pedido a partir dos cabeçalhos (`x-forwarded-proto`/`x-forwarded-host`, com
 * `host` como alternativa). Sem dados suficientes devolve `null`, ou seja, `Secure`.
 */
export function originFromHeaders(headers: {
  get(name: string): string | null;
}): RequestOrigin | null {
  const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host"));
  const proto = firstValue(headers.get("x-forwarded-proto"));
  if (!host || !proto) return null;
  try {
    const url = new URL(`${proto}://${host}`);
    return { protocol: url.protocol, hostname: url.hostname };
  } catch {
    return null;
  }
}
