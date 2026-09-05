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
  limit = 3,
  showDepartment = true,
  className,
}: {
  sources: ActionSource[];
  detailBase: string;
  viewAllHref: string;
  title?: string;
  hint?: string;
  limit?: number;
  showDepartment?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const [queue, setQueue] = useState<string | null>(null);
  const ranked = rank(sources);
  const filtered = queue ? ranked.filter((entry) => entry.queue === queue) : ranked;
  const visible = filtered.slice(0, limit);
  const live = sources.filter((source) => source.block.count > 0);
  const total = sources.reduce((sum, source) => sum + source.block.count, 0);
  const moreHref = (queue && live.find((source) => source.key === queue)?.href) || viewAllHref;

  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <Section
      className={className}
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
        <div className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain border-b border-line/60 bg-subtle/30 px-4 py-3 md:flex-wrap md:overflow-visible">
          <button
            type="button"
            onClick={() => setQueue(null)}
            aria-pressed={queue === null}
            className={cn(
              "min-h-11 shrink-0 whitespace-nowrap rounded-full px-5 text-[13px] font-bold transition-all duration-200 backdrop-blur-sm",
              queue === null ? "bg-inverse text-on-inverse shadow-sm" : "bg-surface/80 text-ink-soft ring-1 ring-line hover:bg-surface hover:text-ink hover:shadow-sm"
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
                "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 text-[13px] font-bold transition-all duration-200 backdrop-blur-sm",
                queue === source.key ? "bg-inverse text-on-inverse shadow-sm" : "bg-surface/80 text-ink-soft ring-1 ring-line hover:bg-surface hover:text-ink hover:shadow-sm"
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
          <ul className="min-h-0 flex-1 divide-y divide-line/60 divider-soft">
            {visible.map(({ item, reason }) => {
              const next = STATUS_NEXT_ACTION[item.status];
              const stage = stageForStatus(item.status);
              return (
                <li key={item.id} className="list-accent-bar group relative overflow-hidden bg-surface px-4 py-4 md:px-6 md:py-5 transition-colors hover:bg-subtle/30">
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
                        className="mt-1 block font-heading text-[16px] font-semibold leading-snug text-navy group-hover:text-primary transition-colors"
                      >
                        {caseTitle(item.text, 110)}
                      </Link>
                      <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-ink-soft">
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
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-surface px-4 py-2 text-[14px] font-bold text-navy ring-1 ring-line shadow-sm hover:bg-primary hover:text-white hover:ring-primary transition-all active:scale-95"
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
          <footer className="mt-auto border-t border-line bg-subtle/50 px-5 py-4 text-center">
            <Link
              href={moreHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 text-[14px] font-bold text-primary-dark hover:text-primary transition-colors"
            >
              {T.notify.loadMore}
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
          className="flex-1 border-0 shadow-none py-10"
        />
      )}
    </Section>
  );
}
