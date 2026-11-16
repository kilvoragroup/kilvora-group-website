"use client";

import { type ReactNode, useActionState, useState } from "react";

import { buttonClasses } from "@/components/button";
import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";
import { cx } from "@/lib/cx";

import type { PortalFormState } from "../_lib/portal-form-state";
import { PORTAL_IDLE } from "../_lib/portal-form-state";
import {
  addMessageAction,
  cancelTicketAction,
  createTicketAction,
  updateAccountAction,
  updateProfileAction,
} from "../portal-actions";

/**
 * Formulários da área do cliente (A3). Toda a validação e autorização é feita no servidor
 * (Server Actions → DAL → serviços → RPC/RLS); estes componentes só apresentam o estado
 * devolvido. Os textos chegam já resolvidos para o idioma.
 */

const controlClasses = (error?: string) =>
  cx(
    "bg-background text-foreground w-full rounded-md border px-3 text-base",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    error ? "border-danger" : "border-input",
  );

function errorsOf(state: PortalFormState) {
  return state.status === "error" ? state.fieldErrors : {};
}

function valuesOf(state: PortalFormState) {
  return state.status === "error" ? state.values : {};
}

function Message({ state, id }: { state: PortalFormState; id: string }) {
  if (state.status === "idle") return null;
  return (
    <FormMessage
      id={id}
      tone={state.status === "error" ? "error" : "success"}
      message={state.message}
    />
  );
}

function Submit({
  label,
  pendingLabel,
  pending,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  variant?: "primary" | "outline";
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={buttonClasses(variant, "md")}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function Described({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = error ? `${id}-erro` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(describedBy)}
      {error && (
        <p id={errorId} className="text-danger text-sm">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}

function TextArea({
  id,
  name,
  label,
  hint,
  error,
  defaultValue,
  maxLength,
  rows = 6,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  maxLength: number;
  rows?: number;
  required?: boolean;
}) {
  return (
    <Described id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <textarea
          id={id}
          name={name}
          rows={rows}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          defaultValue={defaultValue}
          maxLength={maxLength}
          className={cx(controlClasses(error), "py-2")}
        />
      )}
    </Described>
  );
}

// ---------------------------------------------------------------------------------------------
// Novo pedido
// ---------------------------------------------------------------------------------------------

export type PlanOption = {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly price: string;
  readonly maintenance: string;
  readonly pages: string;
  readonly delivery: string;
};

export type NewTicketText = {
  type: string;
  typePlaceholder: string;
  plan: string;
  planHint: string;
  planUndecided: string;
  development: string;
  maintenance: string;
  perMonth: string;
  subject: string;
  subjectHint: string;
  details: string;
  detailsHint: string;
  submit: string;
  sending: string;
  disclaimer: string;
};

export function NewTicketForm({
  types,
  websiteType,
  plans,
  initialType,
  initialPlan,
  text,
}: {
  types: readonly { value: string; label: string }[];
  websiteType: string;
  plans: readonly PlanOption[];
  initialType: string;
  initialPlan: string;
  text: NewTicketText;
}) {
  const [state, action, pending] = useActionState(createTicketAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  const sent = valuesOf(state);
  const [type, setType] = useState(sent.type ?? initialType);
  const selectedPlan = sent.planId ?? initialPlan;

  return (
    <form action={action} noValidate className="grid gap-6" aria-describedby="pedido-mensagem">
      <Message state={state} id="pedido-mensagem" />

      <Described id="pedido-tipo" label={text.type} error={errors.type}>
        {(describedBy) => (
          <select
            id="pedido-tipo"
            name="type"
            required
            aria-required
            aria-invalid={errors.type ? true : undefined}
            aria-describedby={describedBy}
            value={type}
            onChange={(event) => setType(event.target.value)}
            className={cx(controlClasses(errors.type), "h-11")}
          >
            <option value="">{text.typePlaceholder}</option>
            {types.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        )}
      </Described>

      {type === websiteType && (
        <fieldset className="grid gap-3" aria-describedby="pedido-plano-dica">
          <legend className="text-sm font-semibold">{text.plan}</legend>
          <p id="pedido-plano-dica" className="text-muted-foreground text-sm">
            {text.planHint}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {plans.map((plan) => (
              <label
                key={plan.id}
                className="border-border has-checked:border-primary has-checked:bg-primary/5 grid cursor-pointer gap-1 rounded-lg border p-4"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    name="planId"
                    value={plan.id}
                    defaultChecked={selectedPlan === plan.id}
                  />
                  {plan.name}
                </span>
                <span className="text-muted-foreground text-sm">{plan.subtitle}</span>
                <span className="text-sm">
                  {text.development}: <strong>{plan.price}</strong>
                </span>
                <span className="text-sm">
                  {text.maintenance}: {plan.maintenance}
                  {text.perMonth}
                </span>
                <span className="text-muted-foreground text-xs">
                  {plan.pages} · {plan.delivery}
                </span>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="planId"
              value=""
              defaultChecked={!plans.some((plan) => plan.id === selectedPlan)}
            />
            {text.planUndecided}
          </label>
          {errors.planId && <p className="text-danger text-sm">{errors.planId}</p>}
          <p className="text-muted-foreground text-xs">{text.disclaimer}</p>
        </fieldset>
      )}

      <FormField
        id="pedido-assunto"
        name="subject"
        autoComplete="off"
        label={text.subject}
        required
        maxLength={160}
        hint={text.subjectHint}
        defaultValue={sent.subject}
        error={errors.subject}
      />
      <TextArea
        id="pedido-descricao"
        name="details"
        label={text.details}
        hint={text.detailsHint}
        required
        maxLength={5000}
        rows={8}
        defaultValue={sent.details}
        error={errors.details}
      />
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Detalhe: mensagem e cancelamento
// ---------------------------------------------------------------------------------------------

export function MessageForm({
  ticketId,
  text,
}: {
  ticketId: string;
  text: { label: string; hint: string; submit: string; sending: string };
}) {
  const [state, action, pending] = useActionState(addMessageAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby="mensagem-estado">
      <Message state={state} id="mensagem-estado" />
      <input type="hidden" name="ticketId" value={ticketId} />
      <TextArea
        id="mensagem-corpo"
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

export function CancelForm({
  ticketId,
  expectedStatus,
  text,
}: {
  ticketId: string;
  expectedStatus: string;
  text: { reason: string; submit: string; sending: string };
}) {
  const [state, action, pending] = useActionState(cancelTicketAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby="cancelar-estado">
      <Message state={state} id="cancelar-estado" />
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="expectedStatus" value={expectedStatus} />
      <TextArea
        id="cancelar-motivo"
        name="reason"
        label={text.reason}
        maxLength={1000}
        rows={3}
        defaultValue={valuesOf(state).reason}
        error={errors.reason}
      />
      <div>
        <Submit
          label={text.submit}
          pendingLabel={text.sending}
          pending={pending}
          variant="outline"
        />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Perfil e conta
// ---------------------------------------------------------------------------------------------

export function ProfileForm({
  initial,
  text,
}: {
  initial: { fullName: string; phone: string; locale: string };
  text: {
    fullName: string;
    phone: string;
    phoneHint: string;
    locale: string;
    localeAO: string;
    localeBR: string;
    submit: string;
    sending: string;
  };
}) {
  const [state, action, pending] = useActionState(updateProfileAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  const sent = valuesOf(state);
  return (
    <form action={action} noValidate className="grid gap-5" aria-describedby="perfil-estado">
      <Message state={state} id="perfil-estado" />
      <FormField
        id="perfil-nome"
        name="fullName"
        autoComplete="name"
        label={text.fullName}
        required
        maxLength={120}
        defaultValue={sent.fullName ?? initial.fullName}
        error={errors.fullName}
      />
      <FormField
        id="perfil-telefone"
        name="phone"
        autoComplete="tel"
        label={text.phone}
        maxLength={32}
        hint={text.phoneHint}
        defaultValue={sent.phone ?? initial.phone}
        error={errors.phone}
      />
      <Described id="perfil-idioma" label={text.locale} error={errors.locale}>
        {(describedBy) => (
          <select
            id="perfil-idioma"
            name="locale"
            aria-describedby={describedBy}
            defaultValue={sent.locale ?? initial.locale}
            className={cx(controlClasses(errors.locale), "h-11")}
          >
            <option value="pt-AO">{text.localeAO}</option>
            <option value="pt-BR">{text.localeBR}</option>
          </select>
        )}
      </Described>
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}

export function AccountForm({
  initial,
  text,
}: {
  initial: { name: string; country: string; sector: string };
  text: {
    name: string;
    country: string;
    countryHint: string;
    sector: string;
    submit: string;
    sending: string;
  };
}) {
  const [state, action, pending] = useActionState(updateAccountAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  const sent = valuesOf(state);
  return (
    <form action={action} noValidate className="grid gap-5" aria-describedby="conta-estado">
      <Message state={state} id="conta-estado" />
      <FormField
        id="conta-nome"
        name="name"
        autoComplete="organization"
        label={text.name}
        required
        maxLength={160}
        defaultValue={sent.name ?? initial.name}
        error={errors.name}
      />
      <FormField
        id="conta-pais"
        name="country"
        autoComplete="country"
        label={text.country}
        maxLength={2}
        hint={text.countryHint}
        defaultValue={sent.country ?? initial.country}
        error={errors.country}
      />
      <FormField
        id="conta-sector"
        name="sector"
        autoComplete="off"
        label={text.sector}
        maxLength={80}
        defaultValue={sent.sector ?? initial.sector}
        error={errors.sector}
      />
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}
