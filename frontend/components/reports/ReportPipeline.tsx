import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatShortDate } from "@/lib/format";
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

/**
 * The report lifecycle as a compact stepper for the report page: dots and
 * connectors with who acts at each stage on wider screens; on phones one
 * line ("stage 2 of 5") over a segmented bar.
 */
export function ReportStepper({
  status,
  dates = {},
}: {
  status: ReportStatus;
  /** A date to show under a stage (created, ratified). */
  dates?: Partial<Record<ReportStatus, string | null>>;
}) {
  useI18n();
  const current = reportStageIndex(status);
  const finished = status === "ratified";

  return (
    <section aria-label={T.reports.lifecycle}>
      <div className="px-4 py-3.5 md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[14px] font-bold text-navy">{REPORT_STATUS_LABELS[status]}</p>
          <p className="shrink-0 font-mono text-[11.5px] font-semibold text-muted">
            {T.caseView.stageProgress.replace("{n}", String(current + 1)).replace("{total}", String(REPORT_STAGES.length))}
          </p>
        </div>
        <ol className="mt-2.5 flex gap-1" aria-hidden>
          {REPORT_STAGES.map((stage, index) => (
            <li
              key={stage.id}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                index < current || finished ? "bg-primary" : index === current ? "bg-navy" : "bg-line"
              )}
            />
          ))}
        </ol>
      </div>

      <ol className="hidden items-start px-2 pb-3.5 pt-4 md:flex">
        {REPORT_STAGES.map((stage, index) => {
          const done = index < current || finished;
          const active = index === current && !finished;
          const date = dates[stage.id];
          return (
            <li
              key={stage.id}
              className="flex min-w-0 flex-1 flex-col items-center text-center"
              aria-current={index === current ? "step" : undefined}
            >
              <div className="flex w-full items-center">
                <span aria-hidden className={cn("h-0.5 flex-1", index === 0 ? "opacity-0" : done || active ? "bg-primary" : "bg-line")} />
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full border font-mono font-bold",
                    active ? "size-7 border-navy bg-navy text-[11.5px] text-surface ring-4 ring-primary/20" : "size-5.5 text-[10px]",
                    done && "border-primary bg-primary text-white",
                    !done && !active && "border-line bg-surface text-muted"
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : index + 1}
                </span>
                <span
                  aria-hidden
                  className={cn("h-0.5 flex-1", index === REPORT_STAGES.length - 1 ? "opacity-0" : done ? "bg-primary" : "bg-line")}
                />
              </div>
              <p
                className={cn(
                  "mt-1.5 px-1 leading-snug",
                  active ? "text-[12.5px] font-bold text-navy" : done ? "text-[11.5px] font-semibold text-ink-soft" : "text-[11.5px] text-muted"
                )}
              >
                {REPORT_STATUS_LABELS[stage.id]}
              </p>
              {date ? (
                <span className="block font-mono text-[11px] text-muted">{formatShortDate(date)}</span>
              ) : stage.id !== "ratified" ? (
                <span className="block text-[11px] text-muted">{T.workflow.reportActors[stage.actorKey]}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
