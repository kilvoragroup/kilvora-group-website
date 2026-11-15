"use client";

import { useActionState } from "react";

import { FormField } from "@/components/form-field";

import { newPasswordAction, recoveryAction, signInAction, signUpAction } from "../actions";
import { IDLE_STATE } from "../_lib/form-state";
import { SubmitButton, StateMessage, fieldErrors, previousValues } from "./form-parts";

/**
 * Formulários de autenticação (A2-B3). Toda a validação e decisão é feita no servidor (Server
 * Actions → serviços B2); estes componentes só apresentam o estado devolvido. Os textos chegam
 * já resolvidos para o idioma, como propriedades.
 *
 * Os campos de palavra-passe nunca recebem valor inicial: depois de um erro voltam vazios.
 */

export type CommonText = {
  email: string;
  password: string;
  newPassword: string;
  passwordConfirmation: string;
  passwordHint: string;
  required: string;
  sending: string;
};

export function SignInForm({
  next,
  text,
}: {
  next: string;
  text: CommonText & { submit: string };
}) {
  const [state, action, pending] = useActionState(signInAction, IDLE_STATE);
  const errors = fieldErrors(state);
  const values = previousValues(state);

  return (
    <form action={action} noValidate className="grid gap-5" aria-describedby="entrar-mensagem">
      <StateMessage state={state} id="entrar-mensagem" />
      <input type="hidden" name="next" value={next} />
      <FormField
        id="entrar-email"
        name="email"
        type="email"
        autoComplete="email"
        label={text.email}
        required
        requiredLabel={text.required}
        maxLength={254}
        defaultValue={values.email}
        error={errors.email}
      />
      <FormField
        id="entrar-palavra-passe"
        name="password"
        type="password"
        autoComplete="current-password"
        label={text.password}
        required
        requiredLabel={text.required}
        error={errors.password}
      />
      <SubmitButton label={text.submit} pendingLabel={text.sending} pending={pending} />
    </form>
  );
}

export function SignUpForm({
  text,
}: {
  text: CommonText & {
    fullName: string;
    company: string;
    companyHint: string;
    submit: string;
  };
}) {
  const [state, action, pending] = useActionState(signUpAction, IDLE_STATE);
  const errors = fieldErrors(state);
  const values = previousValues(state);

  if (state.status === "success") {
    return <StateMessage state={state} id="registo-mensagem" />;
  }

  return (
    <form action={action} noValidate className="grid gap-5" aria-describedby="registo-mensagem">
      <StateMessage state={state} id="registo-mensagem" />
      <FormField
        id="registo-nome"
        name="fullName"
        autoComplete="name"
        label={text.fullName}
        required
        requiredLabel={text.required}
        maxLength={120}
        defaultValue={values.fullName}
        error={errors.fullName}
      />
      <FormField
        id="registo-empresa"
        name="company"
        autoComplete="organization"
        label={text.company}
        maxLength={160}
        hint={text.companyHint}
        defaultValue={values.company}
        error={errors.company}
      />
      <FormField
        id="registo-email"
        name="email"
        type="email"
        autoComplete="email"
        label={text.email}
        required
        requiredLabel={text.required}
        maxLength={254}
        defaultValue={values.email}
        error={errors.email}
      />
      <FormField
        id="registo-palavra-passe"
        name="password"
        type="password"
        autoComplete="new-password"
        label={text.password}
        required
        requiredLabel={text.required}
        hint={text.passwordHint}
        error={errors.password}
      />
      <FormField
        id="registo-confirmacao"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        label={text.passwordConfirmation}
        required
        requiredLabel={text.required}
        error={errors.passwordConfirmation}
      />
      <SubmitButton label={text.submit} pendingLabel={text.sending} pending={pending} />
    </form>
  );
}

export function RecoveryForm({ text }: { text: CommonText & { submit: string } }) {
  const [state, action, pending] = useActionState(recoveryAction, IDLE_STATE);
  const errors = fieldErrors(state);
  const values = previousValues(state);

  if (state.status === "success") {
    return <StateMessage state={state} id="recuperar-mensagem" />;
  }

  return (
    <form action={action} noValidate className="grid gap-5" aria-describedby="recuperar-mensagem">
      <StateMessage state={state} id="recuperar-mensagem" />
      <FormField
        id="recuperar-email"
        name="email"
        type="email"
        autoComplete="email"
        label={text.email}
        required
        requiredLabel={text.required}
        maxLength={254}
        defaultValue={values.email}
        error={errors.email}
      />
      <SubmitButton label={text.submit} pendingLabel={text.sending} pending={pending} />
    </form>
  );
}

export function NewPasswordForm({ text }: { text: CommonText & { submit: string } }) {
  const [state, action, pending] = useActionState(newPasswordAction, IDLE_STATE);
  const errors = fieldErrors(state);

  return (
    <form action={action} noValidate className="grid gap-5" aria-describedby="nova-mensagem">
      <StateMessage state={state} id="nova-mensagem" />
      <FormField
        id="nova-palavra-passe"
        name="password"
        type="password"
        autoComplete="new-password"
        label={text.newPassword}
        required
        requiredLabel={text.required}
        hint={text.passwordHint}
        error={errors.password}
      />
      <FormField
        id="nova-confirmacao"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        label={text.passwordConfirmation}
        required
        requiredLabel={text.required}
        error={errors.passwordConfirmation}
      />
      <SubmitButton label={text.submit} pendingLabel={text.sending} pending={pending} />
    </form>
  );
}
