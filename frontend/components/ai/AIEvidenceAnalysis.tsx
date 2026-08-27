"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AlertTriangle, Check, ExternalLink, Sparkles } from "lucide-react";

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
    <div className="mt-3 rounded-xl border border-ai/20 bg-gradient-to-br from-ai-light/30 to-ai-light/5 p-4 text-[13px]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-heading text-[13px] font-bold text-ai-dark">
          <Sparkles className="size-3.5" aria-hidden />
          {T.ai.evidenceReview}
        </span>
        <Button
          variant="ghost"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="h-7 px-3 text-xs font-bold"
        >
          {T.ai.analyzeEvidence}
        </Button>
      </div>

      <p className="mt-1.5 text-[11px] font-medium text-ai-dark/75">{T.ai.verifyRemains}</p>
      <ErrorBanner message={error} />
      <AIJobStatus job={mutation.data} busy={mutation.isPending} />

      {analysis ? (
        <div className="mt-3 space-y-3 border-t border-ai/15 pt-3">
          {/* Score row */}
          <div className="rounded-lg border border-ai/15 bg-surface p-3">
            <ScoreRow label={T.ai.relevance} value={typeof out.relevance_score === "number" ? out.relevance_score : 0} />
            <div className="mt-2">
              <AIConfidenceBadge value={typeof out.confidence === "number" ? out.confidence : null} />
            </div>
          </div>

          {/* Summary */}
          {String(out.summary ?? "") && (
            <p className="leading-relaxed text-ink font-medium">{String(out.summary ?? "")}</p>
          )}

          {out.extraction_ok === false ? (
            <p className="text-[12px] font-bold text-danger-dark">{T.ai.extractionFail}</p>
          ) : null}

          {/* Matched requirements */}
          {Array.isArray(out.matched_requirements) && (out.matched_requirements as string[]).length ? (
            <ul className="space-y-1.5">
              {(out.matched_requirements as string[]).map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12px] font-medium text-success-dark">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success/15">
                    <Check className="size-2.5" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Missing information */}
          {Array.isArray(out.missing_information) && (out.missing_information as string[]).length ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-warning-dark">{T.ai.missing}</p>
              <ul className="space-y-1.5">
                {(out.missing_information as string[]).map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px] font-medium text-warning-dark">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-warning/15">
                      <AlertTriangle className="size-2.5" aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* File link */}
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary-dark hover:underline"
            >
              {T.common.details}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
