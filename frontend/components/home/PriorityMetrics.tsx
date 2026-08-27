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
    <div className="-mx-3 overflow-x-auto px-3 scrollbar-thin md:mx-0 md:px-0">
      <ul className="flex snap-x snap-mandatory gap-2 pb-1 md:flex-wrap">
        {items.map((item) => (
          <li key={item.label} className="snap-start">
            <Link
              href={item.href}
              className={cn(
                "flex min-h-16 min-w-[8.5rem] flex-col justify-center rounded-xl border border-line bg-surface px-4 py-3",
                item.tone === "danger" && item.value ? "border-danger/40 bg-danger-light" : null,
                item.tone === "warning" && item.value ? "border-warning/40 bg-warning-light" : null,
              )}
            >
              <p className="text-[13px] font-semibold text-muted">{item.label}</p>
              <p
                className={cn(
                  "mt-1 font-heading text-[1.5rem] font-bold tabular-nums leading-none",
                  item.tone === "danger" && item.value ? "text-danger-dark" : null,
                  item.tone === "warning" && item.value ? "text-warning-dark" : null,
                  (!item.tone || item.tone === "muted" || item.tone === "primary") && "text-navy",
                )}
                dir="ltr"
              >
                {item.value}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
