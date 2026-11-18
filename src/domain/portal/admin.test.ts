import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUDIT_ENTITY_TYPES,
  parseAssignment,
  parseAuditFilter,
  parseCancelProvisioning,
  parseProvision,
  parseReopen,
  parseRoleChange,
  parseStatusChange,
} from "./admin";
import { mapPortalError } from "./errors";

// Valores FICTÍCIOS.
const TICKET = "00000000-0000-4000-8000-00000000000a";
const USER = "00000000-0000-4000-8000-000000000099";

const M2 = readFileSync(
  join(process.cwd(), "supabase/migrations/20261113115533_portal_functions.sql"),
  "utf8",
);

describe("entradas administrativas", () => {
  it("atribuição: operador ou vazio (retirar)", () => {
    expect(parseAssignment({ ticketId: TICKET, operatorId: "" })).toEqual({
      ok: true,
      value: { ticketId: TICKET, operatorId: null },
    });
    expect(parseAssignment({ ticketId: TICKET, operatorId: USER })).toMatchObject({ ok: true });
    expect(parseAssignment({ ticketId: TICKET, operatorId: "x" })).toEqual({
      ok: false,
      issues: { operatorId: "operator" },
    });
  });

  it("reabertura exige motivo (D12) até 1000", () => {
    expect(parseReopen({ ticketId: TICKET, reason: "  " })).toEqual({
      ok: false,
      issues: { reason: "reasonRequired" },
    });
    expect(parseReopen({ ticketId: TICKET, reason: "a".repeat(1001) }).ok).toBe(false);
    expect(parseReopen({ ticketId: TICKET, reason: " Erro " })).toEqual({
      ok: true,
      value: { ticketId: TICKET, reason: "Erro" },
    });
  });

  it("papéis e estado: listas fechadas; anonimizado recusado", () => {
    expect(parseRoleChange({ userId: USER, role: "admin", change: "grant" })).toMatchObject({
      ok: true,
    });
    expect(parseRoleChange({ userId: USER, role: "root", change: "grant" }).ok).toBe(false);
    expect(parseRoleChange({ userId: USER, role: "admin", change: "x" }).ok).toBe(false);
    expect(parseStatusChange({ userId: USER, status: "suspenso" })).toMatchObject({ ok: true });
    expect(parseStatusChange({ userId: USER, status: "anonimizado" }).ok).toBe(false);
  });

  it("provisionamento: normaliza como a M2 (minúsculas, sem espaços)", () => {
    expect(parseProvision({ email: "  Ana@Example.TEST " })).toEqual({
      ok: true,
      value: { email: "ana@example.test" },
    });
    for (const email of ["", "ana", "ana@x", "a b@x.test"]) {
      expect(parseProvision({ email }).ok).toBe(false);
    }
    expect(parseCancelProvisioning({ provisioningId: "12" })).toEqual({
      ok: true,
      value: { provisioningId: 12 },
    });
    for (const id of ["0", "-1", "1.5", "abc", ""]) {
      expect(parseCancelProvisioning({ provisioningId: id }).ok).toBe(false);
    }
  });

  it("filtro da auditoria: tipos da M2 e identificador seguro", () => {
    const fromM2 = new Set(
      [...M2.matchAll(/write_audit\('\w+',\s*'(\w+)'/g)].map((match) => match[1]),
    );
    expect([...AUDIT_ENTITY_TYPES].sort()).toEqual([...fromM2].sort());
    expect(parseAuditFilter({ tipo: "ticket", id: TICKET })).toEqual({
      entityType: "ticket",
      entityId: TICKET,
    });
    expect(parseAuditFilter({ tipo: "x", id: "a'; drop" })).toEqual({
      entityType: null,
      entityId: null,
    });
  });
});

describe("mensagens das RPCs administrativas", () => {
  it("motivos conhecidos com o SQLSTATE certo; os restantes caem no genérico", () => {
    expect(mapPortalError({ code: "PT409", message: "last_admin" }).reason).toBe("last_admin");
    expect(mapPortalError({ code: "42501", message: "self_grant_forbidden" }).reason).toBe(
      "self_grant_forbidden",
    );
    expect(mapPortalError({ code: "PT409", message: "already_provisioned" }).reason).toBe(
      "already_provisioned",
    );
    expect(mapPortalError({ code: "22023", message: "last_admin" }).reason).toBeNull();
  });
});
