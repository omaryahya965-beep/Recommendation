"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Send, Stamp } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { DirBack } from "@/components/i18n/DirIcon";

import { ReportPipeline, REPORT_STATUS_FAMILY } from "@/components/reports/ReportPipeline";
import { Button, DataField, ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api, errorMessage } from "@/lib/api";
import { invalidateRecommendationViews } from "@/lib/queryPolicy";
import { caseTitle } from "@/lib/finding";
import { formatDate, recordCode } from "@/lib/format";
import { REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, RISK_LABELS, T, useI18n } from "@/lib/i18n";
import { MODERATE } from "@/lib/queryPolicy";
import type { AuditReport } from "@/lib/types";
import { stageForStatus } from "@/lib/workflow";

export default function ReportDetailPage() {
  useI18n();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: report, isLoading, isError, refetch } = useQuery({
    queryKey: ["report", id],
    queryFn: () => api<AuditReport>(`/api/reports/${id}/`),
    ...MODERATE,
  });

  const reportAction = useMutation({
    mutationFn: (path: string) => api(`/api/reports/${id}/${path}`, { method: "POST" }),
    onSuccess: () => {
      setError(null);
      // Report actions move every recommendation in the report at once.
      invalidateRecommendationViews(queryClient, { reportId: id, allCases: true });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !report) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const recommendations = report.recommendations ?? [];
  const isDraft = report.status === "draft";
  const canSendToDepartment = isDraft && recommendations.length > 0;
  const high = recommendations.filter((item) => item.risk_level === "high").length;
  const medium = recommendations.filter((item) => item.risk_level === "medium").length;
  const low = recommendations.filter((item) => item.risk_level === "low").length;

  return (
    <article className="animate-fade-in space-y-8">
      <header className="border-b border-line pb-5">
        <Link
          href="/audit/reports"
          className="inline-flex min-h-11 items-center gap-1.5 text-[14px] text-ink-soft"
        >
          <DirBack className="size-4" />
          {T.reports.title}
        </Link>
        <p className="mt-3 font-mono text-sm text-muted" dir="ltr">
          {recordCode(report.id, "RPT")}
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-heading text-xl font-bold text-navy md:text-[1.6rem]">{report.title}</h1>
          <StatusBadge
            status={REPORT_STATUS_FAMILY[report.status]}
            label={REPORT_STATUS_LABELS[report.status]}
            size="lg"
          />
        </div>
        <p className="mt-1 text-sm text-ink-soft">{T.reports.document}</p>
      </header>

      <section>
        <h2 className="mb-3 font-heading text-sm font-semibold text-navy">{T.reports.identity}</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DataField label={T.reports.objective}>{REPORT_TYPE_LABELS[report.engagement_type]}</DataField>
          <DataField label={T.reports.scope}>{report.department_name}</DataField>
          <DataField label={T.common.department}>{report.department_name}</DataField>
          <DataField label={T.reports.period}>
            <span dir="ltr">
              {formatDate(report.created_at)} — {formatDate(report.response_deadline)}
            </span>
          </DataField>
          <DataField label={T.create.auditor}>
            {report.created_by_detail?.full_name_ar || report.created_by_detail?.username || "—"}
          </DataField>
          <DataField label={T.create.deadline}>
            <span dir="ltr">{formatDate(report.response_deadline)}</span>
          </DataField>
          <DataField label={T.reports.approvedAt}>
            <span dir="ltr">{formatDate(report.council_approval_date)}</span>
          </DataField>
          <DataField label={T.common.status}>{REPORT_STATUS_LABELS[report.status]}</DataField>
        </dl>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-sm font-semibold text-navy">{T.reports.lifecycle}</h2>
        <ReportPipeline status={report.status} />
      </section>

      <ErrorBanner message={error} />

      {isDraft || report.status === "under_review" ? (
        <section className="border border-inverse bg-inverse p-4 text-on-inverse">
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            {isDraft ? (
              <>
                <Link href={`/audit/recommendations/new?report=${report.id}`} className="w-full md:w-auto">
                  <Button variant="secondary" className="w-full border-on-inverse/30 bg-elevated text-navy hover:bg-subtle md:w-auto">
                    <Plus className="size-4" />
                    {T.reports.addRecommendation}
                  </Button>
                </Link>
                <Button
                  className="w-full bg-elevated text-navy hover:bg-subtle md:w-auto"
                  onClick={() => reportAction.mutate("submit-to-department/")}
                  disabled={reportAction.isPending || !canSendToDepartment}
                >
                  <Send className="size-4" />
                  {T.reports.submitToDepartment}
                </Button>
              </>
            ) : (
              <Button
                className="w-full bg-elevated text-navy hover:bg-subtle md:w-auto"
                onClick={() => reportAction.mutate("submit-to-council/")}
                disabled={reportAction.isPending}
              >
                <Stamp className="size-4" />
                {T.reports.submitToCouncil}
              </Button>
            )}
          </div>
          {isDraft && !canSendToDepartment ? (
            <p className="mt-3 text-sm text-warning-light">{T.reports.needsRecommendations}</p>
          ) : (
            <p className="mt-3 text-sm text-on-inverse/80">{T.reports.lifecycleHint}</p>
          )}
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-base font-semibold text-navy">
            {T.reports.findings}
            <span className="ms-2 font-mono text-sm font-normal text-muted" dir="ltr">
              {recommendations.length}
            </span>
          </h2>
          {recommendations.length ? (
            <p className="text-[12px] text-ink-soft">
              {T.reports.riskSummary}: {RISK_LABELS.high} {high} · {RISK_LABELS.medium} {medium} · {RISK_LABELS.low}{" "}
              {low}
            </p>
          ) : null}
        </div>

        {recommendations.length ? (
          <ol className="space-y-3 md:space-y-0 md:divide-y md:border-y md:border-line md:divide-line">
            {recommendations.map((item, index) => {
              const stage = stageForStatus(item.status);
              return (
                <li key={item.id} className="rounded-xl border border-line bg-surface p-4 md:rounded-none md:border-0 md:bg-transparent md:py-4">
                  <Link href={`/audit/recommendations/${item.id}`} className="group block">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[12px] text-muted" dir="ltr">
                          {String(index + 1).padStart(2, "0")} · {recordCode(item.id)}
                        </p>
                        <p className="mt-1 font-heading text-[15px] font-semibold text-ink group-hover:text-primary-dark">
                          {caseTitle(item.text, 140)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <RiskBadge level={item.risk_level} />
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                    <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
                      <div>
                        <dt className="text-[11px] text-muted">{T.case.currentStage}</dt>
                        <dd className="text-ink">{stage.label}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted">{T.common.responsible}</dt>
                        <dd className="text-ink">{item.responsible_employee ?? T.common.none}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted">{T.common.targetDate}</dt>
                        <dd className="inline-flex items-center gap-2 text-ink">
                          <span dir="ltr">{formatDate(item.target_date)}</span>
                          {item.target_date ? (
                            <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                          ) : null}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState
            icon={<FileText className="size-6" />}
            title={T.reports.noRecommendations}
            description={isDraft ? T.empty.recommendationsHint : T.reports.draftOnlyEditable}
          />
        )}
      </section>
    </article>
  );
}
