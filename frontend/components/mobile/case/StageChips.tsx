"use client";

import { Check, Minus, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";
import { stageTimeline } from "@/lib/viewmodels/caseView";

/**
 * The ten stages as a swipeable row of chips; the current one is scrolled
 * into view and marked for assistive tech.
 */
export function StageChips({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const stages = stageTimeline(rec);
  const currentRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [rec.status]);

  return (
    <ol
      // Scrolls sideways, so it takes keyboard focus (arrow keys scroll it).
      tabIndex={0}
      aria-label={T.mobile.stages}
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none"
      data-testid="stage-chips"
    >
      {stages.map((stage, index) => {
        const current = stage.state === "current" || stage.state === "returned";
        const done = stage.state === "completed";
        const skipped = stage.state === "skipped";
        return (
          <li
            key={stage.id}
            ref={current ? currentRef : undefined}
            aria-current={current ? "step" : undefined}
            className={cn(
              // `relative` keeps the sr-only label inside the scrolling row; an
              // absolutely positioned child would otherwise widen the page.
              "relative flex shrink-0 snap-center items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px]",
              current
                ? stage.state === "returned"
                  ? "border-danger bg-danger text-surface"
                  : "border-navy bg-navy text-surface"
                : done
                  ? "border-primary/25 bg-primary-light/60 text-primary-dark"
                  : skipped
                    ? "border-dashed border-line bg-surface text-muted"
                    : "border-line bg-surface text-muted"
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full font-mono text-[10.5px] font-bold",
                current ? "bg-white/20" : done ? "bg-primary text-white" : "bg-subtle"
              )}
              aria-hidden
            >
              {done ? (
                <Check className="size-3" strokeWidth={3} />
              ) : stage.state === "returned" ? (
                <RotateCcw className="size-3" strokeWidth={3} />
              ) : skipped ? (
                <Minus className="size-3" strokeWidth={3} />
              ) : (
                index + 1
              )}
            </span>
            <span className={cn("whitespace-nowrap", current ? "font-bold" : "font-medium")}>
              {T.workflow.stages[stage.id]}
            </span>
            {skipped ? <span className="sr-only">{T.caseView.stageSkipped}</span> : null}
            {done && stage.enteredAt ? (
              <span className="whitespace-nowrap font-mono text-[10.5px]">{formatShortDate(stage.enteredAt)}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
