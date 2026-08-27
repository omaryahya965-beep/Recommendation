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
    <ul className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-0.5 sm:grid sm:grid-cols-3 sm:overflow-visible md:grid-cols-5">
      {items.map((item) => (
        <li key={item.label} className="w-[9.75rem] shrink-0 sm:w-auto sm:min-w-0">
          <Link
            href={item.href}
            className={cn(
              "flex h-full min-h-16 min-w-0 flex-col justify-center rounded-xl border border-line bg-surface px-3 py-3 sm:px-4",
              item.tone === "danger" && item.value ? "border-danger/40 bg-danger-light" : null,
              item.tone === "warning" && item.value ? "border-warning/40 bg-warning-light" : null,
            )}
          >
            <p className="text-[13px] font-semibold leading-snug text-muted break-words">{item.label}</p>
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
  );
}
