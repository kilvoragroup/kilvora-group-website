import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  recoveryAction: vi.fn(),
  newPasswordAction: vi.fn(),
}));

import { FormField } from "@/components/form-field";
import { FormMessage } from "@/components/form-message";

import { NewPasswordForm, RecoveryForm, SignInForm, SignUpForm } from "./auth-forms";

const common = {
  email: "E-mail",
  password: "Palavra-passe",
  newPassword: "Nova palavra-passe",
  passwordConfirmation: "Confirmar palavra-passe",
  passwordHint: "Pelo menos 12 caracteres.",
  required: "obrigatório",
  sending: "A enviar…",
};

/** Cada `<input>` visível tem um `<label for>` correspondente. */
function expectLabelledInputs(html: string) {
  const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(html, id).toContain(`for="${id}"`);
}

describe("formulários: acessibilidade básica", () => {
  const forms = {
    entrada: renderToStaticMarkup(
      <SignInForm next="/cliente" text={{ ...common, submit: "Entrar" }} />,
    ),
    registo: renderToStaticMarkup(
      <SignUpForm
        text={{
          ...common,
          fullName: "Nome completo",
          company: "Empresa (opcional)",
          companyHint: "Nome da conta.",
          submit: "Criar conta",
        }}
      />,
    ),
    recuperacao: renderToStaticMarkup(<RecoveryForm text={{ ...common, submit: "Enviar link" }} />),
    novaPalavraPasse: renderToStaticMarkup(
      <NewPasswordForm text={{ ...common, submit: "Guardar" }} />,
    ),
  };

  it.each(Object.entries(forms))("%s: campos rotulados e botão de envio", (_name, html) => {
    expectLabelledInputs(html);
    expect(html).toMatch(/<button[^>]*type="submit"/);
    // Os atributos HTML não distinguem maiúsculas (o React pode emitir `noValidate`).
    expect(html.toLowerCase()).toContain("novalidate");
  });

  it.each(Object.entries(forms))("%s: campos obrigatórios marcados", (_name, html) => {
    expect(html).toMatch(
      /required=""[^>]*aria-required="true"|aria-required="true"[^>]*required=""/,
    );
  });

  it("autocomplete adequado a cada campo", () => {
    const lower = (html: string) => html.toLowerCase();
    expect(lower(forms.entrada)).toContain('autocomplete="email"');
    expect(lower(forms.entrada)).toContain('autocomplete="current-password"');
    expect(lower(forms.registo)).toContain('autocomplete="new-password"');
    expect(lower(forms.registo)).toContain('autocomplete="name"');
    expect(lower(forms.registo)).toContain('autocomplete="organization"');
    expect(lower(forms.novaPalavraPasse)).toContain('autocomplete="new-password"');
    expect(lower(forms.novaPalavraPasse)).not.toContain('autocomplete="current-password"');
  });

  it("palavras-passe nunca têm valor inicial no HTML", () => {
    for (const html of Object.values(forms)) {
      for (const match of html.matchAll(/<input[^>]*type="password"[^>]*>/g)) {
        expect(match[0]).not.toContain("value=");
      }
    }
  });

  it("entrada envia o destino já validado como campo oculto", () => {
    expect(forms.entrada).toContain('<input type="hidden" name="next" value="/cliente"/>');
  });

  it("dica da palavra-passe ligada por aria-describedby", () => {
    expect(forms.registo).toMatch(
      /id="registo-palavra-passe"[^>]*aria-describedby="registo-palavra-passe-dica"|aria-describedby="registo-palavra-passe-dica"[^>]*id="registo-palavra-passe"/,
    );
    expect(forms.registo).toContain('id="registo-palavra-passe-dica"');
  });
});

describe("FormField", () => {
  it("com erro: aria-invalid e erro ligado antes da dica", () => {
    const html = renderToStaticMarkup(
      <FormField
        id="campo"
        name="email"
        type="email"
        autoComplete="email"
        label="E-mail"
        hint="Dica"
        error="Indique um e-mail válido."
        required
        requiredLabel="obrigatório"
      />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="campo-erro campo-dica"');
    expect(html).toContain('id="campo-erro"');
    expect(html).toContain("(obrigatório)");
  });

  it("sem erro: sem aria-invalid", () => {
    const html = renderToStaticMarkup(<FormField id="c" name="n" autoComplete="off" label="L" />);
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
  });
});

describe("FormMessage", () => {
  it("erros anunciados com role=alert; confirmações com role=status", () => {
    expect(renderToStaticMarkup(<FormMessage tone="error" message="x" />)).toContain(
      'role="alert"',
    );
    expect(renderToStaticMarkup(<FormMessage tone="success" message="x" />)).toContain(
      'role="status"',
    );
  });
});
