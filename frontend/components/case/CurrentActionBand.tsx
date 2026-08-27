"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/Base";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail, Role } from "@/lib/types";
import { isWaitingOn, stageForStatus, STATUS_NEXT_ACTION } from "@/lib/workflow";

/**
 * The strongest surface on the case file: who must act, what they must do,
 * and when. Official decisions still outrank this once the user is on the
 * decision tab — until then this band is the way in.
 */
export function CurrentActionBand({
  rec,
  role,
  onAct,
  acting,
}: {
  rec: RecommendationDetail;
  role: Role;
  onAct?: () => void;
  /** True when the workspace is already on the tab that holds the action. */
  acting?: boolean;
}) {
  useI18n();
  const next = STATUS_NEXT_ACTION[rec.status];
  const stage = stageForStatus(rec.status);
  const yours = isWaitingOn(rec.status, role);
  const closed = rec.status === "closed";
  const owner =
    rec.action_plan?.responsible_employee_detail?.full_name_ar ?? rec.responsible_employee ?? next.role;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border shadow-sm",
        closed
          ? "border-success/20 bg-success-light/30"
          : yours
            ? "border-inverse bg-inverse text-on-inverse ring-1 ring-inset ring-white/10"
            : "border-primary/20 bg-primary-light/40"
      )}
    >
      <div className="flex flex-wrap items-stretch gap-0">
        <div className="min-w-0 flex-1 px-5 py-5 md:px-6">
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-widest",
              closed ? "text-success-dark" : yours ? "text-white/60" : "text-primary-dark"
            )}
          >
            {closed ? T.workflow.noAction : yours ? T.workflow.actNow : T.workflow.currentAction}
          </p>

          {!closed ? (
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                yours ? "bg-white/15 text-white" : "bg-primary/20 text-primary-dark"
              )}
            >
              {T.workflow.youAreHere}
              <span aria-hidden className="opacity-55">•</span>
              {stage.label}
            </p>
          ) : null}

          <h2
            className={cn(
              "mt-3 font-heading text-lg font-bold leading-snug md:text-xl",
              closed ? "text-success-dark" : yours ? "text-white" : "text-navy"
            )}
          >
            {next.action}
          </h2>

          <dl className="mt-4 grid gap-4 sm:grid-cols-3 bg-white/5 rounded-lg p-3.5 border border-white/5">
            <div>
              <dt className={cn("text-[11px] font-bold uppercase tracking-wider", yours && !closed ? "text-white/60" : "text-muted")}>
                {T.common.responsible}
              </dt>
              <dd className={cn("mt-1 text-sm font-bold", yours && !closed ? "text-white" : "text-ink")}>
                {owner}
                {owner !== next.role ? (
                  <span className={cn("mt-0.5 block text-xs font-medium", yours && !closed ? "text-white/75" : "text-ink-soft")}>
                    {next.role}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className={cn("text-[11px] font-bold uppercase tracking-wider", yours && !closed ? "text-white/60" : "text-muted")}>
                {T.common.targetDate}
              </dt>
              <dd className={cn("mt-1 text-sm font-bold font-mono", yours && !closed ? "text-white" : "text-ink")} dir="ltr">
                {formatDate(rec.target_date)}
              </dd>
            </div>
            <div>
              <dt className={cn("text-[11px] font-bold uppercase tracking-wider", yours && !closed ? "text-white/60" : "text-muted")}>
                {T.case.currentStage}
              </dt>
              <dd className={cn("mt-1 text-sm font-bold", yours && !closed ? "text-white" : "text-ink")}>
                {stage.label}
              </dd>
            </div>
          </dl>
        </div>

        {yours && onAct && !closed ? (
          <div className="flex min-w-[14rem] flex-col justify-center gap-2 border-t border-white/10 px-5 py-5 sm:border-s sm:border-t-0 md:px-6 bg-white/5">
            {acting ? (
              <p className="text-[13px] font-medium leading-relaxed text-white/80">{T.workflow.onDecisionTab}</p>
            ) : (
              <Button
                className="w-full bg-white text-navy hover:bg-white/95 font-bold shadow-md"
                onClick={onAct}
              >
                {T.workflow.goToAction}
              </Button>
            )}
            <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-warning-light mt-1">
              <AlertTriangle className="size-4 shrink-0" />
              {T.workflow.waitingOnYou}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
