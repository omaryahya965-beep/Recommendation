"use client";

import { ArrowDown, ArrowUp, GitBranch, Link2, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  Button,
  Callout,
  Card,
  ErrorBanner,
  Field,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui/Base";
import { useEmployees } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import { composeStep, parseStep } from "@/lib/planStep";
import type { ActionPlan } from "@/lib/types";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

export interface PlanStepDraft {
  key: string;
  title: string;
  description: string;
  result: string;
  evidence: string;
  /** Index of the step that must finish first, mirroring `depends_on_index`. */
  dependsOnIndex: number | null;
}

export interface PlanDraft {
  responsible_employee: number | null;
  target_date: string;
  notes: string;
  steps: PlanStepDraft[];
}

export interface PlanPayload {
  responsible_employee: number;
  target_date: string;
  notes: string;
  steps: Array<{ title: string; order: number; comments: string; depends_on_index: number | null }>;
}

let stepCounter = 0;
const newStep = (): PlanStepDraft => ({
  key: `step-${(stepCounter += 1)}`,
  title: "",
  description: "",
  result: "",
  evidence: "",
  dependsOnIndex: null,
});

export function emptyPlanDraft(seed?: {
  responsible_employee?: number | null;
  target_date?: string;
  notes?: string;
  steps?: Array<{ title: string; comments?: string; description?: string; result?: string; evidence?: string }>;
}): PlanDraft {
  const steps = seed?.steps?.length
    ? seed.steps.map((step, index) => {
        const parsed = parseStep(step.comments);
        return {
          ...newStep(),
          title: step.title,
          description: step.description || parsed.description || parsed.unstructured,
          result: step.result || parsed.result,
          evidence: step.evidence || parsed.evidence,
          dependsOnIndex: index > 0 ? index - 1 : null,
        };
      })
    : [newStep()];
  return {
    responsible_employee: seed?.responsible_employee ?? null,
    target_date: seed?.target_date ?? "",
    notes: seed?.notes ?? "",
    steps,
  };
}

export function toPlanPayload(draft: PlanDraft): PlanPayload | null {
  if (!draft.responsible_employee || !draft.target_date) return null;
  const steps = draft.steps
    .map((step, index) => ({
      title: step.title.trim(),
      order: index,
      comments: composeStep({
        description: step.description,
        result: step.result,
        evidence: step.evidence,
      }),
      depends_on_index: step.dependsOnIndex,
    }))
    .filter((step) => step.title);
  if (!steps.length) return null;
  return {
    responsible_employee: draft.responsible_employee,
    target_date: draft.target_date,
    notes: draft.notes.trim(),
    steps,
  };
}

/**
 * Builds a corrective action plan. The backend models a single plan owner and
 * target date, with ordered steps that may depend on one earlier step — this
 * form exposes exactly those fields and nothing more.
 */
export function ActionPlanBuilder({
  draft,
  onChange,
  onSubmit,
  busy,
  error,
  submitLabel,
  reviewNotes,
  existingPlan,
  aiSlot,
}: {
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  onSubmit?: (payload: PlanPayload) => void;
  busy?: boolean;
  error?: string | null;
  submitLabel?: string;
  reviewNotes?: string;
  existingPlan?: ActionPlan | null;
  aiSlot?: React.ReactNode;
}) {
  useI18n();
  const { data: employees } = useEmployees();
  const [localError, setLocalError] = useState<string | null>(null);

  useUnsavedChanges(
    Boolean(onSubmit) &&
      (draft.responsible_employee !== null ||
        draft.target_date !== "" ||
        draft.notes.trim() !== "" ||
        draft.steps.some((step) => step.title.trim() || step.description.trim() || step.result.trim()))
  );

  const patch = (partial: Partial<PlanDraft>) => onChange({ ...draft, ...partial });

  const patchStep = (index: number, partial: Partial<PlanStepDraft>) =>
    patch({ steps: draft.steps.map((step, i) => (i === index ? { ...step, ...partial } : step)) });

  const addStep = () => patch({ steps: [...draft.steps, newStep()] });

  const removeStep = (index: number) => {
    const steps = draft.steps
      .filter((_, i) => i !== index)
      .map((step) => ({
        ...step,
        // Dependencies point at positions, so drop or shift them on removal.
        dependsOnIndex:
          step.dependsOnIndex === null
            ? null
            : step.dependsOnIndex === index
              ? null
              : step.dependsOnIndex > index
                ? step.dependsOnIndex - 1
                : step.dependsOnIndex,
      }));
    patch({ steps: steps.length ? steps : [newStep()] });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    // Reordering invalidates positional dependencies; clear them deliberately.
    patch({ steps: steps.map((step) => ({ ...step, dependsOnIndex: null })) });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.responsible_employee || !draft.target_date) {
      setLocalError(T.common.required);
      return;
    }
    if (!draft.steps.some((step) => step.title.trim())) {
      setLocalError(T.plan.minSteps);
      return;
    }
    if (draft.steps.some((step) => !step.title.trim())) {
      setLocalError(T.plan.titleRequired);
      return;
    }
    const payload = toPlanPayload(draft);
    if (!payload) {
      setLocalError(T.common.required);
      return;
    }
    setLocalError(null);
    onSubmit?.(payload);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {reviewNotes ? (
        <Callout tone="danger" title={T.plan.reviewNotes}>
          <p className="whitespace-pre-wrap leading-relaxed">{reviewNotes}</p>
          {existingPlan && existingPlan.revision_count > 0 ? (
            <p className="mt-1 text-xs font-bold">
              {T.plan.revisionCount}: <span dir="ltr">{existingPlan.revision_count}</span>
            </p>
          ) : null}
        </Callout>
      ) : null}

      {aiSlot}

      {/* Plan meta card */}
      <Card title={T.plan.title}>
        <p className="mb-5 text-sm font-medium leading-relaxed text-ink-soft">{T.plan.intro}</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={T.plan.owner}>
            <Select
              value={draft.responsible_employee ?? ""}
              onChange={(event) =>
                patch({ responsible_employee: event.target.value ? Number(event.target.value) : null })
              }
              required
            >
              <option value="">— {T.common.none} —</option>
              {(employees ?? []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name_ar || employee.username}
                  {employee.department_name ? ` — ${employee.department_name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={T.plan.targetDate}>
            <TextInput
              type="date"
              dir="ltr"
              value={draft.target_date}
              onChange={(event) => patch({ target_date: event.target.value })}
              required
            />
          </Field>
        </div>

        <div className="mt-5">
          <Field label={T.plan.notes}>
            <TextArea
              rows={4}
              value={draft.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              placeholder={T.plan.notesHint}
            />
          </Field>
        </div>
      </Card>

      {/* Steps card */}
      <Card
        title={T.plan.steps}
        actions={
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-bold text-primary-dark" dir="ltr">
            {draft.steps.length}
          </span>
        }
      >
        <p className="mb-5 text-sm font-medium leading-relaxed text-ink-soft">{T.plan.stepsHint}</p>

        <ol className="space-y-4">
          {draft.steps.map((step, index) => (
            <li
              key={step.key}
              className="relative rounded-xl border border-line bg-subtle/30 p-4 last:mb-0"
            >
              {/* Step header */}
              <div className="mb-3 flex items-start gap-3">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy/10 font-mono text-[13px] font-bold text-navy"
                  dir="ltr"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <TextInput
                    value={step.title}
                    onChange={(event) => patchStep(index, { title: event.target.value })}
                    placeholder={T.plan.stepTitle}
                    aria-label={`${T.plan.stepTitle} ${index + 1}`}
                  />
                </div>
                {/* Step controls */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={T.plan.moveUp}
                    className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === draft.steps.length - 1}
                    aria-label={T.plan.moveDown}
                    className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-colors hover:text-ink disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    aria-label={T.plan.removeStep}
                    className="flex size-7 items-center justify-center rounded-lg border border-danger/20 bg-surface text-danger-dark transition-colors hover:bg-danger/10"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Description */}
              <TextArea
                rows={2}
                value={step.description}
                onChange={(event) => patchStep(index, { description: event.target.value })}
                placeholder={T.plan.stepDescriptionHint}
                aria-label={`${T.plan.stepDescription} ${index + 1}`}
              />

              {/* Result + Evidence */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={T.plan.expectedResult}>
                  <TextArea
                    rows={2}
                    value={step.result}
                    onChange={(event) => patchStep(index, { result: event.target.value })}
                    placeholder={T.plan.expectedResultHint}
                  />
                </Field>
                <Field label={T.plan.requiredEvidence}>
                  <TextArea
                    rows={2}
                    value={step.evidence}
                    onChange={(event) => patchStep(index, { evidence: event.target.value })}
                    placeholder={T.plan.requiredEvidenceHint}
                  />
                </Field>
              </div>

              {/* Dependency selector */}
              {index > 0 ? (
                <label className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-ink-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <Link2 className="size-3.5" />
                    {T.plan.dependsOn}
                  </span>
                  <Select
                    className="w-auto min-w-[200px] py-1 text-xs"
                    value={step.dependsOnIndex ?? ""}
                    onChange={(event) =>
                      patchStep(index, {
                        dependsOnIndex: event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                  >
                    <option value="">{T.plan.noDependency}</option>
                    {draft.steps.slice(0, index).map((candidate, candidateIndex) => (
                      <option key={candidate.key} value={candidateIndex}>
                        {candidateIndex + 1}. {candidate.title.trim() || T.plan.stepTitle}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
            </li>
          ))}
        </ol>

        <Button type="button" variant="secondary" className="mt-4 gap-2 font-bold" onClick={addStep}>
          <Plus className="size-4" />
          {T.plan.addStep}
        </Button>
      </Card>

      {draft.steps.some((step) => step.dependsOnIndex !== null) ? (
        <Callout tone="neutral" icon={<GitBranch className="size-4" />}>
          {T.plan.dependencyHint}
        </Callout>
      ) : null}

      <ErrorBanner message={localError ?? error ?? null} />

      {onSubmit ? (
        <Button type="submit" disabled={busy} className="gap-2 font-bold shadow-sm">
          <Send className="size-4" />
          {submitLabel ?? T.plan.submit}
        </Button>
      ) : null}
    </form>
  );
}
