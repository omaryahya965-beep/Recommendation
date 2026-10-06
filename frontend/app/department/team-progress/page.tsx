"use client";

import { useQuery } from "@tanstack/react-query";
import { UserRound, Users } from "lucide-react";
import Link from "next/link";

import { DirForward } from "@/components/i18n/DirIcon";
import { Card, ErrorBanner, ProgressBar } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { CaseDue } from "@/components/home/Queues";
import { PageHeader } from "@/components/ui/PageHeader";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api } from "@/lib/api";
import { clipTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { LIVE } from "@/lib/queryPolicy";
import type { RecommendationListItem } from "@/lib/types";

interface EmployeeLoad {
  employee: { id: number; name: string };
  open: number;
  active: number;
  overdue: number;
  due_soon: number;
  returned: number;
  awaiting_head_review: number;
  in_review: number;
  nearest_deadline: string | null;
  items: RecommendationListItem[];
}

interface TeamWorkload {
  department: { id: number; name: string };
  item_limit: number;
  employees: EmployeeLoad[];
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  const color =
    tone === "danger" && value ? "text-danger-dark" : tone === "warning" && value ? "text-warning-dark" : "text-navy";
  return (
    <div className="min-w-0 rounded-lg bg-subtle/60 px-3 py-2">
      <dt className="truncate text-[11.5px] font-medium text-ink-soft">{label}</dt>
      <dd className={`font-heading text-[18px] font-semibold ${color}`} dir="ltr">
        {value}
      </dd>
    </div>
  );
}

function WorkloadCard({ load, maxLoad, limit }: { load: EmployeeLoad; maxLoad: number; limit: number }) {
  useI18n();
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-light text-primary-dark">
            <UserRound className="size-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="font-heading text-[15px] font-semibold text-ink">{load.employee.name}</h2>
            <p className="text-xs text-muted">
              {T.team.load}: <span className="font-mono" dir="ltr">{load.open}</span>
              {load.nearest_deadline ? (
                <>
                  {" · "}
                  {T.team.nearest}: <span className="font-mono" dir="ltr">{formatDate(load.nearest_deadline)}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <Link
          href={`/department/recommendations?responsible_employee=${load.employee.id}`}
          className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-primary-dark hover:underline"
        >
          {T.team.allCases.replace("{name}", load.employee.name)}
          <DirForward className="size-3.5" aria-hidden />
        </Link>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Count label={T.team.active} value={load.active} />
        <Count label={T.team.overdueLoad} value={load.overdue} tone="danger" />
        <Count label={T.team.dueSoon} value={load.due_soon} tone="warning" />
        <Count label={T.team.returned} value={load.returned} />
        <Count label={T.team.awaitingHead} value={load.awaiting_head_review} />
        <Count label={T.team.inReview} value={load.in_review} />
      </dl>

      <ProgressBar
        value={Math.round((load.open / Math.max(maxLoad, 1)) * 100)}
        label={`${T.team.load} — ${load.employee.name}`}
        className="mt-3"
        tone={load.overdue ? "danger" : "primary"}
      />

      {load.items.length ? (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {load.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/department/recommendations/${item.id}`}
                className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 transition-colors hover:bg-primary-light/40"
              >
                <RecordId id={item.id} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink group-hover:text-primary-dark">
                  <bdi>{clipTitle(item.title, 90)}</bdi>
                </span>
                <RiskBadge level={item.risk_level} />
                <StatusBadge status={item.status} />
                <span className="font-mono text-xs text-ink-soft" dir="ltr">
                  {formatDate(item.deadline)}
                </span>
                <CaseDue item={item} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">{T.team.noCases}</p>
      )}
      {load.open > load.items.length ? (
        <p className="mt-2 text-[12px] text-muted">
          {T.team.moreThanShown
            .replace("{shown}", String(Math.min(limit, load.items.length)))
            .replace("{total}", String(load.open))}
        </p>
      ) : null}
    </Card>
  );
}

export default function TeamProgressPage() {
  useI18n();
  // Exact counts per employee from the API; this page used to group at most
  // the first 100 cases in the browser and silently drop the rest.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["recommendations", "team-workload"],
    ...LIVE,
    queryFn: () => api<TeamWorkload>("/api/team/workload/"),
  });

  const employees = data?.employees ?? [];
  const maxLoad = employees.reduce((max, load) => Math.max(max, load.open), 0);

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={T.team.title} description={T.team.subtitle} />
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : employees.length ? (
        <div className="space-y-4" data-testid="team-workload">
          {employees.map((load) => (
            <WorkloadCard key={load.employee.id} load={load} maxLoad={maxLoad} limit={data?.item_limit ?? 10} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users className="size-6" />} title={T.team.empty} description={T.team.emptyHint} />
      )}
    </div>
  );
}
