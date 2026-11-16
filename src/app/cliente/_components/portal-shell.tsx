import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/button";
import { Container } from "@/components/container";
import { getContent } from "@/content";
import { portalClient, portalClientStatus, ticketStatusLabels } from "@/content/portal-client";
import type { TicketStatus } from "@/domain/portal/types";
import { cx } from "@/lib/cx";

import { signOutAction } from "../actions";
import { portalPaths } from "../_lib/paths";
import { t } from "../_lib/text";

/**
 * Enquadramento da área autenticada do cliente (A3): navegação, título, aviso «Em validação» e
 * conteúdo. Componente de servidor SEM leitura de sessão — cada página verifica o cliente na DAL
 * dentro do seu `<Suspense>`.
 */
export function PortalShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  const { common } = getContent();
  const nav = portalClient.nav;
  const links = [
    { href: portalPaths.home, label: t(nav.tickets) },
    { href: portalPaths.newTicket, label: t(nav.newTicket) },
    { href: portalPaths.account, label: t(nav.account) },
  ];
  return (
    <section aria-labelledby="portal-titulo" className="py-section">
      <Container>
        <nav
          aria-label={t(nav.label)}
          className="border-border mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-b pb-4"
        >
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-primary underline-offset-4 hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          {/* Saída só por POST (Server Action da A2). */}
          <form action={signOutAction} className="ml-auto">
            <button type="submit" className={buttonClasses("outline", "sm")}>
              {t(nav.signOut)}
            </button>
          </form>
        </nav>
        <header className="mb-8 max-w-3xl">
          <h1 id="portal-titulo" className="text-heading font-semibold text-balance">
            {title}
          </h1>
          {intro && <p className="text-muted-foreground mt-3 text-pretty">{intro}</p>}
          {portalClientStatus === "provisorio" && (
            <p className="border-warning bg-warning/15 mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold">
              {common.inValidation}
            </p>
          )}
        </header>
        {children}
      </Container>
    </section>
  );
}

const STATUS_TONE: Readonly<Record<TicketStatus, string>> = {
  recebido: "border-border",
  em_analise: "border-primary",
  aguarda_cliente: "border-warning bg-warning/15",
  em_preparacao_proposta: "border-primary",
  proposta_enviada: "border-primary bg-primary/10",
  aceite: "border-success bg-success/10",
  concluido: "border-success bg-success/10",
  recusado: "border-danger bg-danger/10",
  cancelado: "border-border bg-muted",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        STATUS_TONE[status],
      )}
    >
      {t(ticketStatusLabels[status])}
    </span>
  );
}
