import type { Metadata } from "next";
import { Suspense } from "react";

import { clientRoutes } from "@/config/navigation";
import { portalAuth } from "@/content/portal-auth";
import { safeNext } from "@/lib/portal/auth-urls";

import { SignInForm } from "../_components/auth-forms";
import { AuthShell, Loading, Notice } from "../_components/auth-shell";
import { type SearchParams, commonText, firstParam, t } from "../_lib/text";

export const metadata: Metadata = { title: t(portalAuth.signIn.title) };

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const s = portalAuth.signIn;
  return (
    <AuthShell
      title={t(s.title)}
      intro={t(s.intro)}
      links={[
        { href: clientRoutes.recover, label: t(s.forgot) },
        { href: clientRoutes.signUp, label: t(s.noAccount) },
      ]}
    >
      <Suspense fallback={<Loading />}>
        <SignInContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

/** Lê os parâmetros do pedido (dinâmico): `next` validado e aviso de chave fechada. */
async function SignInContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNext(firstParam(params.next));
  return (
    <>
      <Notice value={firstParam(params.aviso)} />
      <SignInForm next={next} text={{ ...commonText(), submit: t(portalAuth.signIn.submit) }} />
    </>
  );
}
