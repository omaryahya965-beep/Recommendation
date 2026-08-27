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
      className="relative z-10 flex min-h-[5.5rem] min-w-[8.5rem] snap-start flex-col justify-center border-b border-e border-line px-4 py-4 md:min-h-[6.5rem] md:px-5"
    >
      <p className="mb-2 text-[13px] font-bold text-muted">{label}</p>
      <p
        className={cn(
          "font-heading text-[1.75rem] font-bold tabular-nums leading-none tracking-tight",
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
    return <EmptyState compact title={T.empty.insufficient} description={T.empty.recommendationsHint} className="border-0 shadow-none" />;
  }

  return (
    <Section title={title ?? T.dashboard.systemHealth} hint={hint ?? T.dashboard.systemHealthHint} className="overflow-hidden bg-surface">
      <div className="flex snap-x snap-mandatory overflow-x-auto scrollbar-thin xl:grid xl:grid-cols-[minmax(16rem,auto)_repeat(6,minmax(0,1fr))] xl:overflow-hidden -mb-px -me-px">
        <div className="flex min-w-[16rem] snap-start items-center gap-4 border-b border-e border-line bg-subtle/20 px-5 py-5 md:min-w-[18rem] xl:min-w-0">
          <Donut
            size={86}
            thickness={10}
            segments={[
              { value: rate, color: "var(--color-success)", label: T.stats.completionRate },
              { value: Math.max(0, 100 - rate), color: "var(--color-line)", label: T.analytics.ofAll },
            ]}
            center={
              <span className="font-heading text-[15px] font-bold text-success-dark drop-shadow-sm" dir="ltr">
                {rate}%
              </span>
            }
          />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-navy">{T.stats.completionRate}</p>
            <p className="mt-1 text-[13px] font-medium text-ink-soft">{T.analytics.ofAll}</p>
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
