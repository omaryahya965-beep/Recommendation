"use client";

import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { useState } from "react";

import {
  Button,
  Callout,
  ChoiceCards,
  DataField,
  ErrorBanner,
  Field,
  ProseBlock,
  TextArea,
  TextInput,
} from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  composeChecklistNotes,
  emptyChecklist,
  VerificationChecklist,
  type ChecklistState,
} from "@/components/verification/VerificationChecklist";
import { cn } from "@/lib/cn";
import { latestVerification, outstandingRequirements, planProgress } from "@/lib/case";
import { parseFinding } from "@/lib/finding";
import { formatDate, formatDateTime } from "@/lib/format";
import type { WorkflowAction } from "@/lib/hooks";
import { T, VERIFICATION_LABELS, useI18n } from "@/lib/i18n";
import type { RecommendationDetail, VerificationDecision } from "@/lib/types";

type Decision = "sufficient" | "partial" | "insufficient";

const DECISION_ICON = {
  sufficient: ShieldCheck,
  partial: ShieldAlert,
  insufficient: ShieldX,
} as const;

const DECISION_STYLE = {
  sufficient: "border-success/25 bg-success/8 text-success-dark",
  partial: "border-warning/25 bg-warning/8 text-warning-dark",
  insufficient: "border-danger/25 bg-danger/8 text-danger-dark",
} as const;

function DecisionRecord({ decision }: { decision: VerificationDecision }) {
  useI18n();
  const Icon = DECISION_ICON[decision.decision];
  return (
    <li className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold",
            DECISION_STYLE[decision.decision]
          )}
        >
          <Icon className="size-3.5" />
          {VERIFICATION_LABELS[decision.decision]}
        </span>
        <span className="font-mono text-[11.5px] font-medium text-muted" dir="ltr">
          {formatDateTime(decision.created_at)}
        </span>
      </div>

      {/* Notes */}
      {decision.notes?.trim() ? (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink font-medium">{decision.notes}</p>
      ) : null}

      {/* Structured rejection fields */}
      {decision.decision !== "sufficient" ? (
        <dl className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
          {decision.rejection_reason?.trim() ? (
            <DataField label={T.verify.returnReason}>{decision.rejection_reason}</DataField>
          ) : null}
          {decision.required_action?.trim() ? (
            <DataField label={T.verify.returnRequired}>{decision.required_action}</DataField>
          ) : null}
          {decision.action_deadline ? (
            <DataField label={T.verify.newDeadline}>
              <span dir="ltr">{formatDate(decision.action_deadline)}</span>
            </DataField>
          ) : null}
        </dl>
      ) : null}

      <p className="mt-3 text-[11.5px] font-semibold text-muted">
        {T.verify.reviewedBy}: {decision.reviewed_by_detail?.full_name_ar || decision.reviewed_by_detail?.username}
      </p>
    </li>
  );
}

function DeskContext({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const parsed = parseFinding(rec.text);
  const statement = parsed.sections.find((section) => section.id === "statement")?.body ?? parsed.preamble ?? rec.text;
  const expected = parsed.sections.find((section) => section.id === "evidence")?.body;
  const outstanding = outstandingRequirements(rec);
  const done = rec.action_plan?.steps.filter((step) => step.is_done).length ?? 0;
  const total = rec.action_plan?.steps.length ?? 0;
  const files = rec.evidence_files ?? [];
  const undone = rec.action_plan?.steps.filter((step) => !step.is_done && step.is_required_for_closure) ?? [];

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-4 text-center shadow-sm">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{T.verify.recommendationLabel}</dt>
          <dd className="text-[13px] font-semibold text-navy line-clamp-2 text-start">{statement}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 text-center shadow-sm">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{T.verify.planLabel}</dt>
          <dd className="text-[15px] font-bold text-navy" dir="ltr">{done}/{total}</dd>
          {rec.action_plan?.target_date ? (
            <dd className="font-mono text-[11px] text-muted mt-0.5" dir="ltr">
              {formatDate(rec.action_plan.target_date)} · {planProgress(rec.action_plan)}%
            </dd>
          ) : null}
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 text-center shadow-sm">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">{T.verify.evidenceLabel}</dt>
          <dd className="text-[15px] font-bold text-navy" dir="ltr">{files.length}</dd>
          <dd className="text-[11px] font-medium text-muted">{T.evidenceRegister.uploadedLabel}</dd>
        </div>
      </dl>

      {/* Context grids */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProseBlock label={T.verify.whatRequired}>
          {statement}
          {expected ? (
            <p className="mt-2 text-[13px] text-ink-soft font-medium">
              {T.create.expectedEvidence}: {expected}
            </p>
          ) : null}
        </ProseBlock>
        <ProseBlock label={T.verify.whatImplemented}>
          {rec.action_plan
            ? rec.action_plan.steps
                .map((step, index) => `${String(index + 1).padStart(2, "0")} ${step.title}${step.is_done ? " — ✓" : ""}`)
                .join("\n")
            : T.case.noPlanYet}
        </ProseBlock>
        <ProseBlock label={T.verify.whatEvidenceProves}>
          {files.length
            ? files
                .map((item) => item.notes?.trim() || T.evidenceRegister.noDescription)
                .join("\n")
            : T.case.noEvidenceYet}
        </ProseBlock>
        <ProseBlock label={T.verify.whatMissing}>
          {outstanding?.required_action?.trim()
            ? outstanding.required_action
            : undone.length
              ? undone.map((step) => step.title).join("\n")
              : T.common.none}
        </ProseBlock>
      </div>
    </div>
  );
}

/**
 * Auditor's review desk. AI analysis lives elsewhere and cannot produce this
 * decision.
 */
export function VerificationPanel({
  rec,
  action,
  canVerify,
}: {
  rec: RecommendationDetail;
  action?: WorkflowAction;
  canVerify: boolean;
}) {
  useI18n();
  const [decision, setDecision] = useState<Decision>("sufficient");
  const [notes, setNotes] = useState("");
  const [rejectedItems, setRejectedItems] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [requiredAction, setRequiredAction] = useState("");
  const [actionDeadline, setActionDeadline] = useState("");
  const [checklist, setChecklist] = useState<ChecklistState>(emptyChecklist);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const decisions = rec.verifications ?? [];
  const outstanding = latestVerification(rec);
  const structuredRequired = decision !== "sufficient";
  const composedNotes = composeChecklistNotes(checklist, notes);

  const ask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!action) return;
    if (
      structuredRequired &&
      (!rejectedItems.trim() || !rejectionReason.trim() || !requiredAction.trim() || !actionDeadline)
    ) {
      setLocalError(T.verify.structuredRequired);
      return;
    }
    setLocalError(null);
    setConfirming(true);
  };

  const submit = () => {
    if (!action) return;
    setConfirming(false);
    action.mutation.mutate({
      path: "verify/",
      body: {
        decision,
        notes: composedNotes,
        rejected_items: rejectedItems,
        rejection_reason: rejectionReason,
        required_action: requiredAction,
        action_deadline: actionDeadline || null,
      },
    });
  };

  return (
    <div className="space-y-7">
      {/* Header */}
      <header>
        <h2 className="font-heading text-[18px] font-bold text-navy">{T.verify.deskTitle}</h2>
        <p className="mt-1.5 text-[13.5px] font-medium text-ink-soft">{T.verify.intro}</p>
      </header>

      {/* Outstanding rejection callout */}
      {outstanding && outstanding.decision !== "sufficient" ? (
        <Callout tone="danger" title={T.verify.outstanding} icon={<ShieldAlert className="size-4" />}>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {outstanding.rejection_reason?.trim() ? (
              <DataField label={T.verify.returnReason}>{outstanding.rejection_reason}</DataField>
            ) : null}
            {outstanding.required_action?.trim() ? (
              <DataField label={T.verify.returnRequired}>{outstanding.required_action}</DataField>
            ) : null}
            {outstanding.action_deadline ? (
              <DataField label={T.verify.newDeadline}>
                <span dir="ltr">{formatDate(outstanding.action_deadline)}</span>
              </DataField>
            ) : null}
          </dl>
        </Callout>
      ) : null}

      {/* Context summary */}
      <DeskContext rec={rec} />

      {/* Verification form */}
      {canVerify && action ? (
        <form onSubmit={ask} className="space-y-5">
          <VerificationChecklist state={checklist} onChange={setChecklist} />

          <Field label={T.verify.notes}>
            <TextArea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>

          {/* Decision band */}
          <section className="rounded-2xl bg-inverse p-6 text-on-inverse">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-on-inverse/60">{T.verify.decisionBand}</p>
            <fieldset className="mt-4">
              <legend className="mb-3 text-[14px] font-bold text-on-inverse">{T.verify.decision}</legend>
              <ChoiceCards
                name="verification-decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: "sufficient", label: T.verify.sufficient, hint: T.verify.sufficientHint },
                  { value: "partial", label: T.verify.partial, hint: T.verify.partialHint },
                  { value: "insufficient", label: T.verify.insufficient, hint: T.verify.insufficientHint },
                ]}
              />
            </fieldset>

            {structuredRequired ? (
              <div className="mt-5 space-y-4 border-t border-white/15 pt-5 text-ink">
                <p className="text-[12px] font-bold text-warning-light">{T.verify.structuredRequired}</p>
                <div className="grid gap-4 rounded-xl bg-surface p-5 sm:grid-cols-2">
                  <Field label={`${T.verify.rejectedItems} *`}>
                    <TextArea
                      rows={2}
                      value={rejectedItems}
                      onChange={(event) => setRejectedItems(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label={`${T.verify.rejectionReason} *`}>
                    <TextArea
                      rows={2}
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label={`${T.verify.requiredAction} *`}>
                    <TextArea
                      rows={2}
                      value={requiredAction}
                      onChange={(event) => setRequiredAction(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label={`${T.verify.actionDeadline} *`} className="max-w-xs">
                    <TextInput
                      type="date"
                      dir="ltr"
                      value={actionDeadline}
                      onChange={(event) => setActionDeadline(event.target.value)}
                      required
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {composedNotes !== notes ? (
              <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-white/15 bg-white/10 p-4 font-body text-[12.5px] leading-relaxed text-white/90">
                {composedNotes}
              </pre>
            ) : null}

            <div className="mt-5">
              <ErrorBanner message={localError ?? action.error} />
            </div>

            <Button
              type="submit"
              className="mt-4 gap-2 bg-elevated font-bold text-navy hover:bg-subtle"
              disabled={action.mutation.isPending}
            >
              <ShieldCheck className="size-4" />
              {T.verify.submit}
            </Button>
          </section>

          <ConfirmDialog
            open={confirming}
            title={T.verify.submit}
            body={
              <>
                <p>
                  {T.verify.decision}: <strong>{VERIFICATION_LABELS[decision]}</strong>
                </p>
                <p className="mt-2">{T.confirm.irreversible}</p>
              </>
            }
            confirmLabel={T.verify.submit}
            tone={decision === "sufficient" ? "primary" : "danger"}
            busy={action.mutation.isPending}
            onConfirm={submit}
            onCancel={() => setConfirming(false)}
          />
        </form>
      ) : null}

      <Callout tone="ai">{T.verify.aiCannotVerify}</Callout>

      {/* Decision history */}
      <section className="border-t border-line pt-6">
        <h3 className="mb-4 flex items-center gap-2 font-heading text-[15px] font-bold text-navy">
          {T.verify.history}
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-primary-dark" dir="ltr">
            {decisions.length}
          </span>
        </h3>
        {decisions.length ? (
          <ul className="space-y-3">
            {[...decisions].reverse().map((item) => (
              <DecisionRecord key={item.id} decision={item} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title={T.case.noVerificationYet}
            description={T.verification.dutyNote}
            className="border-dashed shadow-none"
          />
        )}
      </section>
    </div>
  );
}
