/**
 * Estado devolvido pelas Server Actions da área do cliente (A3) aos formulários
 * (`useActionState`). Só textos já resolvidos para o idioma e, em caso de erro, os valores
 * enviados para voltar a preencher o formulário. Nunca contém detalhes da base.
 */
export type PortalFormState =
  | { readonly status: "idle" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly fieldErrors: Readonly<Record<string, string>>;
      readonly values: Readonly<Record<string, string>>;
    }
  | { readonly status: "success"; readonly message: string };

export const PORTAL_IDLE: PortalFormState = { status: "idle" };
