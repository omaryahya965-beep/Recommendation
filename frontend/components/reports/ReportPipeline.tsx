import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import { REPORT_STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import type { AuditReport } from "@/lib/types";

export type ReportStatus = AuditReport["status"];

/**
 * The report lifecycle exactly as the backend defines it on AuditReport.status.
 * Each stage names the party that must act, which is what makes the rail useful.
 */
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

/** Maps a report status onto the shared status colour families. */
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
    <ol className={cn("flex flex-wrap items-stretch gap-1", className)}>
      {REPORT_STAGES.map((stage, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={stage.id} className={cn("min-w-0 flex-1", compact ? "min-w-[5.5rem]" : "min-w-[8.5rem]")}>
            <div
              aria-current={active ? "step" : undefined}
              className={cn(
                "h-full rounded-(--radius-field) border transition-colors",
                compact ? "px-2 py-1.5" : "px-3 py-2",
                active
                  ? "border-primary bg-primary text-white"
                  : done
                    ? "border-primary/30 bg-primary-light text-primary-dark"
                    : "border-line bg-subtle/40 text-muted"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full font-mono",
                    compact ? "size-3.5 text-[9px]" : "size-4 text-[10px]",
                    active ? "bg-white/25" : done ? "bg-primary text-white" : "bg-line/70 text-ink-soft"
                  )}
                >
                  {done ? <Check className={compact ? "size-2" : "size-2.5"} strokeWidth={3.5} /> : index + 1}
                </span>
                <span className={cn("truncate font-semibold", compact ? "text-[11px]" : "text-[12.5px]")}>
                  {REPORT_STATUS_LABELS[stage.id]}
                </span>
              </div>
              {compact ? null : (
                <p
                  className={cn(
                    "mt-0.5 truncate text-[11px]",
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
