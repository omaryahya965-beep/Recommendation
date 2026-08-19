"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Button, ErrorBanner } from "@/components/ui/Base";
import { uiLanguage } from "@/lib/ai";
import { api, errorMessage } from "@/lib/api";
import { RISK_LABELS, T, useI18n } from "@/lib/i18n";
import type { AIAnalysisEnvelope, AIJob, AIMatch } from "@/lib/types";

import { AIConfidenceBadge, AIJobStatus, AIMeta, AIPanel, ScoreRow } from "./AIPrimitives";
import { AISimilarityCard } from "./AISimilarityCard";

const MIN_SIMILAR_PERCENT = 52;

function asNum(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function qualityLabel(score: number, band?: unknown) {
  const key = typeof band === "string" ? band : score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
  if (key === "HIGH") return T.ai.qualityHigh;
  if (key === "LOW") return T.ai.qualityLow;
  return T.ai.qualityMedium;
}

function priorityLabel(value: unknown) {
  if (value === "HIGH" || value === "high") return RISK_LABELS.high;
  if (value === "LOW" || value === "low") return RISK_LABELS.low;
  if (value === "MEDIUM" || value === "medium") return RISK_LABELS.medium;
  return String(value ?? "—");
}

function materialMatches(raw: AIMatch[] | undefined) {
  const seen = new Set<string>();
  const out: AIMatch[] = [];
  for (const match of raw ?? []) {
    if (match.similarity_percent < MIN_SIMILAR_PERCENT) continue;
    const key = (match.matched_title || match.matched_text || "").replace(/\s+/g, " ").slice(0, 180);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(match);
    if (out.length >= 3) break;
  }
  return out;
}

export function AIRecommendationAnalysis({
  recommendationId,
  caseHref,
}: {
  recommendationId: number;
  caseHref?: (id: number) => string;
}) {
  useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const lang = uiLanguage();

  const cached = useQuery({
    queryKey: ["ai-analysis", recommendationId],
    queryFn: () => api<AIAnalysisEnvelope | { analysis: null }>(`/api/ai/recommendations/${recommendationId}/analyze/`),
  });

  const analyze = useMutation({
    mutationFn: () =>
      api<AIJob>(`/api/ai/recommendations/${recommendationId}/analyze/`, {
        method: "POST",
        body: { language: lang },
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["ai-analysis", recommendationId] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const similar = useMutation({
    mutationFn: () =>
      api<AIJob>(`/api/ai/recommendations/${recommendationId}/similar/`, {
        method: "POST",
        body: { language: lang },
      }),
    onError: (err) => setError(errorMessage(err)),
  });

  const analysis =
    analyze.data?.analysis ??
    (cached.data && "output" in cached.data ? cached.data : null);
  const similarAnalysis = similar.data?.analysis ?? null;
  const out = (analysis?.output ?? {}) as Record<string, unknown>;
  const matches = useMemo(
    () => materialMatches((similarAnalysis?.output?.matches as AIMatch[] | undefined) ?? []),
    [similarAnalysis],
  );
  const quality = asNum(out.quality_score);

  return (
    <AIPanel
      title={T.ai.title}
      actions={
        <Button variant="secondary" onClick={() => analyze.mutate()} disabled={analyze.isPending}>
          {analysis && !analysis.live ? T.ai.regenerate : T.ai.generate}
        </Button>
      }
    >
      <ErrorBanner message={error} />
      <AIJobStatus job={analyze.data} busy={analyze.isPending} />
      {!analysis ? (
        <p className="text-sm text-ink-soft">{T.ai.empty}</p>
      ) : (
        <div className="space-y-3">
          {typeof out.brief === "string" && out.brief ? (
            <div>
              <p className="font-heading text-sm font-semibold text-ai-dark">{T.ai.brief}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-[1.9] text-ink">{out.brief}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <ScoreRow label={T.ai.quality} value={`${qualityLabel(quality, out.quality_band)} · ${quality}%`} />
            <ScoreRow label={T.ai.risk} value={asNum(out.risk_score)} />
            <ScoreRow label={T.ai.priority} value={priorityLabel(out.suggested_priority)} />
          </div>
          <AIConfidenceBadge value={asNum(out.confidence, analysis.confidence ?? 0)} />

          {typeof out.how_to_resolve === "string" && out.how_to_resolve ? (
            <div>
              <p className="font-heading text-sm font-semibold text-ai-dark">{T.ai.howToResolve}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{out.how_to_resolve}</p>
            </div>
          ) : null}
          {typeof out.next_action === "string" && out.next_action ? (
            <div>
              <p className="font-heading text-sm font-semibold text-ai-dark">{T.ai.nextAction}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{out.next_action}</p>
            </div>
          ) : null}

          {Array.isArray(out.issues) && out.issues.length ? (
            <div>
              <p className="font-heading text-sm font-bold">{T.ai.issues}</p>
              <ul className="mt-1 list-disc ps-5 text-sm">
                {(out.issues as string[]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {Array.isArray(out.suggestions) && out.suggestions.length ? (
            <div>
              <p className="font-heading text-sm font-bold">{T.ai.suggestions}</p>
              <ul className="mt-1 list-disc ps-5 text-sm">
                {(out.suggestions as string[]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <AIMeta provider={analysis.provider} model={analysis.model} createdAt={analysis.created_at} />
        </div>
      )}

      <div className="mt-4 border-t border-ai/20 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-heading text-sm font-semibold text-ai-dark">{T.ai.similar}</p>
          <Button variant="ghost" onClick={() => similar.mutate()} disabled={similar.isPending} className="h-8 px-2 text-xs">
            {T.ai.checkSimilar}
          </Button>
        </div>
        {similar.isPending ? (
          <p className="mt-1 text-sm text-ink-soft">{T.ai.generating}</p>
        ) : matches.length ? (
          <div className="mt-2 space-y-2">
            {matches.map((m) => (
              <AISimilarityCard key={m.matched_id} match={m} href={caseHref?.(m.matched_id)} />
            ))}
          </div>
        ) : similarAnalysis || similar.isSuccess ? (
          <p className="mt-1 text-sm text-ink-soft">{T.ai.similarEmpty}</p>
        ) : null}
      </div>
    </AIPanel>
  );
}
