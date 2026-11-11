"use client";

import { useEffect, useState } from "react";

import { cx } from "@/lib/cx";

import { Container } from "./container";

type ContextNavProps = {
  title: string;
  label: string;
  sections: { id: string; label: string }[];
};

/** Navegação contextual por âncoras (segundo nível), fixa abaixo do cabeçalho. */
export function ContextNav({ title, label, sections }: ContextNavProps) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label={label}
      className="border-border bg-background/95 sticky top-16 z-30 border-b backdrop-blur"
    >
      <Container className="flex items-center gap-6">
        <p className="hidden shrink-0 font-semibold md:block">{title}</p>
        <ul className="-mx-2 flex overflow-x-auto">
          {sections.map((section) => {
            const current = active === section.id;
            return (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  aria-current={current ? "true" : undefined}
                  onClick={() => setActive(section.id)}
                  className={cx(
                    "inline-flex h-12 items-center border-b-2 px-2 text-sm font-medium transition-colors motion-reduce:transition-none",
                    current
                      ? "border-highlight text-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {section.label}
                </a>
              </li>
            );
          })}
        </ul>
      </Container>
    </nav>
  );
}
