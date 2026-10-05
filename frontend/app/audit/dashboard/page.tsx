"use client";

import { ClipboardList, FilePlus2, FileText } from "lucide-react";

import { BarList } from "@/components/analytics/charts";
import { queueLabel, type ActionSource } from "@/components/dashboard/queues";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { PriorityMetrics } from "@/components/home/PriorityMetrics";
import { QueuePanel } from "@/components/home/Queues";
import { RecurrenceWatch } from "@/components/home/RecurrenceWatch";
import { ReportQueuePanel } from "@/components/home/RoleBlocks";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";

const BASE = "/audit/recommendations";

/** Every link opens the register with the filter the server used for the count. */
const QUEUES: Array<{ key: string; href: string }> = [
  { key: "overdue", href: `${BASE}?overdue=1` },
  { key: "responses_to_review", href: `${BASE}?status=audit_review` },
  { key: "plans_to_review", href: `${BASE}?status=action_plan_review` },
  { key: "verifications_pending", href: `${BASE}?status=submitted_for_verification` },
  { key: "closure_reviews", href: `${BASE}?status=closure_review` },
];

export default function AuditDashboard() {
  useI18n();
  const { data, isLoading, isError, refetch } = useDashboard();

  const hero = (
    <HomeHero
      role="audit"
      title={T.dashboard.auditTitle}
      subtitle={T.dashboard.auditHint}
      actions={[
        { href: "/audit/reports/new", label: T.reports.addReport, icon: FilePlus2, primary: true },
        { href: "/audit/reports", label: T.nav.reports, icon: FileText },
        { href: BASE, label: T.register.title, icon: ClipboardList },
      ]}
    />
  );

  // The hero is static: it renders at once, while only the data sections
  // wait for /api/dashboard/. Same wrapper in both branches, so the hero is
  // updated in place (not remounted) when the data arrives.
  if (isLoading || isError || !data) {
    return (
      <div className="animate-fade-in min-w-0 space-y-5">
        {hero}
        {isLoading ? <DashboardBodySkeleton /> : <ErrorBanner message={T.common.error} onRetry={() => refetch()} />}
      </div>
    );
  }

  const sources: ActionSource[] = QUEUES.filter((queue) => data.action_center[queue.key]).map((queue) => ({
    key: queue.key,
    block: data.action_center[queue.key],
    href: queue.href,
  }));
  const late = data.late_in_audit_queue;
  const stale = data.high_risk_stale;
  const lateDays = String(late?.threshold_days ?? 7);
  const staleDays = String(stale?.threshold_days ?? 30);
  const departments = (data.overdue_by_department ?? []).filter((row) => row.overdue > 0);

  return (
    <div className="animate-fade-in min-w-0 space-y-5">
      {hero}

      <PriorityMetrics
        items={sources.map((source) => ({
          label: queueLabel(source.key),
          value: source.block.count,
          href: source.href,
          tone: source.key === "overdue" ? "danger" : source.key.includes("review") ? "warning" : "primary",
        }))}
      />

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <ActionNow
          sources={sources}
          detailBase={BASE}
          viewAllHref={BASE}
          limit={4}
          title={T.dashboard.hottest}
          hint={T.dashboard.auditReviewHint}
        />
        <div className="min-w-0 space-y-4">
          <ReportQueuePanel
            title={T.home.readyForCouncil}
            hint={T.home.readyForCouncilHint}
            block={data.reports_ready_for_council}
            hrefFor={(report) => `/audit/reports/${report.id}`}
            viewAllHref="/audit/reports"
            emptyLabel={T.home.noReadyReports}
            testId="ready-for-council"
          />
          <ReportQueuePanel
            title={T.home.draftReports}
            hint={T.home.draftReportsHint}
            block={data.draft_reports}
            hrefFor={(report) => `/audit/reports/${report.id}`}
            viewAllHref="/audit/reports"
            emptyLabel={T.home.noDraftReports}
          />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <QueuePanel
          title={T.home.lateInQueue}
          hint={T.home.lateInQueueHint.replace("{days}", lateDays)}
          block={late}
          href={`${BASE}?waiting_on=audit&waiting_over=${lateDays}`}
          detailBase={BASE}
          meta="waiting"
          tone="warning"
          emptyLabel={T.home.noLateInQueue.replace("{days}", lateDays)}
          testId="late-in-queue"
        />
        <QueuePanel
          title={T.home.highRiskStale}
          hint={T.home.highRiskStaleHint.replace("{days}", staleDays)}
          block={stale}
          href={`${BASE}?risk_level=high&open=true&waiting_over=${staleDays}`}
          detailBase={BASE}
          meta="waiting"
          tone="danger"
          emptyLabel={T.home.noHighRiskStale}
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Section title={T.home.overdueByDepartment} hint={T.home.overdueByDepartmentHint} padded>
          <div data-testid="overdue-by-department">
            <BarList
              emptyLabel={T.home.noOverdue}
              rows={departments.map((row) => ({
                key: String(row.department.id),
                label: row.department.name,
                sublabel: T.home.openOfDepartment.replace("{n}", String(row.open)),
                value: row.overdue,
                href: `${BASE}?overdue=1&report__department=${row.department.id}`,
              }))}
            />
          </div>
        </Section>
        <RecurrenceWatch
          items={data.action_center.possible_recurrences?.items ?? []}
          detailHref={(item) => `${BASE}/${item.id}`}
          viewAllHref={`${BASE}?is_recurring=true&recurrence_confirmed=false`}
        />
      </div>

      <RecentActivity detailBase={BASE} moreHref="/audit/notifications" compact />
    </div>
  );
}
