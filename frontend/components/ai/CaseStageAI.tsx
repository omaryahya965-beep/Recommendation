"use client";

import { BrainCircuit } from "lucide-react";

import { AISummaryPanel } from "@/components/ai/AISummaryPanel";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail, Role } from "@/lib/types";

/**
 * On a recommendation case, only the executive summary of this file is shown.
 * Quality analysis and delay-risk estimates stay off this page.
 */
export function CaseStageAI({
  rec,
  role,
  tab,
}: {
  rec: RecommendationDetail;
  role: Role;
  tab: string;
}) {
  useI18n();
  if (tab !== "overview") return null;

  return (
    <div className="space-y-5 border-t border-line pt-6">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-ai/10">
          <BrainCircuit className="size-3.5 text-ai-dark" aria-hidden />
        </span>
        <p className="text-[12px] font-bold uppercase tracking-wider text-ai-dark">{T.dashboard.advisoryBelow}</p>
      </div>
      <AISummaryPanel role={role} recommendationId={rec.id} />
    </div>
  );
}
