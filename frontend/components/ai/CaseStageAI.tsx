"use client";

import { BrainCircuit } from "lucide-react";

import { AIRecommendationAnalysis } from "@/components/ai/AIRecommendationAnalysis";
import { AIRiskCard } from "@/components/ai/AIRiskCard";
import { AISummaryPanel } from "@/components/ai/AISummaryPanel";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail, Role } from "@/lib/types";
import { can } from "@/lib/workflow";

export type CaseTab =
  | "overview"
  | "finding"
  | "response"
  | "plan"
  | "evidence"
  | "verification"
  | "approvals"
  | "trail";

/**
 * Stage-aware advisory panels. Overview is the full set; the action tab the
 * role currently owes also surfaces the AI that belongs to that step so it is
 * not hidden behind a skipped overview.
 */
export function CaseStageAI({
  rec,
  role,
  tab,
}: {
  rec: RecommendationDetail;
  role: Role;
  tab: CaseTab;
}) {
  useI18n();

  const analysisRoles = role === "audit" || role === "council" || role === "department_head";
  const summaryRoles = role === "audit" || role === "council";
  const submittingPlan = can("submit_plan", rec.status, role);

  let showAnalysis = false;
  let showRisk = false;
  let showSummary = false;

  switch (tab) {
    case "overview":
      showAnalysis = analysisRoles;
      showRisk = true;
      showSummary = summaryRoles;
      break;
    case "finding":
    case "response":
      showAnalysis = analysisRoles;
      break;
    case "plan":
      showRisk =
        !submittingPlan &&
        (can("review_plan", rec.status, role) ||
          can("update_progress", rec.status, role) ||
          can("review_implementation", rec.status, role) ||
          can("mark_implemented", rec.status, role));
      break;
    case "verification":
      showAnalysis = summaryRoles;
      showRisk = summaryRoles;
      showSummary = summaryRoles;
      break;
    default:
      return null;
  }

  if (!showAnalysis && !showRisk && !showSummary) return null;

  return (
    <div className={tab === "overview" ? "space-y-5 border-t border-line pt-6" : "mt-5 space-y-5"}>
      {/* Advisory header */}
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-ai/10">
          <BrainCircuit className="size-3.5 text-ai-dark" aria-hidden />
        </span>
        <p className="text-[12px] font-bold uppercase tracking-wider text-ai-dark">{T.dashboard.advisoryBelow}</p>
      </div>

      {(showAnalysis || showRisk) ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {showAnalysis ? (
            <AIRecommendationAnalysis
              recommendationId={rec.id}
              caseHref={(id) =>
                role === "council"
                  ? `/council/recommendations/${id}`
                  : role === "department_head"
                    ? `/department/recommendations/${id}`
                    : `/audit/recommendations/${id}`
              }
            />
          ) : null}
          {showRisk ? <AIRiskCard recommendationId={rec.id} /> : null}
        </div>
      ) : null}

      {showSummary ? <AISummaryPanel role={role} recommendationId={rec.id} /> : null}
    </div>
  );
}
