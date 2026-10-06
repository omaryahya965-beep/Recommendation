"use client";

import { Check, Minus, RotateCcw } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatShortDate, timesCount } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";
import { stageTimeline, type TimelineStage, type TimelineState } from "@/lib/viewmodels/caseView";

const DOT: Record<TimelineState, string> = {
  completed: "border-primary bg-primary text-white",
  current: "border-navy bg-navy text-surface ring-4 ring-primary/20",
  returned: "border-danger bg-danger text-surface ring-4 ring-danger/15",
  next: "border-line bg-surface text-muted",
  skipped: "border-dashed border-primary/40 bg-surface text-primary/60",
};

/** The line between two stages: dashed where the case passed a stage over. */
function connector(stages: TimelineStage[], from: number, to: number, active: boolean) {
  if (from < 0 || to >= stages.length) return "h-0.5 opacity-0";
  if (stages[from].state === "skipped" || stages[to].state === "skipped") {
    return "h-0 border-t-2 border-dashed border-primary/35";
  }
  return cn("h-0.5", active ? "bg-primary" : "bg-line");
}

function StageDate({ stage }: { stage: TimelineStage }) {
  useI18n();
  if (stage.state === "skipped") {
    return <span className="block text-[11px] text-muted">{T.caseView.stageSkipped}</span>;
  }
  if (stage.state === "next" || !stage.enteredAt) return null;
  return (
    <span className="block font-mono text-[11px] text-muted" title={stage.enteredBy ?? undefined}>
      {formatShortDate(stage.enteredAt)}
    </span>
  );
}

function Returns({ count }: { count: number }) {
  useI18n();
  if (!count) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-danger-light px-1.5 py-0.5 text-[10.5px] font-bold text-danger-dark">
      <RotateCcw className="size-3" aria-hidden />
      {T.caseView.returnedTimes.replace("{times}", timesCount(count))}
    </span>
  );
}

/**
 * The ten business stages with the date the case entered each one and how
 * often it was sent back. Phones get a one-line summary with a segmented bar.
 */
export function CaseTimeline({ rec, className }: { rec: RecommendationDetail; className?: string }) {
  useI18n();
  const stages = stageTimeline(rec);
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.state === "current" || stage.state === "returned")
  );
  const closed = rec.status === "closed";
  const here = closed ? stages[stages.length - 1] : stages[currentIndex];

  return (
    <section aria-label={T.caseView.timelineTitle} className={cn("rounded-2xl border border-line bg-surface", className)}>
      {/* Phones and narrow tablets */}
      <div className="px-4 py-3.5 md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[14px] font-bold text-navy">
            {T.workflow.stages[here.id]}
          </p>
          <p className="shrink-0 font-mono text-[11.5px] font-semibold text-muted">
            {T.caseView.stageProgress
              .replace("{n}", String((closed ? stages.length - 1 : currentIndex) + 1))
              .replace("{total}", String(stages.length))}
          </p>
        </div>
        <ol className="mt-2.5 flex gap-1" aria-hidden>
          {stages.map((stage) => (
            <li
              key={stage.id}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                stage.state === "completed"
                  ? "bg-primary"
                  : stage.state === "current"
                    ? "bg-navy"
                    : stage.state === "returned"
                      ? "bg-danger"
                      : stage.state === "skipped"
                        ? "bg-primary/25"
                        : "bg-line"
              )}
            />
          ))}
        </ol>
        <Returns count={here.returns} />
      </div>

      {/* Tablets and desktop */}
      <div className="hidden scrollbar-thin overflow-x-auto px-3 pb-4 pt-5 md:block">
        {/* 600px fits the narrowest tablet column (768px less the rail); labels wrap. */}
        <ol className="flex min-w-[600px] items-start">
          {stages.map((stage, index) => {
            const current = stage.state === "current" || stage.state === "returned";
            const done = stage.state === "completed";
            return (
              <li
                key={stage.id}
                className="flex min-w-0 flex-1 flex-col items-center text-center"
                aria-current={current ? "step" : undefined}
              >
                <div className="flex w-full items-center">
                  <span aria-hidden className={cn("flex-1", connector(stages, index - 1, index, done || current))} />
                  <span
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full border font-mono font-bold",
                      current ? "size-8 text-[12px]" : "size-6 text-[10.5px]",
                      DOT[stage.state]
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" strokeWidth={3} aria-hidden />
                    ) : stage.state === "returned" ? (
                      <RotateCcw className="size-3.5" strokeWidth={3} aria-hidden />
                    ) : stage.state === "skipped" ? (
                      <Minus className="size-3.5" strokeWidth={3} aria-hidden />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span aria-hidden className={cn("flex-1", connector(stages, index, index + 1, done))} />
                </div>
                <p
                  className={cn(
                    "mt-2 px-1 leading-snug",
                    current
                      ? "text-[12.5px] font-bold text-navy"
                      : done
                        ? "text-[11.5px] font-semibold text-ink-soft"
                        : "text-[11.5px] text-muted"
                  )}
                >
                  {T.workflow.stages[stage.id]}
                </p>
                <StageDate stage={stage} />
                <Returns count={stage.returns} />
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
