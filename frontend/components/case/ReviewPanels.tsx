"use client";

import { useState } from "react";

import { Button, Callout, Card, ErrorBanner, Field, TextArea } from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { parseFinding } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import type { WorkflowAction } from "@/lib/hooks";
import { DECISION_LABELS, T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";
import { cn } from "@/lib/cn";

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
    <Card title={title} className="overflow-hidden border-t-4 border-t-primary">
      {intro ? <p className="mb-4 text-[13.5px] leading-relaxed text-ink-soft">{intro}</p> : null}
      {children}

      <div className="mt-5 space-y-4 border-t border-line pt-5">
        <p className="font-heading text-sm font-bold text-navy uppercase tracking-wider">{T.case.officialDecision}</p>
        <Field label={notesLabel ?? T.common.notes}>
          <TextArea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={notesHint} />
        </Field>

        <ErrorBanner message={localError ?? action.error} />

        <div className="flex flex-wrap gap-3 bg-navy/5 rounded-xl p-4 border border-line">
          <Button className="bg-primary text-white hover:bg-primary-dark font-bold shadow-md" onClick={() => ask(true)} disabled={action.mutation.isPending}>
            {acceptLabel}
          </Button>
          <Button variant="danger" className="font-bold shadow-md" onClick={() => ask(false)} disabled={action.mutation.isPending}>
            {rejectLabel}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? acceptLabel : rejectLabel}
        body={
          <div className="space-y-2">
            <p className="font-bold text-navy text-[15px]">{title}</p>
            <p className="text-[13px] text-ink-soft">{T.confirm.irreversible}</p>
          </div>
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
      <section className="border-s-4 border-line/60 bg-subtle/25 rounded-e-xl p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">{T.auditReview.compareFinding}</p>
        <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-[1.8] text-ink font-medium">{statement}</p>
        {rec.root_cause?.trim() ? (
          <div className="mt-3 border-t border-line/50 pt-3 text-[12px] leading-relaxed text-ink-soft">
            <span className="font-bold uppercase tracking-wide text-[10px] text-muted block mb-1">{T.case.rootCause}</span>
            <p className="font-medium">{rec.root_cause}</p>
          </div>
        ) : null}
      </section>

      <section className="border-s-4 border-primary bg-primary-light/10 rounded-e-xl p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-primary-dark">{T.auditReview.compareResponse}</p>
        {response ? (
          <div className="space-y-3 mt-3">
            <span className="inline-flex rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary-dark uppercase tracking-wider border border-primary/25">
              {T.response.managementDecision}: {DECISION_LABELS[response.decision]}
            </span>
            <p className="whitespace-pre-wrap text-[13.5px] leading-[1.8] text-ink font-medium">
              {response.justification || T.common.none}
            </p>
            {response.attachment ? (
              <a
                href={response.attachment}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded bg-surface border border-line px-3 py-1.5 text-xs font-bold text-primary-dark hover:border-primary/45 transition-colors shadow-sm"
              >
                {T.evidenceRegister.supporting}
              </a>
            ) : null}
            <dl className="grid gap-3 text-xs sm:grid-cols-2 bg-surface/50 border border-line rounded-lg p-2.5">
              {proposed ? (
                <div>
                  <dt className="text-muted font-bold uppercase tracking-wider text-[9px] mb-0.5">{T.response.proposedDate}</dt>
                  <dd className="font-mono font-bold text-navy" dir="ltr">
                    {formatDate(proposed)}
                  </dd>
                </div>
              ) : null}
              {responsible ? (
                <div>
                  <dt className="text-muted font-bold uppercase tracking-wider text-[9px] mb-0.5">{T.response.responsibleParty}</dt>
                  <dd className="font-bold text-navy truncate">{responsible}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : (
          <p className="mt-3 text-sm font-medium text-muted">{T.case.noResponseYet}</p>
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
        <Callout tone="warning" className="mt-4 border-s-4 shadow-sm">
          {T.case.disagreementCouncilNote}
        </Callout>
      ) : null}
    </DecisionPanel>
  );
}
