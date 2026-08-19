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
      className={className}
      title={title ?? T.dashboard.statusDistribution}
      hint={hint ?? T.dashboard.statusDistributionHint}
    >
      {!rows.length ? (
        <EmptyState compact title={T.common.noChartData} className="border-0 shadow-none" />
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`${base}?stage=${row.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/70"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("truncate text-[13px]", row.count ? "font-medium text-ink" : "text-muted")}>
                      {row.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[13px] tabular-nums",
                        row.count ? "font-semibold text-navy" : "text-muted"
                      )}
                      dir="ltr"
                    >
                      {row.count}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{row.actor}</p>
                  <MeterBar className="mt-2" value={max ? Math.round((row.count / max) * 100) : 0} />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
