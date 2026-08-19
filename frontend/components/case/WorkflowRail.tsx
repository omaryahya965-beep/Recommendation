"use client";

import { Check, RotateCcw } from "lucide-react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationStatus, Role } from "@/lib/types";
import { isWaitingOn, type StageState, visualSnapshot } from "@/lib/workflow";

const STATE_DOT: Record<StageState, string> = {
  completed: "border-primary/40 bg-primary text-white",
  current: "border-inverse bg-inverse text-on-inverse ring-4 ring-primary/20",
  returned: "border-danger bg-danger-light text-danger-dark ring-4 ring-danger/15",
  next: "border-line bg-subtle text-muted",
  skipped: "border-line bg-subtle text-muted",
};

/**
 * Lifecycle explanation over the real backend statuses. Current beat is large;
 * completed beats stay quiet; future beats stay muted. Required action lives
 * in CurrentActionBand, not here.
 */
export function WorkflowRail({
  status,
  role,
  className,
}: {
  status: RecommendationStatus;
  role?: Role;
  className?: string;
}) {
  useI18n();
  const beats = visualSnapshot(status);
  const yours = role ? isWaitingOn(status, role) : false;

  return (
    <section className={cn("overflow-hidden border-b border-line pb-4", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-navy">{T.workflow.title}</h2>
        {yours ? (
          <p className="text-[12px] font-semibold text-warning-dark">{T.workflow.actNow}</p>
        ) : null}
      </div>

      <div className="scrollbar-thin overflow-x-auto">
        <ol className="flex min-w-[920px] items-start gap-0">
          {beats.map((beat, index) => {
            const isLast = index === beats.length - 1;
            const done = beat.state === "completed";
            const here = beat.state === "current" || beat.state === "returned";
            return (
              <li key={beat.id} className="flex min-w-0 flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <span
                    aria-hidden
                    className={cn(
                      "h-px flex-1",
                      index === 0
                        ? "opacity-0"
                        : done || here
                          ? "bg-primary"
                          : "bg-line"
                    )}
                  />
                  <span
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full border font-mono font-semibold",
                      here ? "size-9 text-[13px]" : "size-5 text-[10px]",
                      STATE_DOT[beat.state]
                    )}
                  >
                    {done ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : beat.state === "returned" ? (
                      <RotateCcw className="size-3.5" strokeWidth={2.5} />
                    ) : here ? (
                      index + 1
                    ) : (
                      <span className="size-1.5 rounded-full bg-current opacity-40" />
                    )}
                  </span>
                  <span
                    aria-hidden
                    className={cn("h-px flex-1", isLast ? "opacity-0" : done ? "bg-primary" : "bg-line")}
                  />
                </div>
                <p
                  className={cn(
                    "mt-1.5 px-0.5 text-center leading-snug",
                    here
                      ? "text-[12px] font-bold text-navy"
                      : done
                        ? "text-[11px] text-ink-soft"
                        : "text-[11px] text-muted"
                  )}
                >
                  {beat.label}
                </p>
                {here ? (
                  <span
                    className={cn(
                      "mt-1 rounded-full px-1.5 py-px text-[10px] font-semibold",
                      beat.state === "returned"
                        ? "bg-danger-light text-danger-dark"
                        : "bg-inverse text-on-inverse"
                    )}
                  >
                    {T.workflow.youAreHere}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
