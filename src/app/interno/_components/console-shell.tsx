import Link from "next/link";
import type { ReactNode } from "react";

import { buttonClasses } from "@/components/button";
import { Container } from "@/components/container";
import { getContent } from "@/content";
import { portalStaff, portalStaffStatus } from "@/content/portal-staff";
import { consolePaths } from "@/lib/portal/dal";

import { signOutAction } from "../../cliente/actions";
import { t } from "../../cliente/_lib/text";

/**
 * Enquadramento da consola interna (A4). Componente de servidor SEM leitura de sessão: cada
 * página verifica o staff na DAL dentro do seu `<Suspense>`. `nav = false` na verificação TOTP.
 */
export function ConsoleShell({
  title,
  intro,
  nav = true,
  children,
}: {
  title: string;
  intro?: string;
  nav?: boolean;
  children: ReactNode;
}) {
  const { common } = getContent();
  const s = portalStaff.nav;
  return (
    <section aria-labelledby="consola-titulo" className="py-section">
      <Container>
        <nav
          aria-label={t(s.label)}
          className="border-border mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-b pb-4"
        >
          <p className="text-sm font-semibold">{t(s.label)}</p>
          {nav && (
            <Link
              href={consolePaths.home}
              className="text-primary text-sm font-semibold underline-offset-4 hover:underline"
            >
              {t(s.tickets)}
            </Link>
          )}
          {/* Saída só por POST (Server Action da A2). */}
          <form action={signOutAction} className="ml-auto">
            <button type="submit" className={buttonClasses("outline", "sm")}>
              {t(s.signOut)}
            </button>
          </form>
        </nav>
        <header className="mb-8 max-w-3xl">
          <h1 id="consola-titulo" className="text-heading font-semibold text-balance">
            {title}
          </h1>
          {intro && <p className="text-muted-foreground mt-3 text-pretty">{intro}</p>}
          {portalStaffStatus === "provisorio" && (
            <p className="border-warning bg-warning/15 mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold">
              {common.inValidation}
            </p>
          )}
        </header>
        {children}
      </Container>
    </section>
  );
}
