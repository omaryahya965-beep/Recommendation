"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Button, Callout, Card, ErrorBanner, ProgressBar } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { LedgerCell, LedgerTable, RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StampBadge } from "@/components/ui/StampBadge";
import { api } from "@/lib/api";
import { caseTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { FollowUpReport, Paginated } from "@/lib/types";

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  useI18n();
  return (
    <div>
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="font-heading text-xl font-bold text-navy">
        <span className="font-mono" dir="ltr">
          {value}
        </span>
        {suffix ? <span className="text-sm font-medium text-ink-soft">{suffix}</span> : null}
      </dd>
    </div>
  );
}

function FollowUpCard({ report }: { report: FollowUpReport }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const totals = report.snapshot.totals;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <RecordId id={report.id} prefix="FUP" />
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
              <CalendarRange className="size-3.5 text-muted" />
              <span className="font-mono" dir="ltr">
                {formatDate(report.period_start)} — {formatDate(report.period_end)}
              </span>
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {T.followup.generatedBy}:{" "}
            {report.generated_by_detail.full_name_ar || report.generated_by_detail.username} ·{" "}
            <span className="font-mono" dir="ltr">
              {formatDate(report.created_at)}
            </span>
          </p>
        </div>
        <Button variant="ghost" onClick={() => setOpen((value) => !value)}>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {open ? T.followup.close : T.followup.open}
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
        <Stat label={T.stats.total} value={totals.total} />
        <Stat label={T.stats.closed} value={totals.closed} />
        <Stat label={T.stats.completionRate} value={totals.completion_rate} suffix="%" />
        <Stat label={T.stats.overdue} value={totals.overdue} />
      </dl>

      <ProgressBar
        value={totals.completion_rate}
        tone={totals.overdue > 0 ? "warning" : "success"}
        label={T.stats.completionRate}
        className="mt-3"
      />

      {open ? (
        <div className="mt-4 space-y-2">
          <h4 className="font-heading text-sm font-semibold text-navy">{T.followup.snapshot}</h4>
          <LedgerTable
            headers={[
              T.table.number,
              T.table.recommendation,
              T.common.department,
              T.common.risk,
              T.common.status,
              T.common.targetDate,
            ]}
            empty={T.common.noResults}
          >
            {report.snapshot.items.map((item) => (
              <tr key={item.id} className="hover:bg-primary-light/50">
                <LedgerCell mono>
                  <RecordId id={item.id} />
                </LedgerCell>
                <LedgerCell className="max-w-md">
                  <span className="line-clamp-2">{caseTitle(item.text, 120)}</span>
                </LedgerCell>
                <LedgerCell>{item.department}</LedgerCell>
                <LedgerCell>
                  <RiskBadge level={item.risk_level} />
                </LedgerCell>
                <LedgerCell>
                  <StampBadge status={item.status} />
                </LedgerCell>
                <LedgerCell mono>
                  <span className="inline-flex items-center gap-1.5">
                    <time dir="ltr">{formatDate(item.target_date)}</time>
                    <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                  </span>
                </LedgerCell>
              </tr>
            ))}
          </LedgerTable>
        </div>
      ) : null}
    </Card>
  );
}

export function FollowUpList({ actions }: { actions?: React.ReactNode }) {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["followups"],
    queryFn: () => api<Paginated<FollowUpReport>>("/api/followup-reports/"),
  });

  if (isLoading) return <TableSkeleton />;
  if (isError) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const reports = data?.results ?? [];

  return (
    <div className="space-y-4">
      {actions}
      <Callout tone="neutral">{T.followup.immutable}</Callout>

      {reports.length ? (
        <div className="space-y-4">
          {reports.map((report) => (
            <FollowUpCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarRange className="size-6" />}
          title={T.followup.empty}
          description={T.followup.emptyHint}
        />
      )}
    </div>
  );
}
