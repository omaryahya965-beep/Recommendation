"use client";

import { useQueries } from "@tanstack/react-query";
import { Check, Circle, Paperclip, ChevronRight, ChevronLeft } from "lucide-react";
import Link from "next/link";

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
  const { locale } = useI18n();
  const queries = useTaskDetails(items);
  const details = queries.map((query) => query.data).filter((rec): rec is RecommendationDetail => Boolean(rec));
  
  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <Section title={T.dashboard.myPlans} hint={T.dashboard.myPlansHint} className="h-full bg-surface">
      {details.length ? (
        <ol className="grid gap-4 p-5">
          {details.map((rec) => {
            const plan = rec.action_plan;
            if (!plan) {
              return (
                <li key={rec.id} className="rounded-xl border border-line p-4 bg-subtle/30">
                  <RecordId id={rec.id} />
                  <p className="mt-2 text-[14px] font-semibold text-ink">{caseTitle(rec.text, 90)}</p>
                  <p className="mt-1.5 text-[12.5px] font-medium text-muted">{T.dashboard.noPlanYet}</p>
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
              <li key={rec.id} className="group rounded-xl border border-line bg-surface p-5 transition-all duration-200 hover:border-primary/40 hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <RecordId id={rec.id} />
                    <Link href={`${detailBase}/${rec.id}`} className="mt-2 block font-heading text-[16px] font-semibold leading-snug text-navy hover:text-primary transition-colors">
                      {caseTitle(rec.text, 90)}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-end">
                      <span className="block font-heading text-[1.25rem] font-bold leading-none text-navy" dir="ltr">
                        {progress}%
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{T.plan.progress}</span>
                    </div>
                  </div>
                </div>
                
                <ProgressBar value={progress} showValue={false} className="mt-4" tone={progress === 100 ? "success" : "primary"} />
                
                <dl className="mt-4 grid gap-x-4 gap-y-3 rounded-lg bg-subtle/50 p-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted mb-0.5">{T.dashboard.stepsDone}</dt>
                    <dd className="font-mono text-[13px] font-bold text-ink" dir="ltr">
                      {done}/{steps.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted mb-0.5">{T.plan.targetDate}</dt>
                    <dd className="font-mono text-[13px] font-bold text-ink" dir="ltr">
                      {formatDate(plan.target_date)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-muted mb-0.5">{T.dashboard.currentStep}</dt>
                    <dd className="text-[13px] font-medium text-ink-soft bg-surface rounded px-2 py-1 ring-1 ring-line/50 line-clamp-1">{current ? current.title : T.plan.done}</dd>
                  </div>
                </dl>
                
                {parsed?.evidence ? (
                  <div className="mt-3 rounded-lg border border-warning/20 bg-warning-light/30 px-3 py-2">
                    <p className="text-[12.5px] font-medium text-warning-dark flex items-center gap-1.5">
                      <Paperclip className="size-3.5 shrink-0" />
                      <span className="font-bold uppercase tracking-wide text-[10px]">{T.plan.requiredEvidence}:</span>
                      <span className="truncate">{parsed.evidence}</span>
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState compact title={T.dashboard.noPlanYet} className="border-0 shadow-none py-10" />
      )}
    </Section>
  );
}

export function EmployeeEvidence({ items, detailBase }: { items: RecommendationListItem[]; detailBase: string }) {
  const { locale } = useI18n();
  const queries = useTaskDetails(items);
  const details = queries.map((query) => query.data).filter((rec): rec is RecommendationDetail => Boolean(rec));
  
  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;

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
    <Section title={T.dashboard.myEvidence} hint={T.dashboard.myEvidenceHint} className="h-full bg-surface">
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.slice(0, 10).map((row, index) => (
            <li key={`${row.rec.id}-${index}`} className="group flex flex-wrap items-start justify-between gap-4 px-5 py-4 transition-all duration-200 hover:bg-subtle/50">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <RecordId id={row.rec.id} />
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1",
                      row.kind === "missing"
                        ? "bg-warning-light text-warning-dark ring-warning/30"
                        : row.kind === "rejected"
                          ? "bg-danger-light text-danger-dark ring-danger/30"
                          : row.kind === "in_review"
                            ? "bg-info-light text-info-dark ring-info/30"
                            : row.kind === "accepted"
                              ? "bg-success-light text-success-dark ring-success/30"
                              : "bg-subtle text-ink-soft ring-line"
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
                <p className="mt-2.5 truncate font-heading text-[14px] font-semibold text-ink group-hover:text-primary transition-colors">
                  {row.file ? fileNameFromUrl(row.file.file_url ?? row.file.file) : row.step}
                </p>
                <p className="mt-1 text-[12px] font-medium text-muted flex items-center gap-2">
                  <span className="truncate">{row.step}</span>
                  {row.file ? (
                    <>
                      <span className="text-muted/50">•</span>
                      <span className="font-mono text-[11px]" dir="ltr">
                        {formatDateTime(row.file.uploaded_at)}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <Link href={`${detailBase}/${row.rec.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[12px] font-bold text-navy ring-1 ring-line hover:bg-navy hover:text-white hover:ring-navy transition-all shadow-sm mt-1">
                {row.kind === "missing" ? <Circle className="size-3.5" /> : row.kind === "accepted" ? <Check className="size-3.5" /> : <Paperclip className="size-3.5" />}
                {T.dashboard.open}
                <DirForward className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title={T.dashboard.myEvidenceEmpty} className="border-0 shadow-none py-10" />
      )}
    </Section>
  );
}
