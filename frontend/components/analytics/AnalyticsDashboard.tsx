"use client";

import { useQuery } from "@tanstack/react-query";

import {
  BarList,
  ColumnChart,
  Meter,
  Panel,
  StatTile,
} from "@/components/analytics/charts";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { CellText, LedgerCell, LedgerTable } from "@/components/ui/Ledger";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  AGING_ORDER,
  decisionSeries,
  departmentPressure,
  fetchAnalytics,
  stagePressure,
  type AnalyticsPayload,
} from "@/lib/analytics";
import { formatDateTime, plural } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { MODERATE } from "@/lib/queryPolicy";
import type { Role } from "@/lib/types";

function registerBase(role: Role) {
  if (role === "audit") return "/audit/recommendations";
  if (role === "department_head") return "/department/recommendations";
  if (role === "employee") return "/employee/recommendations";
  return "/council/recommendations";
}

function hintFor(role: Role) {
  if (role === "employee") return T.insights.employeeHint;
  if (role === "department_head") return T.insights.headHint;
  if (role === "council") return T.insights.councilHint;
  return T.insights.auditHint;
}

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

/* ---------------------------------------------------------------- */

function HeadlineTiles({ data, base, role }: { data: AnalyticsPayload; base: string; role: Role }) {
  const totals = data.totals;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="analytics-headline">
      <StatTile
        label={T.insights.issued}
        value={totals.total}
        definition={T.insights.def.issued}
        note={role === "audit" && totals.drafts ? plural(totals.drafts, T.insights.draftsNote) : null}
        href={`${base}?issued=true`}
      />
      <StatTile label={T.insights.open} value={totals.open} definition={T.insights.def.open} href={`${base}?open=true`} />
      <StatTile
        label={T.insights.closed}
        value={totals.closed}
        definition={T.insights.def.closed}
        note={fill(T.insights.closedSplit, {
          implemented: totals.closed_implemented,
          disagreement: totals.closed_disagreement,
        })}
        href={`${base}?status=closed`}
      />
      <StatTile
        label={T.insights.completionRate}
        value={totals.completion_rate}
        suffix="%"
        definition={T.insights.def.completionRate}
      />
      <StatTile
        label={T.insights.overdue}
        value={totals.overdue}
        alert
        definition={T.insights.def.overdue}
        note={fill(T.insights.overdueRateNote, { rate: totals.overdue_rate })}
        href={`${base}?overdue=1`}
        testId="analytics-overdue"
      />
      <StatTile
        label={T.insights.highRiskOpen}
        value={totals.high_risk_open}
        definition={T.insights.def.highRiskOpen}
        href={`${base}?risk_level=high&open=true`}
      />
    </div>
  );
}

function Queues({ data, base }: { data: AnalyticsPayload; base: string }) {
  const rows: Array<[keyof AnalyticsPayload["queues"], string]> = [
    ["department", T.insights.queueDepartment],
    ["audit", T.insights.queueAudit],
    ["council", T.insights.queueCouncil],
  ];
  return (
    <Panel title={T.insights.queuesTitle} hint={T.insights.queuesHint} testId="analytics-queues">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map(([side, label]) => (
          <StatTile
            key={side}
            label={label}
            value={data.queues[side].count}
            href={`${base}?waiting_on=${side}&issued=true`}
            note={fill(T.insights.queueStats, {
              avg: data.queues[side].average_days,
              max: data.queues[side].max_days,
            })}
          />
        ))}
      </div>
      {data.totals.late_in_review ? (
        <p className="mt-3 text-[12.5px] text-ink-soft">
          {fill(T.insights.lateInReview, { count: data.totals.late_in_review })}
        </p>
      ) : null}
    </Panel>
  );
}

function Stages({ data, base }: { data: AnalyticsPayload; base: string }) {
  return (
    <Panel title={T.insights.stagesTitle} hint={T.insights.stagesHint} testId="analytics-stages">
      <BarList
        rows={stagePressure(data).map((stage) => ({
          key: stage.id,
          label: stage.label,
          sublabel: stage.actor,
          value: stage.count,
          // Analytics counts issued cases only; so does the list (BUG-23).
          href: `${base}?stage=${stage.id}&issued=true`,
        }))}
      />
    </Panel>
  );
}

function Volume({ data }: { data: AnalyticsPayload }) {
  return (
    <Panel title={T.insights.volumeTitle} hint={T.insights.volumeHint} testId="analytics-volume">
      <ColumnChart
        label={T.insights.volumeTitle}
        series={[
          { name: T.insights.seriesCreated, colorClass: "bg-chart-1" },
          { name: T.insights.seriesClosed, colorClass: "bg-chart-2" },
        ]}
        data={data.volume.map((point) => ({ key: point.month, values: [point.created, point.closed] }))}
      />
    </Panel>
  );
}

function Aging({ data, base }: { data: AnalyticsPayload; base: string }) {
  const labels = [T.insights.aging1, T.insights.aging2, T.insights.aging3];
  return (
    <Panel title={T.insights.agingTitle} hint={T.insights.agingHint}>
      <div className="grid grid-cols-3 gap-3">
        {AGING_ORDER.map((bucket, index) => (
          <StatTile
            key={bucket}
            label={labels[index]}
            value={data.overdue_aging[bucket] ?? 0}
            alert
            href={`${base}?overdue_age=${encodeURIComponent(bucket)}&issued=true`}
          />
        ))}
      </div>
    </Panel>
  );
}

function Departments({ data, base }: { data: AnalyticsPayload; base: string }) {
  const rows = departmentPressure(data);
  return (
    <Panel title={T.insights.departmentsTitle} hint={T.insights.departmentsHint} testId="analytics-departments">
      <LedgerTable
        headers={[
          T.analytics.colDepartment,
          T.analytics.colTotal,
          T.analytics.colOpen,
          T.analytics.colOverdue,
          T.insights.colOverdueRate,
          T.analytics.colHighRisk,
          T.insights.colExecution,
        ]}
        widths={[undefined, "4.5rem", "4.5rem", "4.5rem", "5rem", "4.5rem", "9rem"]}
        minWidth="40rem"
        empty={T.insights.empty}
      >
        {rows.map((row) => (
          <tr key={row.department} className="hover:bg-subtle/60">
            <LedgerCell>
              <a href={`${base}?report__department=${row.department}&issued=true`} className="block min-w-0 font-semibold text-ink hover:text-primary-dark hover:underline">
                <CellText text={row.name} lines={2} />
              </a>
            </LedgerCell>
            <LedgerCell mono>{row.total}</LedgerCell>
            <LedgerCell mono>{row.open}</LedgerCell>
            <LedgerCell mono>
              <span className={row.overdue ? "font-bold text-danger-dark" : undefined}>{row.overdue}</span>
            </LedgerCell>
            <LedgerCell mono>{row.overdue_rate}%</LedgerCell>
            <LedgerCell mono>{row.high_risk}</LedgerCell>
            <LedgerCell>
              <span className="flex min-w-0 items-center gap-2">
                <Meter value={row.execution_rate} label={`${T.insights.colExecution} ${row.name}`} />
                <span className="w-12 shrink-0 text-end font-mono text-[12.5px] font-semibold text-navy" dir="ltr">
                  {row.execution_rate}%
                </span>
              </span>
            </LedgerCell>
          </tr>
        ))}
      </LedgerTable>
    </Panel>
  );
}

function Progress({ data }: { data: AnalyticsPayload }) {
  const implementation = data.implementation;
  return (
    <Panel title={T.insights.progressTitle} hint={T.insights.progressHint}>
      <p className="font-heading text-[2rem] font-semibold leading-none text-navy">
        <span dir="ltr">{implementation.average_step_progress}</span>
        <span className="ms-0.5 text-[15px] text-ink-soft">%</span>
      </p>
      <div className="mt-3">
        <Meter value={implementation.average_step_progress} label={T.insights.progressTitle} />
      </div>
      <p className="mt-2 text-[12.5px] text-ink-soft">
        {plural(implementation.cases_in_execution, T.insights.progressCases)}
      </p>
    </Panel>
  );
}

function Recurrence({ data, base }: { data: AnalyticsPayload; base: string }) {
  return (
    <Panel title={T.insights.recurrenceTitle}>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label={T.insights.recurrenceConfirmed} value={data.recurrence.confirmed} href={`${base}?is_recurring=true&recurrence_confirmed=true&issued=true`} />
        <StatTile label={T.insights.recurrenceAwaiting} value={data.recurrence.awaiting_confirmation} />
      </div>
    </Panel>
  );
}

function CouncilDecisions({ data }: { data: AnalyticsPayload }) {
  const series = decisionSeries(data);
  return (
    <Panel title={T.insights.decisionsTitle} hint={T.insights.decisionsHint} testId="analytics-decisions">
      <ColumnChart
        label={T.insights.decisionsTitle}
        series={[
          { name: T.insights.seriesClosed, colorClass: "bg-chart-1" },
          { name: T.insights.seriesReopened, colorClass: "bg-chart-2" },
        ]}
        data={series.map((point) => ({ key: point.month, values: [point.closed, point.reopened] }))}
      />
    </Panel>
  );
}

/* ---------------------------------------------------------------- */

function AuditView({ data, base }: { data: AnalyticsPayload; base: string }) {
  return (
    <>
      <HeadlineTiles data={data} base={base} role="audit" />
      <Queues data={data} base={base} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Stages data={data} base={base} />
        <Volume data={data} />
      </div>
      <Departments data={data} base={base} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Aging data={data} base={base} />
        <Progress data={data} />
        <Recurrence data={data} base={base} />
      </div>
    </>
  );
}

function HeadView({ data, base }: { data: AnalyticsPayload; base: string }) {
  return (
    <>
      <HeadlineTiles data={data} base={base} role="department_head" />
      <Queues data={data} base={base} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Stages data={data} base={base} />
        <Volume data={data} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Aging data={data} base={base} />
        <Progress data={data} />
      </div>
    </>
  );
}

function EmployeeView({ data, base }: { data: AnalyticsPayload; base: string }) {
  const totals = data.totals;
  const inReview = totals.awaiting_head_review + totals.awaiting_verification + totals.awaiting_closure_audit + totals.awaiting_closure_council;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analytics-headline">
        <StatTile
          label={T.insights.myActive}
          value={totals.in_execution}
          href={`${base}?status__in=in_progress,returned_insufficient,partial,reopened`}
        />
        <StatTile label={T.insights.myOverdue} value={totals.overdue} alert definition={T.insights.def.overdue} href={`${base}?overdue=1`} testId="analytics-overdue" />
        <StatTile label={T.insights.myInReview} value={inReview} />
        <StatTile label={T.insights.myClosed} value={totals.closed} />
      </div>
      <Progress data={data} />
    </>
  );
}

function CouncilView({ data, base }: { data: AnalyticsPayload; base: string }) {
  const totals = data.totals;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analytics-headline">
        <StatTile label={T.insights.awaitingRatification} value={totals.awaiting_ratification} href="/council/pending-approvals" />
        <StatTile label={T.insights.awaitingClosure} value={totals.awaiting_closure_council} href="/council/closure-reviews" />
        <StatTile label={T.insights.highRiskOpen} value={totals.high_risk_open} definition={T.insights.def.highRiskOpen} href={`${base}?risk_level=high&open=true`} />
        <StatTile
          label={T.insights.reopenRate}
          value={data.decisions.reopen_rate}
          suffix="%"
          definition={T.insights.def.reopenRate}
          note={fill(T.insights.reopenRateNote, {
            reopened: data.decisions.reopened,
            decisions: data.decisions.closure_decisions,
          })}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CouncilDecisions data={data} />
        <Volume data={data} />
      </div>
      <Departments data={data} base={base} />
    </>
  );
}

/** The analytics page for every role, from one payload (/api/analytics/). */
export function AnalyticsDashboard({ role }: { role: Role }) {
  useI18n();
  const base = registerBase(role);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["analytics", role],
    queryFn: () => fetchAnalytics(12),
    ...MODERATE,
  });

  return (
    <div className="animate-fade-in space-y-6" data-testid="analytics-dashboard">
      <PageHeader title={T.insights.title} description={hintFor(role)} />
      {isLoading ? (
        <DashboardBodySkeleton />
      ) : isError || !data ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : (
        <div className={isFetching ? "space-y-6 opacity-70 transition-opacity" : "space-y-6 transition-opacity"}>
          {role === "audit" ? <AuditView data={data} base={base} /> : null}
          {role === "department_head" ? <HeadView data={data} base={base} /> : null}
          {role === "employee" ? <EmployeeView data={data} base={base} /> : null}
          {role === "council" ? <CouncilView data={data} base={base} /> : null}
          <p className="text-[11.5px] text-muted">
            {T.insights.generated}: <span dir="ltr">{formatDateTime(data.generated_at)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
