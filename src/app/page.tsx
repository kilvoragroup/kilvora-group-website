import { LinkButton } from "@/components/button";
import { Card } from "@/components/card";
import { Hero } from "@/components/hero";
import { ArrowRightIcon } from "@/components/icons";
import { Section } from "@/components/section";
import { navActions } from "@/config/navigation";
import { site } from "@/config/site";
import { areaHref, formatKz, getContent, productHref } from "@/content";

export default function Home() {
  const { about, areas, common, pages, products, productsIntro, websites } = getContent();
  const lowestPrice = Math.min(...websites.plans.map((plan) => plan.priceKz));

  return (
    <>
      <Hero
        size="home"
        eyebrow={site.name}
        title={site.signature}
        description={site.tagline}
        actions={
          <>
            <LinkButton href={navActions.proposal.href} variant="accent" size="lg">
              {common.cta.requestProposal}
            </LinkButton>
            <LinkButton href="/areas" variant="inverse" size="lg">
              {common.cta.exploreAreas}
            </LinkButton>
          </>
        }
      />

      <Section id="areas" eyebrow={pages.areas.title} title={pages.areas.intro}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <li key={area.slug} className="flex">
              <Card
                className="w-full"
                title={area.name}
                description={area.summary}
                href={areaHref(area.slug)}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="websites" tone="muted" eyebrow="Websites" title={pages.websites.title}>
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <p className="text-lead text-pretty">{websites.intro}</p>
          <div className="border-border bg-background rounded-xl border p-6">
            <p className="text-muted-foreground text-sm">Starter · Business · Premium</p>
            <p className="text-heading mt-2 font-semibold">
              <span className="text-muted-foreground text-lead font-normal">a partir de </span>
              {formatKz(lowestPrice)}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">{websites.pricingDisclaimer}</p>
            <LinkButton href="/websites" variant="primary" className="mt-6">
              {common.cta.viewPlans}
              <ArrowRightIcon className="size-4" />
            </LinkButton>
          </div>
        </div>
      </Section>

      <Section id="produtos" eyebrow={pages.products.title} title={productsIntro}>
        <ul className="grid gap-4 md:grid-cols-2">
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

      <Section id="posicionamento" tone="muted" eyebrow="Sobre" title={about.positioning}>
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {about.differentiators.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="bg-highlight mt-2.5 h-0.5 w-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <LinkButton href="/sobre" variant="outline" className="mt-10">
          {common.cta.learnMore}
        </LinkButton>
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
