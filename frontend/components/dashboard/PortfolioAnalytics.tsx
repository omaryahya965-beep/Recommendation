"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Layers, Repeat2, ChevronRight, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { MeterBar, ProgressBar } from "@/components/ui/Base";
import { CardSkeleton, EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import {
  departmentPressure,
  fetchAnalytics,
  portfolioRates,
  stagePressure,
  type PortfolioRates,
} from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { T, useI18n } from "@/lib/i18n";
import { MODERATE } from "@/lib/queryPolicy";

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
    <div className="flex-1 px-5 py-4 transition-colors hover:bg-subtle/50">
      <p className="text-[12px] font-bold uppercase tracking-wider text-muted mb-2">{label}</p>
      <p
        className={cn(
          "font-heading text-[1.75rem] font-bold tabular-nums leading-none tracking-tight",
          tone === "success" ? "text-success-dark" : "text-danger-dark"
        )}
        dir="ltr"
      >
        {value}%
      </p>
      <ProgressBar value={value} tone={tone === "success" ? "success" : "danger"} showValue={false} className="mt-3" />
      <p className="mt-2 text-[11.5px] font-medium text-ink-soft">{basis}</p>
    </div>
  );
}

function Count({ label, value, href, icon }: { label: string; value: number; href: string; icon?: React.ReactNode }) {
  useI18n();
  return (
    <Link href={href} className="group flex-1 px-5 py-4 transition-colors hover:bg-subtle/70 relative">
      <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted mb-2">
        {icon}
        {label}
      </p>
      <p className="font-heading text-[1.75rem] font-bold tabular-nums leading-none text-navy tracking-tight group-hover:text-primary-dark transition-colors" dir="ltr">
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
    <Section 
      title={T.analytics.performance} 
      hint={T.analytics.performanceHint}
      className="bg-surface"
    >
      <div className="flex flex-wrap divide-y divide-line sm:divide-y-0 sm:divide-x sm:rtl:divide-x-reverse">
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
          icon={<AlertTriangle className="size-4 text-warning-dark" strokeWidth={2.5} />}
        />
        <Count
          label={T.analytics.recurringCount}
          value={rates.recurring}
          href={`${base}?is_recurring=true`}
          icon={<Repeat2 className="size-4 text-info-dark" strokeWidth={2.5} />}
        />
      </div>
    </Section>
  );
}

/** Where open cases are stuck, as a proportional bar per lifecycle stage. */
function StageBreakdown({ rows }: { rows: ReturnType<typeof stagePressure> }) {
  useI18n();
  const max = rows.reduce((peak, row) => Math.max(peak, row.count), 0);
  if (!max) {
    return (
      <Section title={T.analytics.stagePressure} hint={T.analytics.stagePressureHint} className="bg-surface">
        <EmptyState compact title={T.common.noChartData} className="border-0 shadow-none py-10" />
      </Section>
    );
  }

  return (
    <Section title={T.analytics.stagePressure} hint={T.analytics.stagePressureHint} className="bg-surface h-full">
      <ol className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.index} className="px-5 py-4 hover:bg-subtle/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <span className="flex size-5 items-center justify-center rounded-full bg-subtle font-mono text-[11px] font-bold text-muted" dir="ltr">
                  {row.index + 1}
                </span>
                <span className={cn("text-[13px] font-bold tracking-wide", row.count ? "text-ink" : "text-muted")}>
                  {row.label}
                </span>
              </div>
              <span
                className={cn("font-mono text-[14px] font-bold tabular-nums", row.count ? "text-navy" : "text-muted")}
                dir="ltr"
              >
                {row.count}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <MeterBar className="flex-1" value={max ? Math.round((row.count / max) * 100) : 0} />
              <p className="text-[11px] font-medium text-muted w-24 text-end truncate">{row.actor}</p>
            </div>
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
  const { locale } = useI18n();
  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;
  if (!rows.length) {
    return <EmptyState icon={<Layers className="size-6" />} title={T.analytics.noDepartments} className="bg-surface border-0" />;
  }

  return (
    <Section title={T.analytics.departmentPressure} hint={T.analytics.departmentPressureHint} className="bg-surface h-full">
      <ul className="space-y-3 p-4 md:hidden">
        {rows.map((row, index) => (
          <li key={row.department}>
            <Link href={`${base}?report__department=${row.department}`} className="block rounded-xl border border-line p-4">
              <p className="font-heading text-[16px] font-bold text-navy">
                {row.name}
                {index === 0 && row.overdue > 0 ? (
                  <span className="ms-2 rounded bg-danger-light px-1.5 py-0.5 text-[11px] font-bold text-danger-dark">
                    {T.dashboard.highestPressure}
                  </span>
                ) : null}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[14px]">
                <div>
                  <dt className="font-semibold text-muted">{T.analytics.colOpen}</dt>
                  <dd className="font-mono" dir="ltr">{row.open}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-muted">{T.analytics.colOverdue}</dt>
                  <dd className={row.overdue ? "font-mono font-bold text-danger-dark" : "font-mono"} dir="ltr">{row.overdue}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-muted">{T.analytics.colHighRisk}</dt>
                  <dd className="font-mono" dir="ltr">{row.highRisk}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-muted">{T.analytics.colClosed}</dt>
                  <dd className="font-mono text-success-dark" dir="ltr">{row.closed}</dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden scrollbar-thin overflow-x-auto md:block">
        <table className="w-full min-w-[50rem] border-collapse text-[13px]">
          <thead className="bg-subtle/80">
            <tr className="border-b border-line text-start text-[11.5px] font-bold uppercase tracking-wider text-ink-soft">
              <th scope="col" className="px-5 py-3.5 text-start">
                {T.analytics.colDepartment}
              </th>
              <th scope="col" className="px-3 py-3.5 text-start">
                {T.analytics.colTotal}
              </th>
              <th scope="col" className="px-3 py-3.5 text-start">
                {T.analytics.colOpen}
              </th>
              <th scope="col" className="px-3 py-3.5 text-start">
                {T.analytics.colClosed}
              </th>
              <th scope="col" className="px-3 py-3.5 text-start">
                {T.analytics.colOverdue}
              </th>
              <th scope="col" className="px-3 py-3.5 text-start">
                {T.analytics.colInProgress}
              </th>
              <th scope="col" className="px-3 py-3.5 text-start">
                {T.analytics.colHighRisk}
              </th>
              <th scope="col" className="w-48 px-5 py-3.5 text-start">
                {T.analytics.colExecution}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, index) => (
              <tr key={row.department} className="group transition-colors hover:bg-subtle/60">
                <td className="px-5 py-4">
                  <Link
                    href={`${base}?report__department=${row.department}`}
                    className="inline-flex items-center gap-2 font-bold text-ink group-hover:text-primary-dark transition-colors"
                  >
                    {row.name}
                    {index === 0 && row.overdue > 0 ? (
                      <span className="rounded bg-danger-light/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-danger-dark ring-1 ring-danger/20">
                        {T.dashboard.highestPressure}
                      </span>
                    ) : null}
                    <DirForward className="size-4 text-muted opacity-0 transition-all -translate-x-2 rtl:translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 group-hover:rtl:translate-x-0" />
                  </Link>
                </td>
                <td className="px-3 py-4 font-mono font-medium tabular-nums text-ink-soft" dir="ltr">
                  {row.total}
                </td>
                <td className="px-3 py-4 font-mono font-medium tabular-nums text-ink-soft" dir="ltr">
                  {row.open}
                </td>
                <td className="px-3 py-4 font-mono font-bold tabular-nums text-success-dark" dir="ltr">
                  {row.closed}
                </td>
                <td className="px-3 py-4" dir="ltr">
                  <span className={cn("inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums", row.overdue ? "bg-danger-light/50 text-danger-dark ring-1 ring-danger/20" : "text-muted")}>
                    {row.overdue}
                  </span>
                </td>
                <td className="px-3 py-4 font-mono font-medium tabular-nums text-ink-soft" dir="ltr">
                  {row.inProgress}
                </td>
                <td className="px-3 py-4" dir="ltr">
                  <span className={cn("inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums", row.highRisk ? "bg-warning-light/50 text-warning-dark ring-1 ring-warning/20" : "text-muted")}>
                    {row.highRisk}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <ProgressBar
                    value={row.executionRate}
                    tone={row.executionRate >= 70 ? "success" : row.overdue ? "warning" : "primary"}
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
    queryKey: ["analytics", scope],
    queryFn: () => fetchAnalytics(),
    ...MODERATE,
  });

  const derived = useMemo(() => {
    if (!data) return null;
    return {
      rates: portfolioRates(data),
      departments: departmentPressure(data),
      stages: stagePressure(data),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !derived) return null;
  if (!derived.rates.total) {
    return <EmptyState icon={<Layers className="size-6" />} title={T.analytics.noDepartments} className="border-0 shadow-none bg-surface" />;
  }

  return (
    <div className="space-y-6">
      {showRates ? <PerformanceBand rates={derived.rates} base={base} /> : null}


      {showStages && showDepartments ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
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
