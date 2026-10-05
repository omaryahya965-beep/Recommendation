"use client";

import { Check, RotateCcw } from "lucide-react";
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
      aria-label={T.mobile.stages}
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none"
      data-testid="stage-chips"
    >
      {stages.map((stage, index) => {
        const current = stage.state === "current" || stage.state === "returned";
        const done = stage.state === "completed";
        return (
          <li
            key={stage.id}
            ref={current ? currentRef : undefined}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex shrink-0 snap-center items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px]",
              current
                ? stage.state === "returned"
                  ? "border-danger bg-danger text-white"
                  : "border-navy bg-navy text-white"
                : done
                  ? "border-primary/25 bg-primary-light/60 text-primary-dark"
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
              ) : (
                index + 1
              )}
            </span>
            <span className={cn("whitespace-nowrap", current ? "font-bold" : "font-medium")}>
              {T.workflow.stages[stage.id]}
            </span>
            {done && stage.enteredAt ? (
              <span className="whitespace-nowrap font-mono text-[10.5px] opacity-70">{formatShortDate(stage.enteredAt)}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
