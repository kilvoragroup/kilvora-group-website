import type { MetadataRoute } from "next";

import { site } from "@/config/site";

/** Indexação bloqueada até à autorização de publicação (W5). */
export default function robots(): MetadataRoute.Robots {
  if (!site.indexable) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/cliente/" },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
