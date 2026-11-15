import type { Metadata } from "next";

import { clientRoutes } from "@/config/navigation";
import { portalAuth } from "@/content/portal-auth";

import { RecoveryForm } from "../_components/auth-forms";
import { AuthShell } from "../_components/auth-shell";
import { commonText, t } from "../_lib/text";

export const metadata: Metadata = { title: t(portalAuth.recovery.title) };

export default function RecoveryPage() {
  const s = portalAuth.recovery;
  return (
    <AuthShell
      title={t(s.title)}
      intro={t(s.intro)}
      links={[{ href: clientRoutes.signIn, label: t(s.back) }]}
    >
      <RecoveryForm text={{ ...commonText(), submit: t(s.submit) }} />
    </AuthShell>
  );
}
