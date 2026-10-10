"use client";

import { Check, ChevronLeft, ChevronRight, Lock, Minus, Paperclip, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";

import { EvidenceFileActions, evidenceFileName } from "@/components/evidence/EvidenceFileActions";
import { EvidenceUploadForm } from "@/components/evidence/EvidenceUploadForm";
import { Sheet } from "@/components/mobile/Sheet";
import { Button, ProgressBar } from "@/components/ui/Base";
import { evidenceByStep, sortSteps, stepState, type StepState } from "@/lib/case";
import { cn } from "@/lib/cn";
import type { WorkflowAction } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import { parseStep } from "@/lib/planStep";
import type { ActionStep, RecommendationDetail } from "@/lib/types";
import { isOffered } from "@/lib/workflow";

const STATE_LABEL: Record<StepState, () => string> = {
  done: () => T.plan.done,
  active: () => T.plan.active,
  pending: () => T.plan.pending,
  blocked: () => T.plan.blocked,
};

/**
 * Touch-sized progress control: −10% / +10% buttons around the value. A
 * slider is hard to set precisely with a thumb; two buttons are not.
 */
function ProgressStepper({
  step,
  action,
  disabled,
}: {
  step: ActionStep;
  action: WorkflowAction;
  disabled: boolean;
}) {
  useI18n();
  const value = step.is_done ? 100 : step.progress_percent;
  const post = (next: number) =>
    action.mutation.mutate({ path: `steps/${step.id}/progress/`, body: { progress_percent: next } });
  return (
    <div className="flex items-center gap-3" role="group" aria-label={`${T.mobile.stepProgress}: ${step.title}`}>
      <Button
        type="button"
        variant="ghost"
        className="size-12 shrink-0 rounded-full p-0 ring-1 ring-line"
        aria-label={T.mobile.decrease}
        disabled={disabled || value <= 0}
        onClick={() => post(Math.max(0, value - 10))}
      >
        <Minus className="size-5" aria-hidden />
      </Button>
      <div className="min-w-0 flex-1 text-center">
        <p className="font-mono text-[22px] font-bold text-navy" dir="ltr" aria-live="polite">
          {value}%
        </p>
        <ProgressBar value={value} showValue={false} label={T.mobile.stepProgress} className="mt-1" />
      </div>
      <Button
        type="button"
        variant="ghost"
        className="size-12 shrink-0 rounded-full p-0 ring-1 ring-line"
        aria-label={T.mobile.increase}
        disabled={disabled || value >= 100}
        onClick={() => post(Math.min(100, value + 10))}
      >
        <Plus className="size-5" aria-hidden />
      </Button>
    </div>
  );
}

function StepSheet({
  rec,
  step,
  index,
  steps,
  action,
  onClose,
}: {
  rec: RecommendationDetail;
  step: ActionStep;
  index: number;
  steps: ActionStep[];
  action: WorkflowAction;
  onClose: () => void;
}) {
  useI18n();
  const state = stepState(step, steps);
  const parsed = parseStep(step.comments);
  const detail = parsed.description || parsed.unstructured;
  const files = evidenceByStep(rec).get(step.id) ?? [];
  const canProgress = isOffered(rec, "update_progress");
  const canUpload = isOffered(rec, "upload_evidence");
  const parent = step.depends_on ? steps.find((candidate) => candidate.id === step.depends_on) : null;
  const busy = action.mutation.isPending;

  return (
    <Sheet
      open
      onClose={onClose}
      size="full"
      title={`${T.plan.stageN.replace("{n}", String(index + 1))} · ${step.title}`}
      description={STATE_LABEL[state]()}
      testId="step-sheet"
    >
      <div className="space-y-5">
        {state === "blocked" && parent ? (
          <p className="flex items-center gap-2 rounded-xl bg-subtle px-3 py-2.5 text-[13px] text-ink-soft">
            <Lock className="size-4 shrink-0" aria-hidden />
            {T.plan.blockedBy}: {parent.title}
          </p>
        ) : null}

        {detail || parsed.result || parsed.evidence ? (
          <div className="space-y-2.5 text-[14px] leading-relaxed text-ink">
            {detail ? <p className="whitespace-pre-wrap">{detail}</p> : null}
            {parsed.result ? (
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-success-dark">{T.plan.expectedResult}: </span>
                {parsed.result}
              </p>
            ) : null}
            {parsed.evidence ? (
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-primary-dark">{T.plan.requiredEvidence}: </span>
                {parsed.evidence}
              </p>
            ) : null}
          </div>
        ) : null}

        {canProgress && state !== "blocked" ? (
          <section className="space-y-3 rounded-2xl border border-line p-4">
            <ProgressStepper step={step} action={action} disabled={busy || step.is_done} />
            <Button
              type="button"
              variant={step.is_done ? "ghost" : "secondary"}
              className="min-h-12 w-full font-bold"
              disabled={busy}
              onClick={() =>
                action.mutation.mutate({
                  path: `steps/${step.id}/progress/`,
                  body: { is_done: !step.is_done, progress_percent: step.is_done ? 0 : 100 },
                })
              }
            >
              {step.is_done ? <RotateCcw className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {step.is_done ? T.plan.markUndone : T.plan.markDone}
            </Button>
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 text-[14px] font-bold text-navy">{T.mobile.stepEvidence}</h3>
          {files.length ? (
            <ul className="space-y-2">
              {files.map((file) => (
                <li key={file.id} className="rounded-xl border border-line p-3">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{evidenceFileName(file)}</p>
                  {file.notes?.trim() ? <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-soft">{file.notes}</p> : null}
                  <div className="mt-2">
                    <EvidenceFileActions evidence={file} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">{T.case.noEvidenceYet}</p>
          )}
        </section>

        {canUpload ? (
          <section className="border-t border-line pt-4">
            <h3 className="mb-3 text-[14px] font-bold text-navy">{T.mobile.attachToStep}</h3>
            <EvidenceUploadForm rec={rec} action={action} defaultStep={step.id} allowCamera />
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}

/** The plan's steps as cards; tapping one opens its sheet. */
export function MobileSteps({ rec, action }: { rec: RecommendationDetail; action: WorkflowAction }) {
  const { locale } = useI18n();
  const [openId, setOpenId] = useState<number | null>(null);
  const steps = sortSteps(rec.action_plan?.steps ?? []);
  const evidence = evidenceByStep(rec);
  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;
  const openIndex = steps.findIndex((step) => step.id === openId);

  if (!steps.length) return <p className="text-[13px] text-muted">{T.caseView.desk.noSteps}</p>;

  return (
    <>
      <ol className="space-y-2.5" data-testid="mobile-steps">
        {steps.map((step, index) => {
          const state = stepState(step, steps);
          const files = evidence.get(step.id)?.length ?? 0;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => setOpenId(step.id)}
                aria-label={T.mobile.openStep.replace("{n}", String(index + 1))}
                className="flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 text-start active:bg-subtle/60"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold",
                    state === "done"
                      ? "bg-success text-white"
                      : state === "active"
                        ? "bg-primary text-white"
                        : "bg-subtle text-ink-soft"
                  )}
                  aria-hidden
                >
                  {state === "done" ? <Check className="size-4" /> : state === "blocked" ? <Lock className="size-4" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[14.5px] font-semibold leading-snug", state === "done" ? "text-ink-soft" : "text-ink")}>
                    {step.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                    <span>{STATE_LABEL[state]()}</span>
                    {step.is_required_for_closure ? (
                      <span className="font-semibold text-warning-dark">{T.plan.requiredForClosure}</span>
                    ) : null}
                    {files ? (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3" aria-hidden />
                        {files}
                      </span>
                    ) : null}
                  </span>
                  {!step.is_done ? (
                    <ProgressBar value={step.progress_percent} showValue={false} label={`${T.mobile.stepProgress} — ${step.title}`} className="mt-2" />
                  ) : null}
                </span>
                <DirForward className="mt-2 size-5 shrink-0 text-muted" aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
      {openId !== null && openIndex >= 0 ? (
        <StepSheet
          rec={rec}
          step={steps[openIndex]}
          index={openIndex}
          steps={steps}
          action={action}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
