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

interface SummaryItem {
  text?: string;
  label?: string;
  value?: string;
  date?: string;
  source_ids?: string[];
  id?: string;
  title?: string;
}

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
        <article className="space-y-6 text-[13.5px]">
          <div className="border-b border-line pb-3">
            <h3 className="font-heading text-[17px] font-bold text-navy leading-snug">{String(out.title ?? T.ai.summary)}</h3>
          </div>

          {/* Executive Summary */}
          {out.executive_summary ? (
            <div className="space-y-1">
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-ai-dark">{uiLanguage() === "ar" ? "الملخص التنفيذي" : "Executive Summary"}</h4>
              <p className="whitespace-pre-wrap leading-relaxed text-ink font-medium bg-surface rounded-xl p-4 border border-line">{String(out.executive_summary)}</p>
            </div>
          ) : null}

          {/* Key Findings */}
          {Array.isArray(out.key_findings) && out.key_findings.length ? (
            <div className="space-y-2">
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-navy">{uiLanguage() === "ar" ? "النتائج الرئيسية" : "Key Findings"}</h4>
              <ul className="space-y-2 bg-surface rounded-xl p-4 border border-line">
                {(out.key_findings as SummaryItem[]).map((item, idx: number) => (
                  <li key={idx} className="flex flex-col gap-1 text-ink font-medium">
                    <div className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" aria-hidden />
                      <span>{item.text}</span>
                    </div>
                    {item.source_ids?.length ? (
                      <div className="ps-3.5 flex flex-wrap gap-1.5 mt-0.5">
                        {item.source_ids.map((sid: string) => (
                          <span key={sid} className="px-2 py-0.5 text-[10px] font-bold bg-subtle text-muted rounded-md border border-line font-mono">{sid}</span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Status & Risk Grid */}
          {((Array.isArray(out.status_overview) && out.status_overview.length) || (Array.isArray(out.risk_overview) && out.risk_overview.length)) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.isArray(out.status_overview) && out.status_overview.length ? (
                <div className="space-y-2">
                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-navy">{uiLanguage() === "ar" ? "نظرة عامة على الحالة" : "Status Overview"}</h4>
                  <div className="bg-surface rounded-xl border border-line divide-y divide-line">
                    {(out.status_overview as SummaryItem[]).map((item, idx: number) => (
                      <div key={idx} className="p-3 flex justify-between items-center text-[12.5px] font-medium">
                        <span className="text-muted">{item.label}</span>
                        <span className="font-bold text-navy">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(out.risk_overview) && out.risk_overview.length ? (
                <div className="space-y-2">
                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-danger-dark">{uiLanguage() === "ar" ? "نظرة عامة على المخاطر" : "Risk Overview"}</h4>
                  <div className="bg-surface rounded-xl border border-line divide-y divide-line">
                    {(out.risk_overview as SummaryItem[]).map((item, idx: number) => (
                      <div key={idx} className="p-3 flex justify-between items-center text-[12.5px] font-medium">
                        <span className="text-muted">{item.label}</span>
                        <span className="font-bold text-danger">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Important Deadlines */}
          {Array.isArray(out.important_deadlines) && out.important_deadlines.length ? (
            <div className="space-y-2">
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-navy">{uiLanguage() === "ar" ? "مواعيد هامة" : "Important Deadlines"}</h4>
              <div className="bg-surface rounded-xl border border-line divide-y divide-line">
                {(out.important_deadlines as SummaryItem[]).map((item, idx: number) => (
                  <div key={idx} className="p-3 flex justify-between items-center text-[12.5px] font-medium">
                    <span className="text-muted">{item.label}</span>
                    <span className="font-bold text-navy font-mono bg-subtle px-2 py-0.5 rounded border border-line">{item.date}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Recommended Next Steps */}
          {Array.isArray(out.recommended_next_steps) && out.recommended_next_steps.length ? (
            <div className="space-y-2">
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-success-dark">{uiLanguage() === "ar" ? "الخطوات التالية الموصى بها" : "Recommended Next Steps"}</h4>
              <ul className="space-y-2 bg-success/5 rounded-xl p-4 border border-success/10">
                {(out.recommended_next_steps as SummaryItem[]).map((item, idx: number) => (
                  <li key={idx} className="flex gap-2.5 font-medium leading-relaxed text-ink">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Open Questions */}
          {Array.isArray(out.open_questions) && out.open_questions.length ? (
            <div className="space-y-2">
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-warning-dark">{uiLanguage() === "ar" ? "أسئلة مفتوحة للمراجعة" : "Open Questions for Review"}</h4>
              <ul className="space-y-2 bg-warning/5 rounded-xl p-4 border border-warning/10">
                {(out.open_questions as SummaryItem[]).map((item, idx: number) => (
                  <li key={idx} className="flex gap-2.5 font-medium leading-relaxed text-ink">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Limitations */}
          {Array.isArray(out.limitations) && out.limitations.length ? (
            <div className="space-y-2">
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-muted">{uiLanguage() === "ar" ? "محددات وتنبيهات" : "Limitations & Disclaimers"}</h4>
              <ul className="space-y-2 bg-subtle/50 rounded-xl p-4 border border-line">
                {(out.limitations as SummaryItem[]).map((item, idx: number) => (
                  <li key={idx} className="flex gap-2.5 font-medium leading-relaxed text-ink-soft">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" aria-hidden />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Sources */}
          {Array.isArray(out.sources) && out.sources.length ? (
            <div className="space-y-2 pt-2 border-t border-line">
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-muted">{uiLanguage() === "ar" ? "المصادر والمراجع" : "Sources & References"}</h4>
              <div className="flex flex-wrap gap-2">
                {(out.sources as SummaryItem[]).map((item, idx: number) => (
                  <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-bold bg-subtle hover:bg-line rounded-lg border border-line transition-colors">
                    <span className="font-mono text-navy">{item.id}</span>
                    {item.title ? <span className="text-ink-soft font-normal">| {item.title}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="border-t border-line pt-4">
            <p className="text-[11px] text-muted font-semibold">
              {uiLanguage() === "ar" ? "توليد بواسطة: " : "Generated by: "}
              <span className="font-mono text-navy">{String(out.provider || "local")}</span>
              {" | "}
              {uiLanguage() === "ar" ? "النموذج: " : "Model: "}
              <span className="font-mono text-navy">{String(out.model || "heuristic-v1")}</span>
            </p>
          </div>
        </article>
      ) : (
        <p className="text-sm font-semibold text-ink-soft">{T.ai.empty}</p>
      )}
    </AIPanel>
  );
}
