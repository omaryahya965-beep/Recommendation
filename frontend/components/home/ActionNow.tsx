"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { queueLabel, rank, type ActionSource } from "@/components/dashboard/AttentionBoard";
import { DirForward } from "@/components/i18n/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { caseTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { STATUS_NEXT_ACTION, stageForStatus } from "@/lib/workflow";

export function ActionNow({
  sources,
  detailBase,
  viewAllHref,
  title,
  hint,
  limit = 7,
  showDepartment = true,
}: {
  sources: ActionSource[];
  detailBase: string;
  viewAllHref: string;
  title?: string;
  hint?: string;
  limit?: number;
  showDepartment?: boolean;
}) {
  useI18n();
  const [queue, setQueue] = useState<string | null>(null);
  const ranked = rank(sources);
  const filtered = queue ? ranked.filter((entry) => entry.queue === queue) : ranked;
  const visible = filtered.slice(0, limit);
  const live = sources.filter((source) => source.block.count > 0);
  const total = sources.reduce((sum, source) => sum + source.block.count, 0);

  return (
    <Section
      title={title ?? T.dashboard.actionCenter}
      hint={hint ?? T.dashboard.actionCenterHint}
      actions={
        total ? (
          <span className="font-mono text-sm font-semibold text-navy" dir="ltr">
            {total}
          </span>
        ) : null
      }
    >
      {live.length ? (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setQueue(null)}
            aria-pressed={queue === null}
            className={cn(
              "rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors",
              queue === null ? "bg-navy text-white" : "bg-subtle text-ink-soft hover:text-ink"
            )}
          >
            {T.reports.filterAll}
          </button>
          {live.map((source) => (
            <button
              key={source.key}
              type="button"
              onClick={() => setQueue((prev) => (prev === source.key ? null : source.key))}
              aria-pressed={queue === source.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors",
                queue === source.key ? "bg-navy text-white" : "bg-subtle text-ink-soft hover:text-ink"
              )}
            >
              {queueLabel(source.key)}
              <span className="font-mono" dir="ltr">
                {source.block.count}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {visible.length ? (
        <>
          <ul className="divide-y divide-line">
            {visible.map(({ item, reason }) => {
              const next = STATUS_NEXT_ACTION[item.status];
              const stage = stageForStatus(item.status);
              return (
                <li key={item.id} className="px-4 py-4 transition-colors hover:bg-subtle/60">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <RecordId id={item.id} />
                        <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[11px] text-ink-soft">{reason}</span>
                        <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                      </div>
                      <p className="mt-2 text-[13px] font-semibold text-primary-dark">{next?.action ?? T.dashboard.open}</p>
                      <Link
                        href={`${detailBase}/${item.id}`}
                        className="mt-1 block text-[15px] font-medium leading-snug text-ink hover:text-primary-dark"
                      >
                        {caseTitle(item.text, 110)}
                      </Link>
                      <p className="mt-2 text-[12.5px] text-ink-soft">
                        {showDepartment ? item.department_name : item.responsible_employee ?? T.team.unassigned}
                        {showDepartment && item.responsible_employee ? ` · ${item.responsible_employee}` : ""}
                        {` · ${stage.label} · `}
                        <span dir="ltr">{formatDate(item.target_date)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <RiskBadge level={item.risk_level} />
                      <Link
                        href={`${detailBase}/${item.id}`}
                        className="inline-flex items-center gap-1 rounded-(--radius-btn) bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                      >
                        {T.dashboard.open}
                        <DirForward className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <footer className="border-t border-line bg-subtle px-4 py-2.5 text-center">
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-dark hover:underline"
            >
              {T.dashboard.viewAll}
              <DirForward className="size-4" />
            </Link>
          </footer>
        </>
      ) : (
        <EmptyState
          compact
          icon={<CheckCircle2 className="size-5" />}
          title={T.dashboard.nothingPending}
          description={T.dashboard.nothingPendingHint}
          className="border-0 shadow-none"
        />
      )}
    </Section>
  );
}
