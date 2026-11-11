import type { ReactNode } from "react";

import { getContent } from "@/content";
import type { ContentStatus } from "@/content/types";
import { cx } from "@/lib/cx";

import { Container } from "./container";

type Tone = "default" | "muted" | "inverse";

const tones: Record<Tone, string> = {
  default: "bg-background text-foreground",
  muted: "bg-surface text-surface-foreground",
  inverse: "bg-inverse text-inverse-foreground",
};

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  /** Conteúdo provisório é sempre assinalado como «Em validação». */
  status?: ContentStatus;
  tone?: Tone;
  children?: ReactNode;
  className?: string;
};

export function Section({
  id,
  eyebrow,
  title,
  intro,
  status = "aprovado",
  tone = "default",
  children,
  className,
}: SectionProps) {
  const headingId = id && title ? `${id}-titulo` : undefined;
  const { common } = getContent();
  const inverse = tone === "inverse";

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-tone={inverse ? "inverse" : undefined}
      className={cx("py-section", tones[tone], className)}
    >
      <Container>
        {(eyebrow || title || intro || status === "provisorio") && (
          <header className="mb-10 max-w-3xl">
            {eyebrow && (
              <p
                className={cx(
                  "mb-3 text-sm font-semibold tracking-wider uppercase",
                  inverse ? "text-inverse-muted" : "text-muted-foreground",
                )}
              >
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 id={headingId} className="text-heading font-semibold text-balance">
                {title}
              </h2>
            )}
            {status === "provisorio" && (
              <p className="border-warning bg-warning/15 mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                <span className="font-semibold">{common.inValidation}</span>
                <span className={inverse ? "text-inverse-muted" : "text-muted-foreground"}>
                  {common.inValidationHint}
                </span>
              </p>
            )}
            {intro && (
              <p
                className={cx(
                  "text-lead mt-4 text-pretty",
                  inverse ? "text-inverse-muted" : "text-muted-foreground",
                )}
              >
                {intro}
              </p>
            )}
          </header>
        )}
        {children}
      </Container>
    </section>
  );
}
