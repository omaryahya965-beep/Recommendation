"use client";

import { Check, Link2, Lock, Paperclip } from "lucide-react";

import { Callout, DataField, ProgressBar } from "@/components/ui/Base";
import { cn } from "@/lib/cn";
import { evidenceByStep, planProgress, sortSteps, stepState, type StepState } from "@/lib/case";
import { formatDate } from "@/lib/format";
import { PLAN_STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import { parseStep } from "@/lib/planStep";
import type { ActionStep, RecommendationDetail } from "@/lib/types";

type PresentState = StepState | "delayed";

function presentState(step: ActionStep, all: ActionStep[], overdue: boolean): PresentState {
  const state = stepState(step, all);
  if (overdue && (state === "active" || state === "pending")) return "delayed";
  return state;
}

function stateLabel(state: PresentState): string {
  const map: Record<PresentState, string> = {
    done: T.plan.done,
    active: T.plan.active,
    pending: T.plan.pending,
    blocked: T.plan.blocked,
    delayed: T.plan.delayed,
  };
  return map[state];
}

const STATE_TONE: Record<PresentState, string> = {
  done: "text-success-dark",
  active: "text-primary-dark",
  pending: "text-muted",
  blocked: "text-muted",
  delayed: "text-warning-dark",
};

/**
 * Implementation roadmap. Each node is a real ActionStep; delayed is a
 * presentation of `overdue` plus unfinished progress — not a backend status.
 */
export function ActionPlanTimeline({
  rec,
  renderStepActions,
}: {
  rec: RecommendationDetail;
  renderStepActions?: (step: ActionStep, state: StepState) => React.ReactNode;
}) {
  useI18n();
  const plan = rec.action_plan;
  if (!plan) return null;

  const steps = sortSteps(plan.steps);
  const evidence = evidenceByStep(rec);
  const progress = planProgress(plan);

  return (
    <div className="space-y-4">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-navy">{T.plan.implementationTitle}</h2>
          <span
            className={cn(
              "border px-2.5 py-1 text-[12px] font-medium",
              plan.status === "approved"
                ? "border-success/25 bg-success-light text-success-dark"
                : plan.status === "revision_required"
                  ? "border-danger/25 bg-danger-light text-danger-dark"
                  : "border-info/25 bg-info-light text-info-dark"
            )}
          >
            {PLAN_STATUS_LABELS[plan.status]}
          </span>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DataField label={T.plan.owner}>
            {plan.responsible_employee_detail?.full_name_ar || plan.responsible_employee_detail?.username}
          </DataField>
          <DataField label={T.plan.targetDate}>
            <span dir="ltr">{formatDate(plan.target_date)}</span>
          </DataField>
          <DataField label={T.common.status}>{PLAN_STATUS_LABELS[plan.status]}</DataField>
          <DataField label={T.plan.revisionCount}>
            <span dir="ltr">{plan.revision_count}</span>
          </DataField>
        </dl>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-muted">{T.plan.title}</p>
            <span className="font-mono text-sm font-semibold text-navy" dir="ltr">
              {progress}%
            </span>
          </div>
          <ProgressBar value={progress} label={T.plan.progress} tone={progress === 100 ? "success" : "primary"} showValue={false} />
        </div>

        <ol className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
          {steps.map((step, index) => {
            const state = presentState(step, steps, rec.overdue);
            return (
              <li key={step.id} className={cn("inline-flex items-center gap-1.5", STATE_TONE[state])}>
                <span className="font-mono" aria-hidden>
                  {state === "done" ? "✓" : state === "active" || state === "delayed" ? "●" : "○"}
                </span>
                {T.plan.stageN.replace("{n}", String(index + 1))}
                <span className="text-muted">— {stateLabel(state)}</span>
              </li>
            );
          })}
        </ol>

        {plan.notes?.trim() ? (
          <div className="border-t border-line pt-4">
            <p className="text-xs font-medium text-muted">{T.plan.objective}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-[1.9] text-ink">{plan.notes}</p>
          </div>
        ) : null}

        {plan.review_notes?.trim() ? (
          <Callout tone={plan.status === "approved" ? "success" : "danger"} title={T.plan.reviewNotes}>
            <p className="whitespace-pre-wrap leading-relaxed">{plan.review_notes}</p>
          </Callout>
        ) : null}
      </header>

      <section>
        <h3 className="mb-1 font-heading text-base font-semibold text-navy">{T.plan.roadmap}</h3>
        <p className="mb-3 text-[12px] text-muted">
          {T.plan.done} ✓ · {T.plan.active} ● · {T.plan.pending} ○ · {T.plan.delayed}
        </p>

        <ol className="relative">
          {steps.map((step, index) => {
            const logical = stepState(step, steps);
            const state = presentState(step, steps, rec.overdue);
            const parent = step.depends_on ? steps.find((candidate) => candidate.id === step.depends_on) : null;
            const files = evidence.get(step.id) ?? [];
            const isLast = index === steps.length - 1;
            const parsed = parseStep(step.comments);
            const detail = parsed.description || parsed.unstructured;
            const number = String(index + 1).padStart(2, "0");

            return (
              <li key={step.id} className="relative flex gap-4">
                <div className="flex w-12 shrink-0 flex-col items-center">
                  <span
                    className={cn(
                      "font-heading text-xl font-bold tabular-nums leading-none",
                      state === "done"
                        ? "text-success-dark"
                        : state === "delayed"
                          ? "text-warning-dark"
                          : state === "active"
                            ? "text-navy"
                            : "text-muted"
                    )}
                    dir="ltr"
                  >
                    {number}
                  </span>
                  {!isLast ? (
                    <span
                      aria-hidden
                      className={cn(
                        "mt-3 w-px flex-1",
                        state === "done" ? "bg-success/40" : "bg-line"
                      )}
                    />
                  ) : null}
                </div>

                <div className={cn("min-w-0 flex-1 pb-5", !isLast && "mb-1 border-b border-line")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-heading text-[15px] font-semibold text-ink">{step.title}</h4>
                    <span className={cn("text-[12px] font-medium", STATE_TONE[state])}>{stateLabel(state)}</span>
                  </div>

                  {detail ? (
                    <p className="mt-3">
                      <span className="block text-[11px] font-medium text-muted">{T.plan.stepDescription}</span>
                      <span className="mt-0.5 block whitespace-pre-wrap text-[13px] leading-[1.9] text-ink">
                        {detail}
                      </span>
                    </p>
                  ) : null}

                  {parsed.result ? (
                    <p className="mt-3">
                      <span className="block text-[11px] font-medium text-muted">{T.plan.expectedResult}</span>
                      <span className="mt-0.5 block whitespace-pre-wrap text-[13px] leading-[1.9] text-ink">
                        {parsed.result}
                      </span>
                    </p>
                  ) : null}

                  {parsed.evidence ? (
                    <p className="mt-3">
                      <span className="block text-[11px] font-medium text-muted">{T.plan.requiredEvidence}</span>
                      <span className="mt-0.5 block whitespace-pre-wrap text-[13px] leading-[1.9] text-ink">
                        {parsed.evidence}
                      </span>
                    </p>
                  ) : null}

                  {!step.is_done && step.progress_percent > 0 ? (
                    <div className="mt-3 max-w-xs">
                      <p className="mb-1 text-[11px] font-medium text-muted">{T.plan.progress}</p>
                      <ProgressBar value={step.progress_percent} label={step.title} />
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
                    {parent ? (
                      <span className="inline-flex items-center gap-1">
                        {logical === "blocked" ? <Lock className="size-3.5" /> : <Link2 className="size-3.5" />}
                        {logical === "blocked" ? T.plan.blockedBy : T.plan.dependsOn}: {parent.title}
                      </span>
                    ) : null}
                    {files.length ? (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3.5" />
                        {files.length} {T.evidence.title}
                      </span>
                    ) : null}
                    {step.is_required_for_closure ? <span>{T.plan.requiredForClosure}</span> : null}
                    {state === "done" ? (
                      <span className="inline-flex items-center gap-1 text-success-dark">
                        <Check className="size-3.5" strokeWidth={3} />
                        {T.plan.done}
                      </span>
                    ) : null}
                  </div>

                  {renderStepActions ? <div className="mt-3">{renderStepActions(step, logical)}</div> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
