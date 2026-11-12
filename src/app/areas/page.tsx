import { LinkButton } from "@/components/button";
import { Card } from "@/components/card";
import { Hero } from "@/components/hero";
import { Section } from "@/components/section";
import { navActions } from "@/config/navigation";
import { areaHref, getContent } from "@/content";
import { pageMetadata } from "@/lib/metadata";

const { pages } = getContent();

export const metadata = pageMetadata({
  title: pages.areas.title,
  description: pages.areas.description,
  path: "/areas",
});

export default function AreasPage() {
  const { areas, common } = getContent();

  return (
    <>
      <Hero eyebrow="Áreas" title={pages.areas.title} description={pages.areas.intro} />

      <Section id="areas">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => (
            <li key={area.slug} className="flex">
              <Card
                className="w-full"
                headingLevel="h2"
                title={area.name}
                description={area.summary}
                href={areaHref(area.slug)}
              />
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
