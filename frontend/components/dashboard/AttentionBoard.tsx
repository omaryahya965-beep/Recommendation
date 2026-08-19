"use client";

import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  FileWarning,
  MessageSquareWarning,
  Repeat2,
  Stamp,
  Timer,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState, type ComponentType } from "react";

import { DirForward } from "@/components/i18n/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/ui/StampBadge";
import { cn } from "@/lib/cn";
import { caseTitle } from "@/lib/finding";
import { daysUntil, formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { ActionCenterBlock, RecommendationListItem } from "@/lib/types";
import { stageForStatus, STATUS_NEXT_ACTION } from "@/lib/workflow";

const RISK_WEIGHT = { high: 0, medium: 1, low: 2 } as const;

type Tone = "danger" | "warning" | "info" | "primary" | "ai" | "neutral";

const QUEUE_TONE: Record<string, Tone> = {
  overdue: "danger",
  returned_for_more_evidence: "danger",
  verifications_pending: "warning",
  responses_to_review: "warning",
  responses_needed: "warning",
  upcoming_deadlines: "warning",
  due_today: "warning",
  plans_to_review: "info",
  plans_needed: "info",
  implementations_to_review: "info",
  waiting_head_review: "info",
  closure_reviews: "primary",
  closures_pending: "primary",
  reports_pending_ratification: "primary",
  possible_recurrences: "ai",
};

const QUEUE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  overdue: Timer,
  returned_for_more_evidence: FileWarning,
  verifications_pending: FileSearch,
  responses_to_review: MessageSquareWarning,
  responses_needed: MessageSquareWarning,
  upcoming_deadlines: CalendarClock,
  due_today: CalendarClock,
  plans_to_review: ClipboardList,
  plans_needed: ClipboardList,
  implementations_to_review: UserRound,
  waiting_head_review: UserRound,
  closure_reviews: Stamp,
  closures_pending: Stamp,
  reports_pending_ratification: Stamp,
  possible_recurrences: Repeat2,
};

const TONE_IDLE: Record<Tone, string> = {
  danger: "border-danger/35 bg-danger-light text-danger-dark",
  warning: "border-warning/35 bg-warning-light text-warning-dark",
  info: "border-info/35 bg-info-light text-info-dark",
  primary: "border-primary/35 bg-primary-light text-primary-dark",
  ai: "border-ai/35 bg-ai-light text-ai-dark",
  neutral: "border-line bg-subtle text-ink",
};

const TONE_SELECTED: Record<Tone, string> = {
  danger: "border-danger bg-danger text-white",
  warning: "border-warning bg-warning text-white",
  info: "border-info bg-info text-white",
  primary: "border-primary bg-primary text-white",
  ai: "border-ai bg-ai text-white",
  neutral: "border-inverse bg-inverse text-on-inverse",
};

export interface ActionSource {
  key: string;
  block: ActionCenterBlock<RecommendationListItem>;
  href: string;
}

export function queueLabel(key: string) {
  return (T.actionCenter as Record<string, string>)[key] ?? key;
}

export function approachingSource(
  sources: ActionSource[],
  href: string,
  withinDays = 7
): ActionSource | null {
  const seen = new Set<number>();
  const items: RecommendationListItem[] = [];
  for (const source of sources) {
    for (const item of source.block.items ?? []) {
      if (seen.has(item.id) || item.overdue) continue;
      const days = daysUntil(item.target_date);
      if (days !== null && days >= 0 && days <= withinDays) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  if (!items.length) return null;
  return { key: "upcoming_deadlines", block: { count: items.length, items }, href };
}

export function splitDue(block: ActionCenterBlock<RecommendationListItem> | undefined, href: string) {
  const items = block?.items ?? [];
  const today = items.filter((item) => daysUntil(item.target_date) === 0);
  const soon = items.filter((item) => {
    const days = daysUntil(item.target_date);
    return days !== null && days > 0 && days <= 7;
  });
  const sources: ActionSource[] = [];
  if (today.length) sources.push({ key: "due_today", block: { count: today.length, items: today }, href });
  if (soon.length) sources.push({ key: "upcoming_deadlines", block: { count: soon.length, items: soon }, href });
  else if (block && block.count > 0 && !today.length) {
    sources.push({ key: "upcoming_deadlines", block, href });
  }
  return sources;
}

export function rank(sources: ActionSource[]) {
  const seen = new Map<number, { item: RecommendationListItem; reason: string; queue: string }>();

  for (const source of sources) {
    for (const item of source.block.items ?? []) {
      if (!seen.has(item.id)) {
        seen.set(item.id, { item, reason: queueLabel(source.key), queue: source.key });
      }
    }
  }

  return [...seen.values()].sort((a, b) => {
    if (a.item.overdue !== b.item.overdue) return a.item.overdue ? -1 : 1;
    const risk = RISK_WEIGHT[a.item.risk_level] - RISK_WEIGHT[b.item.risk_level];
    if (risk !== 0) return risk;
    const aDays = daysUntil(a.item.target_date);
    const bDays = daysUntil(b.item.target_date);
    if (aDays !== null && bDays !== null && aDays !== bDays) return aDays - bDays;
    if (aDays === null && bDays !== null) return 1;
    if (bDays === null && aDays !== null) return -1;
    return b.item.priority_score - a.item.priority_score;
  });
}

function ActionRow({ item, reason, href }: { item: RecommendationListItem; reason: string; href: string }) {
  useI18n();
  const stage = stageForStatus(item.status);
  const next = STATUS_NEXT_ACTION[item.status];

  return (
    <li
      className={cn(
        "border-s-[3px] px-4 py-3 transition-colors hover:bg-subtle/70",
        item.overdue ? "border-s-danger" : item.risk_level === "high" ? "border-s-warning" : "border-s-primary/35"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <RecordId id={item.id} />
            <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">{reason}</span>
            <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
          </div>
          <Link href={href} className="mt-1 block font-medium leading-snug text-ink hover:text-primary-dark">
            {caseTitle(item.text, 110)}
          </Link>
          <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
            <div>
              <dt className="inline text-muted">{T.common.department}: </dt>
              <dd className="inline">{item.department_name}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{T.common.responsible}: </dt>
              <dd className="inline">{item.responsible_employee ?? T.common.none}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{T.workflow.current}: </dt>
              <dd className="inline">{stage.label}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{T.common.targetDate}: </dt>
              <dd className="inline font-mono" dir="ltr">
                {formatDate(item.target_date)}
              </dd>
            </div>
          </dl>
          <p className="mt-1.5 text-[13px] text-ink">
            <span className="text-muted">{T.workflow.requiredAction}: </span>
            {next.action}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <RiskBadge level={item.risk_level} />
          <StatusBadge status={item.status} />
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-(--radius-btn) border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary-dark hover:bg-primary-light"
          >
            {T.dashboard.open}
            <DirForward className="size-3.5" />
          </Link>
        </div>
      </div>
    </li>
  );
}

/**
 * Action centre. `jump` = control-room tiles that open the register.
 * `groups` = personal/department work stacks. `filter` = tiles that filter rows.
 */
export function AttentionBoard({
  sources,
  detailBase,
  viewAllHref,
  limit = 6,
  layout = "filter",
  title,
  hint,
}: {
  sources: ActionSource[];
  detailBase: string;
  viewAllHref: string;
  limit?: number;
  layout?: "filter" | "jump" | "groups";
  title?: string;
  hint?: string;
}) {
  useI18n();
  const [queue, setQueue] = useState<string | null>(null);

  const ranked = rank(sources);
  const filtered = queue ? ranked.filter((entry) => entry.queue === queue) : ranked;
  const visible = filtered.slice(0, limit);
  const total = sources.reduce((sum, source) => sum + source.block.count, 0);
  const active = queue ? sources.find((source) => source.key === queue) : null;
  const liveQueues = sources.filter((source) => source.block.count > 0);

  if (layout === "groups") {
    return (
      <Section title={title ?? T.dashboard.myActions} hint={hint ?? T.dashboard.myActionsHint}>
        {liveQueues.length ? (
          <div className="divide-y divide-line">
            {liveQueues.map((source) => {
              const tone = QUEUE_TONE[source.key] ?? "neutral";
              const Icon = QUEUE_ICON[source.key] ?? ClipboardList;
              const rows = (source.block.items ?? []).slice(0, 4);
              return (
                <section key={source.key} className="px-0">
                  <header
                    className={cn(
                      "flex items-center justify-between gap-2 px-4 py-2",
                      TONE_IDLE[tone]
                    )}
                  >
                    <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                      <Icon className="size-3.5" />
                      {queueLabel(source.key)}
                    </p>
                    <span className="font-mono text-sm font-bold text-ink" dir="ltr">
                      {source.block.count}
                    </span>
                  </header>
                  {rows.length ? (
                    <ul className="divide-y divide-line">
                      {rows.map((item) => (
                        <ActionRow
                          key={item.id}
                          item={item}
                          reason={queueLabel(source.key)}
                          href={`${detailBase}/${item.id}`}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState
            compact
            icon={<CheckCircle2 className="size-5" />}
            title={T.dashboard.nothingPending}
            description={T.dashboard.nothingPendingHint}
            className="border-0 shadow-none"
          />
        )}
        {liveQueues.length ? (
          <footer className="border-t border-line bg-subtle px-4 py-2 text-center">
            <Link href={viewAllHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-dark hover:underline">
              {T.dashboard.viewAll}
              <DirForward className="size-4" />
            </Link>
          </footer>
        ) : null}
      </Section>
    );
  }

  return (
    <Section
      title={title ?? T.dashboard.actionCenter}
      hint={hint ?? T.dashboard.actionCenterHint}
      actions={
        <p className="text-sm text-ink-soft">
          <span className="font-mono text-lg font-bold text-ink" dir="ltr">
            {total}
          </span>{" "}
          {T.dashboard.needsAction}
        </p>
      }
    >
      {liveQueues.length ? (
        <div className="flex flex-wrap gap-2 px-3 py-3">
          {layout === "filter" ? (
            <button
              type="button"
              onClick={() => setQueue(null)}
              aria-pressed={queue === null}
              className={cn(
                "min-w-[8.5rem] flex-1 basis-[8.5rem] rounded-(--radius-field) border px-3 py-2 text-start transition-colors",
                queue === null ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-subtle text-ink-soft hover:text-ink"
              )}
            >
              <p className="text-[11px] font-medium">{T.reports.filterAll}</p>
              <p className="mt-0.5 font-heading text-lg font-bold" dir="ltr">
                {total}
              </p>
            </button>
          ) : null}
          {liveQueues.map((source) => {
            const tone = QUEUE_TONE[source.key] ?? "neutral";
            const selected = queue === source.key;
            const Icon = QUEUE_ICON[source.key] ?? ClipboardList;
            const className = cn(
              "min-w-[8.5rem] flex-1 basis-[8.5rem] rounded-(--radius-field) border px-3 py-2 text-start transition-colors",
              layout === "jump" ? TONE_IDLE[tone] : selected ? TONE_SELECTED[tone] : TONE_IDLE[tone]
            );
            const body = (
              <>
                <p className="flex items-center gap-1.5 text-[11px] font-medium leading-snug">
                  <Icon className="size-3.5 shrink-0" />
                  <span className="line-clamp-2">{queueLabel(source.key)}</span>
                </p>
                <p className="mt-0.5 font-heading text-lg font-bold" dir="ltr">
                  {source.block.count}
                </p>
              </>
            );
            if (layout === "jump") {
              return (
                <Link key={source.key} href={source.href} className={className}>
                  {body}
                </Link>
              );
            }
            return (
              <button
                key={source.key}
                type="button"
                onClick={() => setQueue((prev) => (prev === source.key ? null : source.key))}
                aria-pressed={selected}
                className={className}
              >
                {body}
              </button>
            );
          })}
        </div>
      ) : null}

      {layout === "jump" ? (
        liveQueues.length ? null : (
          <EmptyState
            compact
            icon={<CheckCircle2 className="size-5" />}
            title={T.dashboard.nothingPending}
            description={T.dashboard.nothingPendingHint}
            className="border-0 shadow-none"
          />
        )
      ) : visible.length ? (
        <>
          <ul className="divide-y divide-line border-t border-line">
            {visible.map(({ item, reason }) => (
              <ActionRow key={item.id} item={item} reason={reason} href={`${detailBase}/${item.id}`} />
            ))}
          </ul>
          <footer className="border-t border-line bg-subtle px-4 py-2 text-center">
            <Link
              href={active?.href ?? viewAllHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-dark hover:underline"
            >
              {T.dashboard.viewAll}
              <DirForward className="size-4" />
            </Link>
          </footer>
        </>
      ) : (
        <EmptyState
          compact
          icon={<CheckCircle2 className="size-5" />}
          title={queue ? T.common.noResults : T.dashboard.nothingPending}
          description={queue ? undefined : T.dashboard.nothingPendingHint}
          className="border-0 shadow-none"
        />
      )}
    </Section>
  );
}
