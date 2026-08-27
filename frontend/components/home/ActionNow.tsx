"use client";

import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { queueLabel, rank, type ActionSource } from "@/components/dashboard/AttentionBoard";
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
  const { locale } = useI18n();
  const [queue, setQueue] = useState<string | null>(null);
  const ranked = rank(sources);
  const filtered = queue ? ranked.filter((entry) => entry.queue === queue) : ranked;
  const visible = filtered.slice(0, limit);
  const live = sources.filter((source) => source.block.count > 0);
  const total = sources.reduce((sum, source) => sum + source.block.count, 0);

  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <Section
      title={title ?? T.dashboard.actionCenter}
      hint={hint ?? T.dashboard.actionCenterHint}
      actions={
        total ? (
          <span className="flex items-center gap-2 rounded-full bg-primary-light px-3 py-1 text-sm font-bold text-primary-dark ring-1 ring-primary/20">
            <span className="font-mono">{total}</span>
          <span className="text-[12px] font-semibold text-primary-dark">{T.dashboard.open}</span>
          </span>
        ) : null
      }
    >
      {live.length ? (
        <div className="flex gap-2 overflow-x-auto border-b border-line bg-subtle/50 px-4 py-3 scrollbar-thin md:flex-wrap">
          <button
            type="button"
            onClick={() => setQueue(null)}
            aria-pressed={queue === null}
            className={cn(
              "min-h-11 shrink-0 rounded-full px-4 text-[13px] font-bold transition-all duration-200",
              queue === null ? "bg-inverse text-on-inverse shadow-sm" : "bg-surface text-ink-soft ring-1 ring-line hover:bg-surface hover:text-ink"
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
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-bold transition-all duration-200",
                queue === source.key ? "bg-inverse text-on-inverse shadow-sm" : "bg-surface text-ink-soft ring-1 ring-line hover:bg-surface hover:text-ink"
              )}
            >
              {queueLabel(source.key)}
              <span className={cn("flex size-5 items-center justify-center rounded-full font-mono text-[10px]", queue === source.key ? "bg-white/20 text-white" : "bg-subtle text-ink-soft")} dir="ltr">
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
                <li key={item.id} className="relative overflow-hidden border-s-4 border-s-transparent bg-surface px-4 py-4 md:px-5 md:py-5">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <RecordId id={item.id} />
                        <span className="rounded bg-navy/5 px-2 py-0.5 text-[12px] font-bold text-navy/70">{reason}</span>
                        <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                      </div>
                      <p className="mt-2 text-[14px] font-bold text-primary-dark">{next?.action ?? T.dashboard.open}</p>
                      <Link
                        href={`${detailBase}/${item.id}`}
                        className="mt-1 block font-heading text-[16px] font-semibold leading-snug text-navy"
                      >
                        {caseTitle(item.text, 110)}
                      </Link>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                        <span className="font-medium">{showDepartment ? item.department_name : item.responsible_employee ?? T.team.unassigned}</span>
                        {showDepartment && item.responsible_employee ? <span className="text-muted/50">•</span> : null}
                        {showDepartment && item.responsible_employee ? <span>{item.responsible_employee}</span> : null}
                        <span className="text-muted/50">•</span>
                        <span>{stage.label}</span>
                        <span className="text-muted/50">•</span>
                        <span className="font-mono text-muted" dir="ltr">{formatDate(item.target_date)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <RiskBadge level={item.risk_level} />
                      <Link
                        href={`${detailBase}/${item.id}`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-surface px-4 py-2 text-[14px] font-bold text-navy ring-1 ring-line"
                      >
                        {T.dashboard.open}
                        <DirForward className="size-4" />
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <footer className="border-t border-line bg-subtle/50 px-5 py-4 text-center">
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-2 text-[14px] font-bold text-primary-dark hover:text-primary transition-colors"
            >
              {T.dashboard.viewAll}
              <DirForward className="size-4.5" />
            </Link>
          </footer>
        </>
      ) : (
        <EmptyState
          compact
          icon={<CheckCircle2 className="size-6" />}
          title={T.dashboard.nothingPending}
          description={T.dashboard.nothingPendingHint}
          className="border-0 shadow-none py-10"
        />
      )}
    </Section>
  );
}
