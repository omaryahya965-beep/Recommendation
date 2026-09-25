"use client";

import { useQuery } from "@tanstack/react-query";
import { UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { DirForward } from "@/components/i18n/DirIcon";

import { Card, ErrorBanner, ProgressBar } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api, loadAuth } from "@/lib/api";
import { caseTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { LIVE } from "@/lib/queryPolicy";
import type { Paginated, RecommendationListItem } from "@/lib/types";
import { buildWorkloads, type Workload } from "@/lib/workload";

const EXECUTION_STATUSES =
  "in_progress,returned_insufficient,partial,reopened,pending_head_review,submitted_for_verification";

function WorkloadCard({ workload, maxLoad }: { workload: Workload; maxLoad: number }) {
  useI18n();
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-light text-primary-dark">
            <UserRound className="size-4.5" />
          </span>
          <div>
            <h3 className="font-heading text-[15px] font-semibold text-ink">{workload.name}</h3>
            <p className="text-xs text-muted">
              {T.team.load}:{" "}
              <span className="font-mono" dir="ltr">
                {workload.items.length}
              </span>
              {workload.nearest ? (
                <>
                  {" · "}
                  {T.team.nearest}:{" "}
                  <span className="font-mono" dir="ltr">
                    {formatDate(workload.nearest)}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        {workload.overdue ? (
          <span className="rounded-full bg-danger-light px-2.5 py-1 text-[11.5px] font-semibold text-danger-dark">
            {T.team.overdueLoad}:{" "}
            <span className="font-mono" dir="ltr">
              {workload.overdue}
            </span>
          </span>
        ) : null}
      </div>

      <ProgressBar
        value={Math.round((workload.items.length / Math.max(maxLoad, 1)) * 100)}
        className="mt-3"
        tone={workload.overdue ? "danger" : "primary"}
      />

      <ul className="mt-3 divide-y divide-line border-t border-line">
        {workload.items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/department/recommendations/${item.id}`}
              className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 transition-colors hover:bg-primary-light/40"
            >
              <RecordId id={item.id} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink group-hover:text-primary-dark">
                {caseTitle(item.text, 90)}
              </span>
              <RiskBadge level={item.risk_level} />
              <StatusBadge status={item.status} />
              <span className="font-mono text-xs text-ink-soft" dir="ltr">
                {formatDate(item.target_date)}
              </span>
              <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
              <DirForward className="size-3.5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function TeamProgressPage() {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["recommendations", "team-progress"],
    ...LIVE,
    queryFn: () =>
      api<Paginated<RecommendationListItem>>(
        `/api/recommendations/?status__in=${EXECUTION_STATUSES}&page_size=100`
      ),
  });

  const myDepartment = loadAuth()?.user.department ?? null;
  const workloads = useMemo(
    () =>
      buildWorkloads(
        (data?.results ?? []).filter((item) => myDepartment == null || item.department === myDepartment),
        T.team.unassigned
      ),
    [data, myDepartment]
  );
  const maxLoad = workloads.reduce((max, workload) => Math.max(max, workload.items.length), 0);

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={T.team.title} description={T.team.subtitle} />

      {/* The title and guidance are static; only the list waits for data. */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : workloads.length ? (
        <div className="space-y-4">
          {workloads.map((workload) => (
            <WorkloadCard key={workload.name} workload={workload} maxLoad={maxLoad} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users className="size-6" />} title={T.team.empty} description={T.team.emptyHint} />
      )}
    </div>
  );
}
