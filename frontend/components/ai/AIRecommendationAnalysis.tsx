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
    queryKey: ["ai-analysis", recommendationId, lang],
    queryFn: () => api<AIAnalysisEnvelope | { analysis: null }>(`/api/ai/recommendations/${recommendationId}/analyze/?language=${lang}`),
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
        <Button variant="secondary" onClick={() => analyze.mutate()} disabled={analyze.isPending} className="font-bold text-xs ring-1 ring-line">
          {analysis && !analysis.live ? T.ai.regenerate : T.ai.generate}
        </Button>
      }
    >
      <ErrorBanner message={error} />
      <AIJobStatus job={analyze.data} busy={analyze.isPending} />
      {!analysis ? (
        <p className="text-sm font-semibold text-ink-soft">{T.ai.empty}</p>
      ) : (
        <div className="space-y-4 text-[13.5px]">
          {/* Brief */}
          {typeof out.brief === "string" && out.brief ? (
            <p className="leading-relaxed text-ink font-medium">{out.brief}</p>
          ) : null}

          {/* Score grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-surface p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{T.ai.quality}</p>
              <p className="text-[13px] font-bold text-navy">{qualityLabel(quality, out.quality_band)}</p>
              <p className="font-mono text-[11px] text-ink-soft">{quality}%</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{T.ai.risk}</p>
              <p className="text-[13px] font-bold text-navy">{asNum(out.risk_score)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{T.ai.priority}</p>
              <p className="text-[13px] font-bold text-navy">{priorityLabel(out.suggested_priority)}</p>
            </div>
          </div>

          <div className="flex items-center">
            <AIConfidenceBadge value={asNum(out.confidence, analysis.confidence ?? 0)} />
          </div>

          {/* How to resolve */}
          {typeof out.how_to_resolve === "string" && out.how_to_resolve ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-navy">{T.ai.howToResolve}</p>
              <p className="leading-relaxed text-ink font-medium bg-surface rounded-xl p-4 border border-line">{out.how_to_resolve}</p>
            </div>
          ) : null}

          {/* Next action */}
          {typeof out.next_action === "string" && out.next_action ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-navy">{T.ai.nextAction}</p>
              <p className="leading-relaxed text-ink font-medium bg-surface rounded-xl p-4 border border-line">{out.next_action}</p>
            </div>
          ) : null}

          {/* Issues */}
          {Array.isArray(out.issues) && out.issues.length ? (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-danger-dark">{T.ai.issues}</p>
              <ul className="list-disc ps-5 space-y-1.5 font-medium text-ink bg-danger/5 rounded-xl p-3.5 border border-danger/10">
                {(out.issues as string[]).slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Suggestions */}
          {Array.isArray(out.suggestions) && out.suggestions.length ? (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-success-dark">{T.ai.suggestions}</p>
              <ul className="list-disc ps-5 space-y-1.5 font-medium text-ink bg-success/5 rounded-xl p-3.5 border border-success/10">
                {(out.suggestions as string[]).slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="border-t border-ai/10 pt-4">
            <AIMeta provider={analysis.provider} model={analysis.model} createdAt={analysis.created_at} />
          </div>
        </div>
      )}

      {/* Similar recommendations section */}
      <div className="mt-5 border-t border-ai/15 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="font-heading text-[13px] font-bold text-navy">{T.ai.similar}</p>
          <Button
            variant="ghost"
            onClick={() => similar.mutate()}
            disabled={similar.isPending}
            className="h-7 px-3 text-xs font-bold"
          >
            {T.ai.checkSimilar}
          </Button>
        </div>
        {similar.isPending ? (
          <p className="text-sm font-semibold text-ink-soft">{T.ai.generating}</p>
        ) : matches.length ? (
          <div className="space-y-2.5">
            {matches.map((m) => (
              <AISimilarityCard key={m.matched_id} match={m} href={caseHref?.(m.matched_id)} />
            ))}
          </div>
        ) : similarAnalysis || similar.isSuccess ? (
          <p className="text-sm font-semibold text-ink-soft">{T.ai.similarEmpty}</p>
        ) : null}
      </div>
    </AIPanel>
  );
}
