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
        <ul className="divide-y divide-line/60 divider-soft">
          {rows.map((item) => {
            const next = STATUS_NEXT_ACTION[item.status];
            return (
              <li key={item.id} className="list-accent-bar group relative overflow-hidden bg-surface px-4 py-4 md:px-6 md:py-5 transition-colors hover:bg-subtle/30">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RecordId id={item.id} />
                      <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                    </div>
                    <Link href={detailHref(item)} className="mt-2 block font-heading text-[16px] font-semibold leading-snug text-navy group-hover:text-primary transition-colors">
                      {caseTitle(item.text, 100)}
                    </Link>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                      <span className="font-bold text-ink">{item.responsible_employee ?? T.team.unassigned}</span>
                      <span className="text-muted/50">•</span>
                      <span>{stageForStatus(item.status).label}</span>
                      <span className="text-muted/50">•</span>
                      <span className="font-mono text-muted" dir="ltr">{formatDate(item.target_date)}</span>
                    </div>
                    {next?.action ? (
                      <div className="mt-2.5 inline-flex items-center rounded bg-primary-light/50 px-2 py-1 text-[12px] font-bold text-primary-dark">
                        {next.action}
                      </div>
                    ) : null}
                  </div>
                  <Link
                    href={detailHref(item)}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-surface px-4 py-2 text-[14px] font-bold text-navy ring-1 ring-line shadow-sm hover:bg-primary hover:text-white hover:ring-primary transition-all active:scale-95"
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
