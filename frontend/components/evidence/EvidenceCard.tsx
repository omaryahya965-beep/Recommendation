import { FileText } from "lucide-react";

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
    <article className="rounded-(--radius-card) border border-line bg-subtle/60 p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            <span className="font-mono" dir="ltr">
              {ext}
            </span>
            {" · "}
            {T.evidence.uploaded}: {formatDate(evidence.uploaded_at)}
            {" · "}
            {evidence.uploaded_by_detail.full_name_ar || evidence.uploaded_by_detail.username}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-(--radius-btn) border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-primary-dark hover:bg-primary-light"
            >
              {T.evidence.view}
            </a>
            <a
              href={url}
              download
              className="rounded-(--radius-btn) border border-line bg-surface px-2.5 py-1 text-[12px] font-medium hover:bg-subtle"
            >
              {T.evidence.download}
            </a>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ai-dark">{T.evidence.advisoryNote}</p>
      <AIEvidenceAnalysis evidenceId={evidence.id} fileUrl={url} />
    </article>
  );
}
