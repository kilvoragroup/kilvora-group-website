import type { Page } from "@playwright/test";

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
