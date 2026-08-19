"use client";

import { useState } from "react";

import { Button, Callout, Card, ErrorBanner, Field, TextArea } from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { parseFinding } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import type { WorkflowAction } from "@/lib/hooks";
import { DECISION_LABELS, T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";

/**
 * Every accept/reject step in the backend uses the same `{ accept, notes }`
 * body, so they share one panel: review response, review plan, review
 * implementation, and the council closure decision.
 */
export function DecisionPanel({
  title,
  intro,
  path,
  action,
  acceptLabel,
  rejectLabel,
  notesLabel,
  notesHint,
  requireNotesOnReject = true,
  children,
}: {
  title: string;
  intro?: string;
  path: string;
  action: WorkflowAction;
  acceptLabel: string;
  rejectLabel: string;
  notesLabel?: string;
  notesHint?: string;
  requireNotesOnReject?: boolean;
  children?: React.ReactNode;
}) {
  useI18n();
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState<boolean | null>(null);

  /**
     Both outcomes are recorded in the audit trail under the reviewer's name and
     move the case, so both go through confirmation rather than firing on the
     first click.
   */
  const ask = (accept: boolean) => {
    if (!accept && requireNotesOnReject && !notes.trim()) {
      setLocalError(notesHint ?? T.common.required);
      return;
    }
    setLocalError(null);
    setPending(accept);
  };

  const submit = () => {
    if (pending === null) return;
    action.mutation.mutate({ path, body: { accept: pending, notes } });
    setPending(null);
  };

  return (
    <Card title={title}>
      {intro ? <p className="mb-4 text-sm leading-relaxed text-ink-soft">{intro}</p> : null}
      {children}

      <div className="mt-4 space-y-4 border-t-2 border-navy pt-5">
        <p className="font-heading text-sm font-semibold text-navy">{T.case.officialDecision}</p>
        <Field label={notesLabel ?? T.common.notes}>
          <TextArea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={notesHint} />
        </Field>

        <ErrorBanner message={localError ?? action.error} />

        <div className="flex flex-wrap gap-2 bg-inverse p-4">
          <Button className="bg-elevated text-navy hover:bg-subtle" onClick={() => ask(true)} disabled={action.mutation.isPending}>
            {acceptLabel}
          </Button>
          <Button variant="danger" onClick={() => ask(false)} disabled={action.mutation.isPending}>
            {rejectLabel}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? acceptLabel : rejectLabel}
        body={
          <>
            <p>{title}</p>
            <p className="mt-2">{T.confirm.irreversible}</p>
          </>
        }
        confirmLabel={pending ? acceptLabel : rejectLabel}
        tone={pending ? "primary" : "danger"}
        busy={action.mutation.isPending}
        onConfirm={submit}
        onCancel={() => setPending(null)}
      />
    </Card>
  );
}

/**
 * Side-by-side accountability view: what audit asked for versus what the
 * department committed to. Never mixed with the audit decision below.
 */
export function ResponseComparison({ rec }: { rec: RecommendationDetail }) {
  useI18n();
  const parsed = parseFinding(rec.text);
  const statement = parsed.sections.find((section) => section.id === "statement")?.body ?? parsed.preamble ?? rec.text;
  const response = rec.response;
  const proposed = rec.action_plan?.target_date ?? rec.target_date;
  const responsible =
    rec.action_plan?.responsible_employee_detail?.full_name_ar || rec.responsible_employee || rec.department_name;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="border-s-2 border-line ps-4">
        <p className="text-xs font-semibold text-muted">{T.auditReview.compareFinding}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-[1.9] text-ink">{statement}</p>
        {rec.root_cause?.trim() ? (
          <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
            <span className="font-semibold">{T.case.rootCause}: </span>
            {rec.root_cause}
          </p>
        ) : null}
      </section>

      <section className="border-s-2 border-primary ps-4">
        <p className="text-xs font-semibold text-primary-dark">{T.auditReview.compareResponse}</p>
        {response ? (
          <>
            <p className="mt-2 text-sm font-semibold text-ink">
              {T.response.managementDecision}: {DECISION_LABELS[response.decision]}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-[1.9] text-ink">
              {response.justification || T.common.none}
            </p>
            {response.attachment ? (
              <a
                href={response.attachment}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm font-medium text-primary-dark hover:underline"
              >
                {T.evidenceRegister.supporting}
              </a>
            ) : null}
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
              {proposed ? (
                <div>
                  <dt className="text-muted">{T.response.proposedDate}</dt>
                  <dd className="mt-0.5 font-medium text-ink" dir="ltr">
                    {formatDate(proposed)}
                  </dd>
                </div>
              ) : null}
              {responsible ? (
                <div>
                  <dt className="text-muted">{T.response.responsibleParty}</dt>
                  <dd className="mt-0.5 font-medium text-ink">{responsible}</dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{T.case.noResponseYet}</p>
        )}
      </section>
    </div>
  );
}

/** Audit accepts the response (sending the report to council) or returns it. */
export function AuditReviewPanel({ rec, action }: { rec: RecommendationDetail; action: WorkflowAction }) {
  useI18n();
  return (
    <DecisionPanel
      title={T.auditReview.title}
      intro={T.auditReview.intro}
      path="review/"
      action={action}
      acceptLabel={T.auditReview.accept}
      rejectLabel={T.auditReview.reject}
      notesLabel={T.auditReview.notes}
      notesHint={T.auditReview.notesRequired}
    >
      <ResponseComparison rec={rec} />
      {rec.response?.decision === "disagree" ? (
        <Callout tone="warning" className="mt-3">
          {T.case.disagreementCouncilNote}
        </Callout>
      ) : null}
    </DecisionPanel>
  );
}
