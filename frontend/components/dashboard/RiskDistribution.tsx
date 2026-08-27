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
      className={cn("bg-surface", className)}
      title={title ?? T.dashboard.riskDistribution}
      hint={hint ?? T.dashboard.riskDistributionHint}
      padded
    >
      {!total ? (
        <EmptyState compact title={T.dashboard.noRiskData} className="border-0 shadow-none py-8" />
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8 p-2">
          <Donut
            size={120}
            thickness={14}
            segments={rows.map((row) => ({
              value: row.count,
              color: TONE[row.level].color,
              label: row.label,
            }))}
            center={
              <div>
                <p className="font-heading text-2xl font-bold leading-none text-navy drop-shadow-sm" dir="ltr">
                  {total}
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted">{T.stats.open}</p>
              </div>
            }
          />
          <ol className="min-w-0 flex-1 space-y-4">
            {rows.map((row) => {
              const share = total ? Math.round((row.count / total) * 100) : 0;
              return (
                <li key={row.level}>
                  <Link
                    href={`${base}?risk_level=${row.level}`}
                    className="group block rounded-xl p-2.5 transition-all duration-200 hover:bg-subtle/70 hover:shadow-sm ring-1 ring-transparent hover:ring-line/50"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className={cn("inline-flex items-center gap-2 text-[14px] font-bold tracking-wide", TONE[row.level].text)}>
                        <span className={cn("size-2.5 shrink-0 rounded-full shadow-sm", TONE[row.level].bar)} aria-hidden />
                        {row.label}
                      </span>
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-[14px] font-bold tabular-nums text-navy" dir="ltr">
                          {row.count}
                        </span>
                        <span className="font-mono text-[12px] font-semibold tabular-nums text-muted" dir="ltr">
                          {share}%
                        </span>
                      </div>
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
