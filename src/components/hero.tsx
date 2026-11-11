import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { Container } from "./container";

type HeroProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** "home" para a página inicial; "page" para páginas interiores. */
  size?: "home" | "page";
  children?: ReactNode;
};

/** Faixa de abertura em superfície navy institucional. */
export function Hero({ eyebrow, title, description, actions, size = "page", children }: HeroProps) {
  const home = size === "home";
  return (
    <div
      data-tone="inverse"
      className={cx(
        "bg-inverse text-inverse-foreground relative overflow-hidden",
        home ? "py-20 sm:py-28 lg:py-32" : "py-14 sm:py-20",
      )}
    >
      {/* Filete verde/laranja: elemento gráfico da marca (provisório) */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 flex h-1">
        <span className="bg-highlight w-2/3" />
        <span className="bg-accent w-1/3" />
      </div>
      <Container>
        <div className={cx(home ? "max-w-4xl" : "max-w-3xl")}>
          {eyebrow && (
            <p className="text-inverse-muted mb-4 flex items-center gap-3 text-sm font-semibold tracking-wider uppercase">
              <span aria-hidden="true" className="bg-highlight h-0.5 w-8" />
              {eyebrow}
            </p>
          )}
          <h1
            className={cx(
              "font-semibold text-balance",
              home ? "text-display" : "text-heading sm:text-display",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="text-lead text-inverse-muted mt-6 max-w-2xl text-pretty">{description}</p>
          )}
          {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
          {children}
        </div>
      </Container>
    </div>
  );
}
