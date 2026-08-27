"use client";

import Link from "next/link";

import { MeterBar } from "@/components/ui/Base";
import { EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import { localizedWorkflowStages } from "@/lib/workflow";

/**
 * Official status mix from GET /api/dashboard/ stats.by_status, grouped into
 * presentation stages. When `stageIds` is set, those stages stay visible even
 * at zero so each role sees its own pipeline.
 */
export function StatusDistribution({
  byStatus,
  base,
  stageIds,
  title,
  hint,
  className,
}: {
  byStatus?: Record<string, number>;
  base: string;
  /** When set, only these stage ids are shown — including zeros. */
  stageIds?: string[] | null;
  title?: string;
  hint?: string;
  className?: string;
}) {
  useI18n();
  const allowed = stageIds?.length ? new Set(stageIds) : null;
  const rows = localizedWorkflowStages()
    .filter((stage) => (allowed ? allowed.has(stage.id) : true))
    .map((stage) => ({
      id: stage.id,
      label: stage.label,
      actor: stage.actor,
      count: stage.statuses.reduce((sum, status) => sum + (byStatus?.[status] ?? 0), 0),
    }))
    .filter((row) => (allowed ? true : row.count > 0));
  const max = rows.reduce((peak, row) => Math.max(peak, row.count), 0);

  return (
    <Section
      className={cn("bg-surface", className)}
      title={title ?? T.dashboard.statusDistribution}
      hint={hint ?? T.dashboard.statusDistributionHint}
    >
      {!rows.length ? (
        <EmptyState compact title={T.common.noChartData} className="border-0 shadow-none py-10" />
      ) : (
        <ol className="divide-y divide-line pt-1">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`${base}?stage=${row.id}`}
                className="group flex flex-col gap-2 px-5 py-3.5 transition-all duration-200 hover:bg-subtle/70"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[13px] font-bold tracking-wide", row.count ? "text-ink" : "text-muted")}>
                      {row.label}
                    </span>
                    <span className="text-[11px] font-medium text-muted px-1.5 py-0.5 rounded-md bg-surface border border-line">
                      {row.actor}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[14px] font-bold tabular-nums tracking-tight",
                      row.count ? "text-navy" : "text-muted"
                    )}
                    dir="ltr"
                  >
                    {row.count}
                  </span>
                </div>
                <MeterBar 
                  className={cn("mt-1 transition-opacity", !row.count && "opacity-30")} 
                  value={max ? Math.round((row.count / max) * 100) : 0} 
                  tone="primary" 
                />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
