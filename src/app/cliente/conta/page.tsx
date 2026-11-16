import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form-message";
import { isPortalEnabled } from "@/config/portal";
import { portalAuth } from "@/content/portal-auth";
import { portalClient } from "@/content/portal-client";
import { requireClient } from "@/lib/portal/dal";
import { getClientProfileAndAccount } from "@/services/portal/client-portal";

import { Loading } from "../_components/auth-shell";
import { AccountForm, ProfileForm } from "../_components/portal-forms";
import { PortalShell } from "../_components/portal-shell";
import { t } from "../_lib/text";

export const metadata: Metadata = { title: t(portalClient.account.title) };

/**
 * Perfil e conta (A3). Perfil: `full_name`, `phone`, `locale` (UPDATE da M3). Conta: `name`,
 * `country`, `sector`, só para o titular (RLS `api_accounts_update_owner`). Membros adicionais
 * ficam fora da V1 (L4).
 */
export default function AccountPage() {
  const s = portalClient.account;
  return (
    <PortalShell title={t(s.title)} intro={t(s.intro)}>
      <Suspense fallback={<Loading />}>
        <Account />
      </Suspense>
    </PortalShell>
  );
}

async function Account() {
  if (!isPortalEnabled()) notFound();
  const viewer = await requireClient();
  const result = await getClientProfileAndAccount(viewer.profile.id);
  if (!result.ok) return <FormMessage tone="error" message={t(result.error.message)} />;
  if (!result.value) notFound();

  const { profile, account } = result.value;
  const s = portalClient.account;
  const sending = t(portalAuth.common.sending);

  return (
    <div className="grid max-w-3xl gap-10">
      <section
        aria-labelledby="perfil-titulo"
        className="border-border grid gap-5 rounded-xl border p-6 sm:p-8"
      >
        <h2 id="perfil-titulo" className="text-lg font-semibold">
          {t(s.profileTitle)}
        </h2>
        <ProfileForm
          initial={{
            fullName: profile.fullName ?? "",
            phone: profile.phone ?? "",
            locale: profile.locale,
          }}
          text={{
            fullName: t(s.fullName),
            phone: t(s.phone),
            phoneHint: t(s.phoneHint),
            locale: t(s.locale),
            localeAO: t(s.localeAO),
            localeBR: t(s.localeBR),
            submit: t(s.saveProfile),
            sending,
          }}
        />
      </section>

      <section
        aria-labelledby="conta-titulo"
        className="border-border grid gap-5 rounded-xl border p-6 sm:p-8"
      >
        <h2 id="conta-titulo" className="text-lg font-semibold">
          {t(s.accountTitle)}
        </h2>
        {!account ? (
          <p className="text-muted-foreground text-sm">{t(s.noAccount)}</p>
        ) : account.role !== "titular" ? (
          <>
            <p className="font-semibold">{account.name}</p>
            <p className="text-muted-foreground text-sm">{t(s.notOwner)}</p>
          </>
        ) : (
          <AccountForm
            initial={{
              name: account.name,
              country: account.country ?? "",
              sector: account.sector ?? "",
            }}
            text={{
              name: t(s.accountName),
              country: t(s.country),
              countryHint: t(s.countryHint),
              sector: t(s.sector),
              submit: t(s.saveAccount),
              sending,
            }}
          />
        )}
      </section>
    </div>
  );
}
