import { FileText } from "lucide-react";

import { AIEvidenceAnalysis } from "@/components/ai/AIEvidenceAnalysis";
import { EvidenceFileActions, evidenceFileName } from "@/components/evidence/EvidenceFileActions";
import { T, useI18n } from "@/lib/i18n";
import { fileExt, formatDate } from "@/lib/format";
import type { Evidence } from "@/lib/types";

export function EvidenceCard({ evidence, showAnalysis = true }: { evidence: Evidence; showAnalysis?: boolean }) {
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
          <p className="truncate text-[14px] font-bold text-navy">{name}</p>
          <p className="truncate text-[12px] text-muted" dir="ltr">{fileName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium text-ink-soft">
            <span className="font-mono font-bold text-muted" dir="ltr">{ext}</span>
            <span className="text-muted/50">·</span>
            <span>{T.evidence.uploaded}: {formatDate(evidence.uploaded_at)}</span>
            <span className="text-muted/50">·</span>
            <span>{evidence.uploaded_by_detail.full_name_ar || evidence.uploaded_by_detail.username}</span>
          </div>

          <EvidenceFileActions evidence={evidence} className="mt-3" />
        </div>
      </div>

      {showAnalysis ? (
        <div className="border-t border-line/60 px-4 pb-4">
          <p className="pt-3 text-[11px] font-bold uppercase tracking-wider text-ai-dark/70">{T.evidence.advisoryNote}</p>
          <AIEvidenceAnalysis evidenceId={evidence.id} />
        </div>
      ) : null}
    </article>
  );
}
