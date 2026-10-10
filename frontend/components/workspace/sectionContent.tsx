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
import { sectionLabel } from "@/lib/caseLinks";
import { plural } from "@/lib/format";
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
  return sectionLabel(id);
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
      return facts.files ? plural(facts.files, T.caseView.summary.files) : T.caseView.summary.noFiles;
    case "verification":
      return facts.latestVerification
        ? VERIFICATION_LABELS[facts.latestVerification]
        : T.caseView.summary.noVerification;
    case "decisions":
      return facts.decisions
        ? plural(facts.decisions, T.caseView.summary.decisions)
        : T.caseView.summary.noDecisions;
    case "history":
      return plural(facts.events, T.caseView.summary.events);
  }
}

export type SectionTone = "success" | "warning" | "danger";

/** A section's review state as a short pill: response review, plan, verification. */
export function sectionStatus(
  id: SectionId,
  rec: RecommendationDetail,
  facts: SectionFacts
): { label: string; tone: SectionTone } | null {
  const labels = T.caseView.sectionStatus;
  switch (id) {
    case "response": {
      const review = facts.responseReview;
      if (!review) return null;
      return { label: labels[review], tone: review === "accepted" ? "success" : review === "rejected" ? "danger" : "warning" };
    }
    case "plan": {
      const status = rec.action_plan?.status;
      if (!status) return null;
      return {
        label: labels[status],
        tone: status === "approved" ? "success" : status === "revision_required" ? "danger" : "warning",
      };
    }
    case "verification": {
      const decision = facts.latestVerification;
      if (!decision) return null;
      return {
        label: labels[decision],
        tone: decision === "sufficient" ? "success" : decision === "partial" ? "warning" : "danger",
      };
    }
    default:
      return null;
  }
}

/** The one-line summary beside a status pill, without repeating the pill. */
export function sectionRowSummary(id: SectionId, rec: RecommendationDetail, facts: SectionFacts): string | null {
  switch (id) {
    case "response":
      return facts.responseDecision ? DECISION_LABELS[facts.responseDecision] : T.caseView.summary.noResponse;
    case "plan":
      return rec.action_plan
        ? T.caseView.summary.steps
            .replace("{done}", String(facts.stepsDone))
            .replace("{total}", String(facts.stepsTotal))
            .replace("{progress}", String(facts.progress))
        : T.caseView.summary.noPlan;
    case "verification":
      return facts.latestVerification
        ? plural(rec.verifications?.length ?? 1, T.caseView.rounds)
        : T.caseView.summary.noVerification;
    default:
      return sectionSummary(id, rec, facts);
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

