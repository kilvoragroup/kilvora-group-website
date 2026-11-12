import { afterEach, describe, expect, it, vi } from "vitest";

import { isIndexableEnv, robotsMetadata, robotsRules } from "./seo";

const SITE_URL = "https://kilvora-group-website.vercel.app";

/** Os quatro cenários exigidos. `undefined` = variável ausente. */
const scenarios = [
  { name: "production", env: "production", indexable: true },
  { name: "preview", env: "preview", indexable: false },
  { name: "development", env: "development", indexable: false },
  { name: "ausente", env: undefined, indexable: false },
] as const;

describe("isIndexableEnv", () => {
  it.each(scenarios)("$name → indexável: $indexable", ({ env, indexable }) => {
    expect(isIndexableEnv(env)).toBe(indexable);
  });

  it("valores inesperados bloqueiam por omissão", () => {
    for (const value of ["", "Production", "PRODUCTION", "prod", "staging", " production"]) {
      expect(isIndexableEnv(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("robotsMetadata / robotsRules", () => {
  it("indexável: index, follow e robots.txt exclui apenas /cliente/", () => {
    expect(robotsMetadata(true)).toEqual({ index: true, follow: true });
    expect(robotsRules(true, SITE_URL)).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/cliente/" },
      sitemap: `${SITE_URL}/sitemap.xml`,
    });
  });

  it("bloqueado: noindex, nofollow e Disallow: / sem sitemap", () => {
    expect(robotsMetadata(false)).toMatchObject({ index: false, follow: false });
    expect(robotsRules(false, SITE_URL)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

/**
 * Módulos reais com o ambiente definido explicitamente pelo teste
 * (não depende das variáveis do terminal).
 */
describe("módulos reais por ambiente (site, robots, sitemap)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(vercelEnv: string | undefined) {
    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE_URL);
    const { site } = await import("./site");
    const { default: robots } = await import("@/app/robots");
    const { default: sitemap } = await import("@/app/sitemap");
    return { site, robots: robots(), sitemap: sitemap() };
  }

  it.each(scenarios)("$name", async ({ env, indexable }) => {
    const { site, robots, sitemap } = await load(env);
    expect(site.indexable).toBe(indexable);

    if (indexable) {
      expect(robots).toEqual({
        rules: { userAgent: "*", allow: "/", disallow: "/cliente/" },
        sitemap: `${SITE_URL}/sitemap.xml`,
      });
    } else {
      expect(robots).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    }

    // O sitemap usa sempre URLs canónicas e nunca inclui /cliente.
    expect(sitemap.length).toBeGreaterThan(10);
    for (const entry of sitemap) {
      expect(entry.url.startsWith(SITE_URL)).toBe(true);
      expect(entry.url).not.toContain("/cliente");
    }
  });
});
