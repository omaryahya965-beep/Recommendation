"use client";

import { FileCheck2, FolderOpen, Info, Trash2 } from "lucide-react";
import { useState } from "react";

import { EvidenceCard } from "@/components/evidence/EvidenceCard";
import { EvidenceFileActions, evidenceFileName } from "@/components/evidence/EvidenceFileActions";
import { EvidenceUploadForm } from "@/components/evidence/EvidenceUploadForm";
import { AIEvidenceAnalysis } from "@/components/ai/AIEvidenceAnalysis";
import { Button, Callout } from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { evidenceReviewState, sortSteps, type EvidenceReviewState } from "@/lib/case";
import { fileExt, fileNameFromUrl, formatDateTime } from "@/lib/format";
import type { WorkflowAction } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { Evidence, RecommendationDetail } from "@/lib/types";

function reviewStateMeta(state: EvidenceReviewState) {
  const map: Record<EvidenceReviewState, { label: string; className: string }> = {
    submitted: {
      label: T.evidenceRegister.statusUploaded,
      className: "text-ink-soft",
    },
    in_review: {
      label: T.evidenceRegister.statusUnderVerification,
      className: "text-info-dark",
    },
    accepted: {
      label: T.evidenceRegister.statusAccepted,
      className: "text-success-dark",
    },
    rejected: {
      label: T.evidenceRegister.statusRejected,
      className: "text-danger-dark",
    },
  };
  return map[state];
}

function EvidenceItem({
  evidence,
  stepTitle,
  reviewState,
  canAnalyze,
  canDelete,
  deleting,
  onDelete,
  actionColSpan,
}: {
  evidence: Evidence;
  stepTitle?: string;
  reviewState: EvidenceReviewState;
  canAnalyze: boolean;
  canDelete: boolean;
  deleting: boolean;
  onDelete?: () => void;
  actionColSpan: number;
}) {
  useI18n();
  const review = reviewStateMeta(reviewState);
  const [open, setOpen] = useState(false);
  const name = evidenceFileName(evidence);

  return (
    <>
      <tr
        data-testid="evidence-item"
        className="cursor-pointer align-top hover:bg-subtle/50"
        onClick={() => setOpen((value) => !value)}
      >
        <td className="px-4 py-3">
          <p className="truncate font-medium text-ink" title={name}>
            {name}
          </p>
        </td>
        <td className="px-3 py-3 text-ink-soft">{stepTitle ?? T.evidenceRegister.noStep}</td>
        <td className="px-3 py-3 text-ink-soft">
          {evidence.uploaded_by_detail?.full_name_ar || evidence.uploaded_by_detail?.username}
        </td>
        <td className="px-3 py-3 font-mono text-[12px] text-muted" dir="ltr">
          {formatDateTime(evidence.uploaded_at)}
        </td>
        <td className="px-3 py-3 font-mono text-[11px] text-ink-soft">{fileExt(name)}</td>
        <td className="max-w-xs px-3 py-3">
          <p className={cn("line-clamp-2 text-[13px]", evidence.notes?.trim() ? "text-ink" : "text-muted")}>
            {evidence.notes?.trim() || T.evidenceRegister.noDescription}
          </p>
        </td>
        <td className="px-4 py-3">
          <span className={cn("text-[12px] font-medium", review.className)}>{review.label}</span>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-start gap-2">
            <EvidenceFileActions evidence={evidence} size="sm" />
            {onDelete && canDelete ? (
              <button
                type="button"
                aria-label={T.evidenceRegister.deleteFile}
                disabled={deleting}
                className="rounded-md border border-line bg-surface p-1.5 text-danger-dark transition-colors hover:bg-danger-light disabled:opacity-50"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={actionColSpan} className="bg-subtle/40 px-4 py-4">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-[11px] text-muted">{T.evidenceRegister.file}</dt>
                <dd className="mt-0.5 text-sm text-ink">{name}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">{T.evidenceRegister.uploadedBy}</dt>
                <dd className="mt-0.5 text-sm text-ink">
                  {evidence.uploaded_by_detail?.full_name_ar || evidence.uploaded_by_detail?.username}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">{T.evidenceRegister.uploadedAt}</dt>
                <dd className="mt-0.5 font-mono text-sm text-ink" dir="ltr">
                  {formatDateTime(evidence.uploaded_at)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">{T.evidenceRegister.stage}</dt>
                <dd className="mt-0.5 text-sm text-ink">{stepTitle ?? T.evidenceRegister.noStep}</dd>
              </div>
            </dl>
            <p className="mt-3">
              <span className="block text-[11px] text-muted">{T.evidenceRegister.purpose}</span>
              <span className="mt-0.5 block whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {evidence.notes?.trim() || T.evidenceRegister.noDescription}
              </span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {canDelete && onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="border-danger/30 text-danger-dark"
                  disabled={deleting}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="size-4" />
                  {T.evidenceRegister.deleteFile}
                </Button>
              ) : null}
              <span className="text-[12px] text-ink-soft">{T.evidenceRegister.uploadedLabel}</span>
              {reviewState === "accepted" ? (
                <span className="text-[12px] font-medium text-success-dark">{T.evidenceRegister.verifiedLabel}</span>
              ) : (
                <span className="text-[12px] text-muted">{T.evidenceRegister.uploadNotVerify}</span>
              )}
            </div>
            {canAnalyze ? (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-[11px] font-medium text-ai-dark">{T.evidenceRegister.aiDisclaimer}</p>
                <AIEvidenceAnalysis evidenceId={evidence.id} />
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * Evidence register as a ledger. Upload is never verification. Whether a
 * file may be deleted is the server's answer (`can_delete`), which applies
 * the same rule as the delete endpoint.
 */
export function EvidenceRegister({
  rec,
  canUpload,
  showUploadForm = canUpload,
  canAnalyze,
  action,
}: {
  rec: RecommendationDetail;
  /** The user may attach evidence now (here or elsewhere on the page). */
  canUpload: boolean;
  /** Show the upload form above the list (off when a desk above holds it). */
  showUploadForm?: boolean;
  canAnalyze: boolean;
  action?: WorkflowAction;
}) {
  useI18n();
  const [pendingDelete, setPendingDelete] = useState<Evidence | null>(null);

  const steps = sortSteps(rec.action_plan?.steps ?? []);
  const stepTitles = new Map(steps.map((item) => [item.id, item.title]));
  const files = rec.evidence_files ?? [];
  const deletable = (item: Evidence) => Boolean(action && item.can_delete);
  const actionColSpan = 8;

  return (
    <div className="space-y-5">
      <Callout tone="neutral" icon={<Info className="size-4" />}>
        {T.evidenceRegister.uploadNotVerify}
      </Callout>

      {showUploadForm && action ? (
        <section className="space-y-3 border-b border-line pb-5">
          <h3 className="font-heading text-sm font-semibold text-navy">{T.evidenceRegister.uploadTitle}</h3>
          <EvidenceUploadForm rec={rec} action={action} />
        </section>
      ) : null}

      <section>
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-heading text-sm font-semibold text-navy">{T.evidenceRegister.title}</h3>
          <span className="font-mono text-xs text-muted" dir="ltr">
            {files.length}
          </span>
        </header>
        <p className="mb-3 text-[12px] text-muted">{T.evidenceRegister.derivedNote}</p>

        {files.length ? (
          <>
            <ul className="space-y-3 md:hidden">
              {files.map((item) => (
                <li key={item.id}>
                  <EvidenceCard evidence={item} showAnalysis={canAnalyze} />
                  {deletable(item) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 min-h-11 w-full"
                      onClick={() => setPendingDelete(item)}
                    >
                      <Trash2 className="size-4" />
                      {T.common.delete}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="hidden scrollbar-thin overflow-x-auto md:block">
              <table className="w-full min-w-[52rem] border-collapse text-[13px]">
                <thead>
                  <tr className="border-y border-line bg-subtle/50 text-start text-[11.5px] font-medium text-ink-soft">
                    <th scope="col" className="px-4 py-2 text-start font-medium">
                      {T.evidenceRegister.file}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {T.evidenceRegister.linkedTo}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {T.evidenceRegister.uploadedBy}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {T.common.date}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {T.evidenceRegister.fileType}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {T.evidenceRegister.proves}
                    </th>
                    <th scope="col" className="px-4 py-2 text-start font-medium">
                      {T.common.status}
                    </th>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {T.common.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {files.map((item) => (
                    <EvidenceItem
                      key={item.id}
                      evidence={item}
                      stepTitle={item.step ? stepTitles.get(item.step) : undefined}
                      reviewState={evidenceReviewState(item.uploaded_at, rec)}
                      canAnalyze={canAnalyze}
                      canDelete={deletable(item)}
                      deleting={Boolean(action?.mutation.isPending)}
                      onDelete={() => setPendingDelete(item)}
                      actionColSpan={actionColSpan}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<FolderOpen className="size-6" />}
            title={T.case.noEvidenceYet}
            description={canUpload ? T.evidenceRegister.intro : T.case.notAvailableYet}
            className="border-dashed shadow-none"
          />
        )}
      </section>

      {rec.response?.attachment ? (
        <section className="border-t border-line pt-4">
          <h3 className="mb-2 font-heading text-sm font-semibold text-navy">{T.evidenceRegister.supporting}</h3>
          <a
            href={rec.response.attachment}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 border border-line bg-subtle px-3 py-2 text-sm font-medium text-primary-dark hover:border-primary/40"
          >
            <FileCheck2 className="size-4" />
            {fileNameFromUrl(rec.response.attachment)}
          </a>
          <p className="mt-2 text-xs text-muted">{T.evidenceRegister.distinction}</p>
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={T.evidenceRegister.deleteFile}
        body={T.evidenceRegister.deleteConfirm}
        confirmLabel={T.common.delete}
        tone="danger"
        busy={Boolean(action?.mutation.isPending)}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete || !action) return;
          action.mutation.mutate(
            {
              path: `evidence/${pendingDelete.id}/delete/`,
              successMessage: T.evidenceRegister.deleted,
            },
            { onSuccess: () => setPendingDelete(null) }
          );
        }}
      />
    </div>
  );
}
