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
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { ActionPlanTimeline } from "@/components/action-plan/ActionPlanTimeline";
import { StepControls } from "@/components/action-plan/StepControls";
import { CaseSkeleton } from "@/components/case/CaseHeader";
import { FindingSection } from "@/components/case/FindingSection";
import { ResponseRecord } from "@/components/case/ResponsePanel";
import { EvidenceRegister } from "@/components/evidence/EvidenceRegister";
import { Button, Callout, ErrorBanner, SuccessBanner } from "@/components/ui/Base";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerificationHistory } from "@/components/verification/VerificationPanel";
import { ActionCard } from "@/components/workspace/ActionCard";
import { ActionPanel } from "@/components/workspace/ActionPanel";
import { CaseHeaderBar } from "@/components/workspace/CaseHeaderBar";
import { CaseHistory, CaseSection, DecisionsList } from "@/components/workspace/CaseSections";
import { CaseTimeline } from "@/components/workspace/CaseTimeline";
import { SideRail } from "@/components/workspace/SideRail";
import { useRecommendation, useWorkflowAction, useWorkflowPolicy, type WorkflowAction } from "@/lib/hooks";
import { DECISION_LABELS, PLAN_STATUS_LABELS, REVIEW_STATUS_LABELS, T, VERIFICATION_LABELS, useI18n } from "@/lib/i18n";
import type { RecommendationDetail, Role } from "@/lib/types";
import {
  defaultOpenSection,
  isExecutionDesk,
  SECTION_IDS,
  sectionFacts,
  sectionFromQuery,
  type SectionFacts,
  type SectionId,
} from "@/lib/viewmodels/caseView";
import { isOffered } from "@/lib/workflow";

function backLink(role: Role): { href: string; label: string } {
  const map: Record<Role, { href: string; label: string }> = {
    audit: { href: "/audit/recommendations", label: T.register.title },
    department_head: { href: "/department/recommendations", label: T.register.title },
    employee: { href: "/employee/my-tasks", label: T.nav.myTasks },
    council: { href: "/council/pending-approvals", label: T.nav.pendingApprovals },
  };
  return map[role];
}

function sectionTitle(id: SectionId): string {
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

function sectionSummary(id: SectionId, rec: RecommendationDetail, facts: SectionFacts): string | null {
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

const SECTION_ICON: Record<SectionId, ReactNode> = {
  finding: <FileSearch className="size-4.5" />,
  response: <MessageSquareText className="size-4.5" />,
  plan: <ClipboardList className="size-4.5" />,
  evidence: <FolderOpen className="size-4.5" />,
  verification: <ShieldCheck className="size-4.5" />,
  decisions: <Stamp className="size-4.5" />,
  history: <History className="size-4.5" />,
};

function SectionBody({
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

function RecurrencePanel({ action }: { action: WorkflowAction }) {
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

/**
 * One recommendation case. The action card (whose turn, by when, and the form
 * when it is this user's turn) comes first; the record follows as collapsible
 * sections; dates, people and context sit in a side rail.
 */
export function RecommendationWorkspace({ id, role }: { id: number; role: Role }) {
  useI18n();
  const { data: rec, isLoading, isError, refetch } = useRecommendation(id);
  const action = useWorkflowAction(id);
  const { data: policy } = useWorkflowPolicy();
  const searchParams = useSearchParams();
  const linked = sectionFromQuery(searchParams.get("section") ?? searchParams.get("tab"));
  // Sections the user opened or closed, per case (a different case starts fresh).
  const [toggled, setToggled] = useState<{ recId: number; open: Partial<Record<SectionId, boolean>> }>({
    recId: id,
    open: {},
  });

  const back = backLink(role);
  if (isLoading) return <CaseSkeleton id={id} backHref={back.href} backLabel={back.label} />;
  if (isError || !rec) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const facts = sectionFacts(rec);
  const primary = rec.workflow?.primary_action ?? null;
  const deskOpen = isExecutionDesk(primary);
  const initial = new Set<SectionId>([defaultOpenSection(rec), ...(linked ? [linked] : [])]);
  const choices = toggled.recId === id ? toggled.open : {};
  const isOpen = (section: SectionId) => choices[section] ?? initial.has(section);
  const setOpen = (section: SectionId, open: boolean) =>
    setToggled((current) => ({
      recId: id,
      open: { ...(current.recId === id ? current.open : {}), [section]: open },
    }));
  const allOpen = SECTION_IDS.every(isOpen);
  const setAll = (open: boolean) =>
    setToggled({ recId: id, open: Object.fromEntries(SECTION_IDS.map((section) => [section, open])) });

  return (
    <div className="space-y-5">
      <CaseHeaderBar rec={rec} backHref={back.href} backLabel={back.label} />
      <CaseTimeline rec={rec} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18.5rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <SuccessBanner message={action.success ?? (searchParams.get("saved") ? T.create.editSaved : null)} />
          <ActionCard rec={rec} role={role}>
            {primary ? (
              <ActionPanel rec={rec} action={action} requirePlan={policy?.require_plan_with_response ?? false} />
            ) : null}
          </ActionCard>
          {isOffered(rec, "confirm_recurrence") && rec.is_recurring && !rec.recurrence_confirmed ? (
            <RecurrencePanel action={action} />
          ) : null}

          <div>
            <div className="mb-2.5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setAll(!allOpen)}
                className="min-h-9 rounded-md px-2 text-[12.5px] font-semibold text-primary-dark hover:underline"
              >
                {allOpen ? T.caseView.collapseAll : T.caseView.expandAll}
              </button>
            </div>
            <div className="space-y-3">
              {SECTION_IDS.map((section) => (
                <CaseSection
                  key={section}
                  id={section}
                  title={sectionTitle(section)}
                  summary={sectionSummary(section, rec, facts)}
                  count={
                    section === "evidence"
                      ? facts.files
                      : section === "decisions"
                        ? facts.decisions
                        : section === "plan"
                          ? facts.stepsTotal
                          : null
                  }
                  icon={SECTION_ICON[section]}
                  open={isOpen(section)}
                  onToggle={() => setOpen(section, !isOpen(section))}
                >
                  <SectionBody id={section} rec={rec} action={action} deskOpen={deskOpen} />
                </CaseSection>
              ))}
            </div>
          </div>
        </div>

        <aside className="min-w-0">
          <SideRail rec={rec} role={role} />
        </aside>
      </div>
    </div>
  );
}
