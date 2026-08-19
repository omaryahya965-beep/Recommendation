"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

/** Grouped surface: a titled section, not a floating KPI card. */
export function Section({
  title,
  hint,
  actions,
  children,
  className,
  padded = false,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  useI18n();
  return (
    <section className={cn("flex h-fit flex-col overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)", className)}>
      {title || actions || hint ? (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="font-heading text-[15px] font-semibold text-navy">{title}</h2> : null}
            {hint ? <p className="mt-0.5 text-xs leading-snug text-muted">{hint}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("min-h-0 flex-1", padded && "p-4")}>{children}</div>
    </section>
  );
}
