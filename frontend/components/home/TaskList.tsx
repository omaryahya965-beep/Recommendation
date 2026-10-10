"use client";

import { AlarmClock, ArrowLeft, ArrowRight, CalendarClock, ListChecks, Paperclip, RotateCcw, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { CaseDue } from "@/components/home/Queues";
import { DirForward } from "@/components/i18n/DirIcon";
import { RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { dayCount, plural, recordCode } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { ActionCenterBlock, RecommendationListItem, TaskFacts } from "@/lib/types";
import { STATUS_NEXT_ACTION } from "@/lib/workflow";

export type TaskGroupId = "returned" | "overdue" | "due" | "active";

export interface TaskGroup {
  id: TaskGroupId;
  title: string;
  icon: LucideIcon;
  tone: "danger" | "warning" | "primary";
  items: RecommendationListItem[];
  /** The exact register list behind the server's block. */
  href: string;
  /** The server count of the block (may exceed the rows shown). */
  total: number;
}

const GROUP_TONE: Record<TaskGroup["tone"], string> = {
  danger: "bg-danger-light text-danger-dark",
  warning: "bg-warning-light text-warning-dark",
  primary: "bg-primary-light text-primary-dark",
};

/**
 * Each task once, in its most urgent group: returned to me, overdue, due
 * soon, then the rest in progress. Blocks arrive in deadline order.
 */
export function groupTasks(
  blocks: Array<Omit<TaskGroup, "items" | "total"> & { block: ActionCenterBlock | undefined }>
): TaskGroup[] {
  const seen = new Set<number>();
  return blocks.map(({ block, ...group }) => ({
    ...group,
    total: block?.count ?? 0,
    items: (block?.items ?? []).filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true))),
  }));
}

/** A small ring with the plan's progress in the middle. */
function ProgressRing({ value }: { value: number }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const done = value >= 100;
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 40 40" className="size-11 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="3.5" className="stroke-line" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, value)) / 100)}
          className={done ? "stroke-success" : "stroke-primary"}
        />
      </svg>
      <span className="absolute font-mono text-[10.5px] font-bold text-navy" dir="ltr">
        {value}%
      </span>
    </span>
  );
}

/** Steps done and evidence attached: "1/3 خطوات · دليلان". */
function TaskMeta({ facts }: { facts: TaskFacts | undefined }) {
  useI18n();
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
      <span className="inline-flex items-center gap-1">
        <ListChecks className="size-3.5 text-muted" aria-hidden />
        {facts?.steps_total
          ? T.roleHome.steps.replace("{done}", String(facts.steps_done)).replace("{total}", String(facts.steps_total))
          : T.roleHome.noSteps}
      </span>
      <span className="inline-flex items-center gap-1">
        <Paperclip className="size-3.5 text-muted" aria-hidden />
        {facts?.evidence ? plural(facts.evidence, T.roleHome.evidence) : T.roleHome.noEvidence}
      </span>
    </span>
  );
}

/** One task: what it is, the next step, its progress and deadline. The row opens it. */
export function TaskRow({
  item,
  facts,
  href,
  returned,
}: {
  item: RecommendationListItem;
  facts: TaskFacts | undefined;
  href: string;
  returned?: boolean;
}) {
  useI18n();
  const next = STATUS_NEXT_ACTION[item.status];
  return (
    <li>
      <Link
        href={href}
        data-testid="task-row"
        data-id={item.id}
        className="group flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/50 active:bg-subtle/70 md:gap-4 md:px-6"
      >
        <ProgressRing value={facts?.progress ?? 0} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <RecordId id={item.id} />
            {returned ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger-light px-2 py-0.5 text-[11.5px] font-bold text-danger-dark">
                <RotateCcw className="size-3" aria-hidden />
                {T.roleHome.returnedFlag}
              </span>
            ) : null}
            {item.risk_level === "high" ? <RiskBadge level={item.risk_level} /> : null}
            <span className="ms-auto">
              <CaseDue item={item} />
            </span>
          </span>
          <span className="mt-1.5 line-clamp-2 text-[14.5px] font-bold leading-snug text-navy group-hover:text-primary-dark md:text-[15px]">
            <bdi>{clipTitle(item.title, 140)}</bdi>
          </span>
          {next ? (
            <span className="mt-1 block text-[12.5px] font-semibold text-primary-dark">
              <span className="text-muted">{T.roleHome.nextStep}: </span>
              {next.action}
            </span>
          ) : null}
          <span className="mt-1.5 block">
            <TaskMeta facts={facts} />
          </span>
        </span>
        <DirForward className="size-5 shrink-0 text-muted group-hover:text-primary-dark" />
      </Link>
    </li>
  );
}

/** The most urgent task, with its next step and one obvious action. */
export function NextTaskCard({
  item,
  facts,
  href,
  returned,
}: {
  item: RecommendationListItem;
  facts: TaskFacts | undefined;
  href: string;
  returned: boolean;
}) {
  const { locale } = useI18n();
  const next = STATUS_NEXT_ACTION[item.status];
  const Forward = locale === "ar" ? ArrowLeft : ArrowRight;
  const progress = facts?.progress ?? 0;
  return (
    <section
      className="overflow-hidden rounded-2xl bg-inverse text-on-inverse shadow-section"
      aria-labelledby="next-task-title"
      data-testid="next-task"
    >
      <div className="px-5 pb-5 pt-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-bold text-white/70">{T.roleHome.nextTask}</p>
          <span className="flex flex-wrap items-center gap-1.5">
            {returned ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2.5 py-1 text-[11.5px] font-bold text-white">
                <RotateCcw className="size-3.5" aria-hidden />
                {T.roleHome.returnedFlag}
              </span>
            ) : null}
            {item.overdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2.5 py-1 text-[11.5px] font-bold text-white">
                <AlarmClock className="size-3.5" aria-hidden />
                {T.workflow.overdueBy.replace("{days}", dayCount(item.days_overdue, "accusative"))}
              </span>
            ) : item.due_in_days != null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11.5px] font-bold text-white">
                <CalendarClock className="size-3.5" aria-hidden />
                {item.due_in_days === 0 ? T.workflow.dueToday : T.workflow.dueIn.replace("{days}", dayCount(item.due_in_days))}
              </span>
            ) : null}
          </span>
        </div>
        <h2 id="next-task-title" className="mt-2 font-heading text-[1.2rem] font-bold leading-snug text-white md:text-[1.3rem]">
          {next?.action ?? T.dashboard.open}
        </h2>
        <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14px] leading-relaxed text-white/85">
          <span className="rounded-md bg-white/12 px-1.5 py-0.5 font-mono text-[12px] font-bold text-white/80" dir="ltr">
            {recordCode(item.id)}
          </span>
          <bdi className="min-w-0">{clipTitle(item.title, 140)}</bdi>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="min-w-[10rem] flex-1">
            <div className="mb-1.5 flex items-baseline justify-between text-[12px] text-white/70">
              <span>{T.case.progress}</span>
              <span className="font-mono font-bold text-white" dir="ltr">
                {progress}%
              </span>
            </div>
            <span className="block h-1.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
              <span className="block h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
            </span>
          </div>
          <Link
            href={href}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-6 text-[15px] font-bold text-[#183b4e] shadow-sm hover:bg-white/90 sm:w-auto"
          >
            {T.roleHome.openTask}
            <Forward className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Every task in one card, grouped by urgency; each group links to its exact list. */
export function TaskBoard({
  groups,
  facts,
  hrefFor,
}: {
  groups: TaskGroup[];
  facts: Record<string, TaskFacts>;
  hrefFor: (item: RecommendationListItem) => string;
}) {
  const { locale } = useI18n();
  const Forward = locale === "ar" ? ArrowLeft : ArrowRight;
  const live = groups.filter((group) => group.items.length);
  return (
    <section
      className="section-elevated flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface"
      aria-labelledby="my-tasks-title"
      data-testid="my-tasks"
    >
      <header className="flex items-center gap-3 border-b border-line/70 px-4 py-3.5 md:px-6 md:py-4">
        <div className="mt-0.5 h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
        <div className="min-w-0">
          <h2 id="my-tasks-title" className="font-heading text-[17px] font-bold text-navy">
            {T.roleHome.myTasks}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted max-md:hidden">{T.roleHome.myTasksHint}</p>
        </div>
      </header>
      {live.length ? (
        live.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.id} data-testid={`task-group-${group.id}`} className="border-b border-line/60 last:border-b-0">
              <div className="flex items-center justify-between gap-3 bg-subtle/45 px-4 py-2 md:px-6">
                <h3 className="inline-flex items-center gap-2 text-[13px] font-bold text-navy">
                  <span className={cn("flex size-6 items-center justify-center rounded-full", GROUP_TONE[group.tone])} aria-hidden>
                    <Icon className="size-3.5" />
                  </span>
                  {group.title}
                  <span className="rounded-full bg-surface px-1.5 font-mono text-[11px] font-bold text-ink-soft ring-1 ring-line" dir="ltr">
                    {group.items.length}
                  </span>
                </h3>
                {group.total > group.items.length ? (
                  <Link
                    href={group.href}
                    className="inline-flex min-h-9 items-center gap-1 text-[12.5px] font-bold text-primary-dark hover:underline"
                  >
                    {T.home.viewAll}
                    <Forward className="size-3.5" aria-hidden />
                  </Link>
                ) : null}
              </div>
              <ul className="divide-y divide-line/60">
                {group.items.map((item) => (
                  <TaskRow
                    key={item.id}
                    item={item}
                    facts={facts[String(item.id)]}
                    href={hrefFor(item)}
                    returned={group.id === "returned"}
                  />
                ))}
              </ul>
            </div>
          );
        })
      ) : (
        <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
          <p className="text-[14px] font-bold text-navy">{T.roleHome.noTasks}</p>
          <p className="text-[12.5px] text-muted">{T.roleHome.noTasksHint}</p>
        </div>
      )}
    </section>
  );
}
