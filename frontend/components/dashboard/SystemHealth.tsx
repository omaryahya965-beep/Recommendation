"use client";

import Link from "next/link";

import { Donut } from "@/components/dashboard/Donut";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import type { DashboardStats } from "@/lib/types";

function StatLink({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[5.25rem] min-w-[7.5rem] flex-col justify-center border-b border-e border-line px-4 py-3.5 transition-colors hover:bg-subtle/70"
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-heading text-[1.35rem] font-bold tabular-nums leading-none",
          tone === "danger" && value ? "text-danger-dark" : tone === "warning" && value ? "text-warning-dark" : "text-navy"
        )}
        dir="ltr"
      >
        {value}
      </p>
    </Link>
  );
}

/**
 * Official portfolio health from GET /api/dashboard/ stats — not derived from
 * a paginated register sample, so it is never truncated.
 */
export function SystemHealth({
  stats,
  base,
  title,
  hint,
}: {
  stats: DashboardStats;
  base: string;
  title?: string;
  hint?: string;
}) {
  useI18n();
  const highRisk = stats.by_risk?.high ?? 0;
  const inProgress = stats.by_status?.in_progress ?? 0;
  const rate = Math.round(stats.completion_rate);

  if (!stats.total) {
    return <EmptyState compact title={T.empty.insufficient} description={T.empty.recommendationsHint} />;
  }

  return (
    <Section title={title ?? T.dashboard.systemHealth} hint={hint ?? T.dashboard.systemHealthHint}>
      <div className="grid grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-cols-[minmax(14rem,auto)_repeat(6,minmax(0,1fr))]">
        <div className="col-span-2 flex items-center gap-3 border-b border-e border-line px-4 py-4 sm:col-span-3 xl:col-span-1 xl:border-b-0">
          <Donut
            size={76}
            thickness={9}
            segments={[
              { value: rate, color: "var(--color-success)", label: T.stats.completionRate },
              { value: Math.max(0, 100 - rate), color: "var(--color-line)", label: T.analytics.ofAll },
            ]}
            center={
              <span className="font-heading text-sm font-bold text-success-dark" dir="ltr">
                {rate}%
              </span>
            }
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{T.stats.completionRate}</p>
            <p className="mt-0.5 text-[13px] text-ink-soft">{T.analytics.ofAll}</p>
          </div>
        </div>

        <StatLink href={base} label={T.stats.total} value={stats.total} />
        <StatLink href={base} label={T.stats.open} value={stats.open} />
        <StatLink href={`${base}?status=in_progress`} label={T.dashboard.inProgress} value={inProgress} />
        <StatLink href={`${base}?overdue=1`} label={T.stats.overdue} value={stats.overdue} tone="danger" />
        <StatLink href={`${base}?status=closed`} label={T.stats.closed} value={stats.closed} />
        <StatLink href={`${base}?risk_level=high`} label={T.dashboard.highRisk} value={highRisk} tone="warning" />
      </div>
    </Section>
  );
}
