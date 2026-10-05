"use client";

import { AlarmClock, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Hourglass } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import type { ActionCenterBlock, RecommendationListItem } from "@/lib/types";

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
          ? T.home.waitingDays.replace("{days}", String(item.days_waiting))
          : T.home.waitingToday}
      </span>
    );
  }
  if (item.overdue) {
    return (
      <span className={cn(chip, "bg-danger-light text-danger-dark")}>
        <AlarmClock className="size-3" aria-hidden />
        {T.workflow.overdueBy.replace("{days}", String(item.days_overdue))}
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
      <span className={cn(chip, item.due_in_days <= 7 ? "bg-warning-light/70 text-warning-dark" : "bg-subtle text-ink-soft")}>
        <CalendarClock className="size-3" aria-hidden />
        {item.due_in_days === 0 ? T.workflow.dueToday : T.workflow.dueIn.replace("{days}", String(item.due_in_days))}
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

/**
 * A titled list of cases from one dashboard block. The count is the exact
 * server count; "view all" opens the register with the same filter.
 */
export function QueuePanel({
  title,
  hint,
  block,
  href,
  detailBase,
  meta = "deadline",
  showDepartment = true,
  emptyLabel,
  limit = 5,
  tone = "neutral",
  testId,
  className,
}: {
  title: string;
  hint?: ReactNode;
  block: ActionCenterBlock | undefined;
  href: string;
  detailBase: string;
  meta?: QueueMeta;
  showDepartment?: boolean;
  emptyLabel: string;
  limit?: number;
  tone?: "neutral" | "danger" | "warning";
  testId?: string;
  className?: string;
}) {
  useI18n();
  const items = (block?.items ?? []).slice(0, limit);
  const count = block?.count ?? 0;
  return (
    <Section
      className={className}
      title={
        <span className="inline-flex items-center gap-2">
          {title}
          <CountChip count={count} tone={tone} />
        </span>
      }
      hint={hint}
      actions={count > 0 ? <ViewAllLink href={href} /> : null}
    >
      <div data-testid={testId} className="flex min-h-0 flex-1 flex-col">
        {items.length ? (
          <ul className="divide-y divide-line/70">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`${detailBase}/${item.id}`}
                  className="group flex min-h-14 flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-subtle/50 md:px-6"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <RecordId id={item.id} />
                      <RiskBadge level={item.risk_level} />
                    </span>
                    <CaseDue item={item} meta={meta} />
                  </span>
                  <span className="text-[14px] font-semibold leading-snug text-navy group-hover:text-primary-dark">
                    {clipTitle(item.title, 100)}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-soft">
                    {showDepartment ? <span>{item.department_name}</span> : null}
                    {showDepartment ? <span aria-hidden className="text-line">•</span> : null}
                    <span>{item.responsible_employee ?? T.team.unassigned}</span>
                    <span aria-hidden className="text-line">•</span>
                    <span>{STATUS_LABELS[item.status] ?? item.status}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center justify-center gap-2 px-4 py-6 text-center text-[13px] text-muted md:px-6">
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
            {emptyLabel}
          </p>
        )}
      </div>
    </Section>
  );
}
