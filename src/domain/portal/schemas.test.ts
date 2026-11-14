import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PHONE_PATTERN,
  accountUpdateSchema,
  changeTicketStatusSchema,
  charLength,
  createTicketSchema,
  pgBtrim,
  profileUpdateSchema,
  ticketMessageSchema,
} from "./schemas";

const read = (file: string) =>
  readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8");
const M1 = read("20261113093521_portal_schema.sql");
const M2 = read("20261113115533_portal_functions.sql");

const TICKET = "6f1c2b9e-0b1a-4c7e-9d2f-1a2b3c4d5e6f";

describe("limites comprovados nas migrações", () => {
  it.each([
    [M1, "char_length(subject) between 3 and 160"],
    [M1, "char_length(description) between 10 and 5000"],
    [M1, "char_length(body) between 1 and 5000"],
    [M1, "char_length(reason) between 1 and 1000"],
    [M1, "char_length(evidence_ref) between 1 and 300"],
    [M1, "char_length(full_name) between 1 and 120"],
    [M1, "char_length(name) between 1 and 160"],
    [M1, "char_length(sector) between 1 and 80"],
    [M1, "country ~ '^[A-Z]{2}$'"],
    [M1, "locale in ('pt-AO', 'pt-BR')"],
    [M2, "char_length(v_subject) not between 3 and 160"],
    [M2, "char_length(v_desc) not between 10 and 5000"],
    [M2, "char_length(v_body) not between 1 and 5000"],
    [M2, "char_length(v_reason) > 1000"],
    [M2, "char_length(v_evidence) > 300"],
  ])("%#: %s", (source, fragment) => {
    expect(source).toContain(fragment);
  });

  it("o padrão de telefone é o da M1", () => {
    expect(M1).toContain(`phone ~ '${PHONE_PATTERN.source}'`);
  });
});

describe("pgBtrim e charLength", () => {
  it("pgBtrim só remove espaços, como btrim(text)", () => {
    expect(pgBtrim("  abc  ")).toBe("abc");
    expect(pgBtrim("\n abc \t")).toBe("\n abc \t");
  });

  it("charLength conta pontos de código, como char_length", () => {
    expect(charLength("😀😀😀")).toBe(3);
    expect("😀😀😀".length).toBe(6);
  });
});

describe("createTicketSchema", () => {
  const base = { type: "consultoria", subject: "Assunto", description: "Descrição válida" };

  it("aceita e aplica btrim", () => {
    expect(createTicketSchema.parse({ ...base, subject: "  Abc  " })).toMatchObject({
      subject: "Abc",
    });
  });

  it("limites do assunto (3–160) e da descrição (10–5000)", () => {
    const ok = (o: object) => createTicketSchema.safeParse({ ...base, ...o }).success;
    expect(ok({ subject: "ab" })).toBe(false);
    expect(ok({ subject: "   ab   " })).toBe(false);
    expect(ok({ subject: "abc" })).toBe(true);
    expect(ok({ subject: "a".repeat(160) })).toBe(true);
    expect(ok({ subject: "a".repeat(161) })).toBe(false);
    expect(ok({ subject: "😀".repeat(160) })).toBe(true);
    expect(ok({ description: "a".repeat(9) })).toBe(false);
    expect(ok({ description: "a".repeat(10) })).toBe(true);
    expect(ok({ description: "a".repeat(5000) })).toBe(true);
    expect(ok({ description: "a".repeat(5001) })).toBe(false);
  });

  it("aceita só os tipos do enum da base", () => {
    expect(createTicketSchema.safeParse({ ...base, type: "outro" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...base, type: "pedido_generico" }).success).toBe(true);
  });
});

describe("ticketMessageSchema", () => {
  it("corpo 1–5000 após btrim e id UUID", () => {
    const ok = (o: object) =>
      ticketMessageSchema.safeParse({ ticketId: TICKET, body: "Olá", ...o }).success;
    expect(ok({})).toBe(true);
    expect(ok({ body: "   " })).toBe(false);
    expect(ok({ body: "a".repeat(5000) })).toBe(true);
    expect(ok({ body: "a".repeat(5001) })).toBe(false);
    expect(ok({ ticketId: "123" })).toBe(false);
  });
});

describe("changeTicketStatusSchema", () => {
  const base = { ticketId: TICKET, toStatus: "em_analise", expectedStatus: "recebido" };

  it("exige o estado esperado (concorrência)", () => {
    expect(changeTicketStatusSchema.safeParse({ ...base, expectedStatus: undefined }).success).toBe(
      false,
    );
  });

  it("motivo e evidência: vazio → null; limites 1000 e 300", () => {
    const parsed = changeTicketStatusSchema.parse({ ...base, reason: "   ", evidenceRef: null });
    expect(parsed).toMatchObject({ reason: null, evidenceRef: null });
    const ok = (o: object) => changeTicketStatusSchema.safeParse({ ...base, ...o }).success;
    expect(ok({ reason: "a".repeat(1000) })).toBe(true);
    expect(ok({ reason: "a".repeat(1001) })).toBe(false);
    expect(ok({ evidenceRef: "a".repeat(300) })).toBe(true);
    expect(ok({ evidenceRef: "a".repeat(301) })).toBe(false);
  });

  it("recusa estados fora do enum e transição para o mesmo estado", () => {
    expect(changeTicketStatusSchema.safeParse({ ...base, toStatus: "apagado" }).success).toBe(
      false,
    );
    expect(changeTicketStatusSchema.safeParse({ ...base, toStatus: "recebido" }).success).toBe(
      false,
    );
  });
});

describe("profileUpdateSchema", () => {
  const base = { fullName: "Ana", phone: null, locale: "pt-AO" };

  it("nome 1–120; vazio → null", () => {
    const ok = (o: object) => profileUpdateSchema.safeParse({ ...base, ...o }).success;
    expect(profileUpdateSchema.parse({ ...base, fullName: "  " }).fullName).toBeNull();
    expect(ok({ fullName: "a".repeat(120) })).toBe(true);
    expect(ok({ fullName: "a".repeat(121) })).toBe(false);
  });

  it("telefone segundo o padrão da M1", () => {
    const ok = (phone: string | null) => profileUpdateSchema.safeParse({ ...base, phone }).success;
    expect(ok("+244 923 000 000")).toBe(true);
    expect(ok("(11) 91234-5678")).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok("12345")).toBe(false);
    expect(ok("+244 abc")).toBe(false);
    expect(ok("1".repeat(33))).toBe(false);
  });

  it("idioma só pt-AO ou pt-BR", () => {
    expect(profileUpdateSchema.safeParse({ ...base, locale: "en" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...base, locale: "pt-BR" }).success).toBe(true);
  });
});

describe("accountUpdateSchema", () => {
  const base = { name: "Empresa", country: "ao", sector: null };

  it("nome 1–160, país ISO em maiúsculas, sector 1–80", () => {
    expect(accountUpdateSchema.parse(base)).toEqual({
      name: "Empresa",
      country: "AO",
      sector: null,
    });
    const ok = (o: object) => accountUpdateSchema.safeParse({ ...base, ...o }).success;
    expect(ok({ name: " " })).toBe(false);
    expect(ok({ name: "a".repeat(160) })).toBe(true);
    expect(ok({ name: "a".repeat(161) })).toBe(false);
    expect(ok({ country: "AGO" })).toBe(false);
    expect(ok({ country: "" })).toBe(true);
    expect(ok({ sector: "a".repeat(80) })).toBe(true);
    expect(ok({ sector: "a".repeat(81) })).toBe(false);
  });
});
