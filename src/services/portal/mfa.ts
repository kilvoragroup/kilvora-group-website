import "server-only";

import { uuidSchema } from "@/domain/portal/schemas";
import { parseTotpCode } from "@/domain/portal/staff";
import { assertPortalEnabled } from "@/lib/portal/portal-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * MFA TOTP da consola interna (A4, D03). Só a API MFA do Supabase Auth com a sessão do próprio
 * utilizador; nenhuma chave privilegiada. A verificação bem-sucedida eleva a sessão a `aal2`
 * (cookies renovados pelo cliente de servidor); só então a RLS e as RPCs concedem acesso interno.
 *
 * Nunca lançam por erros esperados; os erros do Auth não são devolvidos (só um código fechado).
 */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type MfaFailure = "unavailable" | "invalid_code" | "failed";
export type MfaOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: MfaFailure };

const FRIENDLY_NAME = "Consola KILVORA";

async function openClient(): Promise<ServerClient | null> {
  try {
    assertPortalEnabled();
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

/** Factor TOTP verificado do utilizador, se existir (para pedir só o código). */
export async function getVerifiedTotpFactor(): Promise<MfaOutcome<{ factorId: string } | null>> {
  const client = await openClient();
  if (!client) return { ok: false, error: "unavailable" };
  const { data, error } = await client.auth.mfa.listFactors();
  if (error || !data) return { ok: false, error: "failed" };
  const factor = data.totp.find((item) => item.status === "verified");
  return { ok: true, value: factor ? { factorId: factor.id } : null };
}

export type TotpEnrollment = {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
};

/**
 * Inicia a inscrição TOTP. Remove primeiro factores TOTP NÃO verificados (tentativas
 * abandonadas). Recusa se já existir um factor verificado (nesse caso só se verifica o código).
 */
export async function startTotpEnrollment(): Promise<MfaOutcome<TotpEnrollment>> {
  const client = await openClient();
  if (!client) return { ok: false, error: "unavailable" };
  const factors = await client.auth.mfa.listFactors();
  if (factors.error || !factors.data) return { ok: false, error: "failed" };
  if (factors.data.totp.some((item) => item.status === "verified")) {
    return { ok: false, error: "failed" };
  }
  for (const factor of factors.data.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      const removed = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) return { ok: false, error: "failed" };
    }
  }
  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: FRIENDLY_NAME,
  });
  if (error || !data?.totp) return { ok: false, error: "failed" };
  return {
    ok: true,
    value: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
  };
}

/** Verifica um código TOTP para o factor indicado (do próprio utilizador; o Auth confirma). */
export async function verifyTotp(raw: {
  factorId: unknown;
  code: unknown;
}): Promise<MfaOutcome<{ aal2: true }>> {
  const factorId = uuidSchema.safeParse(raw.factorId);
  const code = parseTotpCode({ code: raw.code });
  if (!factorId.success || !code.ok) return { ok: false, error: "invalid_code" };
  const client = await openClient();
  if (!client) return { ok: false, error: "unavailable" };
  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId: factorId.data,
    code: code.value.code,
  });
  if (error) return { ok: false, error: "invalid_code" };
  return { ok: true, value: { aal2: true } };
}
