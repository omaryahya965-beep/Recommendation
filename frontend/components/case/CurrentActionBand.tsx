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
        "overflow-hidden rounded-(--radius-card) border",
        closed
          ? "border-success/25 bg-success-light/60"
          : yours
            ? "border-inverse bg-inverse text-on-inverse"
            : "border-primary/30 bg-primary-light/50"
      )}
    >
      <div className="flex flex-wrap items-stretch gap-0">
        <div className="min-w-0 flex-1 px-4 py-3.5 md:px-5">
          <p
            className={cn(
              "text-[11px] font-semibold",
              closed ? "text-success-dark" : yours ? "text-white/70" : "text-primary-dark"
            )}
          >
            {closed ? T.workflow.noAction : yours ? T.workflow.actNow : T.workflow.currentAction}
          </p>

          {!closed ? (
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                yours ? "bg-white/15 text-white" : "bg-primary/15 text-primary-dark"
              )}
            >
              {T.workflow.youAreHere}
              <span aria-hidden>·</span>
              {stage.label}
            </p>
          ) : null}

          <h2
            className={cn(
              "mt-2 font-heading text-lg font-bold leading-snug md:text-xl",
              closed ? "text-success-dark" : yours ? "text-white" : "text-navy"
            )}
          >
            {next.action}
          </h2>

          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className={cn("text-[11px] font-medium", yours && !closed ? "text-white/60" : "text-muted")}>
                {T.common.responsible}
              </dt>
              <dd className={cn("mt-1 text-sm font-medium", yours && !closed ? "text-white" : "text-ink")}>
                {owner}
                {owner !== next.role ? (
                  <span className={cn("mt-0.5 block text-xs font-normal", yours && !closed ? "text-white/70" : "text-ink-soft")}>
                    {next.role}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className={cn("text-[11px] font-medium", yours && !closed ? "text-white/60" : "text-muted")}>
                {T.common.targetDate}
              </dt>
              <dd className={cn("mt-1 text-sm font-medium", yours && !closed ? "text-white" : "text-ink")} dir="ltr">
                {formatDate(rec.target_date)}
              </dd>
            </div>
            <div>
              <dt className={cn("text-[11px] font-medium", yours && !closed ? "text-white/60" : "text-muted")}>
                {T.case.currentStage}
              </dt>
              <dd className={cn("mt-1 text-sm font-medium", yours && !closed ? "text-white" : "text-ink")}>
                {stage.label}
              </dd>
            </div>
          </dl>
        </div>

        {yours && onAct && !closed ? (
          <div className="flex min-w-[13rem] flex-col justify-center gap-2 border-t border-white/10 px-4 py-3.5 sm:border-s sm:border-t-0 md:px-5">
            {acting ? (
              <p className="text-sm leading-relaxed text-white/80">{T.workflow.onDecisionTab}</p>
            ) : (
              <Button
                className="w-full bg-elevated text-navy hover:bg-subtle"
                onClick={onAct}
              >
                {T.workflow.goToAction}
              </Button>
            )}
            <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-warning-light">
              <AlertTriangle className="size-3.5" />
              {T.workflow.waitingOnYou}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
