"use client";

import { useActionState } from "react";

import { buttonClasses } from "@/components/button";
import { FormField } from "@/components/form-field";
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
import { type PortalFormState, PORTAL_IDLE } from "../../cliente/_lib/portal-form-state";
import {
  assignAction,
  cancelProvisioningAction,
  provisionAction,
  provisioningStatusAction,
  removeMisclassifiedAction,
  reopenAction,
  roleAction,
  statusAction,
} from "../admin-actions";

/**
 * Formulários da administração (A5). Autorização e validação no servidor (admin `aal2` na DAL
 * e nas RPCs da M2). Textos já resolvidos.
 */

type ServerAction = (previous: PortalFormState, formData: FormData) => Promise<PortalFormState>;

/** Botão com campos ocultos (retirar papel, suspender, reactivar). */
export function HiddenActionForm({
  id,
  action: serverAction,
  hidden,
  label,
  sending,
}: {
  id: string;
  action: "role" | "status";
  hidden: Record<string, string>;
  label: string;
  sending: string;
}) {
  const handler: ServerAction = serverAction === "role" ? roleAction : statusAction;
  const [state, action, pending] = useActionState(handler, PORTAL_IDLE);
  return (
    <form action={action} className="inline-grid gap-1" data-testid={id}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className={buttonClasses("outline", "sm")}
      >
        {pending ? sending : label}
      </button>
      {state.status !== "idle" && (
        <span
          role={state.status === "error" ? "alert" : "status"}
          className={cx("text-xs", state.status === "error" ? "text-danger" : "text-success")}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

export function GrantRoleForm({
  userId,
  options,
  text,
}: {
  userId: string;
  options: readonly { value: string; label: string }[];
  text: { role: string; submit: string; sending: string };
}) {
  const [state, action, pending] = useActionState(roleAction, PORTAL_IDLE);
  const selectId = `papel-${userId}`;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid={`dar-${userId}`}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="change" value="grant" />
      <label htmlFor={selectId} className="sr-only">
        {text.role}
      </label>
      <select id={selectId} name="role" className={cx(controlClasses(), "h-9 w-auto")}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className={buttonClasses("outline", "sm")}
      >
        {pending ? text.sending : text.submit}
      </button>
      {state.status !== "idle" && (
        <span
          role={state.status === "error" ? "alert" : "status"}
          className={cx("text-xs", state.status === "error" ? "text-danger" : "text-success")}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

export function AssignForm({
  ticketId,
  currentOperatorId,
  operators,
  text,
}: {
  ticketId: string;
  currentOperatorId: string | null;
  operators: readonly { id: string; label: string }[];
  text: { operator: string; none: string; submit: string; sending: string };
}) {
  const [state, action, pending] = useActionState(assignAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby="atribuicao-estado">
      <Message state={state} id="atribuicao-estado" />
      <input type="hidden" name="ticketId" value={ticketId} />
      <Described id="atribuicao-operador" label={text.operator} error={errors.operatorId}>
        {(describedBy) => (
          <select
            id="atribuicao-operador"
            name="operatorId"
            aria-describedby={describedBy}
            defaultValue={currentOperatorId ?? ""}
            className={cx(controlClasses(errors.operatorId), "h-11")}
          >
            <option value="">{text.none}</option>
            {operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.label}
              </option>
            ))}
          </select>
        )}
      </Described>
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}

export function ReopenForm({
  ticketId,
  text,
}: {
  ticketId: string;
  text: { reason: string; hint: string; submit: string; sending: string };
}) {
  const [state, action, pending] = useActionState(reopenAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby="reabrir-estado">
      <Message state={state} id="reabrir-estado" />
      <input type="hidden" name="ticketId" value={ticketId} />
      <TextArea
        id="reabrir-motivo"
        name="reason"
        label={text.reason}
        hint={text.hint}
        required
        maxLength={1000}
        rows={3}
        defaultValue={valuesOf(state).reason}
        error={errors.reason}
      />
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}

export function ProvisionForm({
  text,
}: {
  text: { email: string; submit: string; sending: string };
}) {
  const [state, action, pending] = useActionState(provisionAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby="provisionar-estado">
      <Message state={state} id="provisionar-estado" />
      <FormField
        id="provisionar-email"
        name="email"
        type="email"
        autoComplete="off"
        label={text.email}
        required
        maxLength={254}
        defaultValue={valuesOf(state).email}
        error={errors.email}
      />
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}

export function CancelProvisioningForm({
  text,
}: {
  text: { id: string; submit: string; sending: string };
}) {
  const [state, action, pending] = useActionState(cancelProvisioningAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby="cancelar-prov-estado">
      <Message state={state} id="cancelar-prov-estado" />
      <FormField
        id="cancelar-prov-id"
        name="provisioningId"
        autoComplete="off"
        label={text.id}
        required
        maxLength={15}
        defaultValue={valuesOf(state).provisioningId}
        error={errors.provisioningId}
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

export function ProvisioningLookupForm({
  text,
}: {
  text: { id: string; submit: string; sending: string };
}) {
  const [state, action, pending] = useActionState(provisioningStatusAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  return (
    <form
      action={action}
      noValidate
      className="grid gap-4"
      aria-describedby="consultar-prov-estado"
    >
      <Message state={state} id="consultar-prov-estado" />
      <FormField
        id="consultar-prov-id"
        name="provisioningId"
        autoComplete="off"
        label={text.id}
        required
        maxLength={15}
        defaultValue={valuesOf(state).provisioningId}
        error={errors.provisioningId}
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

/** Correcção F2: exige confirmação explícita; a base valida a elegibilidade. */
export function MisclassifiedRemovalForm({
  text,
}: {
  text: {
    userId: string;
    provisioningId: string;
    confirm: string;
    submit: string;
    sending: string;
  };
}) {
  const [state, action, pending] = useActionState(removeMisclassifiedAction, PORTAL_IDLE);
  const errors = errorsOf(state);
  const sent = valuesOf(state);
  return (
    <form action={action} noValidate className="grid gap-4" aria-describedby="f2-estado">
      <Message state={state} id="f2-estado" />
      <FormField
        id="f2-utilizador"
        name="userId"
        autoComplete="off"
        label={text.userId}
        required
        maxLength={36}
        defaultValue={sent.userId}
        error={errors.userId}
      />
      <FormField
        id="f2-provisionamento"
        name="provisioningId"
        autoComplete="off"
        label={text.provisioningId}
        required
        maxLength={15}
        defaultValue={sent.provisioningId}
        error={errors.provisioningId}
      />
      <div className="grid gap-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            id="f2-confirmar"
            type="checkbox"
            name="confirm"
            value="sim"
            aria-invalid={errors.confirm ? true : undefined}
            aria-describedby={errors.confirm ? "f2-confirmar-erro" : undefined}
          />
          {text.confirm}
        </label>
        {errors.confirm && (
          <p id="f2-confirmar-erro" className="text-danger text-sm">
            {errors.confirm}
          </p>
        )}
      </div>
      <div>
        <Submit label={text.submit} pendingLabel={text.sending} pending={pending} />
      </div>
    </form>
  );
}
