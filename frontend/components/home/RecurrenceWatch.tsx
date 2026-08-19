"use client";

import { Repeat2 } from "lucide-react";
import Link from "next/link";

import { DirForward } from "@/components/i18n/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { Section } from "@/components/ui/Section";
import { caseTitle } from "@/lib/finding";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";

export function RecurrenceWatch({
  items,
  detailHref,
  viewAllHref,
}: {
  items: RecommendationListItem[];
  detailHref: (item: RecommendationListItem) => string;
  viewAllHref: string;
}) {
  useI18n();
  return (
    <Section
      title={T.dashboard.recurrenceWatch}
      hint={T.dashboard.recurrenceWatchHint}
      actions={
        items.length ? (
          <Link href={viewAllHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary-dark hover:underline">
            {T.dashboard.viewQueue}
            <DirForward className="size-3.5" />
          </Link>
        ) : null
      }
    >
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.slice(0, 6).map((item) => (
            <li key={item.id}>
              <Link
                href={detailHref(item)}
                className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-subtle/70"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <RecordId id={item.id} />
                    <span className="inline-flex items-center gap-1 rounded-md bg-ai-light px-1.5 py-0.5 text-[11px] font-medium text-ai-dark">
                      <Repeat2 className="size-3" />
                      {T.actionCenter.possible_recurrences}
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] font-medium leading-snug text-ink">{caseTitle(item.text, 100)}</p>
                  <p className="mt-1 text-[12px] text-ink-soft">{item.department_name}</p>
                </div>
                <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[12px] text-primary-dark">
                  {T.dashboard.open}
                  <DirForward className="size-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={<Repeat2 className="size-5" />} title={T.dashboard.queueEmpty} className="border-0 shadow-none" />
      )}
    </Section>
  );
}
