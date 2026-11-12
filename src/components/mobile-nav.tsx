"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { activeState, type ResolvedNavItem } from "@/config/navigation";
import { cx } from "@/lib/cx";

import { buttonClasses } from "./button";
import { ChevronDownIcon, CloseIcon, MenuIcon } from "./icons";

type MobileNavProps = {
  items: ResolvedNavItem[];
  labels: {
    navigation: string;
    open: string;
    close: string;
    overview: string;
    signIn: string;
    soon: string;
    signInHint: string;
    proposal: string;
  };
  proposalHref: string;
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Menu móvel expansível e acessível (abaixo de `lg`). */
export function MobileNav({ items, labels, proposalHref }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Fechar quando a rota é ocultada pelo Activity (Cache Components).
  useLayoutEffect(() => () => setOpen(false), []);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      // Mantém o foco dentro do menu aberto (botão + painel).
      const focusables = [
        toggleRef.current,
        ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((el): el is HTMLElement => el !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Fecha ao passar para o layout desktop.
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onDesktop = (event: MediaQueryListEvent) => event.matches && setOpen(false);

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onDesktop);
    return () => {
      body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onDesktop);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.close : labels.open}
        onClick={() => setOpen((value) => !value)}
        className="hover:bg-muted inline-flex size-11 items-center justify-center rounded-md"
      >
        {open ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
      </button>

      <div
        ref={panelRef}
        id={panelId}
        hidden={!open}
        className="bg-background fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto overscroll-contain"
      >
        <nav aria-label={labels.navigation} className="px-gutter py-6">
          <ul className="divide-border divide-y">
            {items.map((item) => {
              const state = activeState(pathname, item.href);
              const children = item.children ?? [];
              const subId = `${panelId}-${item.id}`;
              const isExpanded = expanded === item.id;

              return (
                <li key={item.id} className="py-1">
                  {children.length === 0 ? (
                    <Link
                      href={item.href}
                      onNavigate={() => close()}
                      aria-current={state === "page" ? "page" : undefined}
                      className={cx(
                        "flex min-h-12 items-center rounded-md px-2 text-lg font-medium",
                        state && "text-primary font-semibold",
                      )}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={subId}
                        onClick={() => setExpanded(isExpanded ? null : item.id)}
                        className={cx(
                          "flex min-h-12 w-full items-center justify-between rounded-md px-2 text-left text-lg font-medium",
                          state && "text-primary font-semibold",
                        )}
                      >
                        {item.label}
                        <ChevronDownIcon
                          className={cx(
                            "size-5 transition-transform motion-reduce:transition-none",
                            isExpanded && "rotate-180",
                          )}
                        />
                      </button>
                      <ul id={subId} hidden={!isExpanded} className="pb-3 pl-4">
                        <li>
                          <Link
                            href={item.href}
                            onNavigate={() => close()}
                            aria-current={state === "page" ? "page" : undefined}
                            className="text-primary flex min-h-11 items-center px-2 font-semibold"
                          >
                            {labels.overview}
                          </Link>
                        </li>
                        {children.map((child) => {
                          const childState = activeState(pathname, child.href);
                          return (
                            <li key={child.href}>
                              <Link
                                href={child.href}
                                onNavigate={() => close()}
                                aria-current={childState === "page" ? "page" : undefined}
                                className={cx(
                                  "flex min-h-11 items-center rounded-md px-2",
                                  childState && "bg-muted font-semibold",
                                )}
                              >
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="border-border mt-6 grid gap-3 border-t pt-6">
            <p className="text-muted-foreground flex min-h-11 items-center gap-2 px-2">
              <span>{labels.signIn}</span>
              <span className="border-border rounded-full border px-2 py-0.5 text-xs">
                {labels.soon}
              </span>
              <span className="sr-only">{labels.signInHint}</span>
            </p>
            <Link
              href={proposalHref}
              onNavigate={() => close()}
              className={buttonClasses("accent", "lg", "w-full")}
            >
              {labels.proposal}
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
