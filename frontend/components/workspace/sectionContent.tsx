"use client";

import {
  ClipboardList,
  FileSearch,
  FolderOpen,
  History,
  MessageSquareText,
  Repeat2,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import type { ReactNode } from "react";

import { ActionPlanTimeline } from "@/components/action-plan/ActionPlanTimeline";
import { StepControls } from "@/components/action-plan/StepControls";
import { FindingSection } from "@/components/case/FindingSection";
import { ResponseRecord } from "@/components/case/ResponsePanel";
import { EvidenceRegister } from "@/components/evidence/EvidenceRegister";
import { Button, Callout } from "@/components/ui/Base";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationHistory } from "@/components/verification/VerificationPanel";
import { CaseHistory, DecisionsList } from "@/components/workspace/CaseSections";
import type { WorkflowAction } from "@/lib/hooks";
import { DECISION_LABELS, PLAN_STATUS_LABELS, REVIEW_STATUS_LABELS, T, VERIFICATION_LABELS, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";
import type { SectionFacts, SectionId } from "@/lib/viewmodels/caseView";
import { isOffered } from "@/lib/workflow";

/*
 * The record sections of a case, shared by the desktop workspace and the
 * phone case screen: titles, one-line summaries, icons and bodies.
 */

export function sectionTitle(id: SectionId): string {
  const titles: Record<SectionId, string> = {
    finding: T.case.finding,
    response: T.case.response,
    plan: T.case.plan,
    evidence: T.case.evidence,
    verification: T.case.verification,
    decisions: T.caseView.decisions,
    history: T.caseView.history,
  };
  return titles[id];
}

export function sectionSummary(id: SectionId, rec: RecommendationDetail, facts: SectionFacts): string | null {
  switch (id) {
    case "finding":
      return rec.excerpt || null;
    case "response":
      if (!facts.responseDecision) return T.caseView.summary.noResponse;
      return `${DECISION_LABELS[facts.responseDecision]} · ${REVIEW_STATUS_LABELS[facts.responseReview ?? "pending"]}`;
    case "plan":
      if (!rec.action_plan) return T.caseView.summary.noPlan;
      return `${T.caseView.summary.steps
        .replace("{done}", String(facts.stepsDone))
        .replace("{total}", String(facts.stepsTotal))
        .replace("{progress}", String(facts.progress))} · ${PLAN_STATUS_LABELS[rec.action_plan.status]}`;
    case "evidence":
      return facts.files ? T.caseView.summary.files.replace("{n}", String(facts.files)) : T.caseView.summary.noFiles;
    case "verification":
      return facts.latestVerification
        ? VERIFICATION_LABELS[facts.latestVerification]
        : T.caseView.summary.noVerification;
    case "decisions":
      return facts.decisions
        ? T.caseView.summary.decisions.replace("{n}", String(facts.decisions))
        : T.caseView.summary.noDecisions;
    case "history":
      return T.caseView.summary.events.replace("{n}", String(facts.events));
  }
}

export const SECTION_ICON: Record<SectionId, ReactNode> = {
  finding: <FileSearch className="size-4.5" />,
  response: <MessageSquareText className="size-4.5" />,
  plan: <ClipboardList className="size-4.5" />,
  evidence: <FolderOpen className="size-4.5" />,
  verification: <ShieldCheck className="size-4.5" />,
  decisions: <Stamp className="size-4.5" />,
  history: <History className="size-4.5" />,
};

export function SectionBody({
  id,
  rec,
  action,
  deskOpen,
}: {
  id: SectionId;
  rec: RecommendationDetail;
  action: WorkflowAction;
  /** The execution desk above already holds step controls and the uploader. */
  deskOpen: boolean;
}) {
  switch (id) {
    case "finding":
      return <FindingSection rec={rec} />;
    case "response":
      return <ResponseRecord rec={rec} withFinding={false} />;
    case "plan":
      return rec.action_plan ? (
        <ActionPlanTimeline
          rec={rec}
          renderStepActions={
            !deskOpen && isOffered(rec, "update_progress")
              ? (step, state) => <StepControls step={step} state={state} action={action} />
              : undefined
          }
        />
      ) : (
        <EmptyState
          icon={<ClipboardList className="size-6" />}
          title={T.case.noPlanYet}
          description={T.case.notAvailableYet}
          className="border-dashed shadow-none"
        />
      );
    case "evidence":
      return (
        <EvidenceRegister
          rec={rec}
          canUpload={isOffered(rec, "upload_evidence")}
          showUploadForm={!deskOpen && isOffered(rec, "upload_evidence")}
          canAnalyze
          action={action}
        />
      );
    case "verification":
      return <VerificationHistory rec={rec} />;
    case "decisions":
      return <DecisionsList rec={rec} />;
    case "history":
      return <CaseHistory rec={rec} />;
  }
}

export function RecurrencePanel({ action }: { action: WorkflowAction }) {
  useI18n();
  return (
    <Callout tone="warning" icon={<Repeat2 className="size-4.5" />} title={T.case.recurrence}>
      <p>{T.ai.recurringLikely}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={() => action.mutation.mutate({ path: "confirm-recurrence/", body: { confirmed: true } })}
          disabled={action.mutation.isPending}
          className="font-bold"
        >
          {T.case.confirmRecurrence}
        </Button>
        <Button
          variant="ghost"
          onClick={() => action.mutation.mutate({ path: "confirm-recurrence/", body: { confirmed: false } })}
          disabled={action.mutation.isPending}
          className="font-bold ring-1 ring-line"
        >
          {T.case.denyRecurrence}
        </Button>
      </div>
    </Callout>
  );
}

