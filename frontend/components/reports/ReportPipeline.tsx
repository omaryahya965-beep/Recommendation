import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import { REPORT_STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import type { AuditReport } from "@/lib/types";

export type ReportStatus = AuditReport["status"];

export const REPORT_STAGES: Array<{ id: ReportStatus; actorKey: keyof typeof T.workflow.reportActors }> = [
  { id: "draft", actorKey: "draft" },
  { id: "pending_response", actorKey: "pending_response" },
  { id: "under_review", actorKey: "under_review" },
  { id: "pending_council", actorKey: "pending_council" },
  { id: "ratified", actorKey: "ratified" },
];

export function reportStageIndex(status: ReportStatus) {
  const index = REPORT_STAGES.findIndex((stage) => stage.id === status);
  return index === -1 ? 0 : index;
}

export const REPORT_STATUS_FAMILY: Record<ReportStatus, string> = {
  draft: "draft",
  pending_response: "pending_response",
  under_review: "audit_review",
  pending_council: "pending_council",
  ratified: "closed",
};

export function ReportPipeline({
  status,
  className,
  compact = false,
}: {
  status: ReportStatus;
  className?: string;
  compact?: boolean;
}) {
  useI18n();
  const current = reportStageIndex(status);

  return (
    <ol className={cn("flex flex-wrap items-stretch gap-2", className)}>
      {REPORT_STAGES.map((stage, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={stage.id} className={cn("min-w-0 flex-1", compact ? "min-w-[6rem]" : "min-w-[9.5rem]")}>
            <div
              aria-current={active ? "step" : undefined}
              className={cn(
                "h-full rounded-xl border transition-all duration-200 shadow-sm",
                compact ? "px-3 py-2" : "px-4 py-3",
                active
                  ? "border-primary bg-primary text-white ring-2 ring-primary/20"
                  : done
                    ? "border-primary/20 bg-primary-light/50 text-primary-dark"
                    : "border-line bg-subtle/50 text-muted"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full font-mono font-bold",
                    compact ? "size-4 text-[9.5px]" : "size-5 text-[11px]",
                    active ? "bg-white/20 text-white" : done ? "bg-primary text-white" : "bg-line/80 text-ink-soft"
                  )}
                >
                  {done ? <Check className={compact ? "size-2.5" : "size-3"} strokeWidth={3.5} /> : index + 1}
                </span>
                <span className={cn("truncate font-bold tracking-wide", compact ? "text-[11.5px]" : "text-[13px]")}>
                  {REPORT_STATUS_LABELS[stage.id]}
                </span>
              </div>
              {compact ? null : (
                <p
                  className={cn(
                    "mt-1.5 truncate text-[11px] font-medium leading-none",
                    active ? "text-white/80" : done ? "text-primary-dark/70" : "text-muted"
                  )}
                >
                  {T.workflow.reportActors[stage.actorKey]}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
