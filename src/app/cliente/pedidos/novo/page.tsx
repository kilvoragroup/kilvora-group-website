import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { isPortalEnabled } from "@/config/portal";
import { portalAuth } from "@/content/portal-auth";
import { portalClient, ticketTypeLabels } from "@/content/portal-client";
import { formatDeliveryDays, formatKz, plans, pricingDisclaimer } from "@/content/websites";
import { isPlanId, WEBSITE_TICKET_TYPE } from "@/domain/portal/tickets";
import { ticketTypeSchema } from "@/domain/portal/schemas";
import { requireClient } from "@/lib/portal/dal";

import { Loading } from "../../_components/auth-shell";
import { NewTicketForm, type PlanOption } from "../../_components/portal-forms";
import { PortalShell } from "../../_components/portal-shell";
import { firstParam, type SearchParams, t } from "../../_lib/text";

export const metadata: Metadata = { title: t(portalClient.newTicket.title) };

/**
 * Novo pedido (A3). Os planos de website e os valores apresentados vêm só de
 * `src/content/websites.ts` (valores aprovados, com a indicação de confirmação comercial).
 * `?tipo=` e `?plano=` só pré-seleccionam opções de listas fechadas.
 */
export default function NewTicketPage({ searchParams }: { searchParams: SearchParams }) {
  const s = portalClient.newTicket;
  return (
    <PortalShell title={t(s.title)} intro={t(s.intro)}>
      <Suspense fallback={<Loading />}>
        <NewTicket searchParams={searchParams} />
      </Suspense>
    </PortalShell>
  );
}

async function NewTicket({ searchParams }: { searchParams: SearchParams }) {
  if (!isPortalEnabled()) notFound();
  await requireClient();
  const params = await searchParams;

  const rawPlan = firstParam(params.plano);
  const initialPlan = isPlanId(rawPlan) ? rawPlan : "";
  const rawType = ticketTypeSchema.safeParse(firstParam(params.tipo));
  const initialType = initialPlan ? WEBSITE_TICKET_TYPE : rawType.success ? rawType.data : "";

  const types = ticketTypeSchema.options.map((value) => ({
    value,
    label: t(ticketTypeLabels[value]),
  }));
  const planOptions: PlanOption[] = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    subtitle: t(plan.subtitle),
    price: formatKz(plan.priceKz),
    maintenance: formatKz(plan.maintenance.monthlyKz),
    pages: t(plan.pages),
    delivery: formatDeliveryDays(plan.deliveryDays),
  }));
  const s = portalClient.newTicket;

  return (
    <div className="border-border max-w-3xl rounded-xl border p-6 sm:p-8">
      <NewTicketForm
        types={types}
        websiteType={WEBSITE_TICKET_TYPE}
        plans={planOptions}
        initialType={initialType}
        initialPlan={initialPlan}
        text={{
          type: t(s.type),
          typePlaceholder: t(s.typePlaceholder),
          plan: t(s.plan),
          planHint: t(s.planHint),
          planUndecided: t(s.planUndecided),
          development: t(s.development),
          maintenance: t(s.maintenance),
          perMonth: t(s.perMonth),
          subject: t(s.subject),
          subjectHint: t(s.subjectHint),
          details: t(s.details),
          detailsHint: t(s.detailsHint),
          submit: t(s.submit),
          sending: t(portalAuth.common.sending),
          disclaimer: t(pricingDisclaimer),
        }}
      />
    </div>
  );
}
