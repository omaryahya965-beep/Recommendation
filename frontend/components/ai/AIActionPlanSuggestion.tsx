"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button, ErrorBanner } from "@/components/ui/Base";
import { uiLanguage } from "@/lib/ai";
import { api, errorMessage } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";
import type { AIJob } from "@/lib/types";

import { AIConfidenceBadge, AIJobStatus, AIMeta, AIPanel } from "./AIPrimitives";

export interface SuggestedStep {
  title: string;
  description: string;
  suggested_responsible_role: string;
  suggested_duration_days: number;
  required_evidence: string;
  completion_criteria: string;
}

export interface SuggestedPlan {
  objective: string;
  steps: SuggestedStep[];
  risks: string[];
  dependencies: string[];
}

export function suggestedPlanToDraftSeed(plan: SuggestedPlan) {
  return {
    notes: plan.objective,
    steps: plan.steps.map((step) => ({
      title: step.title,
      description: step.description,
      result: step.completion_criteria,
      evidence: step.required_evidence,
    })),
  };
}

export function AIActionPlanSuggestion({
  recommendationId,
  onAccept,
}: {
  recommendationId: number;
  onAccept: (plan: SuggestedPlan) => void;
}) {
  useI18n();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      api<AIJob>(`/api/ai/recommendations/${recommendationId}/action-plan/suggest/`, {
        method: "POST",
        body: { language: uiLanguage() },
      }),
    onError: (err) => setError(errorMessage(err)),
    onSuccess: () => setError(null),
  });
  const out = mutation.data?.analysis?.output as (SuggestedPlan & { confidence?: number }) | undefined;

  return (
    <AIPanel
      title={T.ai.suggestedPlan}
      actions={
        <div className="flex flex-wrap gap-2.5">
          <Button variant="secondary" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="font-bold text-xs ring-1 ring-line">
            {out ? T.ai.regenerate : T.ai.generatePlan}
          </Button>
          {out ? (
            <>
              <Button onClick={() => onAccept(out)} className="font-bold text-xs shadow-sm">{T.ai.acceptPlan}</Button>
              <Button variant="ghost" onClick={() => mutation.reset()} className="font-bold text-xs">
                {T.ai.discardPlan}
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <p className="mb-3 text-xs font-bold text-ai-dark uppercase tracking-wide">{T.ai.draftOnly}</p>
      <ErrorBanner message={error} />
      <AIJobStatus job={mutation.data} busy={mutation.isPending} />
      {out ? (
        <div className="space-y-4 text-[13.5px]">
          <p className="leading-relaxed text-ink font-medium bg-surface rounded-xl p-4 border border-line">{out.objective}</p>
          <ol className="space-y-3">
            {(out.steps ?? []).map((step, index) => (
              <li
                key={`${step.title}-${index}`}
                className="rounded-xl border border-ai/15 bg-surface/50 p-4.5 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-5 items-center justify-center rounded-full bg-subtle font-mono text-[10px] font-bold text-ink-soft" dir="ltr">
                    {index + 1}
                  </span>
                  <span className="font-heading text-[14.5px] font-bold text-navy">{step.title}</span>
                </div>
                <p className="mt-2 leading-relaxed text-ink-soft font-medium">{step.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-bold text-muted uppercase tracking-wider bg-subtle/55 p-2 rounded-lg border border-line/45">
                  <span>{step.suggested_responsible_role}</span>
                  <span className="text-muted/50">•</span>
                  <span className="font-mono" dir="ltr">{step.suggested_duration_days}d</span>
                </div>
                {step.required_evidence ? (
                  <div className="mt-3 border-t border-line/50 pt-2.5 text-[12px] font-medium text-ink-soft">
                    <span className="text-muted font-bold uppercase tracking-wider text-[10px] block mb-0.5">{T.ai.requiredEvidencePrefix}</span>
                    {step.required_evidence}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between border-t border-ai/10 pt-4">
            <AIConfidenceBadge value={typeof out.confidence === "number" ? out.confidence : null} />
            {mutation.data?.analysis ? (
              <AIMeta
                provider={mutation.data.analysis.provider}
                model={mutation.data.analysis.model}
                createdAt={mutation.data.analysis.created_at}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </AIPanel>
  );
}
