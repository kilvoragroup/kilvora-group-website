import { Card } from "@/components/card";
import { Hero } from "@/components/hero";
import { Section } from "@/components/section";
import { getContent, productHref } from "@/content";
import { pageMetadata } from "@/lib/metadata";

const { pages } = getContent();

export const metadata = pageMetadata({
  title: pages.products.title,
  description: pages.products.description,
  path: "/produtos",
});

export default function ProductsPage() {
  const { products, productsIntro } = getContent();

  return (
    <>
      <Hero eyebrow="KILVORA GROUP" title={pages.products.title} description={productsIntro} />

      <Section id="produtos">
        <ul className="grid gap-4 md:grid-cols-2">
          {products.map((product) => (
            <li key={product.slug} className="flex">
              <Card
                className="w-full"
                headingLevel="h2"
                eyebrow={product.category}
                title={product.name}
                description={product.description.text}
                href={productHref(product.slug)}
              />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
