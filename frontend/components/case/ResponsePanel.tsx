"use client";

import { CheckCircle2, MessageSquareWarning, Paperclip, Send, XCircle } from "lucide-react";
import { useState } from "react";

import { toPlanPayload, type PlanDraft } from "@/components/action-plan/ActionPlanBuilder";
import {
  Button,
  Callout,
  ChoiceCards,
  DataField,
  ErrorBanner,
  Field,
  ProseBlock,
  TextArea,
} from "@/components/ui/Base";
import { EmptyState } from "@/components/ui/EmptyState";
import { parseFinding } from "@/lib/finding";
import { formatDate, formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import type { WorkflowAction } from "@/lib/hooks";
import { DECISION_LABELS, REVIEW_STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";
import { FILE_INPUT_ACCEPT, prepareFileSubmission } from "@/lib/upload";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

const REVIEW_TONE = {
  pending: "info",
  accepted: "success",
  rejected: "danger",
} as const;

function FindingExcerpt({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const parsed = parseFinding(rec.text);
  const statement = parsed.sections.find((section) => section.id === "statement")?.body;
  const action = parsed.sections.find((section) => section.id === "required_action")?.body;
  const body = statement || parsed.preamble || rec.text;
  if (!body?.trim()) return null;

  return (
    <section className="border-b border-line pb-5">
      <h3 className="mb-3 font-heading text-sm font-semibold text-navy">{T.response.recommendation}</h3>
      <ProseBlock label={T.create.statement}>{body}</ProseBlock>
      {action ? (
        <div className="mt-3">
          <ProseBlock label={T.workflow.requiredAction}>{action}</ProseBlock>
        </div>
      ) : null}
    </section>
  );
}

/** Read-only record: management response kept visually apart from the audit decision. */
export function ResponseRecord({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const response = rec.response;
  if (!response) {
    return (
      <EmptyState
        icon={<MessageSquareWarning className="size-6" />}
        title={T.case.noResponseYet}
        description={T.case.notAvailableYet}
      />
    );
  }

  const agreed = response.decision === "agree";
  const proposed = rec.action_plan?.target_date ?? rec.target_date;
  const responsible =
    rec.action_plan?.responsible_employee_detail?.full_name_ar ||
    rec.responsible_employee ||
    rec.department_name;

  return (
    <div className="space-y-8">
      <FindingExcerpt rec={rec} />

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-semibold text-navy">{T.case.managementResponse}</h3>
          <span
            className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[12px] font-medium ${
              agreed
                ? "border-success/25 bg-success-light text-success-dark"
                : "border-danger/25 bg-danger-light text-danger-dark"
            }`}
          >
            {agreed ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            {T.response.managementDecision}: {DECISION_LABELS[response.decision]}
          </span>
        </div>

        {response.justification?.trim() ? (
          <ProseBlock label={T.response.notes}>{response.justification}</ProseBlock>
        ) : (
          <p className="text-sm text-muted">{T.common.none}</p>
        )}

        {response.attachment ? (
          <a
            href={response.attachment}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 border border-line bg-subtle px-3 py-2 text-sm font-medium text-primary-dark hover:border-primary/40"
          >
            <Paperclip className="size-4" />
            {T.evidenceRegister.supporting}
          </a>
        ) : null}

        <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <DataField label={T.response.submittedBy}>
            {response.submitted_by_detail?.full_name_ar || response.submitted_by_detail?.username}
          </DataField>
          <DataField label={T.common.date}>
            <span dir="ltr">{formatDateTime(response.created_at)}</span>
          </DataField>
          {proposed ? (
            <DataField label={T.response.proposedDate}>
              <span dir="ltr">{formatDate(proposed)}</span>
            </DataField>
          ) : null}
          {responsible ? <DataField label={T.response.responsibleParty}>{responsible}</DataField> : null}
        </dl>
      </section>

      <section className="border-t-2 border-navy/20 pt-5">
        <h3 className="mb-3 font-heading text-sm font-semibold text-navy">{T.case.auditDecision}</h3>
        <Callout tone={REVIEW_TONE[response.review_status]} title={REVIEW_STATUS_LABELS[response.review_status]}>
          {response.audit_review_notes?.trim() ? (
            <p className="whitespace-pre-wrap leading-relaxed">{response.audit_review_notes}</p>
          ) : (
            <p>{T.common.none}</p>
          )}
        </Callout>
      </section>
    </div>
  );
}

/**
 * Department head records the official response.
 * Backend requires justification + attachment when disagreeing.
 */
export function RespondForm({
  rec,
  action,
  requirePlan,
  planDraft,
  planSlot,
}: {
  rec: RecommendationDetail;
  action: WorkflowAction;
  requirePlan: boolean;
  planDraft?: PlanDraft;
  planSlot?: React.ReactNode;
}) {
  useI18n();
  const [decision, setDecision] = useState<"agree" | "disagree">("agree");
  const [justification, setJustification] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const needsAttachment = decision === "disagree";
  const plan = decision === "agree" && planDraft ? toPlanPayload(planDraft) : null;
  const planReady = Boolean(plan);
  useUnsavedChanges(Boolean(justification.trim() || attachment));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (needsAttachment && !attachment) {
      setLocalError(T.response.attachmentRequired);
      return;
    }
    if (needsAttachment && !justification.trim()) {
      setLocalError(T.common.required);
      return;
    }
    if (requirePlan && decision === "agree" && !plan) {
      setLocalError(T.response.planRequired);
      return;
    }
    setLocalError(null);

    const extraFields: Record<string, string> = {
      decision,
      justification,
    };
    if (plan) extraFields.plan = JSON.stringify(plan);

    if (attachment) {
      setUploading(true);
      try {
        const payload = await prepareFileSubmission({
          file: attachment,
          purpose: "response",
          fileFieldName: "attachment",
          extraFields,
        });
        action.mutation.mutate(
          { path: "respond/", ...payload },
          { onSettled: () => setUploading(false) }
        );
      } catch (err) {
        setUploading(false);
        setLocalError(errorMessage(err));
      }
      return;
    }
    action.mutation.mutate({
      path: "respond/",
      body: {
        decision,
        justification,
        ...(plan ? { plan } : {}),
      },
    });
  };

  return (
    <div className="space-y-6">
      <FindingExcerpt rec={rec} />

      {rec.status === "returned_for_revision" && rec.response?.audit_review_notes ? (
        <Callout tone="danger" title={T.response.auditNotes}>
          <p className="whitespace-pre-wrap leading-relaxed">{rec.response.audit_review_notes}</p>
        </Callout>
      ) : null}

      <form onSubmit={submit} className="space-y-5">
        <h3 className="font-heading text-sm font-semibold text-navy">{T.case.managementResponse}</h3>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">{T.response.managementDecision}</legend>
          <ChoiceCards
            name="response-decision"
            value={decision}
            onChange={setDecision}
            options={[
              { value: "agree", label: T.response.agree, hint: T.response.agreeHint },
              { value: "disagree", label: T.response.disagree, hint: T.response.disagreeHint },
            ]}
          />
        </fieldset>

        <Field label={T.response.notes}>
          <TextArea
            rows={6}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            placeholder={T.response.justificationHint}
            required={needsAttachment}
          />
        </Field>

        <Field label={`${T.response.attachment}${needsAttachment ? " *" : ""}`} className="max-w-md">
          <input
            type="file"
            accept={FILE_INPUT_ACCEPT}
            onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
            className="block w-full border border-line bg-surface px-3 py-2 text-sm file:me-3 file:border-0 file:bg-subtle file:px-3 file:py-1 file:text-sm file:text-ink"
          />
          <p className="mt-1 text-xs text-muted">
            {needsAttachment ? T.response.attachmentRequired : T.evidenceRegister.allowedTypes}
          </p>
        </Field>

        {requirePlan && decision === "agree" && planSlot ? (
          <div className="border border-primary/25 bg-primary-light/40 p-4">
            <p className="mb-1 font-heading text-sm font-semibold text-primary-dark">{T.response.withPlan}</p>
            <p className="mb-3 text-xs text-ink-soft">{T.response.withPlanHint}</p>
            {planSlot}
            {planReady ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-success-dark">
                <CheckCircle2 className="size-3.5" />
                {T.response.withPlan}
              </p>
            ) : null}
          </div>
        ) : null}

        <ErrorBanner message={localError ?? action.error} />

        <Button type="submit" disabled={action.mutation.isPending || uploading}>
          <Send className="size-4" />
          {uploading || action.mutation.isPending ? T.common.uploading : T.response.submit}
        </Button>
      </form>
    </div>
  );
}
