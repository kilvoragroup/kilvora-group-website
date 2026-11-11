import Link from "next/link";

import { getNavigation } from "@/config/navigation";
import { site } from "@/config/site";
import { getContent } from "@/content";

import { BrandWordmark } from "./brand-wordmark";
import { buttonClasses } from "./button";
import { Container } from "./container";
import { MegaMenu } from "./mega-menu";
import { MobileNav } from "./mobile-nav";

export function SiteHeader() {
  const { main, actions } = getNavigation();
  const { common } = getContent();

  // Sem backdrop-filter no cabeçalho: criaria um bloco de contenção que anula o
  // `position: fixed` do painel do menu móvel (defeito W2-C).
  return (
    <header className="border-border bg-background sticky top-0 z-40 border-b">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label={`${site.name} — início`} className="shrink-0 rounded-sm">
          <BrandWordmark />
        </Link>

        <MegaMenu items={main} label={common.mainNavigation} overviewLabel={common.overview} />

        <div className="flex items-center gap-2">
          {/* «Entrar»: área de clientes reservada para W3 — sem ligação nem autenticação. */}
          <p className="text-muted-foreground hidden items-center gap-2 text-sm xl:flex">
            <span>{actions.signIn.label}</span>
            <span className="border-border rounded-full border px-2 py-0.5 text-xs">
              {common.soon}
            </span>
            <span className="sr-only">{common.clientAreaSoon}</span>
          </p>
          <Link
            href={actions.proposal.href}
            className={buttonClasses("accent", "sm", "hidden sm:inline-flex")}
          >
            {actions.proposal.label}
          </Link>
          <MobileNav
            items={main}
            proposalHref={actions.proposal.href}
            labels={{
              navigation: common.mainNavigation,
              open: common.openMenu,
              close: common.closeMenu,
              overview: common.overview,
              signIn: actions.signIn.label,
              soon: common.soon,
              signInHint: common.clientAreaSoon,
              proposal: actions.proposal.label,
            }}
          />
        </div>
      </Container>
    </header>
  );
}
