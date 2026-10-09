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
import { useIsPhone } from "@/lib/useMediaQuery";
import {
  AUDIT_REVIEW_QUEUES,
  queueHint,
  queueHref,
  queueTitle,
  type AuditReviewQueue,
  type QueueId,
} from "@/lib/registerQueues";
import type { ActionCenterBlock, DashboardReport, RecommendationListItem } from "@/lib/types";

/** Why a case sits in a queue: the chip on its row and the tab that filters to it. */
export interface QueueReason {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Chip / icon tile colours. */
  tone: string;
}

export const REASON_TONE = {
  info: "bg-info-light text-info-dark",
  primary: "bg-primary-light text-primary-dark",
  warning: "bg-warning-light text-warning-dark",
  success: "bg-success-light text-success-dark",
  danger: "bg-danger-light text-danger-dark",
  neutral: "bg-subtle text-ink-soft",
} as const;

type CaseQueue = AuditReviewQueue | "department_overdue";

const QUEUE_ICON: Record<CaseQueue, LucideIcon> = {
  responses_to_review: MessageSquareReply,
  plans_to_review: ClipboardList,
  verifications_pending: FileSearch,
  closure_reviews: ShieldCheck,
  department_overdue: AlarmClock,
};

const QUEUE_TONE: Record<CaseQueue, string> = {
  responses_to_review: REASON_TONE.info,
  plans_to_review: REASON_TONE.primary,
  verifications_pending: REASON_TONE.warning,
  closure_reviews: REASON_TONE.success,
  department_overdue: REASON_TONE.danger,
};

function auditReason(queue: CaseQueue): QueueReason {
  return { id: queue, label: queueTitle(queue), icon: QUEUE_ICON[queue], tone: QUEUE_TONE[queue] };
}

/** "وصلت منذ يومين": how long the case has been in this queue. */
export function arrival(item: RecommendationListItem) {
  return item.days_waiting > 0
    ? T.queues.arrivedAgo.replace("{days}", dayCount(item.days_waiting, "genitive"))
    : T.queues.arrivedToday;
}

/** Newest arrival in the queue first (audit's review queues). */
export function byArrival(a: RecommendationListItem, b: RecommendationListItem) {
  const at = a.waiting_since ? Date.parse(a.waiting_since) : 0;
  const bt = b.waiting_since ? Date.parse(b.waiting_since) : 0;
  return bt - at || b.id - a.id;
}

const RISK_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Most urgent first: department overdue, then the nearest binding deadline, then risk. */
export function byUrgency(a: RecommendationListItem, b: RecommendationListItem) {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.overdue && b.overdue && a.days_overdue !== b.days_overdue) return b.days_overdue - a.days_overdue;
  const ad = a.due_in_days ?? Number.POSITIVE_INFINITY;
  const bd = b.due_in_days ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level] || b.priority_score - a.priority_score || a.id - b.id;
}

/**
 * One case in a work queue: why it is here, what it is, whose it is, and
 * how long it has waited (or how its deadline stands). The whole row opens
 * the case at the section the work is in.
 */
export function QueueCaseRow({
  item,
  href,
  reason,
  showReason = true,
  timing = "arrival",
  showDepartment = true,
  dense = false,
}: {
  item: RecommendationListItem;
  href: string;
  reason: QueueReason;
  showReason?: boolean;
  /** `arrival`: time in the queue; `deadline`: the binding deadline chip. */
  timing?: "arrival" | "deadline";
  showDepartment?: boolean;
  /** The stacked phone row on every screen (a dashboard's side rail). */
  dense?: boolean;
}) {
  useI18n();
  const phone = useIsPhone();
  const stacked = phone || dense;
  const Icon = reason.icon;
  const byDeadline = timing === "deadline";

  if (stacked) {
    // Phones and rails: title and reference first, then who and where, then one line
    // of chips (why it is here, high risk, how long). The whole row is the link.
    return (
      <li>
        <Link
          href={href}
          data-testid="queue-item"
          data-id={item.id}
          data-queue={reason.id}
          className="group flex min-w-0 items-center gap-2.5 px-4 py-3.5 transition-colors hover:bg-subtle/50 active:bg-subtle/70 md:px-5"
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-start justify-between gap-2">
              <span className="line-clamp-2 min-w-0 text-[15px] font-bold leading-snug text-navy group-hover:text-primary-dark md:text-[14.5px]">
                <bdi>{clipTitle(item.title, 120)}</bdi>
              </span>
              <span className="mt-0.5 shrink-0">
                <RecordId id={item.id} />
              </span>
            </span>
            <span className="mt-1.5 flex min-w-0 items-center gap-x-3 text-[12.5px] text-ink-soft">
              {showDepartment ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Building2 className="size-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{item.department_name}</span>
                </span>
              ) : null}
              <span className="inline-flex min-w-0 items-center gap-1">
                <UserRound className="size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="sr-only">{T.queues.owner}: </span>
                <span className="truncate">{item.responsible_employee ?? T.team.unassigned}</span>
              </span>
              {showDepartment ? null : (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Workflow className="size-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{STATUS_LABELS[item.status] ?? item.status}</span>
                </span>
              )}
            </span>
            <span className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1.5">
              {byDeadline ? <CaseDue item={item} /> : null}
              {showReason ? (
                <span
                  className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold", reason.tone)}
                  data-testid="queue-reason"
                >
                  <Icon className="size-3.5" aria-hidden />
                  {reason.label}
                </span>
              ) : null}
              {/* Risk only where it changes the order of work. */}
              {item.risk_level === "high" ? <RiskBadge level={item.risk_level} /> : null}
              {byDeadline ? null : (
                <span className="ms-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted" data-testid="queue-arrival">
                  <Clock3 className="size-3.5" aria-hidden />
                  {arrival(item)}
                </span>
              )}
            </span>
          </span>
          <DirForward className="size-5 shrink-0 text-muted" />
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        data-testid="queue-item"
        data-id={item.id}
        data-queue={reason.id}
        className="group relative flex min-w-0 gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/50 focus-visible:bg-subtle/60 active:bg-subtle/70 md:gap-4 md:px-6 md:py-4"
      >
        <span className={cn("mt-0.5 hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex", reason.tone)} aria-hidden>
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <RecordId id={item.id} />
            {showReason ? (
              <span
                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold", reason.tone)}
                data-testid="queue-reason"
              >
                <Icon className="size-3 sm:hidden" aria-hidden />
                {reason.label}
              </span>
            ) : null}
            {byDeadline ? (
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
            {showDepartment ? (
              <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                <Building2 className="size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="truncate">{item.department_name}</span>
              </span>
            ) : null}
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
            {byDeadline ? (
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
  // Phones carry "view all" in the card header instead.
  if (useIsPhone()) return null;
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

/** Phones: "view all" in the card header, in place of the footer link. */
export function HeaderMore({ href, testId }: { href: string; testId?: string }) {
  useI18n();
  if (!useIsPhone()) return null;
  return (
    <Link
      href={href}
      data-testid={testId}
      className="-me-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-[13.5px] font-bold text-primary-dark active:bg-primary-light/50"
    >
      {T.home.viewAll}
      <DirForward className="size-4" />
    </Link>
  );
}

/** A queue card's header: accent bar, title, count, one-line hint (hidden on phones). */
export function CardHeader({
  title,
  hint,
  count,
  tone = "neutral",
  aside,
  id,
}: {
  title: string;
  hint?: ReactNode;
  count?: number;
  tone?: "neutral" | "danger" | "warning";
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3.5 md:items-start md:px-6 md:py-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-1 h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
        <div className="min-w-0">
          <h2 id={id} className="flex flex-wrap items-center gap-2 font-heading text-[16.5px] font-bold text-navy md:text-[17px]">
            {title}
            {count != null ? <CountChip count={count} tone={tone} /> : null}
          </h2>
          {hint ? <p className="mt-1 text-[12.5px] leading-snug text-muted max-md:hidden md:text-[13px]">{hint}</p> : null}
        </div>
      </div>
      {aside}
    </header>
  );
}

/** A quiet, centred "nothing here" line for an empty queue card. */
export function QueueEmpty({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-success-light text-success-dark">
        <CheckCircle2 className="size-5" aria-hidden />
      </span>
      <p className="text-[13.5px] font-bold text-navy">{label}</p>
      {hint ? <p className="max-w-sm text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export interface QueueTab {
  reason: QueueReason;
  /** Why a case is in this queue (shown when the tab is selected). */
  hint: string;
  block: ActionCenterBlock | undefined;
  /** The register list holding exactly this block's count. */
  href: string;
}

/**
 * Several queues merged into one card with a tab per queue. "All" lists every
 * queue together in `order`; each tab narrows to one queue, and "view more"
 * opens that exact subset in the register.
 */
export function TabbedQueueCard({
  title,
  hint,
  titleId,
  tabs,
  allHref,
  order,
  orderLabel,
  detailHref,
  timing = "arrival",
  showDepartment = true,
  limit = 6,
  emptyTitle,
  emptyHint,
  testId,
  listTestId,
  moreTestId,
  className,
}: {
  title: string;
  hint: string;
  titleId: string;
  tabs: QueueTab[];
  allHref: string;
  order: (a: RecommendationListItem, b: RecommendationListItem) => number;
  orderLabel: string;
  detailHref: (item: RecommendationListItem) => string;
  timing?: "arrival" | "deadline";
  showDepartment?: boolean;
  limit?: number;
  emptyTitle: string;
  emptyHint?: string;
  testId: string;
  listTestId?: string;
  moreTestId: string;
  className?: string;
}) {
  useI18n();
  const [tab, setTab] = useState<string>("all");
  const merged = useMemo(() => {
    const seen = new Set<number>();
    return tabs
      .flatMap((entry) => (entry.block?.items ?? []).map((item) => ({ item, reason: entry.reason })))
      .filter(({ item }) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
      .sort((a, b) => order(a.item, b.item));
  }, [tabs, order]);
  const total = tabs.reduce((sum, entry) => sum + (entry.block?.count ?? 0), 0);
  const current = tabs.find((entry) => entry.reason.id === tab) ?? null;
  const count = current ? (current.block?.count ?? 0) : total;
  const rows = (current ? merged.filter((entry) => entry.reason.id === tab) : merged).slice(0, limit);
  const moreHref = current ? current.href : allHref;

  return (
    <section
      className={cn("section-elevated flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface", className)}
      data-testid={testId}
      aria-labelledby={titleId}
    >
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 md:flex-wrap md:items-start md:px-6 md:pt-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-1 h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
          <div className="min-w-0">
            <h2 id={titleId} className="flex flex-wrap items-center gap-2 font-heading text-[17px] font-bold text-navy md:text-[18px]">
              {title}
              <span className="rounded-full bg-primary-light px-2.5 py-0.5 font-mono text-[12.5px] font-bold text-primary-dark" dir="ltr">
                {total}
              </span>
            </h2>
            <p className="mt-1 text-[12.5px] leading-snug text-muted max-md:hidden md:text-[13px]">{hint}</p>
          </div>
        </div>
        {count ? <HeaderMore href={moreHref} testId={moreTestId} /> : null}
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-subtle px-3 text-[12px] font-bold text-ink-soft max-md:hidden">
          <ArrowDownWideNarrow className="size-3.5" aria-hidden />
          {orderLabel}
        </span>
      </header>

      <div
        className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-3 scrollbar-none md:flex-wrap md:px-6"
        role="group"
        aria-label={title}
      >
        {[null, ...tabs].map((entry) => {
          const id = entry ? entry.reason.id : "all";
          const n = entry ? (entry.block?.count ?? 0) : total;
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
              {entry ? entry.reason.label : T.queues.all}
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

      {current ? (
        <p className="mx-4 mb-3 rounded-xl bg-subtle/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-soft md:mx-6" data-testid="queue-why">
          {current.hint}
        </p>
      ) : null}

      {rows.length ? (
        <>
          <ul className="divide-y divide-line/60 border-t border-line/70" data-testid={listTestId}>
            {rows.map(({ item, reason }) => (
              <QueueCaseRow
                key={`${reason.id}-${item.id}`}
                item={item}
                href={detailHref(item)}
                reason={reason}
                timing={timing}
                showDepartment={showDepartment}
              />
            ))}
          </ul>
          <QueueMore href={moreHref} count={count} testId={moreTestId} />
        </>
      ) : (
        <div className="border-t border-line/70">
          <QueueEmpty label={current ? T.queues.empty : emptyTitle} hint={current ? undefined : emptyHint} />
        </div>
      )}
    </section>
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
  const tabs: QueueTab[] = AUDIT_REVIEW_QUEUES.map((queue) => ({
    reason: auditReason(queue),
    hint: queueHint(queue),
    block: blocks[queue],
    href: queueHref(registerBase, queue),
  }));
  return (
    <TabbedQueueCard
      title={T.queues.audit_priorities}
      hint={T.queues.audit_prioritiesHint}
      titleId="audit-priorities-title"
      tabs={tabs}
      allHref={queueHref(registerBase, "audit_priorities" satisfies QueueId)}
      order={byArrival}
      orderLabel={T.queues.newestFirst}
      detailHref={(item) => caseHref(detailBase, item.id, sectionForStatus(item.status))}
      limit={limit}
      emptyTitle={T.queues.emptyAll}
      emptyHint={T.queues.emptyAllHint}
      testId="audit-priorities"
      listTestId="priorities-list"
      moreTestId="priorities-more"
    />
  );
}

/** One case queue with a short preview, its count and an exact "view all". */
export function QueueListCard({
  title,
  hint,
  block,
  href,
  reason,
  detailHref,
  tone = "neutral",
  timing = "arrival",
  showReason = false,
  showDepartment = true,
  emptyLabel,
  limit = 3,
  testId,
  className,
  dense = false,
}: {
  title: string;
  hint?: ReactNode;
  block: ActionCenterBlock | undefined;
  href: string;
  reason: QueueReason;
  detailHref: (item: RecommendationListItem) => string;
  tone?: "neutral" | "danger" | "warning";
  timing?: "arrival" | "deadline";
  showReason?: boolean;
  showDepartment?: boolean;
  emptyLabel: string;
  limit?: number;
  testId?: string;
  className?: string;
  /** Stacked rows, for a dashboard's side rail. */
  dense?: boolean;
}) {
  useI18n();
  const count = block?.count ?? 0;
  const items = (block?.items ?? []).slice(0, limit);
  return (
    <section
      className={cn("section-elevated flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface", className)}
      data-testid={testId}
    >
      <CardHeader
        title={title}
        hint={hint}
        count={count}
        tone={tone}
        aside={count ? <HeaderMore href={href} testId={testId ? `${testId}-more` : undefined} /> : null}
      />
      {items.length ? (
        <>
          <ul className="divide-y divide-line/60">
            {items.map((item) => (
              <QueueCaseRow
                key={item.id}
                item={item}
                href={detailHref(item)}
                reason={reason}
                showReason={showReason}
                timing={timing}
                showDepartment={showDepartment}
                dense={dense}
              />
            ))}
          </ul>
          <QueueMore href={href} count={count} testId={testId ? `${testId}-more` : undefined} />
        </>
      ) : (
        <p className="flex flex-1 items-center justify-center gap-2 px-4 py-7 text-center text-[13px] text-muted">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

/** Audit: a secondary case queue (overdue at departments) with a short preview. */
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
  return (
    <QueueListCard
      title={queueTitle(queue)}
      hint={queueHint(queue)}
      block={block}
      href={queueHref(registerBase, queue)}
      reason={auditReason(queue)}
      detailHref={(item) => caseHref(detailBase, item.id, sectionForStatus(item.status))}
      tone="danger"
      timing="deadline"
      emptyLabel={emptyLabel}
      limit={limit}
      testId={testId}
    />
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
  dense = false,
}: {
  title: string;
  hint?: ReactNode;
  block: ActionCenterBlock<DashboardReport> | undefined;
  hrefFor: (report: DashboardReport) => string;
  moreHref: string;
  emptyLabel: string;
  limit?: number;
  testId?: string;
  /** Two-line titles and no date column, for a dashboard's side rail. */
  dense?: boolean;
}) {
  useI18n();
  const count = block?.count ?? 0;
  const items = (block?.items ?? []).slice(0, limit);
  return (
    <section className="section-elevated flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface" data-testid={testId}>
      <CardHeader
        title={title}
        hint={hint}
        count={count}
        aside={count ? <HeaderMore href={moreHref} testId={testId ? `${testId}-more` : undefined} /> : null}
      />
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
                    <span
                      className={cn(
                        "block text-[14px] font-bold text-navy group-hover:text-primary-dark",
                        dense ? "line-clamp-2 leading-snug" : "truncate"
                      )}
                    >
                      <bdi>{report.title}</bdi>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-ink-soft">
                      {report.department_name} · {REPORT_TYPE_LABELS[report.engagement_type]} ·{" "}
                      {plural(report.recommendations_count, T.home.recommendationsCount)}
                    </span>
                  </span>
                  <span className={cn("hidden shrink-0 font-mono text-[11.5px] text-muted", !dense && "sm:inline")} dir="ltr">
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
