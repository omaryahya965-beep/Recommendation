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
    <section className="border-b border-line pb-6 space-y-4">
      <h3 className="font-heading text-sm font-bold text-navy uppercase tracking-wider">{T.response.recommendation}</h3>
      <ProseBlock label={T.create.statement} className="bg-subtle/30 rounded-xl p-4 border border-line/50">{body}</ProseBlock>
      {action ? (
        <ProseBlock label={T.workflow.requiredAction} className="bg-subtle/30 rounded-xl p-4 border border-line/50">{action}</ProseBlock>
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
        icon={<MessageSquareWarning className="size-8" />}
        title={T.case.noResponseYet}
        description={T.case.notAvailableYet}
        className="bg-surface py-12"
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

      <section className="bg-surface border border-line rounded-xl p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-heading text-[15px] font-bold text-navy flex items-center gap-2">
            <span className="h-3.5 w-1 rounded-full bg-primary" aria-hidden />
            {T.case.managementResponse}
          </h3>
          <span
            className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-wider ring-1 ${
              agreed
                ? "border-success/25 bg-success-light text-success-dark ring-success/20"
                : "border-danger/25 bg-danger-light text-danger-dark ring-danger/20"
            }`}
          >
            {agreed ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
            {T.response.managementDecision}: {DECISION_LABELS[response.decision]}
          </span>
        </div>

        {response.justification?.trim() ? (
          <ProseBlock label={T.response.notes} className="bg-subtle/30 rounded-xl p-4 border border-line/60">{response.justification}</ProseBlock>
        ) : (
          <p className="text-sm text-muted">{T.common.none}</p>
        )}

        {response.attachment ? (
          <a
            href={response.attachment}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-subtle px-4 py-2.5 text-[13.5px] font-bold text-primary-dark hover:border-primary/45 transition-colors shadow-sm"
          >
            <Paperclip className="size-4 shrink-0" />
            {T.evidenceRegister.supporting}
          </a>
        ) : null}

        <dl className="mt-5 grid gap-4 border-t border-line pt-5 bg-subtle/30 rounded-xl p-4 sm:grid-cols-2 lg:grid-cols-4">
          <DataField label={T.response.submittedBy}>
            <span className="font-bold text-navy">{response.submitted_by_detail?.full_name_ar || response.submitted_by_detail?.username}</span>
          </DataField>
          <DataField label={T.common.date}>
            <span className="font-mono font-medium text-ink-soft" dir="ltr">{formatDateTime(response.created_at)}</span>
          </DataField>
          {proposed ? (
            <DataField label={T.response.proposedDate}>
              <span className="font-mono font-medium text-ink-soft" dir="ltr">{formatDate(proposed)}</span>
            </DataField>
          ) : null}
          {responsible ? <DataField label={T.response.responsibleParty}><span className="font-bold text-navy">{responsible}</span></DataField> : null}
        </dl>
      </section>

      <section className="border-t border-line pt-6">
        <h3 className="mb-4 font-heading text-[15px] font-bold text-navy flex items-center gap-2">
          <span className="h-3.5 w-1 rounded-full bg-primary" aria-hidden />
          {T.case.auditDecision}
        </h3>
        <Callout tone={REVIEW_TONE[response.review_status]} title={REVIEW_STATUS_LABELS[response.review_status]} className="shadow-sm border-s-4">
          {response.audit_review_notes?.trim() ? (
            <p className="whitespace-pre-wrap leading-relaxed text-[13.5px] font-medium">{response.audit_review_notes}</p>
          ) : (
            <p className="text-[13.5px] font-medium">{T.common.none}</p>
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
        <Callout tone="danger" title={T.response.auditNotes} className="border-s-4">
          <p className="whitespace-pre-wrap leading-relaxed text-[13.5px] font-medium">{rec.response.audit_review_notes}</p>
        </Callout>
      ) : null}

      <form onSubmit={submit} className="space-y-6 bg-surface border border-line rounded-xl p-5 shadow-sm">
        <h3 className="font-heading text-[15px] font-bold text-navy flex items-center gap-2 pb-3 border-b border-line">
          <span className="h-3.5 w-1 rounded-full bg-primary" aria-hidden />
          {T.case.managementResponse}
        </h3>

        <fieldset>
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{T.response.managementDecision}</legend>
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
            className="block w-full border border-line bg-surface px-3.5 py-2.5 text-sm file:me-3 file:border-0 file:bg-subtle file:px-3 file:py-1 file:text-sm file:text-ink rounded-lg shadow-sm"
          />
          <p className="mt-1.5 text-xs text-muted">
            {needsAttachment ? T.response.attachmentRequired : T.evidenceRegister.allowedTypes}
          </p>
        </Field>

        {requirePlan && decision === "agree" && planSlot ? (
          <div className="border border-primary/20 bg-primary-light/30 p-5 rounded-xl space-y-3">
            <div>
              <p className="font-heading text-[14.5px] font-bold text-primary-dark">{T.response.withPlan}</p>
              <p className="text-[12px] font-medium text-ink-soft">{T.response.withPlanHint}</p>
            </div>
            {planSlot}
            {planReady ? (
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-success-dark bg-success-light/50 px-2.5 py-0.5 rounded-full border border-success/20 ring-1 ring-success/10">
                <CheckCircle2 className="size-3.5" />
                {T.response.withPlan}
              </p>
            ) : null}
          </div>
        ) : null}

        <ErrorBanner message={localError ?? action.error} />

        <Button type="submit" disabled={action.mutation.isPending || uploading} className="font-bold gap-2 shadow-md">
          <Send className="size-4" />
          {uploading || action.mutation.isPending ? T.common.uploading : T.response.submit}
        </Button>
      </form>
    </div>
  );
}
