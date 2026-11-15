import { buttonClasses } from "@/components/button";
import { FormMessage } from "@/components/form-message";

import type { FormState } from "../_lib/form-state";

/** Botão de envio com estado de carregamento anunciado (`aria-busy`). */
export function SubmitButton({
  label,
  pendingLabel,
  pending,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={buttonClasses("primary", "md", "w-full")}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Mensagem geral do formulário a partir do estado da acção. */
export function StateMessage({ state, id }: { state: FormState; id: string }) {
  if (state.status === "idle") return null;
  return (
    <FormMessage
      id={id}
      tone={state.status === "error" ? "error" : "success"}
      message={state.message}
    />
  );
}

export function fieldErrors(state: FormState): Readonly<Record<string, string>> {
  return state.status === "error" ? state.fieldErrors : {};
}

export function previousValues(state: FormState) {
  return state.status === "error" ? state.values : {};
}
