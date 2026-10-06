"use client";

import {
  AlarmClock,
  ArrowDownWideNarrow,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileSearch,
  FileText,
  MessageSquareReply,
  ShieldCheck,
  UserRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { CaseDue, CountChip } from "@/components/home/Queues";
import { DirForward } from "@/components/i18n/DirIcon";
import { RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { caseHref, sectionForStatus } from "@/lib/caseLinks";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { dayCount, formatDate, plural } from "@/lib/format";
import { REPORT_TYPE_LABELS, STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import {
  AUDIT_REVIEW_QUEUES,
  queueHint,
  queueHref,
  queueTitle,
  type AuditReviewQueue,
  type QueueId,
} from "@/lib/registerQueues";
import type { ActionCenterBlock, DashboardReport, RecommendationListItem } from "@/lib/types";

type CaseQueue = AuditReviewQueue | "department_overdue";

const QUEUE_ICON: Record<CaseQueue, LucideIcon> = {
  responses_to_review: MessageSquareReply,
  plans_to_review: ClipboardList,
  verifications_pending: FileSearch,
  closure_reviews: ShieldCheck,
  department_overdue: AlarmClock,
};

const QUEUE_TONE: Record<CaseQueue, string> = {
  responses_to_review: "bg-info-light text-info-dark",
  plans_to_review: "bg-primary-light text-primary-dark",
  verifications_pending: "bg-warning-light text-warning-dark",
  closure_reviews: "bg-success-light text-success-dark",
  department_overdue: "bg-danger-light text-danger-dark",
};

/** "وصلت منذ يومين": how long the case has been in this queue. */
function arrival(item: RecommendationListItem) {
  return item.days_waiting > 0
    ? T.queues.arrivedAgo.replace("{days}", dayCount(item.days_waiting, "genitive"))
    : T.queues.arrivedToday;
}

function newest(a: RecommendationListItem, b: RecommendationListItem) {
  const at = a.waiting_since ? Date.parse(a.waiting_since) : 0;
  const bt = b.waiting_since ? Date.parse(b.waiting_since) : 0;
  return bt - at || b.id - a.id;
}

/**
 * One case in a work queue: why it is here, what it is, whose it is, and
 * how long it has waited. The whole row opens the case at the section the
 * work is in.
 */
export function QueueCaseRow({
  item,
  queue,
  detailBase,
  showReason = true,
}: {
  item: RecommendationListItem;
  queue: CaseQueue;
  detailBase: string;
  showReason?: boolean;
}) {
  useI18n();
  const Icon = QUEUE_ICON[queue];
  const overdueQueue = queue === "department_overdue";
  return (
    <li>
      <Link
        href={caseHref(detailBase, item.id, sectionForStatus(item.status))}
        data-testid="queue-item"
        data-id={item.id}
        data-queue={queue}
        className="group relative flex min-w-0 gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/50 focus-visible:bg-subtle/60 active:bg-subtle/70 md:gap-4 md:px-6 md:py-4"
      >
        <span
          className={cn("mt-0.5 hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex", QUEUE_TONE[queue])}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <RecordId id={item.id} />
            {showReason ? (
              <span
                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold", QUEUE_TONE[queue])}
                data-testid="queue-reason"
              >
                <Icon className="size-3 sm:hidden" aria-hidden />
                {queueTitle(queue)}
              </span>
            ) : null}
            {overdueQueue ? (
              <span className="ms-auto">
                <CaseDue item={item} />
              </span>
            ) : (
              <span className="ms-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ink-soft" data-testid="queue-arrival">
                <Clock3 className="size-3.5 text-muted" aria-hidden />
                {arrival(item)}
              </span>
            )}
          </span>
          <span className="mt-1.5 line-clamp-2 text-[14.5px] font-bold leading-snug text-navy group-hover:text-primary-dark md:text-[15px]">
            <bdi>{clipTitle(item.title, 160)}</bdi>
          </span>
          <span className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-ink-soft">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1">
              <Building2 className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="truncate">{item.department_name}</span>
            </span>
            <span className="inline-flex min-w-0 max-w-full items-center gap-1">
              <UserRound className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">{T.queues.owner}: </span>
              <span className="truncate">{item.responsible_employee ?? T.team.unassigned}</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <Workflow className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="truncate">{STATUS_LABELS[item.status] ?? item.status}</span>
            </span>
            <span className="sm:hidden">
              <RiskBadge level={item.risk_level} />
            </span>
            {overdueQueue ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3.5 shrink-0 text-muted" aria-hidden />
                {arrival(item)}
              </span>
            ) : null}
          </span>
        </span>
        <span className="hidden shrink-0 flex-col items-end justify-between gap-2 sm:flex">
          <RiskBadge level={item.risk_level} />
          <DirForward className="size-4 text-muted group-hover:text-primary-dark" />
        </span>
      </Link>
    </li>
  );
}

/** The card footer that opens the queue's full list in the register. */
export function QueueMore({ href, count, testId }: { href: string; count: number; testId?: string }) {
  useI18n();
  return (
    <footer className="mt-auto border-t border-line/70 bg-subtle/40">
      <Link
        href={href}
        data-testid={testId}
        className="flex min-h-12 items-center justify-center gap-1.5 px-4 text-[13.5px] font-bold text-primary-dark transition-colors hover:bg-primary-light/40 hover:text-primary"
      >
        {T.queues.viewMoreCount.replace("{n}", String(count))}
        <DirForward className="size-4" />
      </Link>
    </footer>
  );
}

function CardHeader({
  title,
  hint,
  count,
  tone = "neutral",
  aside,
}: {
  title: string;
  hint?: ReactNode;
  count: number;
  tone?: "neutral" | "danger" | "warning";
  aside?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line/70 px-4 py-3.5 md:px-6 md:py-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-1 h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-[16.5px] font-bold text-navy md:text-[17px]">
            {title}
            <CountChip count={count} tone={tone} />
          </h2>
          {hint ? <p className="mt-1 text-[12.5px] leading-snug text-muted md:text-[13px]">{hint}</p> : null}
        </div>
      </div>
      {aside}
    </header>
  );
}

/**
 * أولويات الرقابة: everything waiting on audit's decision, newest arrival
 * first. The tabs narrow it to one queue; "view more" opens that exact
 * subset in the register, in the same order.
 */
export function AuditPriorities({
  blocks,
  detailBase,
  registerBase,
  limit = 6,
}: {
  blocks: Partial<Record<AuditReviewQueue, ActionCenterBlock>>;
  detailBase: string;
  registerBase: string;
  limit?: number;
}) {
  useI18n();
  const [tab, setTab] = useState<AuditReviewQueue | "all">("all");
  const merged = useMemo(
    () =>
      AUDIT_REVIEW_QUEUES.flatMap((queue) => (blocks[queue]?.items ?? []).map((item) => ({ item, queue })))
        .sort((a, b) => newest(a.item, b.item)),
    [blocks]
  );
  const total = AUDIT_REVIEW_QUEUES.reduce((sum, queue) => sum + (blocks[queue]?.count ?? 0), 0);
  const count = tab === "all" ? total : (blocks[tab]?.count ?? 0);
  const rows = (tab === "all" ? merged : merged.filter((entry) => entry.queue === tab)).slice(0, limit);
  const view: QueueId = tab === "all" ? "audit_priorities" : tab;

  return (
    <section
      className="section-elevated flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface"
      data-testid="audit-priorities"
      aria-labelledby="audit-priorities-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-3 pt-4 md:px-6 md:pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-1 h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
          <div className="min-w-0">
            <h2 id="audit-priorities-title" className="flex flex-wrap items-center gap-2 font-heading text-[17px] font-bold text-navy md:text-[18px]">
              {T.queues.audit_priorities}
              <span className="rounded-full bg-primary-light px-2.5 py-0.5 font-mono text-[12.5px] font-bold text-primary-dark" dir="ltr">
                {total}
              </span>
            </h2>
            <p className="mt-1 text-[12.5px] leading-snug text-muted md:text-[13px]">{T.queues.audit_prioritiesHint}</p>
          </div>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-subtle px-3 text-[12px] font-bold text-ink-soft">
          <ArrowDownWideNarrow className="size-3.5" aria-hidden />
          {T.queues.newestFirst}
        </span>
      </header>

      <div
        className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-3 scrollbar-none md:flex-wrap md:px-6"
        role="group"
        aria-label={T.queues.audit_priorities}
      >
        {(["all", ...AUDIT_REVIEW_QUEUES] as const).map((id) => {
          const n = id === "all" ? total : (blocks[id]?.count ?? 0);
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={active}
              data-queue={id}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold transition-colors",
                active ? "bg-inverse text-on-inverse shadow-sm" : "bg-subtle/70 text-ink-soft hover:bg-subtle hover:text-ink",
                !active && n === 0 && "text-muted"
              )}
            >
              {id === "all" ? T.queues.all : queueTitle(id)}
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 py-px text-center font-mono text-[11px]",
                  active ? "bg-on-inverse/20" : "bg-surface ring-1 ring-line"
                )}
                dir="ltr"
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {tab !== "all" ? (
        <p className="mx-4 mb-3 rounded-xl bg-subtle/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-soft md:mx-6" data-testid="queue-why">
          {queueHint(tab)}
        </p>
      ) : null}

      {rows.length ? (
        <>
          <ul className="divide-y divide-line/60 border-t border-line/70" data-testid="priorities-list">
            {rows.map(({ item, queue }) => (
              <QueueCaseRow key={`${queue}-${item.id}`} item={item} queue={queue} detailBase={detailBase} />
            ))}
          </ul>
          <QueueMore href={queueHref(registerBase, view)} count={count} testId="priorities-more" />
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 border-t border-line/70 px-6 py-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-success-light text-success-dark">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <p className="text-[14.5px] font-bold text-navy">{tab === "all" ? T.queues.emptyAll : T.queues.empty}</p>
          {tab === "all" ? <p className="max-w-sm text-[12.5px] text-muted">{T.queues.emptyAllHint}</p> : null}
        </div>
      )}
    </section>
  );
}

/** A secondary case queue (e.g. overdue at departments) with a short preview. */
export function CaseQueueCard({
  queue,
  block,
  detailBase,
  registerBase,
  emptyLabel,
  limit = 3,
  testId,
}: {
  queue: "department_overdue";
  block: ActionCenterBlock | undefined;
  detailBase: string;
  registerBase: string;
  emptyLabel: string;
  limit?: number;
  testId?: string;
}) {
  useI18n();
  const count = block?.count ?? 0;
  const items = (block?.items ?? []).slice(0, limit);
  return (
    <section className="section-elevated flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface" data-testid={testId}>
      <CardHeader title={queueTitle(queue)} hint={queueHint(queue)} count={count} tone="danger" />
      {items.length ? (
        <>
          <ul className="divide-y divide-line/60">
            {items.map((item) => (
              <QueueCaseRow key={item.id} item={item} queue={queue} detailBase={detailBase} showReason={false} />
            ))}
          </ul>
          <QueueMore href={queueHref(registerBase, queue)} count={count} testId={testId ? `${testId}-more` : undefined} />
        </>
      ) : (
        <p className="flex items-center justify-center gap-2 px-4 py-7 text-center text-[13px] text-muted">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

/** Reports in one state (ready for council, drafts), each opening its page. */
export function ReportQueueCard({
  title,
  hint,
  block,
  hrefFor,
  moreHref,
  emptyLabel,
  limit = 3,
  testId,
}: {
  title: string;
  hint?: ReactNode;
  block: ActionCenterBlock<DashboardReport> | undefined;
  hrefFor: (report: DashboardReport) => string;
  moreHref: string;
  emptyLabel: string;
  limit?: number;
  testId?: string;
}) {
  useI18n();
  const count = block?.count ?? 0;
  const items = (block?.items ?? []).slice(0, limit);
  return (
    <section className="section-elevated flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface" data-testid={testId}>
      <CardHeader title={title} hint={hint} count={count} />
      {items.length ? (
        <>
          <ul className="divide-y divide-line/60">
            {items.map((report) => (
              <li key={report.id}>
                <Link
                  href={hrefFor(report)}
                  className="group flex min-h-14 min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/50 active:bg-subtle/70 md:px-6"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary-dark" aria-hidden>
                    <FileText className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold text-navy group-hover:text-primary-dark">
                      <bdi>{report.title}</bdi>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-ink-soft">
                      {report.department_name} · {REPORT_TYPE_LABELS[report.engagement_type]} ·{" "}
                      {plural(report.recommendations_count, T.home.recommendationsCount)}
                    </span>
                  </span>
                  <span className="hidden shrink-0 font-mono text-[11.5px] text-muted sm:inline" dir="ltr">
                    {formatDate(report.updated_at)}
                  </span>
                  <DirForward className="size-4 shrink-0 text-muted group-hover:text-primary-dark" />
                </Link>
              </li>
            ))}
          </ul>
          <QueueMore href={moreHref} count={count} testId={testId ? `${testId}-more` : undefined} />
        </>
      ) : (
        <p className="px-4 py-7 text-center text-[13px] text-muted md:px-6">{emptyLabel}</p>
      )}
    </section>
  );
}

export interface PortfolioStat {
  label: string;
  value: string;
  href: string;
  tone?: "danger" | "warning";
}

/** A slim row of portfolio figures, each opening the list it counts. */
export function PortfolioStrip({ title, items }: { title: string; items: PortfolioStat[] }) {
  useI18n();
  return (
    <section aria-label={title} className="min-w-0" data-testid="portfolio-strip">
      <h2 className="mb-2 px-1 text-[12.5px] font-bold text-muted">{title}</h2>
      <ul className="grid min-w-0 grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-4">
        {items.map((item, index) => (
          <li
            key={item.label}
            className={cn(
              "min-w-0 border-line/70",
              index % 2 === 1 && "border-s",
              index >= 2 && "border-t md:border-t-0",
              index >= 1 && "md:border-s"
            )}
          >
            <Link href={item.href} className="flex min-h-16 min-w-0 flex-col justify-center px-4 py-3 transition-colors hover:bg-subtle/50">
              <span className="truncate text-[12px] font-semibold text-ink-soft">{item.label}</span>
              <span
                className={cn(
                  "mt-0.5 self-start font-heading text-[1.35rem] font-bold leading-none tabular-nums",
                  item.tone === "danger" ? "text-danger-dark" : item.tone === "warning" ? "text-warning-dark" : "text-navy"
                )}
                dir="ltr"
              >
                {item.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
