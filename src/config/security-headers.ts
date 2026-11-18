/**
 * Cabeçalhos de segurança HTTP (A6 — endurecimento; Plano M3-APP §5, portão GQL/A6).
 *
 * Aplicados a todas as rotas em `next.config.ts` (`headers()`), fixados no build.
 *
 * CSP SEM nonces (documentação Next.js 16, «Content Security Policy — Without Nonces»): com
 * `cacheComponents`, as páginas têm shells pré-renderizados no build; uma CSP com nonce exigiria
 * renderização dinâmica de todo o site e bloquearia os scripts inline desses shells. Por isso:
 * - `script-src` e `style-src` admitem `'unsafe-inline'` (scripts de hidratação e payload RSC do
 *   Next.js); `'unsafe-eval'` só em desenvolvimento (React usa `eval` para diagnóstico);
 * - tudo o resto fica restrito à própria origem: o site não carrega recursos de terceiros, não
 *   usa o cliente Supabase no navegador (as escritas do portal são Server Actions) e não tem
 *   análises externas;
 * - `img-src` admite `data:` (código QR TOTP da consola, A4) e `blob:`;
 * - `frame-ancestors 'none'` (e `X-Frame-Options: DENY` para navegadores antigos), `object-src
 *   'none'`, `base-uri 'self'` e `form-action 'self'`.
 * - Só em Preview da Vercel: `https://vercel.live` para a barra de comentários (sem efeito em
 *   Production).
 *
 * HSTS não é definido aqui: a Vercel já o envia em todos os domínios (verificado na H6).
 */

export type HeaderEnv = {
  readonly nodeEnv: string | undefined;
  readonly vercelEnv: string | undefined;
};

export type SecurityHeader = { readonly key: string; readonly value: string };

export function contentSecurityPolicy({ nodeEnv, vercelEnv }: HeaderEnv): string {
  const dev = nodeEnv === "development";
  const preview = vercelEnv === "preview";
  const live = preview ? " https://vercel.live" : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${live}`,
    `style-src 'self' 'unsafe-inline'${live}`,
    `img-src 'self' data: blob:${live}`,
    `font-src 'self'${live}`,
    `connect-src 'self'${live}`,
    `frame-src ${preview ? "https://vercel.live" : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

export function securityHeaders(env: HeaderEnv): readonly SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
