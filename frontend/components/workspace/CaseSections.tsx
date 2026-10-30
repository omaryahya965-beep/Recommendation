"use client";

import { BellRing, ChevronDown, ChevronLeft, ChevronRight, Stamp, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useFocusTrap } from "@/components/mobile/useFocusTrap";

import { AuditTrail } from "@/components/trail/AuditTrail";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { dayCount, formatDate, formatDateTime } from "@/lib/format";
import { APPROVAL_TYPE_LABELS, RECIPIENT_ROLE_LABELS, T, useI18n } from "@/lib/i18n";
import type { CaseReminder, RecommendationDetail } from "@/lib/types";
import { historyEntries, type HistoryFilter, type SectionId } from "@/lib/viewmodels/caseView";
import type { SectionTone } from "@/components/workspace/sectionContent";

const STATUS_PILL: Record<SectionTone, string> = {
  success: "bg-success-light text-success-dark ring-success/20",
  warning: "bg-warning-light/70 text-warning-dark ring-warning/25",
  danger: "bg-danger-light text-danger-dark ring-danger/20",
};

/**
 * One collapsible part of the case record.
 *
 * - `card`: a framed card of its own (phone case screen).
 * - `row`: a row inside the desktop "case record" group; the group draws the frame.
 * - `quiet`: a lighter, smaller row for the secondary decisions/history group.
 */
export function CaseSection({
  id,
  title,
  summary,
  count,
  status,
  icon,
  open,
  onToggle,
  variant = "card",
  nav,
  children,
}: {
  /** A record section, or an extra one (the phone's "details"). */
  id: SectionId | "details";
  title: string;
  summary?: string | null;
  count?: number | null;
  /** A short review-state pill (accepted, sufficient, ...). */
  status?: { label: string; tone: SectionTone } | null;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** tile / tile-wide: a card in a grid of sections; the open section's
      content spans the grid's full width below the tiles. */
  variant?: "card" | "row" | "quiet" | "tile" | "tile-wide";
  /** Tiles only: move to the neighbouring part from inside the open panel. */
  nav?: SectionNav;
  children: ReactNode;
}) {
  const contentId = `section-${id}-content`;
  const titleId = `section-${id}-title`;
  const summaryId = `section-${id}-summary`;
  if (variant === "tile" || variant === "tile-wide") {
    return (
      <SectionTile
        id={id}
        title={title}
        summary={summary}
        count={count}
        status={status}
        icon={icon}
        open={open}
        onToggle={onToggle}
        wide={variant === "tile-wide"}
        nav={nav}
      >
        {children}
      </SectionTile>
    );
  }
  const quiet = variant === "quiet";
  const Heading = variant === "card" ? "h2" : "h3";
  return (
    <section
      id={`section-${id}`}
      data-open={open || undefined}
      className={cn(
        "scroll-mt-24",
        variant === "card" && "overflow-hidden rounded-2xl border border-line bg-surface",
        variant === "row" && open && "bg-surface"
      )}
    >
      <Heading>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          aria-labelledby={titleId}
          aria-describedby={summary ? summaryId : undefined}
          onClick={onToggle}
          className={cn(
            "flex w-full items-center gap-3 text-start transition-colors hover:bg-subtle/50 focus-visible:bg-subtle/50",
            quiet ? "min-h-12 px-4 py-2.5 md:px-5" : "min-h-14 px-4 py-3 md:px-5",
            variant === "row" && open && "bg-primary-light/25 hover:bg-primary-light/35"
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg",
              quiet ? "size-8" : "size-9",
              open ? "bg-primary-light text-primary-dark" : quiet ? "text-muted" : "bg-subtle text-muted"
            )}
            aria-hidden
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span
              id={titleId}
              className={cn("block font-heading font-bold text-navy", quiet ? "text-[14px]" : "text-[15px]")}
            >
              {title}
            </span>
            {summary ? (
              <span id={summaryId} className="mt-0.5 block truncate text-[12.5px] font-normal text-muted">
                {summary}
              </span>
            ) : null}
          </span>
          {status ? (
            <span
              className={cn(
                "hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ring-1 sm:inline-flex",
                STATUS_PILL[status.tone]
              )}
            >
              {status.label}
            </span>
          ) : null}
          {count ? (
            <span className="rounded-full bg-subtle px-2 py-0.5 font-mono text-[11.5px] font-bold text-ink-soft" dir="ltr">
              {count}
            </span>
          ) : null}
          <ChevronDown
            className={cn("size-5 shrink-0 text-muted transition-transform duration-200", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </Heading>
      {open ? (
        <div
          id={contentId}
          className={cn("border-t border-line px-4 py-5 md:px-6", variant === "row" && "border-line/70 pb-6")}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A part of the record as a tile; it opens as a page inside the page: a
 * centred panel over the case with its own header and scrolling body.
 * Escape, the close button or a click outside closes it, focus stays inside
 * while it is open and returns to the tile.
 */
type SectionNav = {
  prev: { title: string; go: () => void } | null;
  next: { title: string; go: () => void } | null;
};

function SectionTile({
  nav,
  id,
  title,
  summary,
  count,
  status,
  icon,
  open,
  onToggle,
  wide,
  children,
}: {
  id: SectionId | "details";
  title: string;
  summary?: string | null;
  count?: number | null;
  status?: { label: string; tone: SectionTone } | null;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  wide: boolean;
  nav?: SectionNav;
  children: ReactNode;
}) {
  useI18n();
  const contentId = `section-${id}-content`;
  const titleId = `section-${id}-title`;
  const summaryId = `section-${id}-summary`;
  const dialogTitleId = `section-${id}-dialog-title`;
  const tileRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // On <body>, above the sidebar and header like any dialog. The case loads on
  // the client, so a tile never renders during server rendering.
  const host = open && typeof document !== "undefined" ? document.body : null;
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // The page behind stays put without touching its overflow (hiding the
  // page's scroll while scrolled breaks the sticky sidebar): wheel and touch
  // scrolling are stopped everywhere on the overlay except the panel body,
  // which itself never hands its scroll on to the page.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!open || !overlay) return;
    const block = (event: Event) => {
      if (!bodyRef.current?.contains(event.target as Node)) event.preventDefault();
    };
    overlay.addEventListener("wheel", block, { passive: false });
    overlay.addEventListener("touchmove", block, { passive: false });
    return () => {
      overlay.removeEventListener("wheel", block);
      overlay.removeEventListener("touchmove", block);
    };
  }, [open, host]);
  // No scroll lock: the overlay blocks background scrolling itself (above).
  useFocusTrap(open, panelRef, onToggle, closeRef, tileRef, false);

  const pills = status || count ? (
    <span className="flex flex-wrap items-center justify-center gap-1.5">
      {status ? (
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1", STATUS_PILL[status.tone])}>
          {status.label}
        </span>
      ) : null}
      {count ? (
        <span className="rounded-full bg-subtle px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-ink-soft">{count}</span>
      ) : null}
    </span>
  ) : null;

  return (
    // display:contents: tile and panel stay inside #section-<id> while the tile
    // takes part in the parent grid.
    <section id={`section-${id}`} data-open={open || undefined} className="contents">
      <h3 className="min-w-0">
        <button
          ref={tileRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={contentId}
          aria-labelledby={titleId}
          aria-describedby={summary ? summaryId : undefined}
          onClick={onToggle}
          className={cn(
            "flex h-full w-full rounded-xl border bg-surface text-start transition-colors focus-visible:outline-2 focus-visible:outline-primary",
            wide ? "items-center gap-3 p-4" : "flex-col items-center gap-2 px-3 py-4 text-center",
            open ? "border-primary/50 bg-primary-light/30" : "border-line hover:border-primary/30 hover:bg-subtle/40"
          )}
        >
          <span
            className={cn("flex shrink-0 items-center justify-center rounded-lg bg-subtle text-primary-dark", wide ? "size-10" : "size-9")}
            aria-hidden
          >
            {icon}
          </span>
          <span className={cn("min-w-0", wide && "flex-1")}>
            <span id={titleId} className="block text-[14.5px] font-semibold text-navy">
              {title}
            </span>
            {summary ? (
              <span id={summaryId} className={cn("mt-1 block text-[12.5px] leading-snug text-ink-soft", wide ? "truncate" : "line-clamp-2")}>
                {summary}
              </span>
            ) : null}
          </span>
          {pills}
          {wide ? (
            <>
              <ChevronLeft className="size-5 shrink-0 text-muted ltr:hidden" aria-hidden />
              <ChevronRight className="size-5 shrink-0 text-muted rtl:hidden" aria-hidden />
            </>
          ) : null}
        </button>
      </h3>
      {open && host
        ? createPortal(
            <div ref={overlayRef} className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-8" data-print="hide">
              <div className="absolute inset-0 bg-navy/45 backdrop-blur-[2px] animate-fade-in" onClick={onToggle} aria-hidden />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl animate-scale-in"
              >
                <header className="flex items-start gap-3 border-b border-line bg-surface px-5 py-4 md:px-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark" aria-hidden>
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id={dialogTitleId} className="text-[17px] font-semibold text-navy">
                      {title}
                    </h2>
                    {summary ? <p className="mt-0.5 text-[13px] text-ink-soft">{summary}</p> : null}
                  </div>
                  {pills}
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={onToggle}
                    aria-label={T.nav.close}
                    title={T.nav.close}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </header>
                <div ref={bodyRef} id={contentId} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6">
                  {children}
                </div>
                {nav && (nav.prev || nav.next) ? (
                  <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 md:px-6">
                    {nav.prev ? (
                      <button
                        type="button"
                        onClick={nav.prev.go}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-[13.5px] font-semibold text-ink-soft transition-colors hover:border-primary/40 hover:text-primary-dark"
                      >
                        {/* Previous points back toward the reading start: right in Arabic. */}
                        <ChevronRight className="size-4 ltr:hidden" aria-hidden />
                        <ChevronLeft className="size-4 rtl:hidden" aria-hidden />
                        <span>
                          {T.common.prev}: {nav.prev.title}
                        </span>
                      </button>
                    ) : (
                      <span />
                    )}
                    {nav.next ? (
                      <button
                        type="button"
                        onClick={nav.next.go}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-[13.5px] font-semibold text-white transition-colors hover:bg-primary-dark"
                      >
                        <span>
                          {T.common.next}: {nav.next.title}
                        </span>
                        <ChevronLeft className="size-4 ltr:hidden" aria-hidden />
                        <ChevronRight className="size-4 rtl:hidden" aria-hidden />
                      </button>
                    ) : null}
                  </footer>
                ) : null}
              </div>
            </div>,
            host
          )
        : null}
    </section>
  );
}

/** Formal approvals recorded on the case (audit, Council, head, closure). */
export function DecisionsList({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const approvals = [...(rec.approvals ?? [])].reverse();
  if (!approvals.length) {
    return <EmptyState icon={<Stamp className="size-6" />} title={T.case.noApprovalsYet} className="border-dashed shadow-none" />;
  }
  return (
    <ol className="space-y-3">
      {approvals.map((approval) => (
        <li key={approval.id} className="rounded-xl border border-line bg-subtle/30 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[14px] font-bold text-navy">
              {APPROVAL_TYPE_LABELS[approval.approval_type] ?? approval.approval_type}
            </p>
            <span className="font-mono text-[11.5px] text-muted" dir="ltr">
              {formatDateTime(approval.created_at)}
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink-soft">
            {approval.approved_by_detail?.full_name_ar || approval.approved_by_detail?.username}
          </p>
          {approval.notes?.trim() ? (
            <p className="mt-2.5 whitespace-pre-wrap rounded-lg border border-line/70 bg-surface p-3 text-[13.5px] leading-relaxed text-ink">
              {approval.notes}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function reminderTiming(reminder: CaseReminder): string {
  if (reminder.offset_days < 0) return T.caseView.reminderBefore.replace("{days}", dayCount(-reminder.offset_days));
  if (reminder.offset_days === 0) return T.caseView.reminderOn;
  return T.caseView.reminderAfter.replace("{days}", dayCount(reminder.offset_days));
}

function Reminders({ reminders }: { reminders: CaseReminder[] }) {
  useI18n();
  if (!reminders.length) return null;
  return (
    <section className="mt-6 border-t border-line pt-5">
      <h3 className="mb-3 inline-flex items-center gap-2 font-heading text-[14px] font-bold text-navy">
        <BellRing className="size-4 text-muted" aria-hidden />
        {T.caseView.reminders}
      </h3>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {reminders.map((reminder) => (
          <li key={reminder.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]">
            <span className="min-w-0">
              <span className="font-semibold text-ink">
                {T.caseView.reminderTo.replace("{who}", reminder.recipient)}
              </span>
              <span className="text-muted">
                {" · "}
                {RECIPIENT_ROLE_LABELS[reminder.recipient_role] ?? reminder.recipient_role}
                {" · "}
                {reminderTiming(reminder)} ({formatDate(reminder.deadline)})
              </span>
            </span>
            <span className="font-mono text-[11.5px] text-muted" dir="ltr">
              {formatDateTime(reminder.sent_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const FILTERS: HistoryFilter[] = ["decisions", "files", "all"];

/** The append-only trail, filterable, plus the reminders sent on the case. */
export function CaseHistory({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const [filter, setFilter] = useState<HistoryFilter>("decisions");
  const entries = historyEntries(rec.trail ?? [], filter);
  return (
    <div>
      <div role="group" aria-label={T.caseView.history} className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-[12.5px] font-semibold transition-colors",
              filter === id
                ? "border-primary bg-primary text-white"
                : "border-line bg-surface text-ink-soft hover:border-primary/40"
            )}
          >
            {T.caseView.historyFilters[id]}
          </button>
        ))}
      </div>
      {entries.length ? (
        <AuditTrail entries={entries} />
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
          {T.caseView.historyEmpty}
        </p>
      )}
      <Reminders reminders={rec.reminders ?? []} />
    </div>
  );
}
