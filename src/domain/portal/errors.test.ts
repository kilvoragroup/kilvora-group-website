import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mapPortalError } from "./errors";

const M2 = readFileSync(
  join(process.cwd(), "supabase/migrations/20261113115533_portal_functions.sql"),
  "utf8",
);

const pg = (code: string, message = "x", extra: object = {}) => ({
  code,
  message,
  details: "detalhe interno",
  hint: "pista interna",
  ...extra,
});

describe("mapPortalError — SQLSTATE", () => {
  it.each([
    ["PT404", "not_found"],
    ["PT409", "conflict"],
    ["PT422", "business_rule"],
    ["PT429", "rate_limited"],
    ["22023", "invalid_input"],
    ["42501", "forbidden"],
    ["23514", "integrity"],
    ["23502", "integrity"],
    ["PGRST116", "not_found"],
    ["PGRST301", "session_expired"],
    ["PGRST303", "session_expired"],
    ["PGRST999", "unexpected"],
    ["XX000", "unexpected"],
    ["23505", "unexpected"],
  ])("%s → %s", (code, kind) => {
    expect(mapPortalError(pg(code)).kind).toBe(kind);
  });

  it("cobre todos os SQLSTATE lançados pela M2", () => {
    const codes = new Set([...M2.matchAll(/errcode\s*=\s*'([A-Z0-9]{5})'/g)].map((m) => m[1]));
    expect([...codes].sort()).toEqual(
      ["22023", "23502", "23514", "42501", "PT404", "PT409", "PT422", "PT429"].sort(),
    );
    for (const code of codes) expect(mapPortalError(pg(code)).kind, code).not.toBe("unexpected");
  });
});

describe("mapPortalError — PT404 neutro", () => {
  it("dá sempre a mesma resposta, seja qual for a mensagem da base", () => {
    const a = mapPortalError(pg("PT404", "not_found_or_forbidden"));
    const b = mapPortalError(pg("PT404", "conta de outro cliente"));
    expect(a).toEqual(b);
    expect(a.reason).toBeNull();
    expect(a.message["pt-AO"]).not.toMatch(/permiss|acesso|outra conta|exist/i);
  });

  it("PGRST116 (.single() sem linhas) é igual a PT404", () => {
    expect(mapPortalError(pg("PGRST116"))).toEqual(mapPortalError(pg("PT404")));
  });
});

describe("mapPortalError — sem divulgação", () => {
  it("nunca devolve message, details nem hint da base", () => {
    const secret = "relation private.audit_log column evidence_ref";
    for (const code of ["PT404", "PT409", "42501", "23514", "23502", "XX000"]) {
      const result = mapPortalError(pg(code, secret, { details: secret, hint: secret }));
      const text = JSON.stringify(result);
      expect(text, code).not.toContain("private.");
      expect(text, code).not.toContain("evidence_ref");
      expect(text, code).not.toContain("detalhe interno");
      expect(Object.keys(result).sort()).toEqual(["kind", "message", "reason", "retryable"]);
    }
  });

  it("23514/23502: mensagem genérica, mesmo com texto da base", () => {
    const r = mapPortalError(pg("23514", "user_roles: o alvo tem de ser um perfil interno activo"));
    expect(r).toMatchObject({ kind: "integrity", reason: null });
    expect(r.message["pt-AO"]).not.toContain("user_roles");
  });
});

describe("mapPortalError — motivos conhecidos", () => {
  it.each([
    ["PT409", "status_conflict"],
    ["PT409", "ticket_closed"],
    ["PT422", "transition_not_allowed"],
    ["PT422", "reason_required"],
    ["PT422", "evidence_required"],
    ["PT429", "too_many_open_tickets"],
    ["22023", "invalid_subject"],
    ["22023", "invalid_description"],
    ["22023", "invalid_body"],
    ["22023", "invalid_reason"],
    ["22023", "invalid_evidence_ref"],
    ["22023", "invalid_type"],
  ])("%s %s", (code, reason) => {
    expect(M2).toContain(`errcode = '${code}', message = '${reason}'`);
    expect(mapPortalError(pg(code, reason)).reason).toBe(reason);
  });

  it("ignora o motivo se o SQLSTATE não coincidir", () => {
    expect(mapPortalError(pg("PT404", "status_conflict"))).toMatchObject({
      kind: "not_found",
      reason: null,
    });
  });

  it("ignora chaves herdadas do protótipo", () => {
    expect(mapPortalError(pg("PT409", "toString")).reason).toBeNull();
  });

  it("todas as mensagens existem em pt-AO e pt-BR", () => {
    for (const code of ["PT404", "PT409", "PT422", "PT429", "22023", "42501", "23514", "XX000"]) {
      const { message } = mapPortalError(pg(code));
      expect(message["pt-AO"].length).toBeGreaterThan(0);
      expect(message["pt-BR"].length).toBeGreaterThan(0);
    }
  });
});

describe("mapPortalError — outros erros", () => {
  it("falhas de rede → unavailable (repetível)", () => {
    expect(mapPortalError(new TypeError("fetch failed"))).toMatchObject({
      kind: "unavailable",
      retryable: true,
    });
    expect(mapPortalError({ name: "AbortError" }).kind).toBe("unavailable");
  });

  it("valores inesperados → unexpected", () => {
    for (const value of [null, undefined, "erro", 42, {}, { code: 5 }, new Error("x")]) {
      expect(mapPortalError(value).kind).toBe("unexpected");
    }
  });

  it("retryable só para rate_limited, unavailable e conflict", () => {
    expect(mapPortalError(pg("PT429")).retryable).toBe(true);
    expect(mapPortalError(pg("PT409")).retryable).toBe(true);
    expect(mapPortalError(pg("PT404")).retryable).toBe(false);
    expect(mapPortalError(pg("42501")).retryable).toBe(false);
  });
});
