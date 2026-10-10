"use client";

import { CheckCircle2, FilePen, Lock, Paperclip, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ActionPlanBuilder, emptyPlanDraft, type PlanDraft } from "@/components/action-plan/ActionPlanBuilder";
import { ActionPlanTimeline } from "@/components/action-plan/ActionPlanTimeline";
import { StepControls } from "@/components/action-plan/StepControls";
import { AIActionPlanSuggestion, suggestedPlanToDraftSeed } from "@/components/ai/AIActionPlanSuggestion";
import { BlockerList } from "@/components/case/BlockerList";
import { RespondForm } from "@/components/case/ResponsePanel";
import { AuditReviewPanel, DecisionPanel } from "@/components/case/ReviewPanels";
import { EvidenceUploadForm } from "@/components/evidence/EvidenceUploadForm";
import { ExpandableSection } from "@/components/mobile/ExpandableSection";
import { Button, Callout, DataField, ErrorBanner, Field, ProgressBar, TextArea } from "@/components/ui/Base";
import { DecisionRecord, VerificationPanel } from "@/components/verification/VerificationPanel";
import { evidenceByStep, latestVerification, outstandingRequirements, sortSteps, stepState, type StepState } from "@/lib/case";
import { cn } from "@/lib/cn";
import { formatDate, plural } from "@/lib/format";
import type { WorkflowAction } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import { parseStep } from "@/lib/planStep";
import type { ActionStep, RecommendationDetail } from "@/lib/types";
import { isExecutionDesk } from "@/lib/viewmodels/caseView";
import { canAct, caseAction, isOffered } from "@/lib/workflow";

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function DeskHeading({ title, hint, aside }: { title: string; hint?: string; aside?: string }) {
  return (
    <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className="font-heading text-[15px] font-bold text-navy">{title}</h3>
        {hint ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{hint}</p> : null}
      </div>
      {aside ? (
        <span className="font-mono text-[12px] font-semibold text-muted" dir="ltr">
          {aside}
        </span>
      ) : null}
    </header>
  );
}

/** What audit asked for when it returned the work (and by when — W1). */
export function OutstandingRequest({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const outstanding = outstandingRequirements(rec);
  if (!outstanding) return null;
  return (
    <Callout tone="danger" title={T.caseView.desk.outstanding}>
      <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {outstanding.rejection_reason?.trim() ? (
          <DataField label={T.verify.returnReason}>{outstanding.rejection_reason}</DataField>
        ) : null}
        {outstanding.required_action?.trim() ? (
          <DataField label={T.verify.returnRequired}>{outstanding.required_action}</DataField>
        ) : null}
        {outstanding.action_deadline ? (
          <DataField label={T.verify.newDeadline}>
            <span className="font-mono" dir="ltr">
              {formatDate(outstanding.action_deadline)}
            </span>
          </DataField>
        ) : null}
      </dl>
    </Callout>
  );
}

const STEP_STATE_LABEL: Record<StepState, () => string> = {
  done: () => T.plan.done,
  active: () => T.plan.active,
  pending: () => T.plan.pending,
  blocked: () => T.plan.blocked,
};

function StepRow({
  step,
  index,
  steps,
  files,
  action,
  canProgress,
}: {
  step: ActionStep;
  index: number;
  steps: ActionStep[];
  files: number;
  action: WorkflowAction;
  canProgress: boolean;
}) {
  useI18n();
  const state = stepState(step, steps);
  const parsed = parseStep(step.comments);
  const detail = parsed.description || parsed.unstructured;
  const parent = step.depends_on ? steps.find((candidate) => candidate.id === step.depends_on) : null;

  return (
    <li className="flex gap-3 px-3.5 py-3.5 md:px-4">
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold",
          state === "done"
            ? "bg-success text-white"
            : state === "active"
              ? "bg-primary text-white"
              : state === "blocked"
                ? "bg-subtle text-muted"
                : "bg-subtle text-ink-soft ring-1 ring-line"
        )}
        dir="ltr"
      >
        {state === "done" ? <CheckCircle2 className="size-4" aria-hidden /> : state === "blocked" ? <Lock className="size-3.5" aria-hidden /> : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className={cn("text-[14px] font-semibold", state === "done" ? "text-ink-soft" : "text-ink")}>{step.title}</p>
          <span className="text-[12px] font-semibold text-muted">{STEP_STATE_LABEL[state]()}</span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {step.is_required_for_closure ? (
            <span className="font-semibold text-warning-dark">{T.plan.requiredForClosure}</span>
          ) : null}
          {parent && state === "blocked" ? (
            <span>
              {T.plan.blockedBy}: {parent.title}
            </span>
          ) : null}
          {files ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" aria-hidden />
              {plural(files, T.caseView.desk.evidenceCount)}
            </span>
          ) : null}
        </p>
        {canProgress ? (
          <StepControls step={step} state={state} action={action} className="mt-2.5" />
        ) : !step.is_done && step.progress_percent > 0 ? (
          <ProgressBar value={step.progress_percent} label={step.title} className="mt-2.5 max-w-xs" />
        ) : null}
        {detail || parsed.result || parsed.evidence ? (
          <ExpandableSection summary={T.common.details} className="mt-1">
            <div className="space-y-2 text-[13px] leading-relaxed text-ink">
              {detail ? <p className="whitespace-pre-wrap">{detail}</p> : null}
              {parsed.result ? (
                <p className="whitespace-pre-wrap">
                  <span className="font-semibold text-success-dark">{T.plan.expectedResult}: </span>
                  {parsed.result}
                </p>
              ) : null}
              {parsed.evidence ? (
                <p className="whitespace-pre-wrap">
                  <span className="font-semibold text-primary-dark">{T.plan.requiredEvidence}: </span>
                  {parsed.evidence}
                </p>
              ) : null}
            </div>
          </ExpandableSection>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Execution desk: steps, evidence, submit                             */
/* ------------------------------------------------------------------ */

export function ExecutionDesk({ rec, action }: { rec: RecommendationDetail; action: WorkflowAction }) {
  useI18n();
  const steps = sortSteps(rec.action_plan?.steps ?? []);
  const evidence = evidenceByStep(rec);
  const canProgress = isOffered(rec, "update_progress");
  const canUpload = isOffered(rec, "upload_evidence");
  const canSubmit = isOffered(rec, "mark_implemented");
  const done = steps.filter((step) => step.is_done).length;

  return (
    <div className="space-y-6">
      <OutstandingRequest rec={rec} />

      <section>
        <DeskHeading
          title={T.caseView.desk.steps}
          hint={canProgress ? T.caseView.desk.stepsHint : undefined}
          aside={steps.length ? `${done}/${steps.length}` : undefined}
        />
        {steps.length ? (
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {steps.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                index={index}
                steps={steps}
                files={evidence.get(step.id)?.length ?? 0}
                action={action}
                canProgress={canProgress}
              />
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-muted">{T.caseView.desk.noSteps}</p>
        )}
      </section>

      {canUpload ? (
        <section>
          <DeskHeading
            title={T.caseView.actions.upload_evidence}
            aside={plural(rec.evidence_files?.length ?? 0, T.caseView.desk.evidenceCount)}
          />
          <EvidenceUploadForm rec={rec} action={action} showActionError={false} />
        </section>
      ) : null}

      <ErrorBanner message={action.error} />

      {canSubmit ? (
        <section className="rounded-xl border border-success/30 bg-success-light/25 p-4 md:p-5">
          <DeskHeading title={T.plan.markImplemented} hint={T.caseView.desk.submitHint} />
          <BlockerList blockers={caseAction(rec, "mark_implemented")?.blockers} />
          <Button
            onClick={() => action.mutation.mutate({ path: "mark-implemented/" })}
            disabled={action.mutation.isPending || !canAct(rec, "mark_implemented")}
            className="min-h-12 w-full gap-2 font-bold md:w-auto"
          >
            <CheckCircle2 className="size-4.5" aria-hidden />
            {T.plan.markImplemented}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Other action forms                                                  */
/* ------------------------------------------------------------------ */

function DraftPanel({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-prose text-[13.5px] leading-relaxed text-ink-soft">{T.caseView.draftEditHint}</p>
      <Link
        href={`/audit/recommendations/${rec.id}/edit`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] font-bold text-navy shadow-sm hover:border-primary/40"
      >
        <FilePen className="size-4" aria-hidden />
        {T.create.editAction}
      </Link>
    </div>
  );
}

function usePlanDraft(rec: RecommendationDetail) {
  return useState<PlanDraft>(() =>
    emptyPlanDraft({
      responsible_employee: rec.action_plan?.responsible_employee,
      target_date: rec.action_plan?.target_date,
      notes: rec.action_plan?.notes,
      steps: rec.action_plan?.steps?.map((step) => ({ title: step.title, comments: step.comments })),
    })
  );
}

function PlanSuggestion({
  rec,
  draft,
  onDraft,
}: {
  rec: RecommendationDetail;
  draft: PlanDraft;
  onDraft: (draft: PlanDraft) => void;
}) {
  return (
    <AIActionPlanSuggestion
      recommendationId={rec.id}
      onAccept={(plan) =>
        onDraft(
          emptyPlanDraft({
            responsible_employee: draft.responsible_employee,
            target_date: draft.target_date,
            ...suggestedPlanToDraftSeed(plan),
          })
        )
      }
    />
  );
}

function RespondPanel({
  rec,
  action,
  requirePlan,
}: {
  rec: RecommendationDetail;
  action: WorkflowAction;
  requirePlan: boolean;
}) {
  const [draft, setDraft] = useState<PlanDraft>(() => emptyPlanDraft());
  return (
    <RespondForm
      rec={rec}
      action={action}
      requirePlan={requirePlan}
      planDraft={draft}
      planSlot={
        <ActionPlanBuilder
          draft={draft}
          onChange={setDraft}
          aiSlot={<PlanSuggestion rec={rec} draft={draft} onDraft={setDraft} />}
        />
      }
    />
  );
}

function PlanEditor({ rec, action }: { rec: RecommendationDetail; action: WorkflowAction }) {
  useI18n();
  const [draft, setDraft] = usePlanDraft(rec);
  const revising = rec.status === "revision_required";
  return (
    <ActionPlanBuilder
      draft={draft}
      onChange={setDraft}
      busy={action.mutation.isPending}
      error={action.error}
      existingPlan={rec.action_plan}
      reviewNotes={revising ? rec.action_plan?.review_notes : undefined}
      submitLabel={revising ? T.plan.resubmit : T.plan.submit}
      onSubmit={(payload) => action.mutation.mutate({ path: "action-plan/", body: payload })}
      aiSlot={<PlanSuggestion rec={rec} draft={draft} onDraft={setDraft} />}
    />
  );
}

function ClosureSubmitPanel({ action }: { action: WorkflowAction }) {
  useI18n();
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-4">
      <Field label={T.verify.closureNotes}>
        <TextArea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <ErrorBanner message={action.error} />
      <Button
        className="min-h-12 gap-2 font-bold"
        onClick={() => action.mutation.mutate({ path: "submit-for-closure/", body: { notes } })}
        disabled={action.mutation.isPending}
      >
        <Send className="size-4" aria-hidden />
        {T.verify.submitForClosure}
      </Button>
    </div>
  );
}

function CouncilClosurePanel({ rec, action }: { rec: RecommendationDetail; action: WorkflowAction }) {
  useI18n();
  const latest = latestVerification(rec);
  const referral = [...(rec.approvals ?? [])].reverse().find((item) => item.approval_type === "closure_review");
  return (
    <DecisionPanel
      plain
      title={T.verify.councilNotes}
      intro={T.verify.intro}
      path="council-closure/"
      action={action}
      acceptLabel={T.verify.councilClose}
      rejectLabel={T.verify.councilReopen}
      notesLabel={T.verify.councilNotes}
    >
      <div className="space-y-4">
        {latest ? (
          <div>
            <p className="mb-2 text-[12px] font-bold text-muted">{T.caseView.latestDecision}</p>
            <ul>
              <DecisionRecord decision={latest} />
            </ul>
          </div>
        ) : null}
        {referral?.notes?.trim() ? (
          <div className="rounded-xl border border-line bg-subtle/40 p-4">
            <p className="mb-1 text-[12px] font-bold text-muted">{T.caseView.closureNotes}</p>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{referral.notes}</p>
          </div>
        ) : null}
      </div>
    </DecisionPanel>
  );
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

/**
 * The form for the action the server marked primary for this user. Every
 * form is the same one the API validates against; this only picks which.
 */
export function ActionPanel({
  rec,
  action,
  requirePlan,
}: {
  rec: RecommendationDetail;
  action: WorkflowAction;
  requirePlan: boolean;
}) {
  useI18n();
  const primary = rec.workflow?.primary_action ?? null;
  if (!primary) return null;
  if (isExecutionDesk(primary)) return <ExecutionDesk rec={rec} action={action} />;

  switch (primary) {
    case "edit_draft":
      return <DraftPanel rec={rec} />;
    case "respond":
      return <RespondPanel rec={rec} action={action} requirePlan={requirePlan} />;
    case "review_response":
      return <AuditReviewPanel rec={rec} action={action} plain />;
    case "submit_plan":
      return <PlanEditor rec={rec} action={action} />;
    case "review_plan":
      return (
        <div className="space-y-6">
          <ActionPlanTimeline rec={rec} />
          <DecisionPanel
            plain
            title={T.plan.reviewNotes}
            intro={T.plan.intro}
            path="action-plan/review/"
            action={action}
            acceptLabel={T.plan.approve}
            rejectLabel={T.plan.requestRevision}
            notesLabel={T.plan.reviewNotes}
          />
        </div>
      );
    case "review_implementation":
      return (
        <div className="space-y-6">
          <ActionPlanTimeline rec={rec} />
          <DecisionPanel
            plain
            title={T.case.headReviewTitle}
            intro={T.case.headReviewIntro}
            path="review-implementation/"
            action={action}
            acceptLabel={T.case.headReviewAccept}
            rejectLabel={T.case.headReviewReject}
            notesLabel={T.common.notes}
          />
        </div>
      );
    case "verify":
      return <VerificationPanel rec={rec} action={action} canVerify showHistory={false} />;
    case "submit_for_closure":
      return <ClosureSubmitPanel action={action} />;
    case "council_closure":
      return <CouncilClosurePanel rec={rec} action={action} />;
    default:
      return null;
  }
}
