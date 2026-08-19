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
    <>
      <p className="text-xs font-medium text-muted">{item.label}</p>
      <p
        className={cn(
          "mt-1 font-heading text-[1.35rem] font-bold tabular-nums leading-none",
          item.tone === "danger" && item.value ? "text-danger-dark" : null,
          item.tone === "warning" && item.value ? "text-warning-dark" : null,
          item.tone === "success" ? "text-success-dark" : null,
          (!item.tone || item.tone === "muted") && "text-navy"
        )}
        dir="ltr"
      >
        {item.value}
      </p>
    </>
  );

  const className =
    "flex min-h-[5.25rem] min-w-[7.5rem] flex-1 flex-col justify-center border-b border-e border-line px-4 py-3.5";
  if (item.href) {
    return (
      <Link href={item.href} className={cn(className, "transition-colors hover:bg-subtle/70")}>
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
    <Section title={title} hint={hint}>
      <div className="flex min-w-0 flex-wrap items-stretch overflow-hidden">
        {leading ? (
          <div className="flex items-center border-b border-e border-line px-4 py-3">{leading}</div>
        ) : null}
        {items.map((item) => (
          <Cell key={item.label} item={item} />
        ))}
      </div>
    </Section>
  );
}
