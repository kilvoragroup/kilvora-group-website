import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { buttonClasses } from "@/components/button";
import { FormMessage } from "@/components/form-message";
import { isPortalEnabled } from "@/config/portal";
import { site } from "@/config/site";
import { portalStaff } from "@/content/portal-staff";
import { AUDIT_ENTITY_TYPES, parseAuditFilter } from "@/domain/portal/admin";
import { formatDateTime } from "@/domain/portal/tickets";
import { requireConsoleStaff } from "@/lib/portal/dal";
import { getAuditLog } from "@/services/portal/admin";

import { Loading } from "../../../cliente/_components/auth-shell";
import { type SearchParams, firstParam, t } from "../../../cliente/_lib/text";
import { ConsoleShell } from "../../_components/console-shell";

export const metadata: Metadata = { title: t(portalStaff.admin.auditTitle) };

/**
 * Auditoria (A5): `admin_audit_log` (só admin `aal2`), filtro por tipo e identificador por GET.
 * Mostra identificadores e alterações de estado; a M2 nunca grava conteúdos de mensagens/notas.
 */
export default function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const a = portalStaff.admin;
  return (
    <ConsoleShell title={t(a.auditTitle)} intro={t(a.auditIntro)}>
      <Suspense fallback={<Loading />}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </ConsoleShell>
  );
}

function compact(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const json = JSON.stringify(value);
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}

async function Audit({ searchParams }: { searchParams: SearchParams }) {
  if (!isPortalEnabled()) notFound();
  await requireConsoleStaff(["admin"]);
  const params = await searchParams;
  const filter = parseAuditFilter({ tipo: firstParam(params.tipo), id: firstParam(params.id) });
  const result = await getAuditLog(filter);
  const a = portalStaff.admin;

  return (
    <div className="grid gap-6">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">{t(a.entityType)}</span>
          <select
            name="tipo"
            defaultValue={filter.entityType ?? ""}
            className="border-input bg-background h-11 rounded-md border px-3"
          >
            <option value="">{t(a.allTypes)}</option>
            {AUDIT_ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">{t(a.entityId)}</span>
          <input
            name="id"
            defaultValue={filter.entityId ?? ""}
            maxLength={100}
            className="border-input bg-background h-11 rounded-md border px-3"
          />
        </label>
        <button type="submit" className={buttonClasses("outline", "md")}>
          {t(a.filter)}
        </button>
      </form>

      {!result.ok ? (
        <FormMessage tone="error" message={t(result.error.message)} />
      ) : result.value.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t(a.noEntries)}</p>
      ) : (
        <ol className="divide-border border-border divide-y rounded-xl border text-sm">
          {result.value.map((entry) => (
            <li key={entry.id} className="grid gap-1 p-4">
              <p>
                <strong>{entry.action}</strong> · {entry.entityType}{" "}
                <span className="font-mono">{entry.entityId}</span>
              </p>
              <p className="text-muted-foreground">
                {formatDateTime(entry.occurredAt, site.locale)} · {t(a.actor)}:{" "}
                <span className="font-mono">{entry.actorId ?? "—"}</span> ({entry.actorAal ?? "—"})
              </p>
              <p className="text-muted-foreground font-mono break-all">
                {compact(entry.before)} → {compact(entry.after)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
