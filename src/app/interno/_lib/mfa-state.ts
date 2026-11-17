/**
 * Estado das acções de MFA (A4). Durante a inscrição contém o QR e a chave TOTP do PRÓPRIO
 * utilizador (necessários para configurar a aplicação autenticadora); nunca é registado.
 */
export type MfaState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "enrolling";
      readonly factorId: string;
      readonly qrCode: string;
      readonly secret: string;
    };

export const MFA_IDLE: MfaState = { status: "idle" };
