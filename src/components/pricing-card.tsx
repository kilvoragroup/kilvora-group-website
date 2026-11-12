import { formatDeliveryDays, formatKz, type Content } from "@/content";
import { cx } from "@/lib/cx";

import { LinkButton } from "./button";
import { CheckIcon, MinusIcon } from "./icons";

type Plan = Content["websites"]["plans"][number];

type PricingCardProps = {
  plan: Plan;
  ctaLabel: string;
  ctaHref: string;
  featured?: boolean;
};

export function PricingCard({ plan, ctaLabel, ctaHref, featured = false }: PricingCardProps) {
  const headingId = `plano-${plan.id}`;
  return (
    <article
      aria-labelledby={headingId}
      className={cx(
        "bg-background flex flex-col rounded-xl border p-6 sm:p-8",
        featured ? "border-primary ring-primary ring-1" : "border-border",
      )}
    >
      <header>
        <h3 id={headingId} className="text-title font-semibold">
          {plan.name}
        </h3>
        <p className="text-muted-foreground">{plan.subtitle}</p>
        <p className="mt-6">
          <span className="text-heading font-semibold tabular-nums">{formatKz(plan.priceKz)}</span>
        </p>
        <p className="text-muted-foreground text-sm">Preço de desenvolvimento · Angola</p>
        <p className="mt-4 text-pretty">{plan.audience}</p>
      </header>

      <dl className="border-border mt-6 grid grid-cols-2 gap-4 border-y py-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Páginas</dt>
          <dd className="font-semibold">{plan.pages}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Prazo estimado</dt>
          <dd className="font-semibold">{formatDeliveryDays(plan.deliveryDays)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Manutenção opcional</dt>
          <dd className="font-semibold">
            {formatKz(plan.maintenance.monthlyKz)}/mês · até {plan.maintenance.supportHours}{" "}
            {plan.maintenance.supportHours === 1 ? "hora" : "horas"} de suporte/mês
          </dd>
        </div>
      </dl>

      <h4 className="mt-6 text-sm font-semibold">Incluído</h4>
      <ul className="mt-3 space-y-2 text-sm">
        {plan.includes.map((item) => (
          <li key={item} className="flex gap-2">
            <CheckIcon className="text-highlight mt-0.5 size-4 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <h4 className="mt-6 text-sm font-semibold">Não incluído</h4>
      <ul className="text-muted-foreground mt-3 space-y-2 text-sm">
        {plan.excludes.map((item) => (
          <li key={item} className="flex gap-2">
            <MinusIcon className="mt-0.5 size-4 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <LinkButton href={ctaHref} variant={featured ? "accent" : "primary"} className="w-full">
          {ctaLabel}
        </LinkButton>
      </div>
    </article>
  );
}
