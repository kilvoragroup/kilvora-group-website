/**
 * Produtos. Fonte: Plano Director §2 e §5.
 *
 * Só descrições institucionais verificáveis: Kilvora Core = ERP SaaS autónomo;
 * Kilvora HCM = produto de RH autónomo. Módulos, funcionalidades, contagem de
 * módulos (divergência 18/20) e disponibilidade comercial NÃO são publicados.
 */
import { v, type ContentStatus, type Text } from "./types";

export const productSlugs = ["kilvora-core", "kilvora-hcm"] as const;
export type ProductSlug = (typeof productSlugs)[number];

export type Product = {
  slug: ProductSlug;
  name: string;
  category: Text;
  description: { status: ContentStatus; source: string; text: Text };
  notice: Text;
};

export const productsIntro: Text = v(
  "Produtos da KILVORA GROUP, concebidos como soluções autónomas e distintas entre si.",
  "Produtos da KILVORA GROUP, concebidos como soluções autônomas e distintas entre si.",
);

export const products: Record<ProductSlug, Product> = {
  "kilvora-core": {
    slug: "kilvora-core",
    name: "Kilvora Core",
    category: "ERP em modelo SaaS",
    description: {
      status: "aprovado",
      source: "Plano Director §2",
      text: v(
        "O Kilvora Core é o sistema de gestão empresarial (ERP) em modelo SaaS da KILVORA GROUP, concebido como produto autónomo.",
        "O Kilvora Core é o sistema de gestão empresarial (ERP) em modelo SaaS da KILVORA GROUP, concebido como produto autônomo.",
      ),
    },
    notice:
      "Os módulos, as funcionalidades e a disponibilidade comercial do Kilvora Core estão em validação e serão publicados após confirmação.",
  },
  "kilvora-hcm": {
    slug: "kilvora-hcm",
    name: "Kilvora HCM",
    category: "Gestão de recursos humanos (HCM)",
    description: {
      status: "aprovado",
      source: "Plano Director §2",
      text: v(
        "O Kilvora HCM é o produto de gestão de recursos humanos da KILVORA GROUP, concebido como produto autónomo e distinto do Kilvora Core.",
        "O Kilvora HCM é o produto de gestão de recursos humanos da KILVORA GROUP, concebido como produto autônomo e distinto do Kilvora Core.",
      ),
    },
    notice:
      "As funcionalidades e a disponibilidade comercial do Kilvora HCM estão em validação e serão publicadas após confirmação.",
  },
};

export function productHref(slug: ProductSlug): string {
  return `/produtos/${slug}`;
}
