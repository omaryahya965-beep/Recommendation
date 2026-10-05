"use client";

import { Archive } from "lucide-react";

import { Card, DataField, ErrorBanner } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { LoadMore } from "@/components/ui/LoadMore";
import { RecordId } from "@/components/ui/Ledger";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/format";
import { REPORT_TYPE_LABELS, T, useI18n } from "@/lib/i18n";
import { usePagedList } from "@/lib/hooks";
import type { AuditReport } from "@/lib/types";

export default function ApprovedHistoryPage() {
  useI18n();
  const list = usePagedList<AuditReport>(["reports", "ratified"], "/api/reports/?status=ratified", {
    live: false,
  });
  const { items: reports, isLoading, isError, refetch } = list;

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title={T.nav.approvedHistory}
        description={T.council.historySubtitle}
      />

      {/* The title and guidance are static; only the list waits for data. */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : reports.length ? (
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
                  {REPORT_TYPE_LABELS[report.engagement_type]}
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
          <LoadMore
            loaded={reports.length}
            total={list.total}
            hasMore={Boolean(list.hasNextPage)}
            loading={list.isFetchingNextPage}
            onMore={() => list.fetchNextPage()}
          />
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
