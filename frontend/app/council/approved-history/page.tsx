"use client";

import { useQuery } from "@tanstack/react-query";
import { Archive } from "lucide-react";

import { Card, DataField, ErrorBanner } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ENGAGEMENT_LABELS, T, useI18n } from "@/lib/i18n";
import type { AuditReport, Paginated } from "@/lib/types";

export default function ApprovedHistoryPage() {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reports", "ratified"],
    queryFn: () => api<Paginated<AuditReport>>("/api/reports/?status=ratified&page_size=100"),
  });

  if (isLoading) return <TableSkeleton />;
  if (isError) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const reports = data?.results ?? [];

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={T.nav.approvedHistory}
        description={T.council.historySubtitle}
      />

      {reports.length ? (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <RecordId id={report.id} prefix="RPT" />
                  <h2 className="mt-1.5 font-heading text-[15px] font-semibold text-ink">{report.title}</h2>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-success/25 bg-success-light px-2.5 py-1 text-[12px] font-medium text-success-dark">
                  <Archive className="size-3.5" />
                  {T.council.ratified}
                </span>
              </div>

              <dl className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
                <DataField label={T.common.department}>{report.department_name}</DataField>
                <DataField label={T.create.engagement}>
                  {ENGAGEMENT_LABELS[report.engagement_type]}
                </DataField>
                <DataField label={T.nav.recommendations}>
                  <span dir="ltr">{report.recommendations_count}</span>
                </DataField>
                <DataField label={T.reports.approvedAt}>
                  <span dir="ltr">{formatDate(report.council_approval_date)}</span>
                </DataField>
              </dl>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Archive className="size-6" />}
          title={T.council.emptyHistory}
          description={T.council.emptyHistoryHint}
        />
      )}
    </div>
  );
}
