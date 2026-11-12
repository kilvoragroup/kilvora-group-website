import type { Page } from "@playwright/test";

/**
 * Ambiente Vercel simulado no build do servidor E2E (ver playwright.config.ts).
 * Por omissão `production`; usar `E2E_VERCEL_ENV=preview|development|none` para os
 * restantes cenários (`none` = variável ausente). Valores desconhecidos são rejeitados.
 */
const allowedEnvs = ["production", "preview", "development", "none"] as const;
export type E2EVercelEnv = (typeof allowedEnvs)[number];

export const e2eVercelEnv = (process.env.E2E_VERCEL_ENV ?? "production") as E2EVercelEnv;
if (!allowedEnvs.includes(e2eVercelEnv)) {
  throw new Error(`E2E_VERCEL_ENV inválido: "${e2eVercelEnv}" (usar ${allowedEnvs.join(", ")})`);
}

/** Só Production é indexável. */
export const e2eIndexable = e2eVercelEnv === "production";

export const viewports = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  // Regressão W2-C: o email do rodapé transbordava também a 1024px.
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
} as const;

export const areaSlugs = [
  "tecnologia",
  "inovacao",
  "consultoria",
  "gestao",
  "formacao",
  "comercio",
] as const;

export const publicPages = [
  "/",
  "/sobre",
  "/areas",
  ...areaSlugs.map((slug) => `/areas/${slug}`),
  "/produtos",
  "/produtos/kilvora-core",
  "/produtos/kilvora-hcm",
  "/solucoes",
  "/websites",
  "/contactos",
] as const;

/** Informação sobre o elemento com foco. */
export function activeElement(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      tag: el?.tagName.toLowerCase() ?? null,
      id: el?.id ?? null,
      text: (el?.getAttribute("aria-label") || el?.textContent || "").trim().replace(/\s+/g, " "),
      href: el?.getAttribute("href") ?? null,
    };
  });
}
