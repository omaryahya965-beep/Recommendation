"use client";

import { Check, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Base";
import { cn } from "@/lib/cn";
import type { WorkflowAction } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { ActionStep } from "@/lib/types";
import type { StepState } from "@/lib/case";

const COMMIT_KEYS = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown",
]);

/**
 * Step progress. Controlled, and committed when the user lets go — pointer
 * release, a keyboard change or leaving the control — so keyboard users can
 * record progress too. The last sent value is remembered so one gesture never
 * posts twice.
 */
export function ProgressSlider({
  initial,
  disabled,
  label,
  onCommit,
  className,
}: {
  initial: number;
  disabled: boolean;
  label: string;
  onCommit: (value: number) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const lastSent = useRef(initial);
  const commit = (next: number) => {
    if (next === lastSent.current) return;
    lastSent.current = next;
    onCommit(next);
  };
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <input
        type="range"
        name="progress"
        min={0}
        max={100}
        step={10}
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(Number(event.currentTarget.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => {
          if (COMMIT_KEYS.has(event.key)) commit(Number(event.currentTarget.value));
        }}
        onBlur={(event) => commit(Number(event.currentTarget.value))}
        className="h-2 w-full min-w-24 cursor-pointer appearance-none rounded-lg bg-line accent-primary disabled:cursor-not-allowed"
        aria-label={label}
        aria-valuetext={`${value}%`}
      />
      <span className="w-10 shrink-0 font-mono text-[12px] font-bold text-navy" dir="ltr">
        {value}%
      </span>
    </span>
  );
}

/** Progress slider plus the done toggle for one step. */
export function StepControls({
  step,
  state,
  action,
  className,
}: {
  step: ActionStep;
  state: StepState;
  action: WorkflowAction;
  className?: string;
}) {
  useI18n();
  // The workflow action runs one request at a time (double-submit guard), so
  // progress changes made while one is saving are merged and sent when it
  // settles: the latest value always reaches the server.
  const sending = useRef(false);
  const queued = useRef<Record<string, unknown> | null>(null);
  const post = (body: Record<string, unknown>) => {
    if (sending.current) {
      queued.current = { ...queued.current, ...body };
      return;
    }
    sending.current = true;
    action.mutation.mutate(
      { path: `steps/${step.id}/progress/`, body },
      {
        onSettled: () => {
          sending.current = false;
          const next = queued.current;
          queued.current = null;
          if (next) post(next);
        },
      }
    );
  };

  if (state === "blocked") return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <ProgressSlider
        // Remounts with the server value whenever it changes.
        key={`${step.id}:${step.progress_percent}`}
        initial={step.progress_percent}
        disabled={step.is_done || action.mutation.isPending}
        label={`${T.plan.progress}: ${step.title}`}
        onCommit={(value) => post({ progress_percent: value })}
        className="min-w-0 flex-1"
      />
      <Button
        type="button"
        variant={step.is_done ? "ghost" : "secondary"}
        className="min-h-10 px-3.5 py-1.5 text-xs font-bold"
        disabled={action.mutation.isPending}
        onClick={() => post({ is_done: !step.is_done, progress_percent: step.is_done ? 0 : 100 })}
      >
        {step.is_done ? <RotateCcw className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
        {step.is_done ? T.plan.markUndone : T.plan.markDone}
      </Button>
    </div>
  );
}
