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
  if (item.overdue || (days !== null && days < 0)) return "text-danger-dark bg-danger-light";
  if (days === 0) return "text-warning-dark bg-warning-light";
  return "text-info-dark bg-info-light";
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
    <section>
      <h3 className="flex items-center gap-2 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wider text-navy bg-subtle/20">
        <span className={`size-1.5 rounded-full ${mark}`} aria-hidden />
        {title}
        <span className="font-mono font-medium text-muted" dir="ltr">
          {items.length}
        </span>
      </h3>
      <ul className="divide-y divide-line/60 divider-soft">
        {items.slice(0, 6).map((item) => (
          <li key={item.id} className="list-accent-bar relative">
            <Link href={detailHref(item)} className="block px-5 py-3.5 transition-colors hover:bg-subtle/30">
              <div className="flex flex-wrap items-center gap-2">
                <RecordId id={item.id} />
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", dueTone(item))}>
                  {dueLabel(item)}
                </span>
                <span className="font-mono text-[11px] text-muted" dir="ltr">
                  {formatDate(item.target_date)}
                </span>
              </div>
              <p className="mt-1 text-[13.5px] font-medium leading-snug text-ink">{caseTitle(item.text, 90)}</p>
              <p className="mt-0.5 text-[12px] text-ink-soft">
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
      className="h-full"
      title={T.dashboard.todayAgenda}
      hint={T.dashboard.todayAgendaHint}
      actions={
        <div className="flex min-w-[3.75rem] flex-col items-center rounded-xl border border-line/70 bg-surface px-2 py-1.5 text-center shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-widest text-primary-dark/70">{parts.weekday}</p>
          <p className="font-heading text-[22px] font-bold leading-none text-navy" dir="ltr">
            {parts.day}
          </p>
          <p className="mt-0.5 text-[10px] font-medium text-muted">{parts.month}</p>
        </div>
      }
    >
      {empty ? (
        <EmptyState
          compact
          icon={<CalendarDays className="size-5" />}
          title={T.dashboard.todayEmpty}
          className="border-0 shadow-none"
        />
      ) : (
        <div className="divide-y divide-line">
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
