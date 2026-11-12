import type { Metadata } from "next";

import { site } from "@/config/site";

/** Metadados por página (título usa o template do layout: «%s | KILVORA GROUP»). */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: site.locale.replace("-", "_"),
      title: `${title} | ${site.name}`,
      description,
      url: path,
    },
  };
}
