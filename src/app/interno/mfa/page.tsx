import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form-message";
import { isPortalEnabled } from "@/config/portal";
import { portalAuth } from "@/content/portal-auth";
import { portalStaff } from "@/content/portal-staff";
import { requireStaffPendingMfa } from "@/lib/portal/dal";
import { getVerifiedTotpFactor } from "@/services/portal/mfa";

import { Loading } from "../../cliente/_components/auth-shell";
import { t } from "../../cliente/_lib/text";
import { MfaPanel } from "../_components/console-forms";
import { ConsoleShell } from "../_components/console-shell";

export const metadata: Metadata = { title: t(portalStaff.mfa.title) };

/**
 * Verificação TOTP da consola (A4, D03): inscrição na primeira vez, código nas seguintes.
 * Só para staff a quem falta apenas o `aal2`; quem não é staff recebe «não encontrado».
 */
export default function MfaPage() {
  const s = portalStaff.mfa;
  return (
    <ConsoleShell title={t(s.title)} intro={t(s.intro)} nav={false}>
      <Suspense fallback={<Loading />}>
        <Mfa />
      </Suspense>
    </ConsoleShell>
  );
}

async function Mfa() {
  if (!isPortalEnabled()) notFound();
  await requireStaffPendingMfa();
  const factor = await getVerifiedTotpFactor();
  const s = portalStaff.mfa;
  if (!factor.ok) return <FormMessage tone="error" message={t(s.unavailable)} />;

  return (
    <div className="border-border max-w-xl rounded-xl border p-6 sm:p-8">
      <MfaPanel
        verifiedFactorId={factor.value?.factorId ?? null}
        text={{
          enrollTitle: t(s.enrollTitle),
          enrollIntro: t(s.enrollIntro),
          start: t(s.start),
          secret: t(s.secret),
          qrAlt: t(s.qrAlt),
          verifyTitle: t(s.verifyTitle),
          code: t(s.code),
          verify: t(s.verify),
          sending: t(portalAuth.common.sending),
        }}
      />
    </div>
  );
}
