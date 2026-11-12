import type { MetadataRoute } from "next";

import { robotsRules } from "@/config/seo";
import { site } from "@/config/site";

/** Production: `Allow: /` + `Disallow: /cliente/`. Restantes ambientes: `Disallow: /`. */
export default function robots(): MetadataRoute.Robots {
  return robotsRules(site.indexable, site.url);
}
