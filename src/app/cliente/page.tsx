import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { buttonClasses } from "@/components/button";
import { isPortalEnabled } from "@/config/portal";
import { portalAuth } from "@/content/portal-auth";
import { requireClient } from "@/lib/portal/dal";

import { signOutAction } from "./actions";
import { AuthShell, Loading } from "./_components/auth-shell";
import { t } from "./_lib/text";

export const metadata: Metadata = { title: t(portalAuth.home.title) };

/**
 * Página mínima autenticada (A2). Os pedidos e a conta chegam na A3.
 * A sessão é lida atrás de `<Suspense>` e verificada na DAL (`requireClient`): sem sessão →
 * entrada; perfil não cliente ou inactivo → «não encontrado» neutro.
 */
export default function ClientHomePage() {
  const s = portalAuth.home;
  return (
    <AuthShell title={t(s.title)} intro={t(s.intro)}>
      <Suspense fallback={<Loading />}>
        <ClientSession />
      </Suspense>
    </AuthShell>
  );
}

async function ClientSession() {
  // O layout e a página são renderizados em paralelo: a barreira repete-se aqui, antes de
  // qualquer leitura de sessão (também evita contactar o Supabase no pré-render).
  if (!isPortalEnabled()) notFound();
  const viewer = await requireClient();
  const name = viewer.profile.fullName;
  return (
    <div className="grid gap-5">
      {name && (
        <p>
          {t(portalAuth.home.signedInAs)} <strong>{name}</strong>
        </p>
      )}
      {/* Saída só por POST (Server Action). */}
      <form action={signOutAction}>
        <button type="submit" className={buttonClasses("outline", "md")}>
          {t(portalAuth.home.signOut)}
        </button>
      </form>
    </div>
  );
}
