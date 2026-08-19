"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AlertTriangle, Check, Sparkles } from "lucide-react";

import { Button, ErrorBanner } from "@/components/ui/Base";
import { uiLanguage } from "@/lib/ai";
import { api, errorMessage } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";
import type { AIAnalysisEnvelope, AIJob } from "@/lib/types";

import { AIConfidenceBadge, AIJobStatus, ScoreRow } from "./AIPrimitives";

export function AIEvidenceAnalysis({ evidenceId, fileUrl }: { evidenceId: number; fileUrl?: string | null }) {
  useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const cached = useQuery({
    queryKey: ["ai-evidence", evidenceId],
    queryFn: () => api<AIAnalysisEnvelope | { analysis: null }>(`/api/ai/evidence/${evidenceId}/analyze/`),
  });
  const mutation = useMutation({
    mutationFn: () =>
      api<AIJob>(`/api/ai/evidence/${evidenceId}/analyze/`, {
        method: "POST",
        body: { language: uiLanguage() },
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["ai-evidence", evidenceId] });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const analysis =
    mutation.data?.analysis ?? (cached.data && "output" in cached.data ? cached.data : null);
  const out = (analysis?.output ?? {}) as Record<string, unknown>;

  return (
    <div className="mt-2 rounded-(--radius-field) border border-ai/25 bg-ai-light/40 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-heading text-[12.5px] font-semibold text-ai-dark">
          <Sparkles className="size-3.5" aria-hidden />
          {T.ai.evidenceReview}
        </span>
        <Button variant="ghost" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {T.ai.analyzeEvidence}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-ai-dark">{T.ai.verifyRemains}</p>
      <ErrorBanner message={error} />
      <AIJobStatus job={mutation.data} busy={mutation.isPending} />
      {analysis ? (
        <div className="mt-2 space-y-1.5 border-t border-ai/20 pt-2">
          <ScoreRow label={T.ai.relevance} value={typeof out.relevance_score === "number" ? out.relevance_score : 0} />
          <AIConfidenceBadge value={typeof out.confidence === "number" ? out.confidence : null} />
          <p className="leading-relaxed text-ink">{String(out.summary ?? "")}</p>
          {out.extraction_ok === false ? <p className="text-danger-dark">{T.ai.extractionFail}</p> : null}
          {Array.isArray(out.matched_requirements) && (out.matched_requirements as string[]).length ? (
            <ul className="space-y-0.5">
              {(out.matched_requirements as string[]).map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-success-dark">
                  <Check className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(out.missing_information) && (out.missing_information as string[]).length ? (
            <div>
              <p className="font-semibold text-warning-dark">{T.ai.missing}</p>
              <ul className="space-y-0.5">
                {(out.missing_information as string[]).map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-warning-dark">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-medium text-primary-dark hover:underline"
            >
              {T.common.details}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
