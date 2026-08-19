"use client";

import { useQuery } from "@tanstack/react-query";

import { ReportStageBoard } from "@/components/dashboard/CouncilDesk";
import { MetricStrip } from "@/components/dashboard/MetricStrip";
import { PortfolioAnalytics } from "@/components/dashboard/PortfolioAnalytics";
import { RiskDistribution } from "@/components/dashboard/RiskDistribution";
import { StatusDistribution } from "@/components/dashboard/StatusDistribution";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { TeamLoad } from "@/components/dashboard/TeamLoad";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { T, useI18n } from "@/lib/i18n";
import type { AuditReport, DashboardData, Paginated, Role } from "@/lib/types";
import { analyticsStageIds } from "@/lib/workflow";

function recBase(role: Role) {
  if (role === "audit") return "/audit/recommendations";
  if (role === "department_head") return "/department/recommendations";
  if (role === "employee") return "/employee/recommendations";
  return "/council/recommendations";
}

function descriptionFor(role: Role) {
  if (role === "employee") return T.dashboard.employeeAnalyticsHint;
  if (role === "department_head") return T.dashboard.deptAnalyticsHint;
  if (role === "council") return T.dashboard.councilAnalyticsHint;
  return T.dashboard.auditAnalyticsHint;
}

function riskHintFor(role: Role) {
  if (role === "employee") return T.dashboard.riskHintEmployee;
  if (role === "department_head") return T.dashboard.riskHintDept;
  return T.dashboard.riskHintAudit;
}

function statusHintFor(role: Role) {
  if (role === "employee") return T.dashboard.statusHintEmployee;
  if (role === "department_head") return T.dashboard.statusHintDept;
  if (role === "council") return T.dashboard.statusHintCouncil;
  return T.dashboard.statusHintAudit;
}

export function AnalyticsWorkspace({ role }: { role: Role }) {
  useI18n();
  const base = recBase(role);
  const stageIds = analyticsStageIds(role);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard/"),
  });
  const { data: reportsPage } = useQuery({
    queryKey: ["reports", "analytics-pipeline", role],
    queryFn: () => api<Paginated<AuditReport>>("/api/reports/?page_size=100"),
    enabled: role === "council",
    retry: false,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const inExecution = data.in_execution?.items ?? [];
  const reports = reportsPage?.results ?? [];
  const pendingReports = data.action_center.reports_pending_ratification?.count ?? 0;
  const pendingClosures = data.action_center.closures_pending?.count ?? 0;
  const ratified = reports.filter((item) => item.status === "ratified").length;

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title={T.nav.analytics} description={descriptionFor(role)} />

      {role === "council" ? (
        <MetricStrip
          title={T.dashboard.decisionCenter}
          hint={T.dashboard.decisionCenterHint}
          items={[
            {
              label: T.nav.pendingApprovals,
              value: pendingReports,
              href: "/council/pending-approvals",
              tone: pendingReports ? "warning" : "muted",
            },
            {
              label: T.nav.closureReviews,
              value: pendingClosures,
              href: "/council/closure-reviews",
              tone: pendingClosures ? "warning" : "muted",
            },
            {
              label: T.council.ratified,
              value: ratified,
              href: "/council/approved-history",
              tone: "success",
            },
          ]}
        />
      ) : (
        <SystemHealth
          stats={data.stats}
          base={base}
          title={
            role === "employee"
              ? T.dashboard.personalProgress
              : role === "department_head"
                ? T.dashboard.deptWorkload
                : T.dashboard.systemHealth
          }
          hint={
            role === "employee"
              ? T.dashboard.personalProgressHint
              : role === "department_head"
                ? T.dashboard.deptWorkloadHint
                : T.dashboard.systemHealthHint
          }
        />
      )}

      {role === "council" ? (
        <ReportStageBoard reports={reports} />
      ) : (
        <div className="grid items-stretch gap-4 xl:grid-cols-2">
          <RiskDistribution
            byRisk={data.stats.by_risk}
            base={base}
            hint={riskHintFor(role)}
            className="h-full"
          />
          <StatusDistribution
            byStatus={data.stats.by_status}
            base={base}
            stageIds={stageIds}
            hint={statusHintFor(role)}
            className="h-full"
          />
        </div>
      )}

      {role === "audit" ? (
        <PortfolioAnalytics
          base={base}
          scope="audit-analytics"
          showRates={false}
          showStages={false}
          showDepartments
        />
      ) : null}

      {role === "department_head" ? (
        <TeamLoad items={inExecution} href="/department/team-progress" />
      ) : null}
    </div>
  );
}
