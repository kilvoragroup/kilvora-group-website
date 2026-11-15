import { z } from "zod";

import { charLength } from "./schemas";

/**
 * Esquemas Zod da autenticação do portal (A2). Sem I/O.
 *
 * A política da palavra-passe reproduz `supabase/config.toml`:
 * `minimum_password_length = 12` e `password_requirements = "lower_upper_letters_digits"`
 * (pelo menos uma minúscula, uma maiúscula e um dígito ASCII, como no GoTrue). O limite
 * superior de 72 bytes é o do bcrypt usado pelo GoTrue. O Auth volta a validar tudo.
 *
 * Os campos de registo seguem o que `private.handle_new_user` aproveita (P6):
 * `full_name` (até 120), `company` (até 160, nome da conta) e `locale`.
 *
 * As palavras-passe nunca são cortadas nem normalizadas.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX_LENGTH = 254;

/** Códigos de erro por campo; a interface traduz com `authFieldMessage`. */
export type AuthFieldIssue =
  | "required"
  | "invalid_email"
  | "too_long"
  | "too_short"
  | "missing_lowercase"
  | "missing_uppercase"
  | "missing_digit"
  | "mismatch"
  | "invalid_locale";

const issue = (code: AuthFieldIssue) => ({ message: code });

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

export const emailSchema = z
  .string(issue("required"))
  .trim()
  .toLowerCase()
  .min(1, issue("required"))
  .max(EMAIL_MAX_LENGTH, issue("too_long"))
  .pipe(z.email(issue("invalid_email")));

/** Palavra-passe nova (registo e recuperação): política completa. */
export const newPasswordValueSchema = z
  .string(issue("required"))
  .min(1, issue("required"))
  .refine((p) => charLength(p) >= PASSWORD_MIN_LENGTH, issue("too_short"))
  .refine((p) => utf8Bytes(p) <= PASSWORD_MAX_BYTES, issue("too_long"))
  .refine((p) => /[a-z]/.test(p), issue("missing_lowercase"))
  .refine((p) => /[A-Z]/.test(p), issue("missing_uppercase"))
  .refine((p) => /[0-9]/.test(p), issue("missing_digit"));

/** Palavra-passe na entrada: só presença e tamanho (a política é do registo). */
const existingPasswordSchema = z
  .string(issue("required"))
  .min(1, issue("required"))
  .refine((p) => utf8Bytes(p) <= PASSWORD_MAX_BYTES, issue("too_long"));

/** Remove caracteres de controlo e corta espaços, como `handle_new_user`. */
function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

export const signInSchema = z.object({
  email: emailSchema,
  password: existingPasswordSchema,
});

export const signUpSchema = z
  .object({
    fullName: z
      .string(issue("required"))
      .transform(cleanText)
      .refine((s) => s.length > 0, issue("required"))
      .refine((s) => charLength(s) <= 120, issue("too_long")),
    company: z
      .string()
      .nullish()
      .transform((s) => {
        const cleaned = cleanText(s ?? "");
        return cleaned === "" ? null : cleaned;
      })
      .refine((s) => s === null || charLength(s) <= 160, issue("too_long")),
    email: emailSchema,
    password: newPasswordValueSchema,
    passwordConfirmation: z.string(issue("required")),
    locale: z.enum(["pt-AO", "pt-BR"], issue("invalid_locale")),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    ...issue("mismatch"),
    path: ["passwordConfirmation"],
  });

export const recoveryRequestSchema = z.object({ email: emailSchema });

export const newPasswordSchema = z
  .object({
    password: newPasswordValueSchema,
    passwordConfirmation: z.string(issue("required")),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    ...issue("mismatch"),
    path: ["passwordConfirmation"],
  });

export type SignInInput = z.output<typeof signInSchema>;
export type SignUpInput = z.output<typeof signUpSchema>;
export type RecoveryRequestInput = z.output<typeof recoveryRequestSchema>;
export type NewPasswordInput = z.output<typeof newPasswordSchema>;

export type FieldErrors = Partial<Record<string, AuthFieldIssue>>;

const KNOWN_ISSUES = new Set<string>([
  "required",
  "invalid_email",
  "too_long",
  "too_short",
  "missing_lowercase",
  "missing_uppercase",
  "missing_digit",
  "mismatch",
  "invalid_locale",
]);

/**
 * Primeiro erro de cada campo, como código fechado. Nunca devolve os valores recebidos
 * (em particular, palavras-passe).
 */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const item of error.issues) {
    const field = typeof item.path[0] === "string" ? item.path[0] : "_form";
    if (result[field]) continue;
    result[field] = KNOWN_ISSUES.has(item.message) ? (item.message as AuthFieldIssue) : "required";
  }
  return result;
}
