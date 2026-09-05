"use client";

import Link from "next/link";

import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

export function PriorityMetrics({
  items,
}: {
  items: Array<{
    label: string;
    value: number;
    href: string;
    tone?: "danger" | "warning" | "primary" | "muted";
  }>;
}) {
  useI18n();
  if (!items.length) return null;

  return (
    <ul className="snap-scroll-x flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible md:grid-cols-5">
      {items.map((item) => (
        <li key={item.label} className="w-[10.5rem] shrink-0 sm:w-auto sm:min-w-0">
          <Link
            href={item.href}
            className={cn(
              "kpi-lift flex h-full min-h-20 min-w-0 flex-col justify-center rounded-xl border border-line bg-surface px-4 py-3.5 shadow-sm",
              item.tone === "danger" && item.value ? "bg-gradient-to-br from-danger-light via-surface to-surface border-danger/20 kpi-accent-danger kpi-active" : null,
              item.tone === "warning" && item.value ? "bg-gradient-to-br from-warning-light via-surface to-surface border-warning/20 kpi-accent-warning" : null,
              item.tone === "primary" ? "kpi-accent-primary" : "kpi-accent-muted",
              item.tone === "danger" && item.value === 0 ? "kpi-accent-muted bg-surface border-line" : null,
              item.tone === "warning" && item.value === 0 ? "kpi-accent-muted bg-surface border-line" : null
            )}
          >
            <p className="text-[12px] font-bold uppercase tracking-wider text-muted break-words">{item.label}</p>
            <p
              className={cn(
                "mt-2 font-heading text-[2rem] font-bold tabular-nums leading-none",
                item.tone === "danger" && item.value ? "text-danger-dark" : null,
                item.tone === "warning" && item.value ? "text-warning-dark" : null,
                (!item.tone || item.tone === "muted" || item.tone === "primary" || item.value === 0) && "text-navy",
              )}
              dir="ltr"
            >
              {item.value}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
