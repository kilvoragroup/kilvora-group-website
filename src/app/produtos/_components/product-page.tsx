import { LinkButton } from "@/components/button";
import { Hero } from "@/components/hero";
import { Section } from "@/components/section";
import { navActions } from "@/config/navigation";
import { getContent, type ProductSlug } from "@/content";
import { pageMetadata } from "@/lib/metadata";

function findProduct(slug: ProductSlug) {
  const content = getContent();
  const product = content.products.find((item) => item.slug === slug);
  if (!product) throw new Error(`Produto desconhecido: ${slug}`);
  return { product, content };
}

export function productMetadata(slug: ProductSlug) {
  const { product } = findProduct(slug);
  return pageMetadata({
    title: product.name,
    description: product.description.text,
    path: `/produtos/${slug}`,
  });
}

/**
 * Página de produto: apenas a descrição institucional verificável e o estado
 * de validação. Sem módulos, funcionalidades, contagens ou disponibilidade comercial.
 */
export function ProductPage({ slug }: { slug: ProductSlug }) {
  const { product, content } = findProduct(slug);
  const { common, pages } = content;

  return (
    <>
      <Hero eyebrow={pages.products.title} title={product.name} description={product.category} />

      <Section id="visao-geral" title={common.overview} status={product.description.status}>
        <p className="max-w-prose text-lg text-pretty">{product.description.text}</p>
        <div className="border-warning bg-warning/15 mt-8 max-w-prose rounded-lg border p-5">
          <p className="font-semibold">{common.inValidation}</p>
          <p className="mt-1">{product.notice}</p>
        </div>
      </Section>

      <Section
        id="contacto"
        tone="inverse"
        title={common.cta.requestInfo}
        intro={pages.contacts.intro}
      >
        <LinkButton href={navActions.proposal.href} variant="accent" size="lg">
          {common.cta.requestInfo}
        </LinkButton>
      </Section>
    </>
  );
}
