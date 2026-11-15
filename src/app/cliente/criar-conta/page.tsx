import type { Metadata } from "next";

import { clientRoutes } from "@/config/navigation";
import { portalAuth } from "@/content/portal-auth";

import { SignUpForm } from "../_components/auth-forms";
import { AuthShell } from "../_components/auth-shell";
import { commonText, t } from "../_lib/text";

export const metadata: Metadata = { title: t(portalAuth.signUp.title) };

export default function SignUpPage() {
  const s = portalAuth.signUp;
  return (
    <AuthShell
      title={t(s.title)}
      intro={t(s.intro)}
      links={[{ href: clientRoutes.signIn, label: t(s.hasAccount) }]}
    >
      <SignUpForm
        text={{
          ...commonText(),
          fullName: t(s.fullName),
          company: t(s.company),
          companyHint: t(s.companyHint),
          submit: t(s.submit),
        }}
      />
    </AuthShell>
  );
}
