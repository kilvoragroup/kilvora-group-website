import { LinkButton } from "@/components/button";
import { Hero } from "@/components/hero";
import { PricingCard } from "@/components/pricing-card";
import { ProcessSteps } from "@/components/process-steps";
import { Section } from "@/components/section";
import { navActions } from "@/config/navigation";
import { formatKz, getContent } from "@/content";
import { pageMetadata } from "@/lib/metadata";

const { pages } = getContent();

export const metadata = pageMetadata({
  title: pages.websites.title,
  description: pages.websites.description,
  path: "/websites",
});

export default function WebsitesPage() {
  const { common, websites } = getContent();
  const { plans } = websites;

  return (
    <>
      <Hero
        eyebrow="Websites"
        title={pages.websites.title}
        description={websites.intro}
        actions={
          <LinkButton href="#planos" variant="accent" size="lg">
            {common.cta.viewPlans}
          </LinkButton>
        }
      />

      <Section id="beneficios" title="Presença digital à medida de cada organização">
        <ul className="grid gap-6 md:grid-cols-3">
          {websites.benefits.map((benefit) => (
            <li key={benefit.title}>
              <span aria-hidden="true" className="bg-highlight mb-4 block h-0.5 w-8" />
              <h3 className="text-title font-semibold">{benefit.title}</h3>
              <p className="text-muted-foreground mt-2">{benefit.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="planos"
        tone="muted"
        title="Planos para Angola"
        eyebrow="Starter · Business · Premium"
      >
        <p
          role="note"
          className="border-warning bg-warning/15 mb-8 max-w-3xl rounded-lg border p-4 text-sm"
        >
          {websites.pricingDisclaimer}
        </p>
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              ctaHref={navActions.proposal.href}
              ctaLabel={common.cta.requestProposal}
            />
          ))}
        </div>
      </Section>

      <Section id="processo" title="Sete etapas, do levantamento à entrega">
        <ProcessSteps steps={websites.processSteps} />
      </Section>

      <Section id="manutencao" tone="muted" title="Manutenção e suporte">
        <div className="overflow-x-auto">
          <table className="border-border bg-background w-full min-w-xl border text-left text-sm">
            <caption className="sr-only">Planos de manutenção mensal, em kwanzas</caption>
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="p-3 font-semibold">
                  Plano
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Valor mensal
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Suporte
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Âmbito
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <th scope="row" className="p-3 font-semibold">
                    {plan.name}
                  </th>
                  <td className="p-3 tabular-nums">{formatKz(plan.maintenance.monthlyKz)}/mês</td>
                  <td className="p-3">
                    Até {plan.maintenance.supportHours}{" "}
                    {plan.maintenance.supportHours === 1 ? "hora" : "horas"}/mês
                  </td>
                  <td className="text-muted-foreground p-3">{plan.maintenance.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="text-muted-foreground mt-6 grid gap-2 text-sm sm:grid-cols-2">
          {websites.maintenanceNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Section>

      <Section id="custos-adicionais" title="Custos adicionais estimados">
        <div className="overflow-x-auto">
          <table className="border-border w-full min-w-xl border text-left text-sm">
            <caption className="sr-only">Custos adicionais estimados por plano, em kwanzas</caption>
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="p-3 font-semibold">
                  Serviço adicional
                </th>
                {plans.map((plan) => (
                  <th key={plan.id} scope="col" className="p-3 font-semibold">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {websites.additionalCosts.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="p-3 font-medium">
                    {row.label}
                  </th>
                  {plans.map((plan) => {
                    const value = row.values[plan.id];
                    return (
                      <td key={plan.id} className="p-3 tabular-nums">
                        {typeof value === "number" ? formatKz(value) : value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-4 text-sm">{websites.additionalCostsNote}</p>
      </Section>

      <Section id="condicoes" tone="muted" title="Condições">
        <div className="grid gap-6 lg:grid-cols-3">
          <article className="border-border bg-background rounded-xl border p-6">
            <h3 className="text-title font-semibold">Pagamento em duas fases</h3>
            <dl className="mt-4 space-y-4">
              {websites.paymentTerms.map((term) => (
                <div key={term.title}>
                  <dt className="font-semibold">{term.title}</dt>
                  <dd className="text-muted-foreground">{term.text}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground mt-4 text-sm">{websites.paymentNote}</p>
          </article>
          <article className="border-border bg-background rounded-xl border p-6">
            <h3 className="text-title font-semibold">Garantia e limitações</h3>
            <ul className="text-muted-foreground mt-4 space-y-3">
              {websites.warranty.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="border-border bg-background rounded-xl border p-6">
            <h3 className="text-title font-semibold">O cliente disponibiliza</h3>
            <ul className="text-muted-foreground mt-4 space-y-3">
              {websites.clientProvides.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </Section>

      <Section
        id="contacto"
        tone="inverse"
        title={common.cta.requestProposal}
        intro={websites.pricingDisclaimer}
      >
        <LinkButton href={navActions.proposal.href} variant="accent" size="lg">
          {common.cta.requestProposal}
        </LinkButton>
      </Section>
    </>
  );
}
