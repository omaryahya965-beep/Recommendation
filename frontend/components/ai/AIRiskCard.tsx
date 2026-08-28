"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, ErrorBanner } from "@/components/ui/Base";
import { uiLanguage } from "@/lib/ai";
import { api, errorMessage } from "@/lib/api";
import { RISK_LABELS, T, useI18n } from "@/lib/i18n";
import type { AIAnalysisEnvelope, AIJob } from "@/lib/types";

import { AIConfidenceBadge, AIJobStatus, AIMeta, AIPanel, ScoreRow } from "./AIPrimitives";

function riskLevelLabel(value: unknown) {
  if (value === "HIGH" || value === "high") return RISK_LABELS.high;
  if (value === "LOW" || value === "low") return RISK_LABELS.low;
  if (value === "MEDIUM" || value === "medium") return RISK_LABELS.medium;
  if (value === "UNAVAILABLE") return T.ai.delayUnavailable;
  return String(value ?? "—");
}

export function AIRiskCard({ recommendationId }: { recommendationId: number }) {
  useI18n();
  const queryClient = useQueryClient();
  const lang = uiLanguage();
  const [error, setError] = useState<string | null>(null);

  const cached = useQuery({
    queryKey: ["ai-risk", recommendationId, lang],
    queryFn: () => api<AIAnalysisEnvelope | { analysis: null }>(`/api/ai/recommendations/${recommendationId}/risk/?language=${lang}`),
    retry: false,
  });

  const generate = useMutation({
    mutationFn: () =>
      api<AIJob>(`/api/ai/recommendations/${recommendationId}/risk/`, {
        method: "POST",
        body: { language: lang },
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["ai-risk", recommendationId] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const analysis =
    generate.data?.analysis ?? (cached.data && "output" in cached.data ? cached.data : null);
  const out = (analysis?.output ?? null) as Record<string, unknown> | null;
  const factors = Array.isArray(out?.factors) ? (out.factors as string[]) : [];
  const missing = Array.isArray(out?.missing_data) ? (out.missing_data as string[]) : [];
  const estimable = out?.estimable !== false && typeof out?.delay_risk_score === "number";

  return (
    <AIPanel
      title={T.ai.delayRisk}
      actions={
        <Button variant="secondary" onClick={() => generate.mutate()} disabled={generate.isPending} className="font-bold text-xs ring-1 ring-line">
          {analysis && !analysis.live ? T.ai.regenerate : T.ai.generate}
        </Button>
      }
    >
      <p className="mb-3 text-xs font-bold text-ai-dark uppercase tracking-wide">{T.ai.notAFact}</p>
      <ErrorBanner message={error} />
      <AIJobStatus job={generate.data} busy={generate.isPending} />

      {cached.isLoading && !analysis ? (
        <p className="text-sm font-semibold text-ink-soft">{T.ai.generating}</p>
      ) : !out ? (
        <p className="text-sm font-semibold text-ink-soft">{T.ai.empty}</p>
      ) : (
        <div className="space-y-4 text-[13.5px]">
          {typeof out.narrative === "string" && out.narrative ? (
            <p className="leading-relaxed text-ink font-medium">{out.narrative}</p>
          ) : null}

          <div className="rounded-xl border border-ai/15 bg-surface p-4 shadow-sm">
            <ScoreRow
              label={T.ai.risk}
              value={estimable && out.risk_level !== "UNAVAILABLE" ? (out.delay_risk_score as number) : T.ai.delayUnavailable}
            />
            <ScoreRow label={T.common.risk} value={riskLevelLabel(out.risk_level)} />
          </div>
          
          <div className="flex items-center">
            <AIConfidenceBadge value={typeof out.confidence === "number" ? out.confidence : null} />
          </div>

          {factors.length ? (
            <div className="space-y-2">
              <p className="font-heading text-sm font-bold text-navy">{T.ai.why}</p>
              <ul className="space-y-1.5 font-medium text-ink-soft">
                {factors.slice(0, 4).map((factor) => (
                  <li key={factor} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" aria-hidden />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {missing.length && out.risk_level === "UNAVAILABLE" ? (
            <div className="space-y-2">
              <p className="font-heading text-sm font-bold text-navy uppercase tracking-wider">{T.ai.missingInputs}</p>
              <ul className="list-disc ps-5 space-y-1.5 font-medium text-ink-soft bg-subtle/40 rounded-xl p-3.5 border border-line">
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {typeof out.recommended_attention === "string" ? (
            <p className="leading-relaxed text-ink font-medium">{out.recommended_attention}</p>
          ) : null}

          <p className="text-xs font-bold text-warning-dark">{T.ai.humanRequired}</p>

          {analysis ? (
            <div className="border-t border-ai/10 pt-4">
              <AIMeta provider={analysis.provider} model={analysis.model} createdAt={analysis.created_at} />
            </div>
          ) : null}
        </div>
      )}
    </AIPanel>
  );
}
