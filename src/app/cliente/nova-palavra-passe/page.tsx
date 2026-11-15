import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { clientRoutes } from "@/config/navigation";
import { isPortalEnabled } from "@/config/portal";
import { portalAuth } from "@/content/portal-auth";
import { NEW_PASSWORD_PATH } from "@/lib/portal/auth-urls";
import { getRecoveryState } from "@/services/portal/auth";

import { NewPasswordForm } from "../_components/auth-forms";
import { AuthShell, Loading, Notice } from "../_components/auth-shell";
import { commonText, t } from "../_lib/text";

export const metadata: Metadata = { title: t(portalAuth.newPassword.title) };

export default function NewPasswordPage() {
  const s = portalAuth.newPassword;
  return (
    <AuthShell
      title={t(s.title)}
      intro={t(s.intro)}
      links={[{ href: clientRoutes.recover, label: t(s.requestNew) }]}
    >
      <Suspense fallback={<Loading />}>
        <NewPasswordContent />
      </Suspense>
    </AuthShell>
  );
}

/**
 * Só mostra o formulário a uma sessão cujos claims verificados provem uma recuperação recente
 * (`amr` `recovery` ≤ 600 s). A acção volta a verificar tudo antes de alterar.
 */
async function NewPasswordContent() {
  // Mesma barreira do layout (renderizados em paralelo), antes de ler a sessão.
  if (!isPortalEnabled()) notFound();
  const state = await getRecoveryState();

  if (state === "session_missing") {
    redirect(`${clientRoutes.signIn}?next=${encodeURIComponent(NEW_PASSWORD_PATH)}`);
  }
  if (state === "unavailable") return <Notice value="indisponivel" />;
  if (state === "recovery_required") {
    return <p className="text-pretty">{t(portalAuth.newPassword.recoveryRequired)}</p>;
  }

  return <NewPasswordForm text={{ ...commonText(), submit: t(portalAuth.newPassword.submit) }} />;
}
