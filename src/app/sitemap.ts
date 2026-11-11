import type { MetadataRoute } from "next";

import { publicPaths } from "@/config/navigation";
import { site } from "@/config/site";

/** Gerado a partir da navegação (fonte única). Rotas `/cliente/*` excluídas. */
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths().map((path) => ({
    url: `${site.url}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
