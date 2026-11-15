/**
 * Estado devolvido pelas Server Actions de autenticação aos formulários (`useActionState`).
 *
 * Contém só textos já resolvidos para o idioma e, em caso de erro, os valores NÃO sensíveis
 * para voltar a preencher o formulário. Nunca contém palavras-passe nem detalhes do Auth.
 */
export type FormValues = {
  readonly email?: string;
  readonly fullName?: string;
  readonly company?: string;
};

export type FormState =
  | { readonly status: "idle" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly fieldErrors: Readonly<Record<string, string>>;
      readonly values: FormValues;
    }
  | { readonly status: "success"; readonly message: string };

export const IDLE_STATE: FormState = { status: "idle" };
