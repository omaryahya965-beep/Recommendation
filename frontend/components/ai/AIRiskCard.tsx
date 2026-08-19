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
    queryFn: () => api<AIAnalysisEnvelope | { analysis: null }>(`/api/ai/recommendations/${recommendationId}/risk/`),
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
  const situation = Array.isArray(out?.situation) ? (out.situation as string[]) : [];
  const missing = Array.isArray(out?.missing_data) ? (out.missing_data as string[]) : [];
  const estimable = out?.estimable !== false && typeof out?.delay_risk_score === "number";

  return (
    <AIPanel
      title={T.ai.delayRisk}
      actions={
        <Button variant="secondary" onClick={() => generate.mutate()} disabled={generate.isPending}>
          {analysis && !analysis.live ? T.ai.regenerate : T.ai.generate}
        </Button>
      }
    >
      <p className="mb-2 text-xs text-ai-dark">{T.ai.notAFact}</p>
      <ErrorBanner message={error} />
      <AIJobStatus job={generate.data} busy={generate.isPending} />

      {cached.isLoading && !analysis ? (
        <p className="text-sm text-ink-soft">{T.ai.generating}</p>
      ) : !out ? (
        <p className="text-sm text-ink-soft">{T.ai.empty}</p>
      ) : (
        <div className="space-y-3">
          {typeof out.narrative === "string" && out.narrative ? (
            <p className="text-sm leading-[1.9] text-ink">{out.narrative}</p>
          ) : null}

          <div className="space-y-1.5 rounded-(--radius-field) border border-ai/20 bg-surface p-3">
            <ScoreRow
              label={T.ai.risk}
              value={estimable && out.risk_level !== "UNAVAILABLE" ? (out.delay_risk_score as number) : T.ai.delayUnavailable}
            />
            <ScoreRow label={T.common.risk} value={riskLevelLabel(out.risk_level)} />
          </div>
          <AIConfidenceBadge value={typeof out.confidence === "number" ? out.confidence : null} />

          {situation.length ? (
            <>
              <p className="font-heading text-sm font-semibold text-ai-dark">{T.ai.delaySituation}</p>
              <ul className="mt-1 space-y-1 text-sm leading-relaxed">
                {situation.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          ) : null}

          {factors.length ? (
            <>
              <p className="font-heading text-sm font-semibold text-ai-dark">{T.ai.why}</p>
              <ul className="mt-1 space-y-1 text-sm leading-relaxed">
                {factors.map((factor) => (
                  <li key={factor} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" aria-hidden />
                    {factor}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {missing.length && out.risk_level === "UNAVAILABLE" ? (
            <>
              <p className="font-heading text-sm font-semibold text-ai-dark">{T.ai.missingInputs}</p>
              <ul className="mt-1 list-disc ps-5 text-sm leading-relaxed">
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}

          {typeof out.recommended_attention === "string" ? (
            <p className="mt-2 text-sm leading-relaxed text-ink">{out.recommended_attention}</p>
          ) : null}

          {typeof out.next_action === "string" && out.next_action !== out.recommended_attention ? (
            <div>
              <p className="font-heading text-sm font-semibold text-ai-dark">{T.ai.nextAction}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{out.next_action}</p>
            </div>
          ) : null}

          <p className="text-xs font-semibold text-warning-dark">{T.ai.humanRequired}</p>

          {analysis ? (
            <AIMeta provider={analysis.provider} model={analysis.model} createdAt={analysis.created_at} />
          ) : null}
        </div>
      )}
    </AIPanel>
  );
}
