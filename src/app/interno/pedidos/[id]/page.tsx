import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form-message";
import { isPortalEnabled } from "@/config/portal";
import { site } from "@/config/site";
import { portalAuth } from "@/content/portal-auth";
import { ticketEventLabels, ticketStatusLabels, ticketTypeLabels } from "@/content/portal-client";
import { portalStaff } from "@/content/portal-staff";
import { staffTransitionsFrom } from "@/domain/portal/staff";
import { formatDateTime, isClosedStatus } from "@/domain/portal/tickets";
import { consolePaths, requireConsoleStaff } from "@/lib/portal/dal";
import { type StaffEvent, getStaffTicket } from "@/services/portal/staff-console";

import { Loading } from "../../../cliente/_components/auth-shell";
import { StatusBadge } from "../../../cliente/_components/portal-shell";
import { t } from "../../../cliente/_lib/text";
import {
  InternalNoteForm,
  StaffMessageForm,
  TransitionForm,
} from "../../_components/console-forms";
import { ConsoleShell } from "../../_components/console-shell";

export const metadata: Metadata = { title: t(portalStaff.home.title) };

/** Rota dinâmica sem parâmetros conhecidos no build (mesmo motivo da A3). */
export const instant = false;

type Params = Promise<{ id: string }>;

/**
 * Detalhe de um pedido na consola (A4): dados, requerente (com `phone`, Q2), conta, mensagens,
 * notas internas, histórico completo com `evidence_ref` (só por `staff_ticket_events`) e
 * transições do staff. Pedido não atribuído (operador), inexistente ou id inválido → o mesmo
 * «não encontrado» neutro.
 */
export default function StaffTicketPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <ConsoleShell title={t(portalStaff.home.title)}>
          <Loading />
        </ConsoleShell>
      }
    >
      <StaffTicket params={params} />
    </Suspense>
  );
}

function eventText(event: StaffEvent): string {
  const label = t(ticketEventLabels[event.type]);
  if (event.fromStatus && event.toStatus) {
    return `${label}: ${t(ticketStatusLabels[event.fromStatus])} → ${t(ticketStatusLabels[event.toStatus])}`;
  }
  return label;
}

async function StaffTicket({ params }: { params: Params }) {
  if (!isPortalEnabled()) notFound();
  const viewer = await requireConsoleStaff();
  const { id } = await params;
  const result = await getStaffTicket(id, viewer.profile.id);
  const s = portalStaff.detail;
  if (!result.ok) {
    return (
      <ConsoleShell title={t(portalStaff.home.title)}>
        <FormMessage tone="error" message={t(result.error.message)} />
      </ConsoleShell>
    );
  }
  const ticket = result.value;
  if (!ticket) notFound();

  const closed = isClosedStatus(ticket.status);
  const sending = t(portalAuth.common.sending);
  const missing = t(s.notProvided);
  const transitions = staffTransitionsFrom(ticket.status);

  return (
    <ConsoleShell title={ticket.subject}>
      <div className="grid max-w-4xl gap-10">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">{t(s.reference)}</dt>
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
            <dt className="text-muted-foreground">{t(s.requester)}</dt>
            <dd>{ticket.requester?.name ?? missing}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t(s.phone)}</dt>
            <dd>{ticket.requester?.phone ?? missing}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t(s.account)}</dt>
            <dd>
              {ticket.account
                ? [ticket.account.name, ticket.account.country, ticket.account.sector]
                    .filter(Boolean)
                    .join(" · ")
                : missing}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t(s.created)}</dt>
            <dd>{formatDateTime(ticket.createdAt, site.locale)}</dd>
          </div>
        </dl>

        <section aria-labelledby="staff-descricao" className="grid gap-3">
          <h2 id="staff-descricao" className="text-lg font-semibold">
            {t(s.description)}
          </h2>
          <p className="border-border rounded-lg border p-4 text-sm whitespace-pre-wrap">
            {ticket.description}
          </p>
        </section>

        {closed ? (
          <p className="text-muted-foreground text-sm">{t(s.closed)}</p>
        ) : (
          <section
            aria-labelledby="staff-transicao"
            className="border-border grid gap-3 rounded-xl border p-6"
          >
            <h2 id="staff-transicao" className="text-lg font-semibold">
              {t(s.transition)}
            </h2>
            {transitions.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t(s.noTransitions)}</p>
            ) : (
              <TransitionForm
                ticketId={ticket.id}
                expectedStatus={ticket.status}
                options={transitions.map((transition) => ({
                  value: transition.to,
                  label: t(ticketStatusLabels[transition.to]),
                  requiresReason: transition.requiresReason,
                  requiresEvidence: transition.requiresEvidence,
                }))}
                text={{
                  toStatus: t(s.toStatus),
                  placeholder: t(s.toStatusPlaceholder),
                  reason: t(s.reason),
                  reasonHint: t(s.reasonHint),
                  evidence: t(s.evidence),
                  evidenceHint: t(s.evidenceHint),
                  required: t(portalAuth.common.required),
                  submit: t(s.apply),
                  sending,
                }}
              />
            )}
          </section>
        )}

        <section aria-labelledby="staff-mensagens" className="grid gap-4">
          <h2 id="staff-mensagens" className="text-lg font-semibold">
            {t(s.messages)}
          </h2>
          {ticket.messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t(s.noMessages)}</p>
          ) : (
            <ol className="grid gap-3">
              {ticket.messages.map((message) => (
                <li key={message.id} className="border-border rounded-lg border p-4">
                  <p className="text-muted-foreground mb-2 text-xs">
                    <strong className="text-foreground">
                      {message.author === "self"
                        ? t(s.you)
                        : message.author === "client"
                          ? (ticket.requester?.name ?? t(s.client))
                          : t(s.team)}
                    </strong>{" "}
                    · {formatDateTime(message.createdAt, site.locale)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                </li>
              ))}
            </ol>
          )}
          {!closed && (
            <StaffMessageForm
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

        <section
          aria-labelledby="staff-notas"
          className="border-warning bg-warning/5 grid gap-4 rounded-xl border p-6"
        >
          <h2 id="staff-notas" className="text-lg font-semibold">
            {t(s.notes)}
          </h2>
          <p className="text-muted-foreground text-sm">{t(s.notesHint)}</p>
          {ticket.notes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t(s.noNotes)}</p>
          ) : (
            <ol className="grid gap-3">
              {ticket.notes.map((note) => (
                <li key={note.id} className="border-border bg-background rounded-lg border p-4">
                  <p className="text-muted-foreground mb-2 text-xs">
                    <strong className="text-foreground">{t(note.mine ? s.you : s.team)}</strong> ·{" "}
                    {formatDateTime(note.createdAt, site.locale)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                </li>
              ))}
            </ol>
          )}
          <InternalNoteForm
            ticketId={ticket.id}
            text={{ label: t(s.noteLabel), hint: t(s.notesHint), submit: t(s.addNote), sending }}
          />
        </section>

        <section aria-labelledby="staff-historico" className="grid gap-3">
          <h2 id="staff-historico" className="text-lg font-semibold">
            {t(s.history)}
          </h2>
          <ol className="border-border grid gap-3 border-l pl-4 text-sm">
            {ticket.events.map((event) => (
              <li key={event.id}>
                <p>
                  {eventText(event)}
                  {event.visibility === "interno" && (
                    <span className="border-warning ml-2 rounded-full border px-2 text-xs">
                      {t(s.internalTag)}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(event.createdAt, site.locale)}
                </p>
                {event.reason && (
                  <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
                    {t(s.reason)}: {event.reason}
                  </p>
                )}
                {event.evidenceRef && (
                  <p className="text-muted-foreground mt-1">
                    {t(s.evidenceLabel)}: {event.evidenceRef}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>

        <p>
          <Link
            href={consolePaths.home}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {t(s.back)}
          </Link>
        </p>
      </div>
    </ConsoleShell>
  );
}
