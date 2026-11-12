import { LinkButton } from "@/components/button";
import { Card } from "@/components/card";
import { ContextNav } from "@/components/context-nav";
import { Hero } from "@/components/hero";
import { Section } from "@/components/section";
import { areaSections, getAreaSections, navActions } from "@/config/navigation";
import { getContent, type AreaSlug } from "@/content";
import { pageMetadata } from "@/lib/metadata";

function findArea(slug: AreaSlug) {
  const content = getContent();
  const area = content.areas.find((item) => item.slug === slug);
  if (!area) throw new Error(`Área desconhecida: ${slug}`);
  return { area, content };
}

export function areaMetadata(slug: AreaSlug) {
  const { area } = findArea(slug);
  return pageMetadata({ title: area.name, description: area.summary, path: `/areas/${slug}` });
}

export function AreaPage({ slug }: { slug: AreaSlug }) {
  const { area, content } = findArea(slug);
  const { common, pages, servicesScopeNote } = content;
  const related = area.related ?? [];
  const sections = getAreaSections(related.length > 0);
  const label = Object.fromEntries(sections.map((s) => [s.id, s.label]));

  return (
    <>
      <Hero eyebrow={pages.areas.title} title={area.name} description={area.summary} />
      <ContextNav title={area.name} label={common.pageNavigation} sections={sections} />

      <Section
        id={areaSections.overview.id}
        title={label[areaSections.overview.id]}
        status={area.overview.status}
      >
        <div className="max-w-prose space-y-5 text-lg">
          {area.overview.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-pretty">
              {paragraph}
            </p>
          ))}
        </div>
      </Section>

      <Section
        id={areaSections.services.id}
        tone="muted"
        title={label[areaSections.services.id]}
        intro={servicesScopeNote}
        status={area.services.status}
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {area.services.items.map((item) => (
            <li key={item} className="border-border bg-background flex gap-3 rounded-lg border p-4">
              <span aria-hidden="true" className="bg-highlight mt-2.5 h-0.5 w-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {area.services.note && (
          <p className="text-muted-foreground mt-6 max-w-prose text-sm">{area.services.note}</p>
        )}
      </Section>

      {related.length > 0 && (
        <Section id={areaSections.related.id} title={label[areaSections.related.id]}>
          <ul className="grid gap-4 md:grid-cols-3">
            {related.map((item) => (
              <li key={item.href} className="flex">
                <Card
                  className="w-full"
                  title={item.label}
                  description={item.description}
                  href={item.href}
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        id={areaSections.contact.id}
        tone="inverse"
        title={label[areaSections.contact.id]}
        intro={pages.contacts.intro}
      >
        <LinkButton href={navActions.proposal.href} variant="accent" size="lg">
          {common.cta.requestProposal}
        </LinkButton>
      </Section>
    </>
  );
}
