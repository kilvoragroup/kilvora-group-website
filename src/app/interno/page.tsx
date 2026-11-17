import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form-message";
import { isPortalEnabled } from "@/config/portal";
import { site } from "@/config/site";
import { ticketTypeLabels } from "@/content/portal-client";
import { portalStaff } from "@/content/portal-staff";
import { formatDateTime } from "@/domain/portal/tickets";
import { requireConsoleStaff } from "@/lib/portal/dal";
import { listStaffTickets } from "@/services/portal/staff-console";

import { Loading } from "../cliente/_components/auth-shell";
import { StatusBadge } from "../cliente/_components/portal-shell";
import { t } from "../cliente/_lib/text";
import { ConsoleShell } from "./_components/console-shell";
import { staffTicketPath } from "./_lib/paths";

export const metadata: Metadata = { title: t(portalStaff.home.title) };

/**
 * Consola interna (A4): pedidos atribuídos (operador) ou todos (admin), conforme a RLS.
 * Staff sem `aal2` é enviado para a verificação TOTP (S7).
 */
export default function ConsoleHomePage() {
  return (
    <ConsoleShell title={t(portalStaff.home.title)}>
      <Suspense fallback={<Loading />}>
        <StaffTickets />
      </Suspense>
    </ConsoleShell>
  );
}

async function StaffTickets() {
  if (!isPortalEnabled()) notFound();
  const viewer = await requireConsoleStaff();
  const result = await listStaffTickets();
  const s = portalStaff.home;
  const isAdmin = viewer.roles.includes("admin");

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground">{t(isAdmin ? s.introAdmin : s.introOperator)}</p>
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
                  href={staffTicketPath(ticket.id)}
                  className="text-primary font-semibold underline-offset-4 hover:underline"
                >
                  {ticket.subject}
                </Link>
                <p className="text-muted-foreground text-sm">
                  <span className="font-mono">{ticket.reference}</span> ·{" "}
                  {t(ticketTypeLabels[ticket.type])} · {t(s.updated)}:{" "}
                  {formatDateTime(ticket.updatedAt, site.locale)}
                  {!ticket.assigned && <> · {t(s.unassigned)}</>}
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
