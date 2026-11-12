import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("max-w-content px-gutter mx-auto w-full", className)}>{children}</div>;
}
