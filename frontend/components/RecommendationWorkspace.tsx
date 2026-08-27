"use client";

import { CheckCircle2, ClipboardList, Repeat2, Send, Stamp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ActionPlanBuilder,
  emptyPlanDraft,
  type PlanDraft,
} from "@/components/action-plan/ActionPlanBuilder";
import { ActionPlanTimeline } from "@/components/action-plan/ActionPlanTimeline";
import { AIActionPlanSuggestion, suggestedPlanToDraftSeed } from "@/components/ai/AIActionPlanSuggestion";
import { CaseStageAI } from "@/components/ai/CaseStageAI";
import { CaseHeader } from "@/components/case/CaseHeader";
import { CurrentActionBand } from "@/components/case/CurrentActionBand";
import { FindingSection } from "@/components/case/FindingSection";
import { RespondForm, ResponseRecord } from "@/components/case/ResponsePanel";
import { AuditReviewPanel, DecisionPanel } from "@/components/case/ReviewPanels";
import { WorkflowRail } from "@/components/case/WorkflowRail";
import { EvidenceRegister } from "@/components/evidence/EvidenceRegister";
import { AuditTrail } from "@/components/trail/AuditTrail";
import {
  Button,
  Callout,
  Card,
  DataField,
  ErrorBanner,
  SuccessBanner,
  Field,
  ProgressBar,
  ProseBlock,
  Tabs,
  TextArea,
  type TabItem,
} from "@/components/ui/Base";
import { DashboardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { VerificationPanel } from "@/components/verification/VerificationPanel";
import { lastActivity, planProgress, type StepState } from "@/lib/case";
import { parseFinding } from "@/lib/finding";
import { formatDateTime } from "@/lib/format";
import { useRecommendation, useWorkflowAction, useWorkflowPolicy, type WorkflowAction } from "@/lib/hooks";
import { APPROVAL_TYPE_LABELS, T, TRAIL_ACTION_LABELS, useI18n } from "@/lib/i18n";
import type { ActionStep, RecommendationDetail, Role } from "@/lib/types";
import { can } from "@/lib/workflow";

type TabId =
  | "overview"
  | "finding"
  | "response"
  | "plan"
  | "evidence"
  | "verification"
  | "approvals"
  | "trail";

function tabFromQuery(value: string | null): TabId | null {
  if (
    value === "overview" ||
    value === "finding" ||
    value === "response" ||
    value === "plan" ||
    value === "evidence" ||
    value === "verification" ||
    value === "approvals" ||
    value === "trail"
  ) {
    return value;
  }
  return null;
}

function backHref(role: Role): { href: string; label: string } {
  const map: Record<Role, { href: string; label: string }> = {
    audit: { href: "/audit/recommendations", label: T.register.title },
    department_head: { href: "/department/recommendations", label: T.register.title },
    employee: { href: "/employee/my-tasks", label: T.nav.myTasks },
    council: { href: "/council/pending-approvals", label: T.nav.pendingApprovals },
  };
  return map[role];
}

/* ----------------------------------------------------------------------- */
/* Overview                                                                 */
/* ----------------------------------------------------------------------- */

function OverviewTab({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const activity = lastActivity(rec);
  const progress = planProgress(rec.action_plan);
  const parsed = parseFinding(rec.text);
  const condition = parsed.sections.find((section) => section.id === "condition")?.body;
  const statement = parsed.sections.find((section) => section.id === "statement")?.body;

  return (
    <div className="space-y-4">
      <dl className="grid gap-x-8 gap-y-4 border-b border-line pb-5 sm:grid-cols-2 lg:grid-cols-4">
        <DataField label={T.case.lastActivity}>
          {activity ? (
            <>
              <span className="block">{TRAIL_ACTION_LABELS[activity.action] ?? activity.action}</span>
              <span className="mt-0.5 block font-mono text-xs text-muted" dir="ltr">
                {formatDateTime(activity.created_at)}
              </span>
            </>
          ) : (
            T.trail.empty
          )}
        </DataField>
        <DataField label={T.case.report}>{rec.report_title}</DataField>
        <DataField label={T.common.department}>{rec.department_name}</DataField>
        <DataField label={T.create.priorityScore}>
          <span dir="ltr">{rec.priority_score}</span>
        </DataField>
      </dl>

      {(condition || statement || parsed.preamble) && (
        <section>
          <h3 className="mb-3 font-heading text-sm font-semibold text-navy">{T.case.whyExists}</h3>
          <div className="space-y-3">
            {condition ? <ProseBlock label={T.create.condition}>{condition}</ProseBlock> : null}
            {statement ? <ProseBlock label={T.create.statement}>{statement}</ProseBlock> : null}
            {!condition && !statement && parsed.preamble ? (
              <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-[1.9] text-ink">{parsed.preamble}</p>
            ) : null}
          </div>
        </section>
      )}

      {rec.action_plan ? (
        <section>
          <p className="mb-1.5 text-xs font-medium text-muted">{T.case.progress}</p>
          <ProgressBar value={progress} label={T.case.progress} />
        </section>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Execution controls                                                       */
/* ----------------------------------------------------------------------- */

function StepControls({
  step,
  state,
  action,
}: {
  step: ActionStep;
  state: StepState;
  action: WorkflowAction;
}) {
  useI18n();
  const post = (body: Record<string, unknown>) =>
    action.mutation.mutate({ path: `steps/${step.id}/progress/`, body });

  if (state === "blocked") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        {T.plan.progress}
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          defaultValue={step.progress_percent}
          disabled={step.is_done || action.mutation.isPending}
          onMouseUp={(event) => post({ progress_percent: Number(event.currentTarget.value) })}
          onTouchEnd={(event) => post({ progress_percent: Number(event.currentTarget.value) })}
          className="h-1.5 w-32 accent-primary"
          aria-label={`${T.plan.progress}: ${step.title}`}
        />
      </label>
      <Button
        type="button"
        variant={step.is_done ? "ghost" : "secondary"}
        className="px-2.5 py-1 text-xs"
        disabled={action.mutation.isPending}
        onClick={() => post({ is_done: !step.is_done, progress_percent: step.is_done ? 0 : 100 })}
      >
        {step.is_done ? T.plan.markUndone : T.plan.markDone}
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Plan tab                                                                 */
/* ----------------------------------------------------------------------- */

function PlanTab({
  rec,
  role,
  action,
}: {
  rec: RecommendationDetail;
  role: Role;
  action: WorkflowAction;
}) {
  useI18n();
  const canSubmitPlan = can("submit_plan", rec.status, role);
  const canReviewPlan = can("review_plan", rec.status, role);
  const canProgress = can("update_progress", rec.status, role);
  const canMarkImplemented = can("mark_implemented", rec.status, role);
  const canReviewImplementation = can("review_implementation", rec.status, role);

  const [draft, setDraft] = useState<PlanDraft>(() =>
    emptyPlanDraft({
      responsible_employee: rec.action_plan?.responsible_employee,
      target_date: rec.action_plan?.target_date,
      notes: rec.action_plan?.notes,
      steps: rec.action_plan?.steps?.map((step) => ({ title: step.title, comments: step.comments })),
    })
  );

  if (canSubmitPlan) {
    return (
      <ActionPlanBuilder
        draft={draft}
        onChange={setDraft}
        busy={action.mutation.isPending}
        error={action.error}
        existingPlan={rec.action_plan}
        reviewNotes={rec.status === "revision_required" ? rec.action_plan?.review_notes : undefined}
        submitLabel={rec.status === "revision_required" ? T.plan.resubmit : T.plan.submit}
        onSubmit={(payload) => action.mutation.mutate({ path: "action-plan/", body: payload })}
        aiSlot={
          <AIActionPlanSuggestion
            recommendationId={rec.id}
            onAccept={(plan) =>
              setDraft(
                emptyPlanDraft({
                  responsible_employee: draft.responsible_employee,
                  target_date: draft.target_date,
                  ...suggestedPlanToDraftSeed(plan),
                })
              )
            }
          />
        }
      />
    );
  }

  if (!rec.action_plan) {
    return (
      <EmptyState
        icon={<ClipboardList className="size-6" />}
        title={T.case.noPlanYet}
        description={T.case.notAvailableYet}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ActionPlanTimeline
        rec={rec}
        renderStepActions={
          canProgress
            ? (step, state) => <StepControls step={step} state={state} action={action} />
            : undefined
        }
      />

      {canMarkImplemented ? (
        <Card title={T.plan.markImplemented}>
          <p className="mb-3 text-sm leading-relaxed text-ink-soft">{T.plan.markImplementedHint}</p>
          <ErrorBanner message={action.error} />
          <Button
            onClick={() => action.mutation.mutate({ path: "mark-implemented/" })}
            disabled={action.mutation.isPending}
          >
            <CheckCircle2 className="size-4" />
            {T.plan.markImplemented}
          </Button>
        </Card>
      ) : null}

      {canReviewPlan ? (
        <DecisionPanel
          title={T.plan.reviewNotes}
          intro={T.plan.intro}
          path="action-plan/review/"
          action={action}
          acceptLabel={T.plan.approve}
          rejectLabel={T.plan.requestRevision}
          notesLabel={T.plan.reviewNotes}
        />
      ) : null}

      {canReviewImplementation ? (
        <DecisionPanel
          title={T.case.headReviewTitle}
          intro={T.case.headReviewIntro}
          path="review-implementation/"
          action={action}
          acceptLabel={T.case.headReviewAccept}
          rejectLabel={T.case.headReviewReject}
          notesLabel={T.common.notes}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Approvals                                                                */
/* ----------------------------------------------------------------------- */

function ApprovalsTab({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const approvals = rec.approvals ?? [];
  if (!approvals.length) {
    return <EmptyState icon={<Stamp className="size-6" />} title={T.case.noApprovalsYet} />;
  }

  return (
    <Card title={T.case.approvals}>
      <ul className="space-y-3">
        {approvals.map((approval) => (
          <li key={approval.id} className="rounded-(--radius-field) border border-line bg-subtle/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-ink">
                {APPROVAL_TYPE_LABELS[approval.approval_type] ?? approval.approval_type}
              </p>
              <span className="font-mono text-xs text-muted" dir="ltr">
                {formatDateTime(approval.created_at)}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {approval.approved_by_detail?.full_name_ar || approval.approved_by_detail?.username}
            </p>
            {approval.notes?.trim() ? (
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{approval.notes}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ----------------------------------------------------------------------- */
/* Recurrence + closure (audit / council)                                   */
/* ----------------------------------------------------------------------- */

function RecurrencePanel({ rec, action }: { rec: RecommendationDetail; action: WorkflowAction }) {
  useI18n();
  if (!rec.is_recurring || rec.recurrence_confirmed) return null;
  return (
    <Card title={T.case.recurrence}>
      <Callout tone="warning" icon={<Repeat2 className="size-4" />} className="mb-3">
        {T.ai.recurringLikely}
      </Callout>
      <ErrorBanner message={action.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => action.mutation.mutate({ path: "confirm-recurrence/", body: { confirmed: true } })}
          disabled={action.mutation.isPending}
        >
          {T.case.confirmRecurrence}
        </Button>
        <Button
          variant="ghost"
          onClick={() => action.mutation.mutate({ path: "confirm-recurrence/", body: { confirmed: false } })}
          disabled={action.mutation.isPending}
        >
          {T.case.denyRecurrence}
        </Button>
      </div>
    </Card>
  );
}

function ClosurePanel({
  rec,
  role,
  action,
}: {
  rec: RecommendationDetail;
  role: Role;
  action: WorkflowAction;
}) {
  useI18n();
  const [notes, setNotes] = useState("");

  if (can("submit_for_closure", rec.status, role)) {
    return (
      <Card title={T.verify.submitForClosure}>
        <Field label={T.verify.closureNotes}>
          <TextArea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <ErrorBanner message={action.error} />
        <Button
          className="mt-3"
          onClick={() => action.mutation.mutate({ path: "submit-for-closure/", body: { notes } })}
          disabled={action.mutation.isPending}
        >
          <Send className="size-4" />
          {T.verify.submitForClosure}
        </Button>
      </Card>
    );
  }

  if (can("council_closure", rec.status, role)) {
    return (
      <DecisionPanel
        title={T.verify.councilNotes}
        intro={T.verify.intro}
        path="council-closure/"
        action={action}
        acceptLabel={T.verify.councilClose}
        rejectLabel={T.verify.councilReopen}
        notesLabel={T.verify.councilNotes}
      />
    );
  }

  return null;
}

/* ----------------------------------------------------------------------- */
/* Workspace                                                                */
/* ----------------------------------------------------------------------- */

export function RecommendationWorkspace({ id, role }: { id: number; role: Role }) {
  useI18n();
  const { data: rec, isLoading, isError, refetch } = useRecommendation(id);
  const action = useWorkflowAction(id);
  const { data: policy } = useWorkflowPolicy();
  const searchParams = useSearchParams();
  const urlTab = tabFromQuery(searchParams.get("tab"));
  const [picked, setPicked] = useState<{ recId: number; tab: TabId } | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft>(() => emptyPlanDraft());
  const pickedTab = picked?.recId === id ? picked.tab : null;

  /** The tab holding the action this role owes, marked so it is findable. */
  const awaitingTab: TabId | null = useMemo(() => {
    if (!rec) return null;
    if (can("respond", rec.status, role) || can("review_response", rec.status, role)) return "response";
    if (
      can("submit_plan", rec.status, role) ||
      can("review_plan", rec.status, role) ||
      can("update_progress", rec.status, role) ||
      can("mark_implemented", rec.status, role) ||
      can("review_implementation", rec.status, role)
    ) {
      return "plan";
    }
    if (
      can("verify", rec.status, role) ||
      can("submit_for_closure", rec.status, role) ||
      can("council_closure", rec.status, role)
    ) {
      return "verification";
    }
    return null;
  }, [rec, role]);

  const tabs: TabItem[] = !rec
    ? []
    : [
      { id: "overview", label: T.case.overview },
      { id: "finding", label: T.case.finding },
      { id: "response", label: T.case.response, active: awaitingTab === "response" },
      {
        id: "plan",
        label: T.case.plan,
        count: rec.action_plan?.steps.length,
        active: awaitingTab === "plan",
      },
      { id: "evidence", label: T.case.evidence, count: rec.evidence_files?.length },
      {
        id: "verification",
        label: T.case.verification,
        count: rec.verifications?.length,
        active: awaitingTab === "verification",
      },
      { id: "approvals", label: T.case.approvals, count: rec.approvals?.length },
      { id: "trail", label: T.case.trail, count: rec.trail?.length },
    ];

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !rec) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const back = backHref(role);
  const requirePlan = policy?.require_plan_with_response ?? false;
  const resolvedTab: TabId = pickedTab ?? urlTab ?? awaitingTab ?? "overview";

  return (
    <div className="space-y-4">
      <CaseHeader rec={rec} backHref={back.href} backLabel={back.label} />
      <CurrentActionBand
        rec={rec}
        role={role}
        acting={Boolean(awaitingTab && resolvedTab === awaitingTab)}
        onAct={awaitingTab ? () => setPicked({ recId: id, tab: awaitingTab }) : undefined}
      />
      <WorkflowRail status={rec.status} role={role} />

      <SuccessBanner message={action.success} />
      {can("confirm_recurrence", rec.status, role) ? <RecurrencePanel rec={rec} action={action} /> : null}

      <div className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
        <Tabs
          items={tabs}
          value={resolvedTab}
          onChange={(nextTab) => setPicked({ recId: id, tab: nextTab as TabId })}
          className="px-2"
        />

        <div className="p-4">
          {resolvedTab === "overview" ? (
            <>
              <OverviewTab rec={rec} />
              <CaseStageAI rec={rec} role={role} tab="overview" />
            </>
          ) : null}

          {resolvedTab === "finding" ? (
            <>
              <FindingSection rec={rec} />
              <CaseStageAI rec={rec} role={role} tab="finding" />
            </>
          ) : null}

          {resolvedTab === "response" ? (
            <>
              {can("respond", rec.status, role) ? (
                <RespondForm
                  rec={rec}
                  action={action}
                  requirePlan={requirePlan}
                  planDraft={planDraft}
                  planSlot={
                    <ActionPlanBuilder
                      draft={planDraft}
                      onChange={setPlanDraft}
                      aiSlot={
                        <AIActionPlanSuggestion
                          recommendationId={rec.id}
                          onAccept={(plan) =>
                            setPlanDraft(
                              emptyPlanDraft({
                                responsible_employee: planDraft.responsible_employee,
                                target_date: planDraft.target_date,
                                ...suggestedPlanToDraftSeed(plan),
                              })
                            )
                          }
                        />
                      }
                    />
                  }
                />
              ) : can("review_response", rec.status, role) ? (
                <AuditReviewPanel rec={rec} action={action} />
              ) : (
                <ResponseRecord rec={rec} />
              )}
              <CaseStageAI rec={rec} role={role} tab="response" />
            </>
          ) : null}

          {resolvedTab === "plan" ? (
            <>
              <PlanTab rec={rec} role={role} action={action} />
              <CaseStageAI rec={rec} role={role} tab="plan" />
            </>
          ) : null}

          {resolvedTab === "evidence" ? (
            <EvidenceRegister
              rec={rec}
              role={role}
              canUpload={can("upload_evidence", rec.status, role)}
              canAnalyze
              action={action}
            />
          ) : null}

          {resolvedTab === "verification" ? (
            <div className="space-y-4">
              <VerificationPanel rec={rec} action={action} canVerify={can("verify", rec.status, role)} />
              <ClosurePanel rec={rec} role={role} action={action} />
              <CaseStageAI rec={rec} role={role} tab="verification" />
            </div>
          ) : null}

          {resolvedTab === "approvals" ? <ApprovalsTab rec={rec} /> : null}

          {resolvedTab === "trail" ? <AuditTrail entries={rec.trail ?? []} /> : null}
        </div>
      </div>
    </div>
  );
}
