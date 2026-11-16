import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form-message";
import { isPortalEnabled } from "@/config/portal";
import { site } from "@/config/site";
import { portalAuth } from "@/content/portal-auth";
import {
  portalClient,
  ticketEventLabels,
  ticketStatusLabels,
  ticketTypeLabels,
} from "@/content/portal-client";
import { canClientCancel, formatDateTime, isClosedStatus } from "@/domain/portal/tickets";
import { requireClient } from "@/lib/portal/dal";
import { type TicketEventView, getClientTicket } from "@/services/portal/client-portal";

import { Loading } from "../../_components/auth-shell";
import { CancelForm, MessageForm } from "../../_components/portal-forms";
import { PortalShell, StatusBadge } from "../../_components/portal-shell";
import { portalPaths } from "../../_lib/paths";
import { firstParam, type SearchParams, t } from "../../_lib/text";

export const metadata: Metadata = { title: t(portalClient.home.title) };

/**
 * Rota dinâmica sem `generateStaticParams` (os pedidos só existem em tempo de pedido): o
 * cabeçalho do site lê `usePathname()` e, sem parâmetros conhecidos no build, o pré-render
 * bloqueia. `instant = false` permite esta rota bloquear (só esta página; docs: instant.md).
 */
export const instant = false;

type Params = Promise<{ id: string }>;

/**
 * Detalhe de um pedido (A3): dados, mensagens, histórico visível ao cliente e cancelamento.
 *
 * - O identificador vem do URL e só é usado como filtro sob a RLS: um pedido de outra conta,
 *   inexistente ou com identificador inválido dá o MESMO «não encontrado» (portão S4).
 * - Sem `evidence_ref` nem notas internas (portão S5): o serviço nunca os lê.
 * - A autoria do staff aparece como «Equipa KILVORA» (D04).
 */
export default function TicketPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <Suspense
      fallback={
        <PortalShell title={t(portalClient.home.title)}>
          <Loading />
        </PortalShell>
      }
    >
      <Ticket params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function eventText(event: TicketEventView): string {
  const label = t(ticketEventLabels[event.type]);
  if (event.type === "status_changed" || event.type === "reopened") {
    const from = event.fromStatus ? t(ticketStatusLabels[event.fromStatus]) : "";
    const to = event.toStatus ? t(ticketStatusLabels[event.toStatus]) : "";
    return from && to ? `${label}: ${from} → ${to}` : label;
  }
  return label;
}

async function Ticket({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  if (!isPortalEnabled()) notFound();
  const viewer = await requireClient();
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const result = await getClientTicket(id, viewer.profile.id);
  const s = portalClient.detail;
  if (!result.ok) {
    return (
      <PortalShell title={t(portalClient.home.title)}>
        <FormMessage tone="error" message={t(result.error.message)} />
      </PortalShell>
    );
  }
  const ticket = result.value;
  if (!ticket) notFound();

  const closed = isClosedStatus(ticket.status);
  const sending = t(portalAuth.common.sending);

  return (
    <PortalShell title={ticket.subject}>
      <div className="grid max-w-3xl gap-10">
        {firstParam(query.aviso) === "criado" && (
          <FormMessage tone="success" message={t(portalClient.newTicket.created)} />
        )}

        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t(portalClient.home.reference)}</dt>
            <dd className="font-mono font-semibold">{ticket.reference}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t(s.status)}</dt>
            <dd>
              <StatusBadge status={ticket.status} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t(s.type)}</dt>
            <dd>{t(ticketTypeLabels[ticket.type])}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t(s.created)}</dt>
            <dd>{formatDateTime(ticket.createdAt, site.locale)}</dd>
          </div>
          {ticket.closedAt && (
            <div>
              <dt className="text-muted-foreground">{t(s.closed)}</dt>
              <dd>{formatDateTime(ticket.closedAt, site.locale)}</dd>
            </div>
          )}
        </dl>

        <section aria-labelledby="pedido-descricao-titulo" className="grid gap-3">
          <h2 id="pedido-descricao-titulo" className="text-lg font-semibold">
            {t(s.description)}
          </h2>
          <p className="border-border rounded-lg border p-4 text-sm whitespace-pre-wrap">
            {ticket.description}
          </p>
        </section>

        <section aria-labelledby="pedido-mensagens-titulo" className="grid gap-4">
          <h2 id="pedido-mensagens-titulo" className="text-lg font-semibold">
            {t(s.messages)}
          </h2>
          {ticket.messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t(s.noMessages)}</p>
          ) : (
            <ol className="grid gap-3">
              {ticket.messages.map((message) => (
                <li
                  key={message.id}
                  className={
                    message.author === "self"
                      ? "border-border rounded-lg border p-4"
                      : "border-primary bg-primary/5 rounded-lg border p-4"
                  }
                >
                  <p className="text-muted-foreground mb-2 text-xs">
                    <strong className="text-foreground">
                      {t(message.author === "self" ? s.you : s.team)}
                    </strong>{" "}
                    · {formatDateTime(message.createdAt, site.locale)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                </li>
              ))}
            </ol>
          )}
          {closed ? (
            <p className="text-muted-foreground text-sm">{t(s.closedNotice)}</p>
          ) : (
            <MessageForm
              ticketId={ticket.id}
              text={{
                label: t(s.messageLabel),
                hint: t(s.messageHint),
                submit: t(s.send),
                sending,
              }}
            />
          )}
        </section>

        <section aria-labelledby="pedido-historico-titulo" className="grid gap-3">
          <h2 id="pedido-historico-titulo" className="text-lg font-semibold">
            {t(s.history)}
          </h2>
          <ol className="border-border grid gap-3 border-l pl-4 text-sm">
            {ticket.events.map((event) => (
              <li key={event.id}>
                <p>{eventText(event)}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(event.createdAt, site.locale)}
                </p>
                {event.reason && (
                  <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
                    {t(s.reason)}: {event.reason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>

        {canClientCancel(ticket.status) && (
          <section
            aria-labelledby="pedido-cancelar-titulo"
            className="border-border grid gap-3 rounded-xl border p-6"
          >
            <h2 id="pedido-cancelar-titulo" className="text-lg font-semibold">
              {t(s.cancelTitle)}
            </h2>
            <p className="text-muted-foreground text-sm">{t(s.cancelIntro)}</p>
            <CancelForm
              ticketId={ticket.id}
              expectedStatus={ticket.status}
              text={{ reason: t(s.cancelReason), submit: t(s.cancelSubmit), sending }}
            />
          </section>
        )}

        <p>
          <Link
            href={portalPaths.home}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {t(s.back)}
          </Link>
        </p>
      </div>
    </PortalShell>
  );
}
