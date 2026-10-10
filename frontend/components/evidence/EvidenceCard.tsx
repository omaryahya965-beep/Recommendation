import { FileText } from "lucide-react";
import type { ReactNode } from "react";

import { AIEvidenceAnalysis } from "@/components/ai/AIEvidenceAnalysis";
import { ExpandableSection } from "@/components/mobile/ExpandableSection";
import { EvidenceFileActions, evidenceFileName } from "@/components/evidence/EvidenceFileActions";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import { fileExt, formatDate } from "@/lib/format";
import type { Evidence } from "@/lib/types";

export function EvidenceCard({
  evidence,
  showAnalysis = true,
  stepTitle,
  status,
  actions,
}: {
  evidence: Evidence;
  showAnalysis?: boolean;
  /** The plan step the file supports, when the register knows it. */
  stepTitle?: string;
  /** Where the file stands in verification (label + text colour). */
  status?: { label: string; className: string };
  /** Extra controls beside View / Download (e.g. delete). */
  actions?: ReactNode;
}) {
  useI18n();
  const fileName = evidenceFileName(evidence);
  const name = evidence.notes || fileName;
  const ext = fileExt(fileName);
  return (
    <article
      data-testid="evidence-item"
      className="rounded-2xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-4 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-dark shadow-sm">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-[14px] font-bold text-navy">{name}</p>
          <p className="truncate text-[12px] text-muted" dir="ltr" title={fileName}>
            {fileName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium text-ink-soft">
            <span className="font-mono font-bold text-muted" dir="ltr">{ext}</span>
            <span className="text-muted/50">·</span>
            <span>{T.evidence.uploaded}: {formatDate(evidence.uploaded_at)}</span>
            <span className="text-muted/50">·</span>
            <span>{evidence.uploaded_by_detail.full_name_ar || evidence.uploaded_by_detail.username}</span>
          </div>
          {stepTitle !== undefined || status ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px]">
              {stepTitle !== undefined ? (
                <span className="text-ink-soft">
                  {T.evidenceRegister.linkedTo}: <span className="font-semibold text-ink">{stepTitle}</span>
                </span>
              ) : null}
              {stepTitle !== undefined && status ? <span className="text-muted/50">·</span> : null}
              {status ? <span className={cn("font-semibold", status.className)}>{status.label}</span> : null}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-start gap-2">
            <EvidenceFileActions evidence={evidence} />
            {actions}
          </div>
        </div>
      </div>

      {showAnalysis ? (
        // Opened on demand: reading the stored analysis counts against the
        // per-user AI rate limit, so a case with many files must not spend
        // it on every page view.
        <ExpandableSection summary={T.ai.evidenceReview} className="border-t border-line/60 px-4 pb-2">
          <p className="text-[11px] font-bold text-ai-dark">{T.evidence.advisoryNote}</p>
          <AIEvidenceAnalysis evidenceId={evidence.id} />
        </ExpandableSection>
      ) : null}
    </article>
  );
}
