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
    <section className={cn("section-elevated flex h-fit flex-col overflow-hidden rounded-2xl border border-line bg-surface", className)}>
      {title || actions || hint ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-4 py-3.5 md:gap-4 md:px-6 md:py-5">
          <div className="flex items-start gap-3 min-w-0">
            {title ? <div className="mt-1 h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden /> : null}
            <div className="min-w-0">
              {title ? <h2 className="font-heading text-[17px] font-bold text-navy break-words">{title}</h2> : null}
              {hint ? <p className="mt-1.5 text-[13px] leading-snug text-muted">{hint}</p> : null}
            </div>
          </div>
          {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("flex min-h-0 flex-1 flex-col", padded && "p-5")}>{children}</div>
    </section>
  );
}
