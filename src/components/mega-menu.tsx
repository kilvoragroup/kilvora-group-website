"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { activeState, type ResolvedNavItem } from "@/config/navigation";
import { cx } from "@/lib/cx";

import { Container } from "./container";
import { ChevronDownIcon } from "./icons";

type MegaMenuProps = {
  items: ResolvedNavItem[];
  label: string;
  overviewLabel: string;
};

const linkBase =
  "inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors motion-reduce:transition-none hover:bg-muted";

/** Navegação principal desktop com painéis (padrão «disclosure»). */
export function MegaMenu({ items, label, overviewLabel }: MegaMenuProps) {
  const pathname = usePathname();
  const [openId, setOpenId] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const baseId = useId();

  // Com Cache Components, a rota fica oculta (Activity) em vez de desmontada:
  // fechar o painel quando o componente é ocultado.
  useLayoutEffect(() => () => setOpenId(null), []);

  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenId(null);
        buttonRefs.current[openId]?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openId]);

  const close = () => setOpenId(null);

  return (
    <nav ref={navRef} aria-label={label} className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const state = activeState(pathname, item.href);
          const children = item.children ?? [];

          if (children.length === 0) {
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={state === "page" ? "page" : undefined}
                  className={cx(
                    linkBase,
                    state &&
                      "text-primary decoration-highlight underline decoration-2 underline-offset-8",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          }

          const panelId = `${baseId}-${item.id}`;
          const open = openId === item.id;
          return (
            <li
              key={item.id}
              // Fecha o painel quando o foco sai do item (botão + painel).
              onBlur={(event) => {
                if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  close();
                }
              }}
            >
              <button
                ref={(el) => {
                  buttonRefs.current[item.id] = el;
                }}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : item.id)}
                className={cx(linkBase, (open || state) && "bg-muted", state && "text-primary")}
              >
                {item.label}
                <ChevronDownIcon
                  className={cx(
                    "size-4 transition-transform motion-reduce:transition-none",
                    open && "rotate-180",
                  )}
                />
              </button>

              <div
                id={panelId}
                hidden={!open}
                className="border-border bg-background absolute inset-x-0 top-full border-y shadow-lg"
              >
                <Container className="grid grid-cols-4 gap-8 py-8">
                  <div className="col-span-1">
                    <p className="text-title font-semibold">{item.label}</p>
                    {item.description && (
                      <p className="text-muted-foreground mt-1 text-sm">{item.description}</p>
                    )}
                    <Link
                      href={item.href}
                      onNavigate={close}
                      aria-current={state === "page" ? "page" : undefined}
                      className="text-primary mt-4 inline-flex text-sm font-semibold underline-offset-4 hover:underline"
                    >
                      {overviewLabel}
                    </Link>
                  </div>
                  <ul className="col-span-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
                    {children.map((child) => {
                      const childState = activeState(pathname, child.href);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onNavigate={close}
                            aria-current={childState === "page" ? "page" : undefined}
                            className={cx(
                              "hover:bg-muted block rounded-md p-3 transition-colors motion-reduce:transition-none",
                              childState && "bg-muted",
                            )}
                          >
                            <span className="block font-semibold">{child.label}</span>
                            {child.description && (
                              <span className="text-muted-foreground mt-0.5 block text-sm">
                                {child.description}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Container>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
