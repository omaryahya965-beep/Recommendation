"use client";

import { Check, RotateCcw } from "lucide-react";

import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationStatus, Role } from "@/lib/types";
import { isWaitingOn, type StageState, visualSnapshot } from "@/lib/workflow";

const STATE_DOT: Record<StageState, string> = {
  completed: "border-primary/20 bg-primary text-white shadow-sm",
  current: "border-navy bg-navy text-white ring-4 ring-primary/20 shadow-md",
  returned: "border-danger bg-danger text-white ring-4 ring-danger/15 shadow-md",
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
    <section className={cn("overflow-hidden border-b border-line pb-5", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-bold text-navy">{T.workflow.title}</h2>
        {yours ? (
          <p className="text-[12px] font-bold text-warning-dark bg-warning-light/50 px-2.5 py-0.5 rounded-full border border-warning/20 ring-1 ring-warning/10">{T.workflow.actNow}</p>
        ) : null}
      </div>

      <ol className="space-y-3 md:hidden">
        {beats.map((beat, index) => {
          const done = beat.state === "completed";
          const here = beat.state === "current" || beat.state === "returned";
          return (
            <li key={beat.id} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border font-mono font-bold",
                  STATE_DOT[beat.state],
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3.5} />
                ) : beat.state === "returned" ? (
                  <RotateCcw className="size-4" strokeWidth={3} />
                ) : (
                  index + 1
                )}
              </span>
              <div className="min-w-0 pt-1">
                <p className={cn("text-[15px] leading-snug", here ? "font-bold text-navy" : done ? "font-semibold text-ink-soft" : "font-medium text-muted")}>
                  {beat.label}
                </p>
                {here ? (
                  <span
                    className={cn(
                      "mt-1 inline-flex rounded-full px-2 py-0.5 text-[12px] font-bold",
                      beat.state === "returned" ? "bg-danger-light text-danger-dark" : "bg-inverse text-on-inverse",
                    )}
                  >
                    {T.workflow.youAreHere}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="hidden scrollbar-thin overflow-x-auto pb-2 md:block">
        <ol className="flex min-w-[920px] items-start gap-0 px-2">
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
                      "h-1 flex-1 rounded-full",
                      index === 0
                        ? "opacity-0"
                        : done || here
                          ? "bg-primary"
                          : "bg-line/60"
                    )}
                  />
                  <span
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full border font-mono font-bold transition-all duration-200",
                      here ? "size-10 text-[14px]" : "size-6 text-[11px]",
                      STATE_DOT[beat.state]
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" strokeWidth={3.5} />
                    ) : beat.state === "returned" ? (
                      <RotateCcw className="size-4" strokeWidth={3} />
                    ) : here ? (
                      index + 1
                    ) : (
                      <span className="size-2 rounded-full bg-current opacity-40" />
                    )}
                  </span>
                  <span
                    aria-hidden
                    className={cn("h-1 flex-1 rounded-full", isLast ? "opacity-0" : done ? "bg-primary" : "bg-line/60")}
                  />
                </div>
                <p
                  className={cn(
                    "mt-2.5 px-1.5 text-center leading-snug",
                    here
                      ? "text-[12.5px] font-bold text-navy"
                      : done
                        ? "text-[11.5px] font-semibold text-ink-soft"
                        : "text-[11.5px] font-medium text-muted"
                  )}
                >
                  {beat.label}
                </p>
                {here ? (
                  <span
                    className={cn(
                      "mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
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
