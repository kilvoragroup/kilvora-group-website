"use client";

import { useActionState, useState } from "react";

import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { cx } from "@/lib/cx";

import {
  Described,
  Message,
  Submit,
  TextArea,
  controlClasses,
  errorsOf,
  valuesOf,
} from "../../cliente/_components/portal-forms";
import { PORTAL_IDLE } from "../../cliente/_lib/portal-form-state";
import {
  internalNoteAction,
  staffMessageAction,
  startEnrollmentAction,
  transitionAction,
  verifyTotpAction,
} from "../actions";
import { MFA_IDLE } from "../_lib/mfa-state";

/**
 * Formulários da consola interna (A4). Validação e autorização no servidor (Server Actions →
 * DAL com `aal2` → RPC da M2). Textos já resolvidos.
 */

type BodyText = { label: string; hint: string; submit: string; sending: string };

function BodyForm({
  idPrefix,
  ticketId,
  text,
  action: serverAction,
}: {
  idPrefix: string;
  ticketId: string;
  text: BodyText;
  action: typeof staffMessageAction;
}) {
  const [state, action, pending] = useActionState(serverAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby={`${idPrefix}-estado`}>
      <Message state={state} id={`${idPrefix}-estado`} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <TextArea
        id={`${idPrefix}-corpo`}
        name="body"
        label={text.label}
        hint={text.hint}
        required
        maxLength={5000}
        rows={4}
        defaultValue={valuesOf(state).body}
        error={errors.body}
      />
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}

export function StaffMessageForm(props: { ticketId: string; text: BodyText }) {
  return <BodyForm idPrefix="staff-mensagem" action={staffMessageAction} {...props} />;
}

export function InternalNoteForm(props: { ticketId: string; text: BodyText }) {
  return <BodyForm idPrefix="nota" action={internalNoteAction} {...props} />;
}

export type TransitionOption = {
  readonly value: string;
  readonly label: string;
  readonly requiresReason: boolean;
  readonly requiresEvidence: boolean;
};

export function TransitionForm({
  ticketId,
  expectedStatus,
  options,
  text,
}: {
  ticketId: string;
  expectedStatus: string;
  options: readonly TransitionOption[];
  text: {
    toStatus: string;
    placeholder: string;
    reason: string;
    reasonHint: string;
    evidence: string;
    evidenceHint: string;
    required: string;
    submit: string;
    sending: string;
  };
}) {
  const [state, action, pending] = useActionState(transitionAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  const sent = valuesOf(state);
  const [to, setTo] = useState("");
  const selected = options.find((option) => option.value === to);

  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby="transicao-estado">
      <Message state={state} id="transicao-estado" />
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="expectedStatus" value={expectedStatus} />
      <Described id="transicao-destino" label={text.toStatus} error={errors.toStatus}>
        {(describedBy) => (
          <select
            id="transicao-destino"
            name="toStatus"
            required
            aria-required
            aria-describedby={describedBy}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={cx(controlClasses(errors.toStatus), "h-11")}
          >
            <option value="">{text.placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </Described>
      <TextArea
        id="transicao-motivo"
        name="reason"
        label={selected?.requiresReason ? `${text.reason} (${text.required})` : text.reason}
        hint={text.reasonHint}
        required={selected?.requiresReason}
        maxLength={1000}
        rows={3}
        defaultValue={sent.reason}
        error={errors.reason}
      />
      <FormField
        id="transicao-evidencia"
        name="evidenceRef"
        autoComplete="off"
        label={selected?.requiresEvidence ? `${text.evidence} (${text.required})` : text.evidence}
        hint={text.evidenceHint}
        required={selected?.requiresEvidence}
        maxLength={300}
        defaultValue={sent.evidenceRef}
        error={errors.evidenceRef}
      />
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}

export function MfaPanel({
  verifiedFactorId,
  text,
}: {
  verifiedFactorId: string | null;
  text: {
    enrollTitle: string;
    enrollIntro: string;
    start: string;
    secret: string;
    qrAlt: string;
    verifyTitle: string;
    code: string;
    verify: string;
    sending: string;
  };
}) {
  const [enrollState, startAction, starting] = useActionState(startEnrollmentAction, MFA_IDLE);
  const [verifyState, verifyAction, verifying] = useActionState(verifyTotpAction, MFA_IDLE);
  // A inscrição (QR e chave) mantém-se enquanto o código não for aceite.
  const enrolling = enrollState.status === "enrolling" ? enrollState : null;
  const factorId = verifiedFactorId ?? enrolling?.factorId ?? null;
  const message =
    verifyState.status === "error"
      ? verifyState.message
      : enrollState.status === "error"
        ? enrollState.message
        : null;

  return (
    <div className="grid gap-6">
      {message && <FormMessage id="mfa-mensagem" tone="error" message={message} />}

      {!verifiedFactorId && !enrolling && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{text.enrollTitle}</h2>
          <p className="text-muted-foreground text-sm">{text.enrollIntro}</p>
          <form action={startAction}>
            <Submit label={text.start} pendingLabel={text.sending} pending={starting} />
          </form>
        </section>
      )}

      {enrolling && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">{text.enrollTitle}</h2>
          <p className="text-muted-foreground text-sm">{text.enrollIntro}</p>
          {/* QR em SVG (data URI) devolvido pelo Supabase Auth; só para o próprio utilizador. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qrCode} alt={text.qrAlt} width={180} height={180} />
          <p className="text-sm">
            {text.secret}:{" "}
            <code id="mfa-segredo" className="font-mono break-all">
              {enrolling.secret}
            </code>
          </p>
        </section>
      )}

      {factorId && (
        <form action={verifyAction} noValidate className="grid gap-4">
          <h2 className="text-lg font-semibold">{text.verifyTitle}</h2>
          <input type="hidden" name="factorId" value={factorId} />
          <FormField
            id="mfa-codigo"
            name="code"
            autoComplete="one-time-code"
            label={text.code}
            required
            maxLength={6}
          />
          <div>
            <Submit label={text.verify} pendingLabel={text.sending} pending={verifying} />
          </div>
        </form>
      )}
    </div>
  );
}
