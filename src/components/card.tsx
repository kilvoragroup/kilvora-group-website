import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { ArrowRightIcon } from "./icons";

type CardProps = {
  title: string;
  description?: string;
  /** Torna o cartão inteiro clicável (ligação no título). */
  href?: string;
  eyebrow?: string;
  headingLevel?: "h2" | "h3";
  children?: ReactNode;
  className?: string;
};

export function Card({
  title,
  description,
  href,
  eyebrow,
  headingLevel: Heading = "h3",
  children,
  className,
}: CardProps) {
  return (
    <article
      className={cx(
        "border-border bg-background relative flex flex-col rounded-lg border p-6",
        href &&
          "hover:border-primary/40 has-[a:focus-visible]:outline-ring transition-colors has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 motion-reduce:transition-none",
        className,
      )}
    >
      <span aria-hidden="true" className="bg-highlight mb-5 block h-0.5 w-8" />
      {eyebrow && <p className="text-muted-foreground mb-2 text-sm font-medium">{eyebrow}</p>}
      <Heading className="text-title font-semibold">
        {href ? (
          <Link
            href={href}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
          >
            {title}
          </Link>
        ) : (
          title
        )}
      </Heading>
      {description && <p className="text-muted-foreground mt-2 text-pretty">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
      {href && <ArrowRightIcon className="text-muted-foreground mt-auto size-5 self-end pt-4" />}
    </article>
  );
}
