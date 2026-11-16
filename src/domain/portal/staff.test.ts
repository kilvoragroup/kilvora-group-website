import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STAFF_TRANSITIONS,
  parseInternalNote,
  parseTotpCode,
  parseTransition,
  staffMessageAuthor,
  staffTransitionsFrom,
} from "./staff";

// Valores FICTÍCIOS.
const TICKET = "00000000-0000-4000-8000-00000000000a";
const STAFF = "00000000-0000-4000-8000-000000000099";
const CLIENT = "00000000-0000-4000-8000-000000000001";

const M2 = readFileSync(
  join(process.cwd(), "supabase/migrations/20261113115533_portal_functions.sql"),
  "utf8",
);

describe("matriz de transições do staff", () => {
  it("coincide exactamente com as linhas `staff` da M2 (incluindo motivo e evidência)", () => {
    const rows = [
      ...M2.matchAll(/\('(\w+)',\s*'(\w+)',\s*'staff',\s*(true|false),\s*(true|false)\)/g),
    ].map((m) => `${m[1]}>${m[2]}:${m[3]}:${m[4]}`);
    expect(rows).toHaveLength(16);
    const mirror = STAFF_TRANSITIONS.map(
      (t) => `${t.from}>${t.to}:${t.requiresReason}:${t.requiresEvidence}`,
    );
    expect([...mirror].sort()).toEqual([...rows].sort());
  });

  it("estados finais não têm transições do staff (reabertura é da A5)", () => {
    for (const status of ["concluido", "recusado", "cancelado"] as const) {
      expect(staffTransitionsFrom(status)).toEqual([]);
    }
  });
});

describe("parseTransition", () => {
  const base = { ticketId: TICKET, expectedStatus: "recebido", toStatus: "em_analise" };

  it("aceita uma transição válida e normaliza texto vazio para null", () => {
    expect(parseTransition({ ...base, reason: " ", evidenceRef: "" })).toEqual({
      ok: true,
      value: { ...base, reason: null, evidenceRef: null },
    });
  });

  it("recusa transição desconhecida (incluindo a do cliente ou a reabertura)", () => {
    expect(parseTransition({ ...base, toStatus: "concluido" })).toEqual({
      ok: false,
      issues: { toStatus: "toStatus" },
    });
    expect(
      parseTransition({ ...base, expectedStatus: "cancelado", toStatus: "em_analise" }),
    ).toEqual({ ok: false, issues: { toStatus: "toStatus" } });
  });

  it("exige motivo para recusar ou cancelar, e evidência para aceite/recusa de proposta", () => {
    expect(
      parseTransition({ ...base, expectedStatus: "em_analise", toStatus: "recusado" }),
    ).toEqual({ ok: false, issues: { reason: "reasonRequired" } });
    expect(
      parseTransition({ ...base, expectedStatus: "proposta_enviada", toStatus: "aceite" }),
    ).toEqual({ ok: false, issues: { evidenceRef: "evidenceRequired" } });
    expect(
      parseTransition({
        ...base,
        expectedStatus: "proposta_enviada",
        toStatus: "aceite",
        evidenceRef: " PROP-2026-01 ",
      }),
    ).toMatchObject({ ok: true, value: { evidenceRef: "PROP-2026-01" } });
  });

  it("limites 1000/300 e identificador inválido", () => {
    expect(parseTransition({ ...base, reason: "a".repeat(1001) })).toEqual({
      ok: false,
      issues: { reason: "reason" },
    });
    expect(parseTransition({ ...base, evidenceRef: "a".repeat(301) })).toEqual({
      ok: false,
      issues: { evidenceRef: "evidenceRef" },
    });
    expect(parseTransition({ ...base, ticketId: "x" }).ok).toBe(false);
  });
});

describe("nota interna, TOTP e autoria", () => {
  it("nota: 1–5000 após btrim", () => {
    expect(parseInternalNote({ ticketId: TICKET, body: "  " }).ok).toBe(false);
    expect(parseInternalNote({ ticketId: TICKET, body: " Ok " })).toEqual({
      ok: true,
      value: { ticketId: TICKET, body: "Ok" },
    });
  });

  it("TOTP: exactamente 6 algarismos", () => {
    expect(parseTotpCode({ code: "123 456" })).toEqual({ ok: true, value: { code: "123456" } });
    for (const code of ["12345", "1234567", "abcdef", ""]) {
      expect(parseTotpCode({ code }).ok).toBe(false);
    }
  });

  it("autoria: próprio, cliente requerente ou equipa", () => {
    expect(staffMessageAuthor(STAFF, STAFF, CLIENT)).toBe("self");
    expect(staffMessageAuthor(CLIENT, STAFF, CLIENT)).toBe("client");
    expect(staffMessageAuthor("outro", STAFF, CLIENT)).toBe("team");
  });
});
