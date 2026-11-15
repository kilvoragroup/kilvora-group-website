import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/container";
import { FormMessage } from "@/components/form-message";
import { getContent } from "@/content";
import { isPortalNoticeKey, portalAuth, portalAuthStatus } from "@/content/portal-auth";

import { t } from "../_lib/text";

type AuthLink = { href: string; label: string };

/**
 * Enquadramento das páginas de autenticação: título, introdução, aviso «Em validação» (P7),
 * conteúdo e ligações secundárias. Componente de servidor, sem leitura de sessão.
 */
export function AuthShell({
  title,
  intro,
  links = [],
  children,
}: {
  title: string;
  intro: string;
  links?: AuthLink[];
  children: ReactNode;
}) {
  const { common } = getContent();
  return (
    <section aria-labelledby="auth-titulo" className="py-section">
      <Container>
        <div className="mx-auto max-w-xl">
          <header className="mb-8">
            <h1 id="auth-titulo" className="text-heading font-semibold text-balance">
              {title}
            </h1>
            <p className="text-muted-foreground mt-3 text-pretty">{intro}</p>
            {portalAuthStatus === "provisorio" && (
              <p className="border-warning bg-warning/15 mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold">
                {common.inValidation}
              </p>
            )}
          </header>
          <div className="border-border rounded-xl border p-6 sm:p-8">{children}</div>
          {links.length > 0 && (
            <nav aria-label={title} className="mt-6">
              <ul className="grid gap-2 text-sm">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </Container>
    </section>
  );
}

/** Aviso de uma chave fechada (`?aviso=`). Valores desconhecidos não são apresentados. */
export function Notice({ value }: { value: string | undefined }) {
  if (!isPortalNoticeKey(value)) return null;
  const notice = portalAuth.notices[value];
  return (
    <div className="mb-5">
      <FormMessage tone={notice.tone} message={t(notice.text)} />
    </div>
  );
}

/** Marcador simples enquanto a parte dependente do pedido carrega. */
export function Loading() {
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {t(portalAuth.loading)}
    </p>
  );
}
