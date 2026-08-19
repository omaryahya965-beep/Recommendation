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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {out ? T.ai.regenerate : T.ai.generatePlan}
          </Button>
          {out ? (
            <>
              <Button onClick={() => onAccept(out)}>{T.ai.acceptPlan}</Button>
              <Button variant="ghost" onClick={() => mutation.reset()}>
                {T.ai.discardPlan}
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      <p className="mb-2 text-xs text-ai-dark">{T.ai.draftOnly}</p>
      <ErrorBanner message={error} />
      <AIJobStatus job={mutation.data} busy={mutation.isPending} />
      {out ? (
        <div className="space-y-3 text-sm">
          <p className="leading-relaxed text-ink">{out.objective}</p>
          <ol className="space-y-2">
            {(out.steps ?? []).map((step, index) => (
              <li
                key={`${step.title}-${index}`}
                className="rounded-(--radius-field) border border-ai/20 bg-surface p-3"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-muted" dir="ltr">
                    {index + 1}
                  </span>
                  <span className="font-heading text-[14px] font-semibold text-ink">{step.title}</span>
                </div>
                <p className="mt-1 leading-relaxed text-ink-soft">{step.description}</p>
                <p className="mt-1.5 font-mono text-[11px] text-muted" dir="ltr">
                  {step.suggested_responsible_role} · {step.suggested_duration_days}d
                </p>
                {step.required_evidence ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    <span className="text-muted">{T.ai.requiredEvidencePrefix} </span>
                    {step.required_evidence}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          <AIConfidenceBadge value={typeof out.confidence === "number" ? out.confidence : null} />
          {mutation.data?.analysis ? (
            <AIMeta
              provider={mutation.data.analysis.provider}
              model={mutation.data.analysis.model}
              createdAt={mutation.data.analysis.created_at}
            />
          ) : null}
        </div>
      ) : null}
    </AIPanel>
  );
}
