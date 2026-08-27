"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

export interface MetricItem {
  label: string;
  value: number | string;
  href?: string;
  tone?: "danger" | "warning" | "success" | "muted";
}

function Cell({ item }: { item: MetricItem }) {
  const inner = (
    <div className="flex flex-col h-full justify-center">
      <p className="text-[12px] font-bold uppercase tracking-wider text-muted mb-2">{item.label}</p>
      <p
        className={cn(
          "font-heading text-[1.75rem] font-bold tabular-nums leading-none tracking-tight",
          item.tone === "danger" && item.value ? "text-danger-dark" : null,
          item.tone === "warning" && item.value ? "text-warning-dark" : null,
          item.tone === "success" ? "text-success-dark" : null,
          (!item.tone || item.tone === "muted") && "text-navy"
        )}
        dir="ltr"
      >
        {item.value}
      </p>
    </div>
  );

  const className =
    "group flex min-h-[6.5rem] min-w-[8.5rem] flex-1 flex-col border-b border-e border-line px-5 py-4 transition-all duration-200 hover:bg-subtle/50 hover:shadow-inner hover:z-10 relative";
  
  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

/** Compact official figures. Not a grid of decorative KPI cards. */
export function MetricStrip({
  title,
  hint,
  items,
  leading,
}: {
  title: string;
  hint?: string;
  items: MetricItem[];
  leading?: ReactNode;
}) {
  useI18n();
  return (
    <Section title={title} hint={hint} className="overflow-hidden bg-surface">
      <div className="flex min-w-0 flex-wrap items-stretch overflow-hidden -mb-px -me-px">
        {leading ? (
          <div className="flex items-center justify-center border-b border-e border-line px-6 py-4 bg-subtle/30">{leading}</div>
        ) : null}
        {items.map((item) => (
          <Cell key={item.label} item={item} />
        ))}
      </div>
    </Section>
  );
}
