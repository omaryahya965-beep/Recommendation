"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { caseTitle } from "@/lib/finding";
import { daysUntil, formatDate, formatDayParts } from "@/lib/format";
import { splitAgenda } from "@/lib/home";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";

function dueLabel(item: RecommendationListItem) {
  const days = daysUntil(item.target_date);
  if (item.overdue || (days !== null && days < 0)) return T.stats.overdue;
  if (days === 0) return T.dashboard.dueToday;
  return T.dashboard.thisWeek;
}

function dueTone(item: RecommendationListItem) {
  const days = daysUntil(item.target_date);
  if (item.overdue || (days !== null && days < 0)) return "text-danger-dark bg-danger-light ring-danger/30";
  if (days === 0) return "text-warning-dark bg-warning-light ring-warning/30";
  return "text-info-dark bg-info-light ring-info/30";
}

function AgendaGroup({
  title,
  items,
  detailHref,
  tone,
  showDepartment,
}: {
  title: string;
  items: RecommendationListItem[];
  detailHref: (item: RecommendationListItem) => string;
  tone: "danger" | "warning" | "info";
  showDepartment: boolean;
}) {
  useI18n();
  if (!items.length) return null;
  const mark =
    tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-info";

  return (
    <section className="relative pb-6 last:pb-0">
      <div className="absolute start-[19px] top-8 bottom-0 w-px bg-line" aria-hidden />
      <h3 className="sticky top-0 z-10 flex items-center gap-3 bg-surface/95 px-5 py-3 backdrop-blur-sm border-b border-line shadow-sm">
        <span className={cn("flex size-4 items-center justify-center rounded-full ring-4 ring-surface", mark)} aria-hidden />
        <span className="text-[13px] font-bold uppercase tracking-wider text-navy">{title}</span>
        <span className="flex size-5 items-center justify-center rounded-full bg-subtle font-mono text-[11px] font-bold text-ink-soft" dir="ltr">
          {items.length}
        </span>
      </h3>
      <ul className="mt-2 space-y-2 px-5">
        {items.slice(0, 6).map((item) => (
          <li key={item.id} className="relative ps-8">
            <div className="absolute start-2 top-[22px] w-4 h-px bg-line" aria-hidden />
            <Link href={detailHref(item)} className="block rounded-xl border border-line bg-surface p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-md">
              <div className="flex flex-wrap items-center gap-3">
                <RecordId id={item.id} />
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold ring-1", dueTone(item))}>
                  {dueLabel(item)}
                </span>
                <span className="ms-auto font-mono text-[11px] font-medium text-muted" dir="ltr">
                  {formatDate(item.target_date)}
                </span>
              </div>
              <p className="mt-2.5 text-[14px] font-semibold leading-snug text-ink">{caseTitle(item.text, 90)}</p>
              <p className="mt-1.5 text-[12.5px] font-medium text-ink-soft">
                {showDepartment ? item.department_name : item.responsible_employee ?? T.team.unassigned}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TodayAgenda({
  items,
  detailHref,
  showDepartment = true,
}: {
  items: RecommendationListItem[];
  detailHref: (item: RecommendationListItem) => string;
  showDepartment?: boolean;
}) {
  useI18n();
  const parts = formatDayParts();
  const agenda = splitAgenda(items);
  const empty = !agenda.overdue.length && !agenda.today.length && !agenda.week.length;

  return (
    <Section
      className="h-full bg-surface"
      title={T.dashboard.todayAgenda}
      hint={T.dashboard.todayAgendaHint}
      actions={
        <div className="flex flex-col items-center rounded-xl bg-subtle px-3 py-1.5 text-center shadow-inner ring-1 ring-inset ring-line/50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{parts.weekday}</p>
          <p className="font-heading text-xl font-bold leading-none text-navy" dir="ltr">
            {parts.day}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-ink-soft">{parts.month}</p>
        </div>
      }
    >
      {empty ? (
        <EmptyState
          compact
          icon={<CalendarDays className="size-6" />}
          title={T.dashboard.todayEmpty}
          className="border-0 shadow-none py-12"
        />
      ) : (
        <div className="pt-2">
          <AgendaGroup
            title={T.stats.overdue}
            items={agenda.overdue}
            detailHref={detailHref}
            tone="danger"
            showDepartment={showDepartment}
          />
          <AgendaGroup
            title={T.dashboard.dueToday}
            items={agenda.today}
            detailHref={detailHref}
            tone="warning"
            showDepartment={showDepartment}
          />
          <AgendaGroup
            title={T.dashboard.thisWeek}
            items={agenda.week}
            detailHref={detailHref}
            tone="info"
            showDepartment={showDepartment}
          />
        </div>
      )}
    </Section>
  );
}
