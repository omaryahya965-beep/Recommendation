"use client";

import { Users, ChevronRight, ChevronLeft } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { Section } from "@/components/ui/Section";
import { caseTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";
import { STATUS_NEXT_ACTION, stageForStatus } from "@/lib/workflow";

export function ExecutionNow({
  items,
  detailHref,
  viewAllHref,
}: {
  items: RecommendationListItem[];
  detailHref: (item: RecommendationListItem) => string;
  viewAllHref: string;
}) {
  const { locale } = useI18n();
  const rows = [...items]
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (a.target_date ?? "").localeCompare(b.target_date ?? "");
    })
    .slice(0, 8);

  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <Section
      title={T.dashboard.executionBoard}
      hint={T.dashboard.executionBoardHint}
      actions={
        <Link href={viewAllHref} className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-4 py-1.5 text-[13px] font-bold text-primary-dark ring-1 ring-line hover:bg-surface hover:text-primary transition-all">
          {T.nav.teamProgress}
          <DirForward className="size-4" />
        </Link>
      }
    >
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((item) => {
            const next = STATUS_NEXT_ACTION[item.status];
            return (
              <li key={item.id} className="group relative overflow-hidden bg-surface px-5 py-5 transition-all duration-200 hover:bg-subtle/40">
                <div className="absolute start-0 top-0 bottom-0 w-1 bg-primary scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-100 transition-all duration-300" aria-hidden />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <RecordId id={item.id} />
                      <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                    </div>
                    <Link href={detailHref(item)} className="mt-3 block font-heading text-[15px] font-semibold leading-snug text-navy hover:text-primary transition-colors">
                      {caseTitle(item.text, 100)}
                    </Link>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
                      <span className="font-bold text-ink">{item.responsible_employee ?? T.team.unassigned}</span>
                      <span className="text-muted/50">•</span>
                      <span>{stageForStatus(item.status).label}</span>
                      <span className="text-muted/50">•</span>
                      <span className="font-mono text-muted" dir="ltr">{formatDate(item.target_date)}</span>
                    </div>
                    {next?.action ? (
                      <div className="mt-2 inline-flex items-center rounded bg-primary-light/30 px-2 py-0.5 text-[11px] font-bold text-primary-dark uppercase tracking-wider">
                        {next.action}
                      </div>
                    ) : null}
                  </div>
                  <Link
                    href={detailHref(item)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[12px] font-bold text-navy ring-1 ring-line hover:bg-navy hover:text-white hover:ring-navy transition-all shadow-sm"
                  >
                    {T.dashboard.open}
                    <DirForward className="size-3.5" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact icon={<Users className="size-6" />} title={T.dashboard.executionEmpty} className="border-0 shadow-none py-10" />
      )}
    </Section>
  );
}
