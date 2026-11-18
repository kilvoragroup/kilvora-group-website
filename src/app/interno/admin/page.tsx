import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form-message";
import { isPortalEnabled } from "@/config/portal";
import { site } from "@/config/site";
import { portalAuth } from "@/content/portal-auth";
import { portalStaff } from "@/content/portal-staff";
import { formatDateTime } from "@/domain/portal/tickets";
import type { StaffRole } from "@/domain/portal/types";
import { requireConsoleStaff } from "@/lib/portal/dal";
import { type AdminProfile, listProfiles } from "@/services/portal/admin";

import { Loading } from "../../cliente/_components/auth-shell";
import { t } from "../../cliente/_lib/text";
import {
  CancelProvisioningForm,
  GrantRoleForm,
  HiddenActionForm,
  ProvisionForm,
} from "../_components/admin-forms";
import { ConsoleShell } from "../_components/console-shell";

export const metadata: Metadata = { title: t(portalStaff.admin.title) };

/**
 * Administração (A5): equipa interna (papéis e estado), clientes (estado, contenção F2) e
 * provisionamento de pessoal (secção 4.2). Só ADMIN com `aal2`; o operador recebe 404 neutro.
 */
export default function AdminPage() {
  const a = portalStaff.admin;
  return (
    <ConsoleShell title={t(a.title)} intro={t(a.intro)}>
      <Suspense fallback={<Loading />}>
        <Admin />
      </Suspense>
    </ConsoleShell>
  );
}

const ROLES: readonly StaffRole[] = ["operador", "admin"];

function ProfileRows({
  profiles,
  viewerId,
  staff,
}: {
  profiles: readonly AdminProfile[];
  viewerId: string;
  staff: boolean;
}) {
  const a = portalStaff.admin;
  const sending = t(portalAuth.common.sending);
  return (
    <ul className="divide-border border-border divide-y rounded-xl border">
      {profiles.map((profile) => {
        const self = profile.id === viewerId;
        const missing = ROLES.filter((role) => !profile.roles.includes(role));
        return (
          <li key={profile.id} className="grid gap-3 p-4" data-testid={`perfil-${profile.id}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="font-semibold">
                {profile.name ?? t(a.unnamed)} {self && t(a.you)}
              </p>
              <p className="text-muted-foreground text-sm">
                {t(a.status)}: {t(a.statusLabels[profile.status])}
                {staff && (
                  <>
                    {" "}
                    · {t(a.roles)}:{" "}
                    {profile.roles.length > 0
                      ? profile.roles.map((role) => t(a.roleLabels[role])).join(", ")
                      : t(a.noRoles)}
                  </>
                )}{" "}
                · {formatDateTime(profile.createdAt, site.locale)}
              </p>
            </div>
            {!self && profile.status !== "anonimizado" && (
              <div className="flex flex-wrap items-start gap-3">
                {staff &&
                  profile.roles.map((role) => (
                    <HiddenActionForm
                      key={role}
                      id={`retirar-${role}-${profile.id}`}
                      action="role"
                      hidden={{ userId: profile.id, role, change: "revoke" }}
                      label={`${t(a.revoke)} ${t(a.roleLabels[role])}`}
                      sending={sending}
                    />
                  ))}
                {staff && profile.status === "activo" && missing.length > 0 && (
                  <GrantRoleForm
                    userId={profile.id}
                    options={missing.map((role) => ({ value: role, label: t(a.roleLabels[role]) }))}
                    text={{ role: t(a.roles), submit: t(a.grant), sending }}
                  />
                )}
                <HiddenActionForm
                  id={`estado-${profile.id}`}
                  action="status"
                  hidden={{
                    userId: profile.id,
                    status: profile.status === "activo" ? "suspenso" : "activo",
                  }}
                  label={t(profile.status === "activo" ? a.suspend : a.reactivate)}
                  sending={sending}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

async function Admin() {
  if (!isPortalEnabled()) notFound();
  const viewer = await requireConsoleStaff(["admin"]);
  const [team, clients] = await Promise.all([listProfiles("interno"), listProfiles("cliente")]);
  const a = portalStaff.admin;
  const sending = t(portalAuth.common.sending);

  return (
    <div className="grid max-w-5xl gap-10">
      <p>
        <Link
          href="/interno/admin/auditoria"
          className="text-primary text-sm font-semibold underline-offset-4 hover:underline"
        >
          {t(a.navAudit)}
        </Link>
      </p>

      <section aria-labelledby="admin-equipa" className="grid gap-4">
        <h2 id="admin-equipa" className="text-lg font-semibold">
          {t(a.team)}
        </h2>
        {!team.ok ? (
          <FormMessage tone="error" message={t(team.error.message)} />
        ) : team.value.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t(a.noTeam)}</p>
        ) : (
          <ProfileRows profiles={team.value} viewerId={viewer.profile.id} staff />
        )}
      </section>

      <section
        aria-labelledby="admin-provisionar"
        className="border-warning bg-warning/5 grid gap-4 rounded-xl border p-6"
      >
        <h2 id="admin-provisionar" className="text-lg font-semibold">
          {t(a.provisionTitle)}
        </h2>
        <p className="text-sm">{t(a.provisionIntro)}</p>
        <p className="text-sm font-semibold">{t(a.f2Warning)}</p>
        <ProvisionForm text={{ email: t(a.email), submit: t(a.provision), sending }} />
        <h3 className="mt-2 font-semibold">{t(a.cancelTitle)}</h3>
        <CancelProvisioningForm text={{ id: t(a.provisioningId), submit: t(a.cancel), sending }} />
      </section>

      <section aria-labelledby="admin-clientes" className="grid gap-4">
        <h2 id="admin-clientes" className="text-lg font-semibold">
          {t(a.clients)}
        </h2>
        {!clients.ok ? (
          <FormMessage tone="error" message={t(clients.error.message)} />
        ) : clients.value.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t(a.noClients)}</p>
        ) : (
          <ProfileRows profiles={clients.value} viewerId={viewer.profile.id} staff={false} />
        )}
      </section>
    </div>
  );
}
