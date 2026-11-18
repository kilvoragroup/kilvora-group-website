import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./security-headers";

const PROD = { nodeEnv: "production", vercelEnv: "production" };
const PREVIEW = { nodeEnv: "production", vercelEnv: "preview" };
const DEV = { nodeEnv: "development", vercelEnv: undefined };

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split("; ").map((d) => {
      const [name, ...rest] = d.split(" ");
      return [name as string, rest.join(" ")];
    }),
  );
}

describe("CSP (A6)", () => {
  it("Production: restrita à própria origem, sem eval nem fontes externas", () => {
    const d = directives(contentSecurityPolicy(PROD));
    expect(d.get("default-src")).toBe("'self'");
    expect(d.get("script-src")).toBe("'self' 'unsafe-inline'");
    expect(d.get("connect-src")).toBe("'self'");
    expect(d.get("img-src")).toBe("'self' data: blob:");
    expect(d.get("frame-src")).toBe("'none'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
    expect(d.has("upgrade-insecure-requests")).toBe(true);
    expect(contentSecurityPolicy(PROD)).not.toMatch(/unsafe-eval|vercel\.live|https:\/\/|\*/);
  });

  it("desenvolvimento: só acrescenta 'unsafe-eval' e não força HTTPS", () => {
    const d = directives(contentSecurityPolicy(DEV));
    expect(d.get("script-src")).toBe("'self' 'unsafe-inline' 'unsafe-eval'");
    expect(d.has("upgrade-insecure-requests")).toBe(false);
  });

  it("Preview: só a barra da Vercel é admitida", () => {
    const csp = contentSecurityPolicy(PREVIEW);
    expect(csp).toContain("https://vercel.live");
    expect(csp).not.toContain("unsafe-eval");
    expect(directives(csp).get("frame-ancestors")).toBe("'none'");
  });
});

describe("cabeçalhos de segurança (A6)", () => {
  it("conjunto fechado e valores esperados", () => {
    const headers = Object.fromEntries(securityHeaders(PROD).map((h) => [h.key, h.value]));
    expect(Object.keys(headers).sort()).toEqual(
      [
        "Content-Security-Policy",
        "Cross-Origin-Opener-Policy",
        "Permissions-Policy",
        "Referrer-Policy",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ].sort(),
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    // HSTS fica com a Vercel (evita duplicação).
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });
});
