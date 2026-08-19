import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import type { ActionStep } from "@/lib/types";

export function ActionStepCard({
  step,
  index,
  editable,
  onToggle,
  onProgress,
}: {
  step: ActionStep;
  index: number;
  editable?: boolean;
  onToggle?: (done: boolean) => void;
  onProgress?: (percent: number) => void;
}) {
  useI18n();
  const statusLabel = step.is_done ? T.plan.done : step.progress_percent > 0 ? T.plan.active : T.plan.pending;
  return (
    <article className="rounded-(--radius-card) border border-line bg-surface p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-inverse font-mono text-[11px] font-medium text-on-inverse">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {editable ? (
              <label className="flex min-w-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={step.is_done}
                  onChange={(e) => onToggle?.(e.target.checked)}
                  className="size-4 accent-primary"
                  aria-label={step.title}
                />
                <span className={cn(step.is_done && "text-ink-soft line-through")}>{step.title}</span>
              </label>
            ) : (
              <p className={cn("text-sm font-medium", step.is_done && "text-ink-soft line-through")}>{step.title}</p>
            )}
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-medium",
                step.is_done ? "bg-success-light text-success-dark" : step.progress_percent > 0 ? "bg-info-light text-info-dark" : "bg-subtle text-muted"
              )}
            >
              {statusLabel}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, step.progress_percent)}%` }} />
            </div>
            {editable ? (
              <input
                type="number"
                min={0}
                max={100}
                defaultValue={step.progress_percent}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value !== step.progress_percent) onProgress?.(value);
                }}
                className="w-16 rounded-(--radius-field) border border-line px-1 py-0.5 text-center font-mono text-xs"
                dir="ltr"
                aria-label={`${T.plan.progress} — ${step.title}`}
              />
            ) : (
              <span className="font-mono text-xs text-ink-soft" dir="ltr">
                {step.progress_percent}%
              </span>
            )}
          </div>
          {step.comments ? <p className="mt-1 text-xs text-ink-soft">{step.comments}</p> : null}
        </div>
      </div>
    </article>
  );
}
