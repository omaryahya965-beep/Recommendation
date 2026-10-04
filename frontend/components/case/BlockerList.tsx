"use client";

import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/cn";
import { describeBlocker } from "@/lib/errors";
import { T, useI18n } from "@/lib/i18n";
import type { ActionBlocker } from "@/lib/types";

/**
 * Why an action the server offered is not available yet ("two required steps
 * are not done", "no evidence uploaded"). The reasons come from the same
 * guards the API enforces.
 */
export function BlockerList({
  blockers,
  className,
  tone = "light",
}: {
  blockers?: ActionBlocker[] | null;
  className?: string;
  tone?: "light" | "dark";
}) {
  useI18n();
  if (!blockers?.length) return null;
  return (
    <div
      role="note"
      className={cn(
        "mb-4 rounded-lg border p-3 text-[13px] leading-relaxed",
        tone === "dark"
          ? "border-white/15 bg-white/10 text-white"
          : "border-warning/30 bg-warning-light/40 text-warning-dark",
        className
      )}
    >
      <p className="mb-1.5 inline-flex items-center gap-1.5 font-bold">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {T.workflow.blockedBecause}
      </p>
      <ul className="space-y-1 ps-6">
        {blockers.map((blocker) => (
          <li key={blocker.code} className="list-disc">
            {describeBlocker(blocker)}
            {Array.isArray(blocker.params?.steps) && (blocker.params.steps as unknown[]).length ? (
              <ul className="mt-1 space-y-0.5 ps-4">
                {(blocker.params.steps as string[]).map((step) => (
                  <li key={step} className="list-[circle] text-[12.5px] opacity-90">
                    {step}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
