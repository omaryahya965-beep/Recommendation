"use client";

import Link from "next/link";

import { Donut } from "@/components/dashboard/Donut";
import { EmptyState } from "@/components/ui/EmptyState";
import { MeterBar } from "@/components/ui/Base";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { RISK_LABELS, T, useI18n } from "@/lib/i18n";

const LEVELS = ["high", "medium", "low"] as const;

const TONE: Record<(typeof LEVELS)[number], { bar: string; text: string; color: string }> = {
  high: { bar: "bg-danger", text: "text-danger-dark", color: "var(--color-danger)" },
  medium: { bar: "bg-warning", text: "text-warning-dark", color: "var(--color-warning)" },
  low: { bar: "bg-success", text: "text-success-dark", color: "var(--color-success)" },
};

/**
 * Official open-case risk mix from GET /api/dashboard/ stats.by_risk.
 * Only high / medium / low exist on the backend.
 */
export function RiskDistribution({
  byRisk,
  base,
  title,
  hint,
  className,
}: {
  byRisk?: Record<string, number>;
  base: string;
  title?: string;
  hint?: string;
  className?: string;
}) {
  useI18n();
  const rows = LEVELS.map((level) => ({
    level,
    count: byRisk?.[level] ?? 0,
    label: RISK_LABELS[level] ?? level,
  }));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Section
      className={className}
      title={title ?? T.dashboard.riskDistribution}
      hint={hint ?? T.dashboard.riskDistributionHint}
      padded
    >
      {!total ? (
        <EmptyState compact title={T.dashboard.noRiskData} className="border-0 shadow-none" />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <Donut
            size={108}
            thickness={12}
            segments={rows.map((row) => ({
              value: row.count,
              color: TONE[row.level].color,
              label: row.label,
            }))}
            center={
              <div>
                <p className="font-heading text-lg font-bold leading-none text-navy" dir="ltr">
                  {total}
                </p>
                <p className="mt-1 text-[11px] text-muted">{T.stats.open}</p>
              </div>
            }
          />
          <ol className="min-w-0 flex-1 space-y-3">
            {rows.map((row) => {
              const share = total ? Math.round((row.count / total) * 100) : 0;
              return (
                <li key={row.level}>
                  <Link
                    href={`${base}?risk_level=${row.level}`}
                    className="block rounded-(--radius-field) px-1 py-0.5 transition-colors hover:bg-subtle/70"
                  >
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium", TONE[row.level].text)}>
                        <span className={cn("size-2 shrink-0 rounded-full", TONE[row.level].bar)} aria-hidden />
                        {row.label}
                      </span>
                      <span className="font-mono text-[13px] font-semibold tabular-nums text-ink" dir="ltr">
                        {row.count}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted" dir="ltr">
                        {share}%
                      </span>
                    </div>
                    <MeterBar value={share} tone={row.level === "high" ? "danger" : row.level === "medium" ? "warning" : "success"} />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Section>
  );
}
