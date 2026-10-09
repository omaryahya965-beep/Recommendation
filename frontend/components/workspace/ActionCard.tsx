"use client";

import {
  AlarmClock,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Flag,
  Hourglass,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { dayCount, formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail, Role } from "@/lib/types";
import { closedTitle, STATUS_NEXT_ACTION } from "@/lib/workflow";

type Tone = "mine" | "waiting" | "closed";

/** "10 days overdue" / "3 days left" / "Due today" for the binding deadline. */
export function DeadlineChip({ rec, inverse = false }: { rec: RecommendationDetail; inverse?: boolean }) {
  useI18n();
  const workflow = rec.workflow;
  if (!workflow || rec.status === "closed") return null;
  if (workflow.is_overdue) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold",
          inverse ? "bg-danger text-surface" : "bg-danger-light text-danger-dark ring-1 ring-danger/20"
        )}
      >
        <AlarmClock className="size-3.5" aria-hidden />
        {T.workflow.overdueBy.replace("{days}", dayCount(workflow.days_overdue, "accusative"))}
      </span>
    );
  }
  if (workflow.response_overdue) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold",
          inverse ? "bg-warning text-white" : "bg-warning-light text-warning-dark ring-1 ring-warning/25"
        )}
      >
        <AlarmClock className="size-3.5" aria-hidden />
        {T.workflow.responseLate}
      </span>
    );
  }
  if (workflow.due_in_days == null) return null;
  const soon = workflow.due_in_days <= 7;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold",
        inverse
          ? "bg-white/15 text-white"
          : soon
            ? "bg-warning-light/70 text-warning-dark ring-1 ring-warning/20"
            : "bg-subtle text-ink-soft ring-1 ring-line"
      )}
    >
      <CalendarClock className="size-3.5" aria-hidden />
      {workflow.due_in_days === 0
        ? T.workflow.dueToday
        : T.workflow.dueIn.replace("{days}", dayCount(workflow.due_in_days))}
    </span>
  );
}

function reportActionHref(role: Role, report: number): string {
  return role === "council" ? "/council/pending-approvals" : `/audit/reports/${report}`;
}

function Fact({
  label,
  icon: Icon,
  children,
  tone,
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
  tone: Tone;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "mine" ? "text-white/55" : "text-muted")} aria-hidden />
      <div className="min-w-0">
        <dt className={cn("text-[11.5px] font-semibold", tone === "mine" ? "text-white/65" : "text-muted")}>{label}</dt>
        <dd className={cn("mt-0.5 text-[13.5px] font-bold", tone === "mine" ? "text-white" : "text-ink")}>{children}</dd>
      </div>
    </div>
  );
}

const TONE_ICON: Record<Tone, LucideIcon> = { mine: Zap, waiting: Hourglass, closed: CheckCircle2 };

/**
 * The first thing on the case: whose turn it is, what must happen, by when,
 * and — when it is this user's turn — the form to do it (`children`).
 */
export function ActionCard({
  rec,
  role,
  children,
}: {
  rec: RecommendationDetail;
  role: Role;
  children?: ReactNode;
}) {
  useI18n();
  const workflow = rec.workflow;
  const closed = rec.status === "closed";
  const primary = workflow?.primary_action ?? null;
  const mine = !closed && Boolean(workflow?.my_turn || primary);
  const tone: Tone = closed ? "closed" : mine ? "mine" : "waiting";
  const next = STATUS_NEXT_ACTION[rec.status];
  const title = closed ? closedTitle(rec.resolution) : mine && primary ? T.caseView.actions[primary] : next.action;

  const waitingText =
    workflow && !closed && workflow.waiting_on !== "none"
      ? (workflow.days_waiting > 0 ? T.workflow.waitingSince : T.workflow.waitingToday)
          .replace("{who}", T.workflow.waitingOn[workflow.waiting_on])
          .replace("{days}", dayCount(workflow.days_waiting, "genitive"))
      : null;
  const responsible = workflow?.next_actor?.user?.name ?? next.role;
  const deadline = workflow?.deadline ?? null;
  const original = workflow?.original_target_date ?? null;
  const reportAction = workflow?.report_action ?? null;

  const ToneIcon = TONE_ICON[tone];

  return (
    <section
      id="case-action"
      aria-labelledby="case-action-title"
      data-tone={tone}
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-2xl border shadow-section",
        tone === "mine" ? "border-inverse" : tone === "closed" ? "border-success/25" : "border-primary/20"
      )}
    >
      <div
        className={cn(
          "px-5 py-4 md:px-6",
          tone === "mine"
            ? "bg-inverse text-on-inverse"
            : tone === "closed"
              ? "bg-success-light/40"
              : "bg-primary-light/30"
        )}
      >
        <div className="flex flex-wrap items-start gap-x-3.5 gap-y-2.5">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              tone === "mine"
                ? "bg-white/12 text-white ring-1 ring-inset ring-white/15"
                : tone === "closed"
                  ? "bg-success/12 text-success-dark"
                  : "bg-surface text-primary-dark ring-1 ring-inset ring-primary/15"
            )}
            aria-hidden
          >
            <ToneIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[11.5px] font-bold",
                tone === "mine" ? "text-white/70" : tone === "closed" ? "text-success-dark" : "text-primary-dark"
              )}
            >
              {closed ? T.workflow.noAction : mine ? T.workflow.actNow : T.workflow.currentAction}
            </p>
            <h2
              id="case-action-title"
              className={cn(
                "mt-0.5 font-heading text-[1.05rem] font-bold leading-snug md:text-[1.15rem]",
                tone === "mine" ? "text-white" : tone === "closed" ? "text-success-dark" : "text-navy"
              )}
            >
              {title}
            </h2>
            {waitingText ? (
              <p
                className={cn(
                  "mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium",
                  tone === "mine" ? "text-white/75" : "text-ink-soft"
                )}
              >
                <Hourglass className="size-3.5" aria-hidden />
                {waitingText}
              </p>
            ) : null}
          </div>
          <DeadlineChip rec={rec} inverse={tone === "mine"} />
        </div>

        {!closed ? (
          <dl
            className={cn(
              "mt-3.5 grid gap-x-6 gap-y-3 border-t pt-3.5 sm:grid-cols-3",
              tone === "mine" ? "border-white/12" : "border-primary/12"
            )}
          >
            <Fact label={T.common.responsible} icon={UserRound} tone={tone}>
              {responsible}
            </Fact>
            <Fact
              label={deadline ? T.workflow.deadlineSource[deadline.source] : T.workflow.bindingDeadline}
              icon={CalendarClock}
              tone={tone}
            >
              {deadline ? (
                <span className="font-mono" dir="ltr">
                  {formatDate(deadline.date)}
                </span>
              ) : (
                <span className={cn("text-[13px] font-medium", tone === "mine" ? "text-white/70" : "text-muted")}>
                  {T.workflow.noDeadline}
                </span>
              )}
            </Fact>
            {original && deadline && original !== deadline.date ? (
              <Fact label={T.workflow.originalTarget} icon={Flag} tone={tone}>
                <span className="font-mono" dir="ltr">
                  {formatDate(original)}
                </span>
              </Fact>
            ) : (
              <Fact label={T.case.currentStage} icon={Flag} tone={tone}>
                {T.workflow.stages[workflow?.stage ?? "preparation"]}
              </Fact>
            )}
          </dl>
        ) : null}

        {reportAction ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <Link
              href={reportActionHref(role, reportAction.report)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-[14px] font-bold shadow-sm",
                tone === "mine" ? "bg-white text-[#183b4e] hover:bg-white/90" : "bg-primary text-white hover:bg-primary-dark"
              )}
            >
              {T.caseView.reportActions[reportAction.id]}
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
            <span className={cn("text-[12.5px]", tone === "mine" ? "text-white/70" : "text-ink-soft")}>
              {T.caseView.reportActionHint}
            </span>
          </div>
        ) : null}
      </div>

      {children ? (
        <div id="case-action-panel" data-print="hide" role="region" aria-label={T.caseView.actionPanelLabel} className="scroll-mt-24 border-t border-line bg-surface px-4 py-5 md:px-6 md:py-6">
          {children}
        </div>
      ) : null}
    </section>
  );
}
