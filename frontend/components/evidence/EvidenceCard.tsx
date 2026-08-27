import { Download, ExternalLink, FileText } from "lucide-react";

import { AIEvidenceAnalysis } from "@/components/ai/AIEvidenceAnalysis";
import { T, useI18n } from "@/lib/i18n";
import { fileExt, fileNameFromUrl, formatDate } from "@/lib/format";
import type { Evidence } from "@/lib/types";

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  useI18n();
  const url = evidence.file_url ?? evidence.file;
  const name = evidence.notes || fileNameFromUrl(url);
  const ext = fileExt(fileNameFromUrl(url));
  return (
    <article className="rounded-2xl border border-line bg-surface shadow-sm transition-shadow hover:shadow-md">
      {/* File header */}
      <div className="flex items-start gap-4 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-dark shadow-sm">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-navy">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium text-ink-soft">
            <span className="font-mono font-bold text-muted" dir="ltr">{ext}</span>
            <span className="text-muted/50">·</span>
            <span>{T.evidence.uploaded}: {formatDate(evidence.uploaded_at)}</span>
            <span className="text-muted/50">·</span>
            <span>{evidence.uploaded_by_detail.full_name_ar || evidence.uploaded_by_detail.username}</span>
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/8 px-3 py-1.5 text-[12px] font-bold text-primary-dark transition-colors hover:bg-primary/15"
            >
              <ExternalLink className="size-3" aria-hidden />
              {T.evidence.view}
            </a>
            <a
              href={url}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-subtle/60 px-3 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:bg-subtle"
            >
              <Download className="size-3" aria-hidden />
              {T.evidence.download}
            </a>
          </div>
        </div>
      </div>

      {/* AI analysis */}
      <div className="border-t border-line/60 px-4 pb-4">
        <p className="pt-3 text-[11px] font-bold uppercase tracking-wider text-ai-dark/70">{T.evidence.advisoryNote}</p>
        <AIEvidenceAnalysis evidenceId={evidence.id} fileUrl={url} />
      </div>
    </article>
  );
}
