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

const STATE_DOT: Record<PresentState, string> = {
  done: "bg-success ring-success/20",
  active: "bg-primary ring-primary/20",
  pending: "bg-line ring-line",
  blocked: "bg-muted/30 ring-line",
  delayed: "bg-warning ring-warning/20",
};

const STATE_LINE: Record<PresentState, string> = {
  done: "bg-success/30",
  active: "bg-primary/20",
  pending: "bg-line",
  blocked: "bg-line",
  delayed: "bg-warning/30",
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

  const statusClass =
    plan.status === "approved"
      ? "border-success/25 bg-success/8 text-success-dark"
      : plan.status === "revision_required"
        ? "border-danger/25 bg-danger/8 text-danger-dark"
        : "border-info/25 bg-info/8 text-info-dark";

  return (
    <div className="space-y-6">
      {/* ─── Plan header ─────────────────────────────────────────── */}
      <header className="rounded-2xl border border-line bg-surface p-5 shadow-sm space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-heading text-[18px] font-bold text-navy">{T.plan.implementationTitle}</h2>
          <span className={cn("rounded-full border px-3 py-1 text-[12px] font-bold", statusClass)}>
            {PLAN_STATUS_LABELS[plan.status]}
          </span>
        </div>

        {/* Meta grid */}
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

        {/* Progress bar */}
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-[12px] font-bold uppercase tracking-wider text-muted">{T.plan.title}</p>
            <span className="font-mono text-[15px] font-bold text-navy" dir="ltr">
              {progress}%
            </span>
          </div>
          <ProgressBar value={progress} label={T.plan.progress} tone={progress === 100 ? "success" : "primary"} showValue={false} />
        </div>

        {/* Steps mini-map */}
        <ol className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {steps.map((step, index) => {
            const state = presentState(step, steps, rec.overdue);
            return (
              <li key={step.id} className={cn("inline-flex items-center gap-1.5 text-[12px] font-bold", STATE_TONE[state])}>
                <span className={cn("size-2 rounded-full", state === "done" ? "bg-success-dark" : state === "active" || state === "delayed" ? "bg-current" : "bg-muted/40")} aria-hidden />
                {T.plan.stageN.replace("{n}", String(index + 1))}
                <span className="text-[11px] font-medium text-muted">— {stateLabel(state)}</span>
              </li>
            );
          })}
        </ol>

        {/* Objective */}
        {plan.notes?.trim() ? (
          <div className="border-t border-line pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">{T.plan.objective}</p>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink font-medium">{plan.notes}</p>
          </div>
        ) : null}

        {/* Review notes callout */}
        {plan.review_notes?.trim() ? (
          <Callout tone={plan.status === "approved" ? "success" : "danger"} title={T.plan.reviewNotes}>
            <p className="whitespace-pre-wrap leading-relaxed">{plan.review_notes}</p>
          </Callout>
        ) : null}
      </header>

      {/* ─── Step roadmap ────────────────────────────────────────── */}
      <section>
        <h3 className="mb-4 font-heading text-[16px] font-bold text-navy">{T.plan.roadmap}</h3>

        <ol className="relative space-y-0">
          {steps.map((step, index) => {
            const logical = stepState(step, steps);
            const state = presentState(step, steps, rec.overdue);
            const parent = step.depends_on ? steps.find((candidate) => candidate.id === step.depends_on) : null;
            const files = evidence.get(step.id) ?? [];
            const isLast = index === steps.length - 1;
            const parsed = parseStep(step.comments);
            const detail = parsed.description || parsed.unstructured;

            return (
              <li key={step.id} className="relative flex gap-5">
                {/* Number + connector */}
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full ring-4 font-mono text-[13px] font-bold",
                      state === "done"
                        ? "bg-success text-white ring-success/15"
                        : state === "delayed"
                          ? "bg-warning text-white ring-warning/15"
                          : state === "active"
                            ? "bg-primary text-white ring-primary/15"
                            : "bg-subtle text-muted ring-line"
                    )}
                    dir="ltr"
                  >
                    {state === "done" ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                  </span>
                  {!isLast ? (
                    <span
                      aria-hidden
                      className={cn("mt-1 w-0.5 flex-1", STATE_LINE[state])}
                    />
                  ) : null}
                </div>

                {/* Step content */}
                <div className={cn("min-w-0 flex-1 pb-7", isLast && "pb-2")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <h4 className="font-heading text-[15px] font-bold text-navy">{step.title}</h4>
                    <span className={cn("text-[12px] font-bold", STATE_TONE[state])}>{stateLabel(state)}</span>
                  </div>

                  {detail ? (
                    <div className="mb-3 rounded-xl border border-line bg-subtle/40 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1">{T.plan.stepDescription}</p>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink font-medium">{detail}</p>
                    </div>
                  ) : null}

                  {parsed.result ? (
                    <div className="mb-3 rounded-xl border border-success/15 bg-success/5 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-success-dark mb-1">{T.plan.expectedResult}</p>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink font-medium">{parsed.result}</p>
                    </div>
                  ) : null}

                  {parsed.evidence ? (
                    <div className="mb-3 rounded-xl border border-primary/15 bg-primary/5 p-3.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-primary-dark mb-1">{T.plan.requiredEvidence}</p>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink font-medium">{parsed.evidence}</p>
                    </div>
                  ) : null}

                  {!step.is_done && step.progress_percent > 0 ? (
                    <div className="mb-3 max-w-sm">
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">{T.plan.progress}</p>
                      <ProgressBar value={step.progress_percent} label={step.title} />
                    </div>
                  ) : null}

                  {/* Meta chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    {parent ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft border border-line">
                        {logical === "blocked" ? <Lock className="size-3" /> : <Link2 className="size-3" />}
                        {logical === "blocked" ? T.plan.blockedBy : T.plan.dependsOn}: {parent.title}
                      </span>
                    ) : null}
                    {files.length ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft border border-line">
                        <Paperclip className="size-3" />
                        {files.length} {T.evidence.title}
                      </span>
                    ) : null}
                    {step.is_required_for_closure ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-[11.5px] font-bold text-warning-dark border border-warning/20">
                        {T.plan.requiredForClosure}
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
