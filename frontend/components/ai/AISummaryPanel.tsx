"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { LayoutGrid } from "lucide-react";

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
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-subtle/60 px-2.5 py-1">
            <LayoutGrid className="size-3 text-muted shrink-0" aria-hidden />
            <Select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="h-auto border-0 bg-transparent py-0 text-[12px] font-semibold shadow-none ring-0 focus:ring-0"
            >
              {SCOPES.filter((item) => !item.roles || item.roles.includes(role)).map((item) => (
                <option key={item.id} value={item.id}>
                  {T.ai[item.labelKey]}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} variant="secondary" className="font-bold text-xs ring-1 ring-line">
            {mutation.isPending ? T.ai.generating : T.ai.generateSummary}
          </Button>
        </div>
      }
    >
      <ErrorBanner message={error} />
      {out ? (
        <article className="space-y-4 text-[13.5px]">
          <h3 className="font-heading text-[16px] font-bold text-navy leading-snug">{String(out.title ?? "")}</h3>

          {highlights.length ? (
            <ul className="space-y-2">
              {highlights.filter((item) => item && !/^\d+$/.test(item)).map((item) => (
                <li key={item} className="flex gap-2.5 font-medium leading-relaxed text-ink">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="whitespace-pre-wrap leading-relaxed text-ink font-medium">{String(out.body ?? "")}</p>

          {typeof out.llm_elaboration === "string" && out.llm_elaboration ? (
            <div className="rounded-xl border border-ai/15 bg-ai-light/20 p-4">
              <p className="whitespace-pre-wrap leading-relaxed text-ink-soft font-medium text-[13px]">
                {out.llm_elaboration}
              </p>
            </div>
          ) : null}
        </article>
      ) : (
        <p className="text-sm font-semibold text-ink-soft">{T.ai.empty}</p>
      )}
    </AIPanel>
  );
}
