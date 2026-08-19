"use client";

import { Users } from "lucide-react";
import Link from "next/link";

import { DirForward } from "@/components/i18n/DirIcon";
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
  useI18n();
  const rows = [...items]
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (a.target_date ?? "").localeCompare(b.target_date ?? "");
    })
    .slice(0, 8);

  return (
    <Section
      title={T.dashboard.executionBoard}
      hint={T.dashboard.executionBoardHint}
      actions={
        <Link href={viewAllHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary-dark hover:underline">
          {T.nav.teamProgress}
          <DirForward className="size-3.5" />
        </Link>
      }
    >
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((item) => {
            const next = STATUS_NEXT_ACTION[item.status];
            return (
              <li key={item.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RecordId id={item.id} />
                      <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                    </div>
                    <Link href={detailHref(item)} className="mt-1 block text-[14px] font-medium text-ink hover:text-primary-dark">
                      {caseTitle(item.text, 100)}
                    </Link>
                    <p className="mt-1 text-[12.5px] text-ink-soft">
                      {item.responsible_employee ?? T.team.unassigned}
                      {` · ${stageForStatus(item.status).label} · `}
                      <span dir="ltr">{formatDate(item.target_date)}</span>
                    </p>
                    <p className="mt-1 text-[12.5px] text-primary-dark">{next?.action}</p>
                  </div>
                  <Link
                    href={detailHref(item)}
                    className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-primary-dark hover:underline"
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
        <EmptyState compact icon={<Users className="size-5" />} title={T.dashboard.executionEmpty} className="border-0 shadow-none" />
      )}
    </Section>
  );
}
