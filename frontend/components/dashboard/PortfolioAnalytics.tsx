"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Layers, Repeat2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { DirForward } from "@/components/i18n/DirIcon";

import { Callout, MeterBar, ProgressBar } from "@/components/ui/Base";
import { CardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import {
  departmentPressure,
  fetchPortfolio,
  portfolioRates,
  stagePressure,
  type PortfolioRates,
} from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";

/** Percentage readout with the population it is measured against spelled out. */
function Rate({
  label,
  value,
  basis,
  tone,
}: {
  label: string;
  value: number;
  basis: string;
  tone: "success" | "danger";
}) {
  useI18n();
  return (
    <div className="flex-1 px-4 py-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-heading text-3xl font-bold",
          tone === "success" ? "text-success-dark" : "text-danger-dark"
        )}
        dir="ltr"
      >
        {value}%
      </p>
      <ProgressBar value={value} tone={tone === "success" ? "success" : "danger"} showValue={false} className="mt-2" />
      <p className="mt-1.5 text-[11px] text-muted">{basis}</p>
    </div>
  );
}

function Count({ label, value, href, icon }: { label: string; value: number; href: string; icon?: React.ReactNode }) {
  useI18n();
  return (
    <Link href={href} className="flex-1 px-4 py-3 transition-colors hover:bg-subtle/60">
      <p className="flex items-center gap-1.5 text-[12px] text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-heading text-3xl font-bold text-navy" dir="ltr">
        {value}
      </p>
    </Link>
  );
}

/**
 * Horizontal indicator band. Deliberately not a grid of cards — these six
 * numbers are one reading of portfolio health, not six separate objects.
 */
function PerformanceBand({ rates, base }: { rates: PortfolioRates; base: string }) {
  useI18n();
  return (
    <section className="overflow-hidden rounded-(--radius-card) border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="font-heading text-base font-semibold text-ink">{T.analytics.performance}</h2>
        <p className="text-[11.5px] text-muted">{T.analytics.performanceHint}</p>
      </header>

      <div className="flex flex-wrap divide-line sm:divide-x sm:rtl:divide-x-reverse">
        <Rate
          label={T.analytics.completionRate}
          value={rates.completionRate}
          basis={T.analytics.ofAll}
          tone="success"
        />
        <Rate label={T.analytics.overdueRate} value={rates.overdueRate} basis={T.analytics.ofOpen} tone="danger" />
        <Count label={T.analytics.openCount} value={rates.open} href={base} />
        <Count label={T.analytics.closedCount} value={rates.closed} href={`${base}?status=closed`} />
        <Count
          label={T.analytics.highRiskOpen}
          value={rates.highRisk}
          href={`${base}?risk_level=high`}
          icon={<AlertTriangle className="size-3.5 text-warning-dark" />}
        />
        <Count
          label={T.analytics.recurringCount}
          value={rates.recurring}
          href={`${base}?is_recurring=true`}
          icon={<Repeat2 className="size-3.5 text-info-dark" />}
        />
      </div>
    </section>
  );
}

/** Where open cases are stuck, as a proportional bar per lifecycle stage. */
function StageBreakdown({ rows }: { rows: ReturnType<typeof stagePressure> }) {
  useI18n();
  const max = rows.reduce((peak, row) => Math.max(peak, row.count), 0);
  if (!max) {
    return (
      <Section title={T.analytics.stagePressure} hint={T.analytics.stagePressureHint}>
        <EmptyState compact title={T.common.noChartData} className="border-0 shadow-none" />
      </Section>
    );
  }

  return (
    <Section title={T.analytics.stagePressure} hint={T.analytics.stagePressureHint}>
      <ol className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.index} className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] tabular-nums text-muted" dir="ltr">
                {row.index + 1}
              </span>
              <span className={cn("truncate text-[13px]", row.count ? "font-medium text-ink" : "text-muted")}>
                {row.label}
              </span>
              <span
                className={cn("shrink-0 font-mono text-[13px] tabular-nums", row.count ? "font-semibold text-navy" : "text-muted")}
                dir="ltr"
              >
                {row.count}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{row.actor}</p>
            <MeterBar className="mt-2" value={max ? Math.round((row.count / max) * 100) : 0} />
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Per-department workload table. Every row drills into the filtered register. */
function DepartmentTable({
  rows,
  base,
}: {
  rows: ReturnType<typeof departmentPressure>;
  base: string;
}) {
  useI18n();
  if (!rows.length) {
    return <EmptyState icon={<Layers className="size-6" />} title={T.analytics.noDepartments} />;
  }

  return (
    <Section title={T.analytics.departmentPressure} hint={T.analytics.departmentPressureHint}>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-subtle text-start text-xs font-semibold text-ink-soft">
              <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                {T.analytics.colDepartment}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                {T.analytics.colTotal}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                {T.analytics.colOpen}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                {T.analytics.colClosed}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                {T.analytics.colOverdue}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                {T.analytics.colInProgress}
              </th>
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">
                {T.analytics.colHighRisk}
              </th>
              <th scope="col" className="w-48 px-4 py-2.5 text-start font-semibold">
                {T.analytics.colExecution}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, index) => (
              <tr key={row.department} className="group transition-colors hover:bg-subtle/80">
                <td className="px-4 py-3">
                  <Link
                    href={`${base}?report__department=${row.department}`}
                    className="inline-flex items-center gap-1.5 font-medium text-ink group-hover:text-primary-dark"
                  >
                    {row.name}
                    {index === 0 && row.overdue > 0 ? (
                      <span className="rounded-md bg-danger-light px-1.5 py-0.5 text-[10px] font-semibold text-danger-dark">
                        {T.dashboard.highestPressure}
                      </span>
                    ) : null}
                    <DirForward className="size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-ink-soft" dir="ltr">
                  {row.total}
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-ink-soft" dir="ltr">
                  {row.open}
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-success-dark" dir="ltr">
                  {row.closed}
                </td>
                <td className="px-3 py-3" dir="ltr">
                  <span className={cn("font-mono tabular-nums", row.overdue ? "font-semibold text-danger-dark" : "text-muted")}>
                    {row.overdue}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-ink-soft" dir="ltr">
                  {row.inProgress}
                </td>
                <td className="px-3 py-3" dir="ltr">
                  <span className={cn("font-mono tabular-nums", row.highRisk ? "font-semibold text-warning-dark" : "text-muted")}>
                    {row.highRisk}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ProgressBar
                    value={row.executionRate}
                    tone={row.executionRate >= 70 ? "success" : row.overdue ? "warning" : "primary"}
                    label={T.analytics.colExecution}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/**
 * The backend has no per-department or per-stage aggregation endpoint, so this
 * derives everything from the real recommendation register. The API already
 * scopes that register by role, so no extra filter is sent — `scope` only keeps
 * the roles' caches apart.
 */
export function PortfolioAnalytics({
  base,
  scope,
  showRates = true,
  showStages = true,
  showDepartments = true,
}: {
  base: string;
  scope: string;
  /** Set false when the page already shows official dashboard.stats. */
  showRates?: boolean;
  /** Set false when the page already shows official by_status grouping. */
  showStages?: boolean;
  showDepartments?: boolean;
}) {
  useI18n();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["portfolio", scope],
    queryFn: () => fetchPortfolio(),
    staleTime: 60_000,
  });

  const derived = useMemo(() => {
    if (!data) return null;
    return {
      rates: portfolioRates(data.items),
      departments: departmentPressure(data.items),
      stages: stagePressure(data.items),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !derived) return null;
  if (!derived.rates.total) {
    return <EmptyState icon={<Layers className="size-6" />} title={T.analytics.noDepartments} />;
  }

  return (
    <div className="space-y-4">
      {showRates ? <PerformanceBand rates={derived.rates} base={base} /> : null}

      {data?.truncated ? <Callout tone="warning">{T.analytics.truncated}</Callout> : null}

      {showStages && showDepartments ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
          <DepartmentTable rows={derived.departments} base={base} />
          <StageBreakdown rows={derived.stages} />
        </div>
      ) : showDepartments ? (
        <DepartmentTable rows={derived.departments} base={base} />
      ) : showStages ? (
        <StageBreakdown rows={derived.stages} />
      ) : null}
    </div>
  );
}
