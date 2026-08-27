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
    <div className="bg-subtle/50 rounded-xl p-3.5 border border-line/40">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">{label}</dt>
      <dd className="font-heading text-[1.5rem] font-bold text-navy leading-none">
        <span className="font-mono" dir="ltr">
          {value}
        </span>
        {suffix ? <span className="text-[14px] font-bold text-ink-soft ms-0.5">{suffix}</span> : null}
      </dd>
    </div>
  );
}

function FollowUpCard({ report }: { report: FollowUpReport }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const totals = report.snapshot.totals;

  return (
    <div className="bg-surface rounded-xl border border-line p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <RecordId id={report.id} prefix="FUP" />
            <span className="inline-flex items-center gap-2 text-[14px] font-bold text-navy bg-subtle/80 px-2.5 py-1 rounded-full border border-line">
              <CalendarRange className="size-4 text-muted" />
              <span className="font-mono" dir="ltr">
                {formatDate(report.period_start)} — {formatDate(report.period_end)}
              </span>
            </span>
          </div>
          <p className="mt-2 text-[12.5px] font-medium text-ink-soft">
            {T.followup.generatedBy}:{" "}
            <span className="font-bold text-ink">{report.generated_by_detail.full_name_ar || report.generated_by_detail.username}</span> ·{" "}
            <span className="font-mono text-muted" dir="ltr">
              {formatDate(report.created_at)}
            </span>
          </p>
        </div>
        <Button variant="ghost" onClick={() => setOpen((value) => !value)} className="font-bold gap-1.5 shadow-sm ring-1 ring-line">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {open ? T.followup.close : T.followup.open}
        </Button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
        <Stat label={T.stats.total} value={totals.total} />
        <Stat label={T.stats.closed} value={totals.closed} />
        <Stat label={T.stats.completionRate} value={totals.completion_rate} suffix="%" />
        <Stat label={T.stats.overdue} value={totals.overdue} />
      </dl>

      <div className="mt-4 bg-subtle/30 rounded-xl p-4 border border-line/50">
        <ProgressBar
          value={totals.completion_rate}
          tone={totals.overdue > 0 ? "warning" : "success"}
          label={T.stats.completionRate}
        />
      </div>

      {open ? (
        <div className="mt-5 space-y-3 animate-scale-in">
          <h4 className="font-heading text-sm font-bold text-navy flex items-center gap-2">
            <span className="h-3 w-1 rounded-full bg-primary" aria-hidden />
            {T.followup.snapshot}
          </h4>
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
              <tr key={item.id} className="group transition-colors hover:bg-subtle/60">
                < LedgerCell mono>
                  <RecordId id={item.id} />
                </LedgerCell>
                <LedgerCell className="max-w-md">
                  <span className="line-clamp-2 font-medium text-ink group-hover:text-primary transition-colors">{caseTitle(item.text, 120)}</span>
                </LedgerCell>
                <LedgerCell>{item.department}</LedgerCell>
                <LedgerCell>
                  <RiskBadge level={item.risk_level} />
                </LedgerCell>
                <LedgerCell>
                  <StampBadge status={item.status} />
                </LedgerCell>
                <LedgerCell mono>
                  <span className="inline-flex items-center gap-2">
                    <time className="font-mono text-muted" dir="ltr">{formatDate(item.target_date)}</time>
                    <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
                  </span>
                </LedgerCell>
              </tr>
            ))}
          </LedgerTable>
        </div>
      ) : null}
    </div>
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
    <div className="space-y-6">
      {actions}
      <Callout tone="neutral" className="shadow-sm">{T.followup.immutable}</Callout>

      {reports.length ? (
        <div className="space-y-4">
          {reports.map((report) => (
            <FollowUpCard key={report.id} report={report} />
          ))}
        </div>
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
