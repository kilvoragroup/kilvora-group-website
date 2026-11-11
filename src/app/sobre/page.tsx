import { LinkButton } from "@/components/button";
import { Hero } from "@/components/hero";
import { Section } from "@/components/section";
import { navActions } from "@/config/navigation";
import { site } from "@/config/site";
import { getContent } from "@/content";
import { pageMetadata } from "@/lib/metadata";

const { pages } = getContent();

export const metadata = pageMetadata({
  title: pages.about.title,
  description: pages.about.description,
  path: "/sobre",
});

export default function AboutPage() {
  const { about, common } = getContent();

  return (
    <>
      <Hero eyebrow="Sobre" title={pages.about.title} description={site.tagline} />

      <Section id="apresentacao" title="Quem somos">
        <div className="max-w-prose space-y-5 text-lg">
          {about.presentation.map((paragraph) => (
            <p key={paragraph} className="text-pretty">
              {paragraph}
            </p>
          ))}
        </div>
      </Section>

      <Section id="missao-visao" tone="muted" title="Missão e visão">
        <div className="grid gap-6 md:grid-cols-2">
          <article className="border-border bg-background rounded-xl border p-6 sm:p-8">
            <span aria-hidden="true" className="bg-highlight mb-5 block h-0.5 w-8" />
            <h3 className="text-title font-semibold">Missão</h3>
            <p className="text-muted-foreground mt-3 text-pretty">{about.mission}</p>
          </article>
          <article className="border-border bg-background rounded-xl border p-6 sm:p-8">
            <span aria-hidden="true" className="bg-accent mb-5 block h-0.5 w-8" />
            <h3 className="text-title font-semibold">Visão</h3>
            <p className="text-muted-foreground mt-3 text-pretty">{about.vision}</p>
          </article>
        </div>
      </Section>

      <Section id="valores" title="Valores">
        <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {about.values.map((value, index) => (
            <li key={value.title}>
              <p className="text-muted-foreground text-sm font-semibold tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="text-title mt-1 font-semibold">{value.title}</h3>
              <p className="text-muted-foreground mt-2 text-pretty">{value.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="posicionamento" tone="muted" title="Posicionamento" intro={about.positioning}>
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {about.differentiators.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="bg-highlight mt-2.5 h-0.5 w-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="mercados" title="Mercados">
        <ul className="flex flex-wrap gap-3">
          {about.markets.map((market) => (
            <li
              key={market}
              className="border-border bg-surface rounded-full border px-4 py-2 font-medium"
            >
              {market}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="contacto" tone="inverse" title={site.signature}>
        <LinkButton href={navActions.proposal.href} variant="accent" size="lg">
          {common.cta.requestProposal}
        </LinkButton>
      </Section>
    </>
  );
}
