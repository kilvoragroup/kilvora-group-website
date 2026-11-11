import Link from "next/link";

import { LinkButton } from "@/components/button";
import { Card } from "@/components/card";
import { Hero } from "@/components/hero";
import { Section } from "@/components/section";
import { navActions } from "@/config/navigation";
import { areaHref, formatKz, getContent, productHref } from "@/content";
import { pageMetadata } from "@/lib/metadata";

const { pages } = getContent();

export const metadata = pageMetadata({
  title: pages.solutions.title,
  description: pages.solutions.description,
  path: "/solucoes",
});

export default function SolutionsPage() {
  const { areas, common, products, servicesScopeNote, websites } = getContent();
  const lowestPrice = Math.min(...websites.plans.map((plan) => plan.priceKz));

  return (
    <>
      <Hero
        eyebrow={pages.solutions.title}
        title={pages.solutions.title}
        description={pages.solutions.intro}
      />

      <Section id="websites-e-produtos" title="Websites e produtos">
        <ul className="grid gap-4 md:grid-cols-3">
          <li className="flex">
            <Card
              className="w-full"
              eyebrow={`Angola · a partir de ${formatKz(lowestPrice)}`}
              title={pages.websites.title}
              description={websites.intro}
              href="/websites"
            />
          </li>
          {products.map((product) => (
            <li key={product.slug} className="flex">
              <Card
                className="w-full"
                eyebrow={product.category}
                title={product.name}
                description={product.description.text}
                href={productHref(product.slug)}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="servicos-por-area"
        tone="muted"
        title={pages.solutions.servicesTitle}
        intro={servicesScopeNote}
        status="provisorio"
      >
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <li
              key={area.slug}
              className="border-border bg-background flex flex-col rounded-lg border p-6"
            >
              <h3 className="text-title font-semibold">{area.name}</h3>
              <ul className="text-muted-foreground mt-3 space-y-1.5 text-sm">
                {area.services.items.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link
                href={`${areaHref(area.slug)}#servicos`}
                className="text-primary mt-auto pt-4 text-sm font-semibold underline-offset-4 hover:underline"
              >
                {common.cta.learnMore}
                <span className="sr-only"> — {area.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="contacto"
        tone="inverse"
        title={common.cta.contactUs}
        intro={pages.contacts.intro}
      >
        <LinkButton href={navActions.proposal.href} variant="accent" size="lg">
          {common.cta.requestProposal}
        </LinkButton>
      </Section>
    </>
  );
}
