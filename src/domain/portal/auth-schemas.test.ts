import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PASSWORD_MIN_LENGTH,
  emailSchema,
  fieldErrorsOf,
  newPasswordSchema,
  newPasswordValueSchema,
  recoveryRequestSchema,
  signInSchema,
  signUpSchema,
} from "./auth-schemas";

// Valores FICTÍCIOS.
const GOOD = "Fict1ciaSegura";
const config = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");

describe("política alinhada com supabase/config.toml", () => {
  it("mínimo de 12 caracteres e lower_upper_letters_digits", () => {
    expect(config).toMatch(new RegExp(`^minimum_password_length = ${PASSWORD_MIN_LENGTH}$`, "m"));
    expect(config).toMatch(/^password_requirements = "lower_upper_letters_digits"$/m);
  });
});

describe("emailSchema", () => {
  it("corta espaços e normaliza para minúsculas", () => {
    expect(emailSchema.parse("  Ana.Silva@Example.TEST ")).toBe("ana.silva@example.test");
  });

  it.each(["", "   ", "sem-arroba", "a@", "@b.test", "a b@c.test"])("recusa %j", (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });

  it("limite de 254 caracteres", () => {
    expect(emailSchema.safeParse(`${"a".repeat(64)}@${"b".repeat(185)}.test`).success).toBe(false);
  });
});

describe("newPasswordValueSchema", () => {
  const issues = (value: string) => {
    const r = newPasswordValueSchema.safeParse(value);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("aceita uma palavra-passe conforme", () => {
    expect(issues(GOOD)).toEqual([]);
  });

  it.each([
    ["Curta1Aa", "too_short"],
    ["semmaiusculas123", "missing_uppercase"],
    ["SEMMINUSCULAS123", "missing_lowercase"],
    ["SemAlgarismosAqui", "missing_digit"],
    ["", "required"],
  ])("%j → %s", (value, expected) => {
    expect(issues(value)).toContain(expected);
  });

  it("limite de 72 bytes (bcrypt), contando UTF-8", () => {
    expect(issues(`Aa1${"x".repeat(69)}`)).toEqual([]);
    expect(issues(`Aa1${"x".repeat(70)}`)).toContain("too_long");
    expect(issues(`Aa1${"é".repeat(35)}`)).toContain("too_long");
  });

  it("não corta espaços", () => {
    expect(newPasswordValueSchema.parse(`  ${GOOD}  `)).toBe(`  ${GOOD}  `);
  });
});

describe("signInSchema", () => {
  it("não aplica a política de complexidade na entrada", () => {
    expect(signInSchema.safeParse({ email: "a@b.test", password: "x" }).success).toBe(true);
  });

  it("exige e-mail e palavra-passe", () => {
    const r = signInSchema.safeParse({ email: "", password: "" });
    expect(r.success).toBe(false);
    expect(fieldErrorsOf(r.error!)).toEqual({ email: "required", password: "required" });
  });
});

describe("signUpSchema", () => {
  const base = {
    fullName: "Ana Fictícia",
    company: "",
    email: "ana@example.test",
    password: GOOD,
    passwordConfirmation: GOOD,
    locale: "pt-AO",
  };

  it("normaliza: empresa vazia → null, caracteres de controlo removidos", () => {
    expect(signUpSchema.parse({ ...base, fullName: " Ana\u0000 Fictícia\n " })).toMatchObject({
      fullName: "Ana Fictícia",
      company: null,
      email: "ana@example.test",
    });
  });

  it("limites: nome 120, empresa 160", () => {
    const ok = (o: object) => signUpSchema.safeParse({ ...base, ...o }).success;
    expect(ok({ fullName: "a".repeat(120) })).toBe(true);
    expect(ok({ fullName: "a".repeat(121) })).toBe(false);
    expect(ok({ fullName: "   " })).toBe(false);
    expect(ok({ company: "c".repeat(160) })).toBe(true);
    expect(ok({ company: "c".repeat(161) })).toBe(false);
    expect(ok({ company: undefined })).toBe(true);
  });

  it("confirmação diferente → mismatch no campo de confirmação", () => {
    const r = signUpSchema.safeParse({ ...base, passwordConfirmation: `${GOOD}x` });
    expect(fieldErrorsOf(r.error!)).toEqual({ passwordConfirmation: "mismatch" });
  });

  it("idioma só pt-AO ou pt-BR", () => {
    expect(signUpSchema.safeParse({ ...base, locale: "en" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, locale: "pt-BR" }).success).toBe(true);
  });
});

describe("recuperação e nova palavra-passe", () => {
  it("recuperação só precisa de e-mail válido", () => {
    expect(recoveryRequestSchema.parse({ email: " X@Y.TEST " })).toEqual({ email: "x@y.test" });
  });

  it("nova palavra-passe com política e confirmação", () => {
    expect(
      newPasswordSchema.safeParse({ password: GOOD, passwordConfirmation: GOOD }).success,
    ).toBe(true);
    const r = newPasswordSchema.safeParse({ password: "fraca", passwordConfirmation: "fraca" });
    expect(fieldErrorsOf(r.error!).password).toBe("too_short");
  });
});

describe("fieldErrorsOf", () => {
  it("devolve só códigos fechados, nunca os valores recebidos", () => {
    const secret = "ValorSecreto123";
    const r = signUpSchema.safeParse({
      fullName: "",
      email: secret,
      password: secret.toLowerCase(),
      passwordConfirmation: secret,
      locale: "xx",
    });
    const errors = fieldErrorsOf(r.error!);
    expect(JSON.stringify(errors)).not.toContain(secret);
    expect(JSON.stringify(errors)).not.toContain(secret.toLowerCase());
    expect(errors).toMatchObject({
      fullName: "required",
      email: "invalid_email",
      password: "missing_uppercase",
      locale: "invalid_locale",
    });
  });
});
