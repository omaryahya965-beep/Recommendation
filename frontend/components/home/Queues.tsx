"use client";

import { AlarmClock, CalendarClock, ChevronLeft, ChevronRight, Hourglass } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { dayCount, formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";

export type QueueMeta = "deadline" | "waiting";

/**
 * The one fact that orders a queue row: how late, how soon, or how long it
 * has waited. Uses the server's binding deadline (W1) and its owner rule (W2).
 */
export function CaseDue({ item, meta = "deadline" }: { item: RecommendationListItem; meta?: QueueMeta }) {
  useI18n();
  const chip = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold";
  if (meta === "waiting") {
    return (
      <span className={cn(chip, item.days_waiting > 7 ? "bg-warning-light text-warning-dark" : "bg-subtle text-ink-soft")}>
        <Hourglass className="size-3" aria-hidden />
        {item.days_waiting > 0
          ? T.home.waitingDays.replace("{days}", dayCount(item.days_waiting))
          : T.home.waitingToday}
      </span>
    );
  }
  if (item.overdue) {
    return (
      <span className={cn(chip, "bg-danger-light text-danger-dark")}>
        <AlarmClock className="size-3" aria-hidden />
        {T.workflow.overdueBy.replace("{days}", dayCount(item.days_overdue ?? 0, "accusative"))}
      </span>
    );
  }
  if (item.response_overdue) {
    return (
      <span className={cn(chip, "bg-warning-light text-warning-dark")}>
        <AlarmClock className="size-3" aria-hidden />
        {T.workflow.responseLate}
      </span>
    );
  }
  if (item.due_in_days != null) {
    return (
      <span className={cn(chip, item.due_in_days <= 7 ? "bg-warning-light text-warning-dark" : "bg-subtle text-ink-soft")}>
        <CalendarClock className="size-3" aria-hidden />
        {item.due_in_days === 0 ? T.workflow.dueToday : T.workflow.dueIn.replace("{days}", dayCount(item.due_in_days))}
      </span>
    );
  }
  return item.deadline ? (
    <span className="shrink-0 font-mono text-[11.5px] text-muted" dir="ltr">
      {formatDate(item.deadline)}
    </span>
  ) : null;
}

export function ViewAllLink({ href, label }: { href: string; label?: string }) {
  const { locale } = useI18n();
  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-[12.5px] font-bold text-primary-dark ring-1 ring-primary/25 hover:bg-primary-light/60"
    >
      {label ?? T.home.viewAll}
      <DirForward className="size-3.5" aria-hidden />
    </Link>
  );
}

export function CountChip({ count, tone = "neutral" }: { count: number; tone?: "neutral" | "danger" | "warning" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[12px] font-bold",
        tone === "danger" && count
          ? "bg-danger-light text-danger-dark"
          : tone === "warning" && count
            ? "bg-warning-light text-warning-dark"
            : "bg-subtle text-ink-soft"
      )}
      dir="ltr"
    >
      {count}
    </span>
  );
}
