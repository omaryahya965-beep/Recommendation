"use client";

import { Repeat2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

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
  const { locale } = useI18n();
  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;
  
  return (
    <Section
      title={T.dashboard.recurrenceWatch}
      hint={T.dashboard.recurrenceWatchHint}
      actions={
        items.length ? (
          <Link href={viewAllHref} className="inline-flex items-center gap-1.5 rounded-full bg-warning-light/30 px-4 py-1.5 text-[13px] font-bold text-warning-dark ring-1 ring-warning/30 hover:bg-warning hover:text-white hover:ring-warning transition-all">
            {T.dashboard.viewQueue}
            <DirForward className="size-4" />
          </Link>
        ) : null
      }
    >
      {items.length ? (
        <ul className="divide-y divide-line/60 divider-soft">
          {items.slice(0, 6).map((item) => (
            <li key={item.id} className="group relative overflow-hidden bg-surface px-5 py-5 transition-colors hover:bg-subtle/30">
              <div className="absolute start-0 top-0 bottom-0 w-[3px] bg-warning scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-100 transition-all duration-250 ease-out" aria-hidden />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <RecordId id={item.id} />
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ai-light/50 px-2 py-0.5 text-[11.5px] font-bold tracking-wide text-ai-dark ring-1 ring-ai/20">
                      <Repeat2 className="size-3.5" />
                      {T.actionCenter.possible_recurrences}
                    </span>
                  </div>
                  <Link href={detailHref(item)} className="mt-3 block font-heading text-[16px] font-semibold leading-snug text-navy group-hover:text-primary transition-colors">
                    {caseTitle(item.text, 100)}
                  </Link>
                  <p className="mt-2.5 text-[13px] font-medium text-ink-soft">{item.department_name}</p>
                </div>
                <Link
                  href={detailHref(item)}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-surface px-4 py-2 text-[14px] font-bold text-navy ring-1 ring-line shadow-sm hover:bg-primary hover:text-white hover:ring-primary transition-all active:scale-95"
                >
                  {T.dashboard.open}
                  <DirForward className="size-4" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={<Repeat2 className="size-6" />} title={T.dashboard.queueEmpty} className="border-0 shadow-none py-10" />
      )}
    </Section>
  );
}
