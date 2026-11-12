import type { Metadata, MetadataRoute } from "next";

/**
 * Protecção SEO por ambiente.
 *
 * Só a implantação Production da Vercel (`VERCEL_ENV=production`) é indexável.
 * Preview, Development, qualquer outro valor ou a ausência da variável bloqueiam
 * a indexação por omissão. Como as páginas são estáticas, o valor é fixado no build
 * (a Vercel define `VERCEL_ENV` em cada build).
 */
export function isIndexableEnv(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production";
}

/** Meta `robots` das páginas. */
export function robotsMetadata(indexable: boolean): NonNullable<Metadata["robots"]> {
  return indexable
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };
}

/** Regras do robots.txt: indexação pública com `/cliente/` excluído, ou bloqueio total. */
export function robotsRules(indexable: boolean, siteUrl: string): MetadataRoute.Robots {
  if (!indexable) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/cliente/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
