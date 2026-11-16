import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { buttonClasses } from "@/components/button";
import { FormMessage } from "@/components/form-message";
import { isPortalEnabled } from "@/config/portal";
import { site } from "@/config/site";
import { portalAuth } from "@/content/portal-auth";
import { portalClient, ticketTypeLabels } from "@/content/portal-client";
import { formatDateTime } from "@/domain/portal/tickets";
import { requireClient } from "@/lib/portal/dal";
import { listClientTickets } from "@/services/portal/client-portal";

import { Loading } from "./_components/auth-shell";
import { PortalShell, StatusBadge } from "./_components/portal-shell";
import { portalPaths, ticketPath } from "./_lib/paths";
import { t } from "./_lib/text";

export const metadata: Metadata = { title: t(portalClient.home.title) };

/**
 * Início da área de cliente (A3): lista dos pedidos da conta.
 * A sessão é lida atrás de `<Suspense>` e verificada na DAL (`requireClient`): sem sessão →
 * entrada; perfil não cliente ou inactivo → «não encontrado» neutro. A lista vem da RLS.
 */
export default function ClientHomePage() {
  const s = portalClient.home;
  return (
    <PortalShell title={t(s.title)} intro={t(s.intro)}>
      <Suspense fallback={<Loading />}>
        <ClientTickets />
      </Suspense>
    </PortalShell>
  );
}

async function ClientTickets() {
  // Layout e página são renderizados em paralelo: a barreira repete-se antes da sessão.
  if (!isPortalEnabled()) notFound();
  const viewer = await requireClient();
  const result = await listClientTickets();
  const s = portalClient.home;
  const name = viewer.profile.fullName;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4">
        {name && (
          <p className="text-sm">
            {t(portalAuth.home.signedInAs)} <strong>{name}</strong>
          </p>
        )}
        <Link href={portalPaths.newTicket} className={buttonClasses("primary", "md", "ml-auto")}>
          {t(portalClient.nav.newTicket)}
        </Link>
      </div>

      {!result.ok ? (
        <FormMessage tone="error" message={t(result.error.message)} />
      ) : result.value.length === 0 ? (
        <p className="text-muted-foreground">{t(s.empty)}</p>
      ) : (
        <ul className="divide-border border-border divide-y rounded-xl border">
          {result.value.map((ticket) => (
            <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="grid gap-1">
                <Link
                  href={ticketPath(ticket.id)}
                  className="text-primary font-semibold underline-offset-4 hover:underline"
                >
                  {ticket.subject}
                </Link>
                <p className="text-muted-foreground text-sm">
                  <span className="font-mono">{ticket.reference}</span> ·{" "}
                  {t(ticketTypeLabels[ticket.type])} · {t(s.updated)}:{" "}
                  {formatDateTime(ticket.updatedAt, site.locale)}
                </p>
              </div>
              <StatusBadge status={ticket.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
