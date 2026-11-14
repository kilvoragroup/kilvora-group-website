import { z } from "zod";

import { Constants } from "@/lib/supabase/database.types";

/**
 * Esquemas Zod das entradas do portal (não administrativas). Os limites reproduzem exactamente
 * as migrações; a base volta a validar tudo e é sempre a autoridade final.
 *
 * Fontes:
 * - M2 `create_ticket`: `btrim`, assunto 3–160, descrição 10–5000.
 * - M2 `add_ticket_message` / `add_internal_note`: `btrim`, corpo 1–5000.
 * - M2 `change_ticket_status`: `btrim` + vazio → null; motivo ≤ 1000; evidência ≤ 300;
 *   `p_expected_status` para concorrência (obrigatório na aplicação, regra 2.2.7).
 * - M1 `profiles`: `full_name` 1–120, `phone` `^\+?[0-9 ()-]{6,32}$`, `locale` pt-AO|pt-BR.
 * - M1 `accounts`: `name` 1–160, `country` `^[A-Z]{2}$`, `sector` 1–80.
 *
 * Notas de fidelidade:
 * - `btrim(text)` do PostgreSQL só remove espaços (U+0020); `String.trim()` removeria também
 *   quebras de linha e tabulações. Por isso usa-se `pgBtrim`.
 * - `char_length` conta pontos de código; `String.length` conta unidades UTF-16. Por isso usa-se
 *   `charLength`.
 */

const enums = Constants.public.Enums;

/** Equivalente a `btrim(text)` do PostgreSQL (só espaços). */
export function pgBtrim(value: string): string {
  return value.replace(/^ +| +$/g, "");
}

/** Equivalente a `char_length` do PostgreSQL (pontos de código). */
export function charLength(value: string): number {
  return Array.from(value).length;
}

function trimmedText(min: number, max: number) {
  return z
    .string()
    .transform(pgBtrim)
    .refine((s) => charLength(s) >= min && charLength(s) <= max, {
      message: `length_${min}_${max}`,
    });
}

/** Texto opcional: vazio (após `btrim`) → `null`; caso contrário, até `max` caracteres. */
function optionalTrimmedText(max: number) {
  return z
    .string()
    .nullish()
    .transform((s) => {
      const trimmed = pgBtrim(s ?? "");
      return trimmed === "" ? null : trimmed;
    })
    .refine((s) => s === null || charLength(s) <= max, { message: `max_${max}` });
}

/** Coluna anulável com `check (... between min and max)`: sem `btrim` na base. */
function nullableColumnText(min: number, max: number) {
  return z
    .string()
    .nullable()
    .transform((s) => (s === null ? null : s.trim() === "" ? null : s.trim()))
    .refine((s) => s === null || (charLength(s) >= min && charLength(s) <= max), {
      message: `length_${min}_${max}`,
    });
}

/** Identificador UUID (formato 8-4-4-4-12; a existência e o acesso são decididos pela base). */
export const uuidSchema = z.guid();

export const ticketTypeSchema = z.enum(enums.ticket_type);
export const ticketStatusSchema = z.enum(enums.ticket_status);

export const createTicketSchema = z.object({
  type: ticketTypeSchema,
  subject: trimmedText(3, 160),
  description: trimmedText(10, 5000),
});

export const ticketMessageSchema = z.object({
  ticketId: uuidSchema,
  body: trimmedText(1, 5000),
});

/** Nota interna (consola de staff): mesmos limites que a mensagem. */
export const internalNoteSchema = ticketMessageSchema;

/**
 * Mudança de estado. Não contém a matriz de transições: quais transições são válidas, e quando
 * exigem motivo ou evidência, é decidido pela base (`private.ticket_transitions`).
 */
export const changeTicketStatusSchema = z
  .object({
    ticketId: uuidSchema,
    toStatus: ticketStatusSchema,
    expectedStatus: ticketStatusSchema,
    reason: optionalTrimmedText(1000),
    evidenceRef: optionalTrimmedText(300),
  })
  .refine((value) => value.toStatus !== value.expectedStatus, {
    message: "same_status",
    path: ["toStatus"],
  });

export const PHONE_PATTERN = /^\+?[0-9 ()-]{6,32}$/;

export const profileUpdateSchema = z.object({
  fullName: nullableColumnText(1, 120),
  phone: z
    .string()
    .nullable()
    .transform((s) => (s === null || s.trim() === "" ? null : s.trim()))
    .refine((s) => s === null || PHONE_PATTERN.test(s), { message: "invalid_phone" }),
  locale: z.enum(["pt-AO", "pt-BR"]),
});

export const accountUpdateSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => charLength(s) >= 1 && charLength(s) <= 160, { message: "length_1_160" }),
  country: z
    .string()
    .nullable()
    .transform((s) => (s === null || s.trim() === "" ? null : s.trim().toUpperCase()))
    .refine((s) => s === null || /^[A-Z]{2}$/.test(s), { message: "invalid_country" }),
  sector: nullableColumnText(1, 80),
});

export type CreateTicketInput = z.output<typeof createTicketSchema>;
export type TicketMessageInput = z.output<typeof ticketMessageSchema>;
export type ChangeTicketStatusInput = z.output<typeof changeTicketStatusSchema>;
export type ProfileUpdateInput = z.output<typeof profileUpdateSchema>;
export type AccountUpdateInput = z.output<typeof accountUpdateSchema>;
