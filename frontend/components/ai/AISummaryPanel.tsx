"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AIPanel } from "@/components/ai/AIPrimitives";
import { Button, ErrorBanner, Select } from "@/components/ui/Base";
import { uiLanguage } from "@/lib/ai";
import { api, errorMessage } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";
import type { AIAnalysisEnvelope, AIJob, Role } from "@/lib/types";

const SCOPES: Array<{ id: string; labelKey: keyof typeof T.ai; roles?: Role[] }> = [
  { id: "recommendation", labelKey: "scopeRecommendation" },
  { id: "department", labelKey: "scopeDepartment", roles: ["audit", "council", "department_head"] },
  { id: "report", labelKey: "scopeReport", roles: ["audit", "council", "department_head"] },
  { id: "municipality", labelKey: "scopeMunicipality", roles: ["audit", "council"] },
  { id: "followup_period", labelKey: "scopeFollowup", roles: ["audit", "council", "department_head"] },
];

export function AISummaryPanel({
  role,
  recommendationId,
  reportId,
}: {
  role: Role;
  recommendationId?: number;
  reportId?: number;
}) {
  useI18n();
  const [scope, setScope] = useState(
    recommendationId ? "recommendation" : role === "audit" || role === "council" ? "municipality" : "department"
  );
  const [error, setError] = useState<string | null>(null);

  const cached = useQuery({
    queryKey: ["ai-summary", scope, recommendationId],
    queryFn: () =>
      api<AIAnalysisEnvelope | { analysis: null }>(
        `/api/ai/summaries/?scope=${encodeURIComponent(scope)}&recommendation_id=${recommendationId ?? ""}&language=${uiLanguage()}`,
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
          language: uiLanguage(),
          recommendation_id: recommendationId,
          report_id: reportId,
        },
      }),
    onError: (err) => setError(errorMessage(err)),
    onSuccess: () => setError(null),
  });

  const analysis =
    mutation.data?.analysis ?? (cached.data && "output" in cached.data ? cached.data : null);
  const out = (analysis?.output ?? null) as Record<string, unknown> | null;
  const highlights = Array.isArray(out?.highlights) ? (out.highlights as string[]) : [];

  return (
    <AIPanel
      title={T.ai.summary}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scope} onChange={(event) => setScope(event.target.value)} className="h-8 py-0 text-[13px]">
            {SCOPES.filter((item) => !item.roles || item.roles.includes(role)).map((item) => (
              <option key={item.id} value={item.id}>
                {T.ai[item.labelKey]}
              </option>
            ))}
          </Select>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} variant="secondary">
            {mutation.isPending ? T.ai.generating : T.ai.generateSummary}
          </Button>
        </div>
      }
    >
      <ErrorBanner message={error} />
      {out ? (
        <article className="space-y-3">
          <h3 className="font-heading text-[15px] font-semibold text-navy">{String(out.title ?? "")}</h3>
          {highlights.length ? (
            <ul className="space-y-1 text-sm leading-relaxed text-ink">
              {highlights.filter((item) => item && !/^\d+$/.test(item)).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-[1.9] text-ink">{String(out.body ?? "")}</p>
          {typeof out.llm_elaboration === "string" && out.llm_elaboration ? (
            <p className="whitespace-pre-wrap border-t border-ai/20 pt-2 text-sm leading-[1.9] text-ink-soft">
              {out.llm_elaboration}
            </p>
          ) : null}
        </article>
      ) : (
        <p className="text-sm text-ink-soft">{T.ai.empty}</p>
      )}
    </AIPanel>
  );
}
