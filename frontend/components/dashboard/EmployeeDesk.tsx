"use client";

import { useQueries } from "@tanstack/react-query";
import { Check, Circle, Paperclip } from "lucide-react";
import Link from "next/link";

import { DirForward } from "@/components/i18n/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { ProgressBar } from "@/components/ui/Base";
import { Section } from "@/components/ui/Section";
import { api } from "@/lib/api";
import { evidenceByStep, evidenceReviewState, planProgress, sortSteps, stepState } from "@/lib/case";
import { caseTitle } from "@/lib/finding";
import { fileNameFromUrl, formatDate, formatDateTime } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { parseStep } from "@/lib/planStep";
import type { RecommendationDetail, RecommendationListItem } from "@/lib/types";
import { cn } from "@/lib/cn";

function useTaskDetails(items: RecommendationListItem[]) {
  const ids = items.slice(0, 6).map((item) => item.id);
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["recommendation", id],
      queryFn: () => api<RecommendationDetail>(`/api/recommendations/${id}/`),
      staleTime: 60_000,
    })),
  });
}

export function EmployeePlans({ items, detailBase }: { items: RecommendationListItem[]; detailBase: string }) {
  useI18n();
  const queries = useTaskDetails(items);
  const details = queries.map((query) => query.data).filter((rec): rec is RecommendationDetail => Boolean(rec));

  return (
    <Section title={T.dashboard.myPlans} hint={T.dashboard.myPlansHint} padded className="h-full">
      {details.length ? (
        <ol className="grid gap-3">
          {details.map((rec) => {
            const plan = rec.action_plan;
            if (!plan) {
              return (
                <li key={rec.id} className="rounded-(--radius-field) border border-line px-3 py-2.5">
                  <RecordId id={rec.id} />
                  <p className="mt-1 text-sm text-ink">{caseTitle(rec.text, 90)}</p>
                  <p className="mt-1 text-xs text-muted">{T.dashboard.noPlanYet}</p>
                </li>
              );
            }
            const steps = sortSteps(plan.steps);
            const current = steps.find((step) => stepState(step, steps) === "active") ?? steps.find((step) => !step.is_done);
            const next = current ? steps.find((step) => step.order > current.order && !step.is_done) : null;
            const done = steps.filter((step) => step.is_done).length;
            const parsed = current ? parseStep(current.comments) : null;
            const progress = planProgress(plan);
            return (
              <li key={rec.id} className="rounded-(--radius-field) border border-line px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <RecordId id={rec.id} />
                    <Link href={`${detailBase}/${rec.id}`} className="mt-1 block text-sm font-medium text-ink hover:text-primary-dark">
                      {caseTitle(rec.text, 90)}
                    </Link>
                  </div>
                  <span className="font-mono text-sm font-semibold text-navy" dir="ltr">
                    {progress}%
                  </span>
                </div>
                <ProgressBar value={progress} showValue={false} className="mt-2" />
                <dl className="mt-2 grid gap-2 text-[12.5px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] text-muted">{T.dashboard.stepsDone}</dt>
                    <dd className="font-mono" dir="ltr">
                      {done}/{steps.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">{T.plan.targetDate}</dt>
                    <dd className="font-mono" dir="ltr">
                      {formatDate(plan.target_date)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">{T.dashboard.currentStep}</dt>
                    <dd>{current ? current.title : T.plan.done}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted">{T.dashboard.nextStep}</dt>
                    <dd>{next ? next.title : "—"}</dd>
                  </div>
                </dl>
                {parsed?.evidence ? (
                  <p className="mt-2 text-[12.5px] text-ink">
                    <span className="text-muted">{T.plan.requiredEvidence}: </span>
                    {parsed.evidence}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState compact title={T.dashboard.noPlanYet} className="border-0 shadow-none" />
      )}
    </Section>
  );
}

export function EmployeeEvidence({ items, detailBase }: { items: RecommendationListItem[]; detailBase: string }) {
  useI18n();
  const queries = useTaskDetails(items);
  const details = queries.map((query) => query.data).filter((rec): rec is RecommendationDetail => Boolean(rec));

  const rows = details.flatMap((rec) => {
    const files = rec.evidence_files ?? [];
    const byStep = evidenceByStep(rec);
    const steps = sortSteps(rec.action_plan?.steps ?? []);
    const missing = steps
      .filter((step) => !step.is_done && !(byStep.get(step.id)?.length))
      .map((step) => ({ rec, kind: "missing" as const, step: step.title, file: null as null }));
    const uploaded = files.map((file) => ({
      rec,
      kind: evidenceReviewState(file.uploaded_at, rec),
      step: steps.find((step) => step.id === file.step)?.title ?? T.evidenceRegister.noStep,
      file,
    }));
    return [...uploaded, ...missing];
  });

  return (
    <Section title={T.dashboard.myEvidence} hint={T.dashboard.myEvidenceHint} className="h-full">
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.slice(0, 10).map((row, index) => (
            <li key={`${row.rec.id}-${index}`} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <RecordId id={row.rec.id} />
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      row.kind === "missing"
                        ? "bg-warning-light text-warning-dark"
                        : row.kind === "rejected"
                          ? "bg-danger-light text-danger-dark"
                          : row.kind === "in_review"
                            ? "bg-info-light text-info-dark"
                            : row.kind === "accepted"
                              ? "bg-success-light text-success-dark"
                              : "bg-subtle text-ink-soft"
                    )}
                  >
                    {row.kind === "missing"
                      ? T.dashboard.missingEvidence
                      : row.kind === "rejected"
                        ? T.evidenceRegister.statusRejected
                        : row.kind === "in_review"
                          ? T.evidenceRegister.statusUnderVerification
                          : row.kind === "accepted"
                            ? T.evidenceRegister.statusAccepted
                            : T.dashboard.uploadedEvidence}
                  </span>
                </div>
                <p className="mt-1 truncate text-[13px] text-ink">
                  {row.file ? fileNameFromUrl(row.file.file_url ?? row.file.file) : row.step}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {row.step}
                  {row.file ? (
                    <>
                      {" · "}
                      <span className="font-mono" dir="ltr">
                        {formatDateTime(row.file.uploaded_at)}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <Link href={`${detailBase}/${row.rec.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-dark">
                {row.kind === "missing" ? <Circle className="size-3" /> : row.kind === "accepted" ? <Check className="size-3" /> : <Paperclip className="size-3" />}
                {T.dashboard.open}
                <DirForward className="size-3" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title={T.dashboard.myEvidenceEmpty} className="border-0 shadow-none" />
      )}
    </Section>
  );
}
