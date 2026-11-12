/**
 * Ponto de entrada do conteúdo: devolve todo o conteúdo resolvido para uma
 * variante do português (por omissão, a variante configurada em `site.locale`).
 */
import { site } from "@/config/site";

import { about } from "./about";
import { areas, areaSlugs, servicesScopeNote } from "./areas";
import { common } from "./common";
import { pages, proposalRequest } from "./pages";
import { products, productSlugs, productsIntro } from "./products";
import { resolve, type PtLocale } from "./types";
import * as websites from "./websites";

export const rawContent = {
  about,
  areas: areaSlugs.map((slug) => areas[slug]),
  servicesScopeNote,
  common,
  pages,
  proposalRequest,
  products: productSlugs.map((slug) => products[slug]),
  productsIntro,
  websites: {
    meta: websites.websitesMeta,
    intro: websites.websitesIntro,
    benefits: websites.websitesBenefits,
    plans: websites.plans,
    maintenanceNotes: websites.maintenanceNotes,
    additionalCosts: websites.additionalCosts,
    additionalCostsNote: websites.additionalCostsNote,
    processSteps: websites.processSteps,
    paymentTerms: websites.paymentTerms,
    paymentNote: websites.paymentNote,
    warranty: websites.warranty,
    clientProvides: websites.clientProvides,
    pricingDisclaimer: websites.pricingDisclaimer,
  },
};

export type Content = ReturnType<typeof getContent>;

export function getContent(locale: PtLocale = site.locale) {
  return resolve(rawContent, locale);
}

export type { AreaSlug } from "./areas";
export type { ProductSlug } from "./products";
export { areaHref, areaSlugs } from "./areas";
export { productHref, productSlugs } from "./products";
export { formatDeliveryDays, formatKz } from "./websites";
