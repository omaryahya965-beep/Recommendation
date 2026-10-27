"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarRange, ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";

import { FollowUpReportView } from "@/components/followup/FollowUpReportView";
import { Button, ErrorBanner } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { MODERATE } from "@/lib/queryPolicy";
import type { FollowUpPreview, FollowUpReport, Paginated } from "@/lib/types";

/** A preview, shown in full while the auditor decides to save it. Once saved it is no longer session-only. */
export function FollowUpSessionCard({ preview, saved = false }: { preview: FollowUpPreview; saved?: boolean }) {
  useI18n();
  return (
    <div className="space-y-3">
      {saved ? null : <p className="text-[12.5px] font-medium text-ink-soft">{T.followup.sessionOnly}</p>}
      <FollowUpReportView
        snapshot={preview.snapshot}
        summary={preview.executive_summary}
        periodStart={String(preview.period_start)}
        periodEnd={String(preview.period_end)}
      />
    </div>
  );
}

function ArchiveCard({ report }: { report: FollowUpReport }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const snapshot = report.snapshot;
  const totals = snapshot.totals;
  return (
    <li className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <RecordId id={report.id} prefix="FUP" />
            <span className="inline-flex items-center gap-2 text-[14px] font-bold text-navy">
              <CalendarRange className="size-4 text-muted" aria-hidden />
              <span className="font-mono" dir="ltr">
                {formatDate(report.period_start)} — {formatDate(report.period_end)}
              </span>
            </span>
          </div>
          {snapshot.as_of_date ? (
            <p className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary-dark">
              <CalendarClock className="size-3.5" aria-hidden />
              {T.followup.asOf}: <span className="font-mono" dir="ltr">{formatDate(snapshot.as_of_date)}</span>
            </p>
          ) : null}
          <p className="text-[12.5px] text-ink-soft">
            {T.followup.generatedBy}:{" "}
            <span className="font-bold text-ink">
              {report.generated_by_detail.full_name_ar || report.generated_by_detail.username}
            </span>{" "}
            · <span className="font-mono" dir="ltr">{formatDate(report.created_at)}</span>
          </p>
        </div>
        <dl className="flex flex-wrap gap-4 text-center">
          <div>
            <dt className="text-[11px] font-semibold text-muted">{T.stats.total}</dt>
            <dd className="font-mono text-[18px] font-bold text-navy" dir="ltr">{totals.total}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-muted">{T.stats.overdue}</dt>
            <dd className="font-mono text-[18px] font-bold text-danger-dark" dir="ltr">{totals.overdue}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-muted">{T.stats.completionRate}</dt>
            <dd className="font-mono text-[18px] font-bold text-navy" dir="ltr">{totals.completion_rate}%</dd>
          </div>
        </dl>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="gap-1.5 font-bold ring-1 ring-line"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {open ? T.followup.hideReport : T.followup.viewReport}
        </Button>
      </div>
      {open ? (
        <div className="border-t border-line p-5">
          <FollowUpReportView
            snapshot={snapshot}
            summary={report.executive_summary}
            periodStart={report.period_start}
            periodEnd={report.period_end}
            reportId={report.id}
            generatedAt={report.created_at}
            generatedBy={report.generated_by_detail}
          />
        </div>
      ) : null}
    </li>
  );
}

/** The archive of saved (frozen) follow-up reports. */
export function FollowUpList({ actions }: { actions?: ReactNode }) {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["followups"],
    queryFn: () => api<Paginated<FollowUpReport>>("/api/followup-reports/"),
    ...MODERATE,
  });
  const reports = data?.results ?? [];

  return (
    <div className="space-y-6">
      {actions}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : reports.length ? (
        <ul className="space-y-4">
          {reports.map((report) => (
            <ArchiveCard key={report.id} report={report} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<CalendarRange className="size-8" />}
          title={T.followup.empty}
          description={T.followup.emptyHint}
          className="bg-surface py-16"
        />
      )}
    </div>
  );
}
