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
  sufficient: "border-success/25 bg-success-light text-success-dark",
  partial: "border-warning/30 bg-warning-light text-warning-dark",
  insufficient: "border-danger/25 bg-danger-light text-danger-dark",
} as const;

function DecisionRecord({ decision }: { decision: VerificationDecision }) {
  useI18n();
  const Icon = DECISION_ICON[decision.decision];
  return (
    <li className="border-b border-line py-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 border px-2.5 py-1 text-[12px] font-medium",
            DECISION_STYLE[decision.decision]
          )}
        >
          <Icon className="size-3.5" />
          {VERIFICATION_LABELS[decision.decision]}
        </span>
        <span className="font-mono text-xs text-muted" dir="ltr">
          {formatDateTime(decision.created_at)}
        </span>
      </div>

      {decision.notes?.trim() ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-[1.9] text-ink">{decision.notes}</p>
      ) : null}

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

      <p className="mt-3 text-xs text-ink-soft">
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
      <dl className="grid gap-4 border-b border-line pb-4 sm:grid-cols-3">
        <DataField label={T.verify.recommendationLabel}>
          <span className="line-clamp-3">{statement}</span>
        </DataField>
        <DataField label={T.verify.planLabel}>
          {rec.action_plan ? (
            <>
              <span dir="ltr">
                {done}/{total}
              </span>{" "}
              {T.plan.done}
              {rec.action_plan.target_date ? (
                <span className="mt-0.5 block font-mono text-xs text-muted" dir="ltr">
                  {formatDate(rec.action_plan.target_date)} · {planProgress(rec.action_plan)}%
                </span>
              ) : null}
            </>
          ) : (
            T.case.noPlanYet
          )}
        </DataField>
        <DataField label={T.verify.evidenceLabel}>
          <span dir="ltr">{files.length}</span> {T.evidenceRegister.uploadedLabel}
        </DataField>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProseBlock label={T.verify.whatRequired}>
          {statement}
          {expected ? (
            <p className="mt-2 text-[13px] text-ink-soft">
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
    <div className="space-y-6">
      <header>
        <h2 className="font-heading text-lg font-semibold text-navy">{T.verify.deskTitle}</h2>
        <p className="mt-1 text-sm text-ink-soft">{T.verify.intro}</p>
      </header>

      {outstanding && outstanding.decision !== "sufficient" ? (
        <Callout tone="danger" title={T.verify.outstanding} icon={<ShieldAlert className="size-4" />}>
          <dl className="mt-2 grid gap-3 sm:grid-cols-3">
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

      <DeskContext rec={rec} />

      {canVerify && action ? (
        <form onSubmit={ask} className="space-y-5">
          <VerificationChecklist state={checklist} onChange={setChecklist} />

          <Field label={T.verify.notes}>
            <TextArea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>

          <section className="bg-inverse p-5 text-on-inverse">
            <p className="text-[11px] font-semibold text-on-inverse/70">{T.verify.decisionBand}</p>
            <fieldset className="mt-3">
              <legend className="mb-2 text-sm font-medium text-on-inverse">{T.verify.decision}</legend>
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
              <div className="mt-4 space-y-3 border-t border-white/15 pt-4 text-ink">
                <p className="text-xs text-warning-light">{T.verify.structuredRequired}</p>
                <div className="grid gap-3 bg-surface p-4 sm:grid-cols-2">
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
              <pre className="mt-3 whitespace-pre-wrap border border-white/15 bg-white/10 p-3 font-body text-[12.5px] leading-[1.9] text-white/90">
                {composedNotes}
              </pre>
            ) : null}

            <div className="mt-4">
              <ErrorBanner message={localError ?? action.error} />
            </div>

            <Button type="submit" className="mt-4 bg-elevated text-navy hover:bg-subtle" disabled={action.mutation.isPending}>
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

      <section className="border-t border-line pt-5">
        <h3 className="mb-3 font-heading text-sm font-semibold text-navy">
          {T.verify.history}
          <span className="ms-2 font-mono text-xs font-normal text-muted" dir="ltr">
            {decisions.length}
          </span>
        </h3>
        {decisions.length ? (
          <ul>
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
