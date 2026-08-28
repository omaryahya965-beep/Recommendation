"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AIPanel } from "@/components/ai/AIPrimitives";
import { Button, ErrorBanner } from "@/components/ui/Base";
import { uiLanguage } from "@/lib/ai";
import { api, errorMessage } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";
import type { AIAnalysisEnvelope, AIJob, Role } from "@/lib/types";

interface SummaryItem {
  text?: string;
  label?: string;
  value?: string;
  source_ids?: string[];
}

export function AISummaryPanel({
  role,
  recommendationId,
  reportId,
  periodStart,
  periodEnd,
}: {
  role: Role;
  recommendationId?: number;
  reportId?: number;
  periodStart?: string;
  periodEnd?: string;
}) {
  useI18n();
  const lang = uiLanguage();
  const lockedScope = recommendationId
    ? "recommendation"
    : periodStart || periodEnd
      ? "followup_period"
      : null;
  const [error, setError] = useState<string | null>(null);
  const scope = lockedScope ?? (role === "audit" || role === "council" ? "municipality" : "department");

  const cached = useQuery({
    queryKey: ["ai-summary", scope, recommendationId, lang],
    queryFn: () =>
      api<AIAnalysisEnvelope | { analysis: null }>(
        `/api/ai/summaries/?scope=${encodeURIComponent(scope)}&recommendation_id=${recommendationId ?? ""}&language=${lang}`,
      ),
    enabled: scope === "recommendation" && Boolean(recommendationId),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api<AIJob>("/api/ai/summaries/", {
        method: "POST",
        body: {
          scope,
          language: lang,
          recommendation_id: recommendationId,
          report_id: reportId,
          period_start: periodStart || undefined,
          period_end: periodEnd || undefined,
        },
      }),
    onError: (err) => setError(errorMessage(err)),
    onSuccess: () => setError(null),
  });

  const analysis =
    mutation.data?.analysis ?? (cached.data && "output" in cached.data ? cached.data : null);
  const out = (analysis?.output ?? null) as Record<string, unknown> | null;
  const findings = Array.isArray(out?.key_findings) ? (out.key_findings as SummaryItem[]).slice(0, 4) : [];
  const nextSteps = Array.isArray(out?.recommended_next_steps)
    ? (out.recommended_next_steps as SummaryItem[]).slice(0, 3)
    : [];

  const hint = recommendationId
    ? lang === "ar"
      ? "ملخص هذه التوصية فقط."
      : "Summary of this recommendation only."
    : periodStart || periodEnd
      ? lang === "ar"
        ? "ملخص فترة المتابعة المحددة."
        : "Summary of the selected follow-up period."
      : T.ai.empty;

  return (
    <AIPanel
      title={T.ai.summary}
      actions={
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} variant="secondary" className="font-bold text-xs ring-1 ring-line">
          {mutation.isPending ? T.ai.generating : T.ai.generateSummary}
        </Button>
      }
    >
      <p className="mb-3 text-xs font-semibold text-ink-soft">{hint}</p>
      <ErrorBanner message={error} />
      {out ? (
        <article className="space-y-4 text-[13.5px]">
          <h3 className="font-heading text-[16px] font-bold text-navy leading-snug">{String(out.title ?? T.ai.summary)}</h3>
          {out.executive_summary ? (
            <p className="leading-relaxed text-ink font-medium">{String(out.executive_summary)}</p>
          ) : null}
          {findings.length ? (
            <ul className="space-y-1.5">
              {findings.map((item, idx) => (
                <li key={idx} className="flex gap-2 font-medium text-ink">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" aria-hidden />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {nextSteps.length ? (
            <div className="space-y-1.5">
              <p className="text-[12px] font-bold text-success-dark">{lang === "ar" ? "المطلوب الآن" : "Next"}</p>
              <ul className="space-y-1.5">
                {nextSteps.map((item, idx) => (
                  <li key={idx} className="font-medium leading-relaxed text-ink">
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ) : (
        <p className="text-sm font-semibold text-ink-soft">{T.ai.empty}</p>
      )}
    </AIPanel>
  );
}
