"use client";

import { AlarmClock, ClipboardList, FilePen, FilePlus2, FileText } from "lucide-react";

import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { DashboardColumns, DashboardPage } from "@/components/home/DashboardLayout";
import { HomeHero, type HeroStat } from "@/components/home/HomeHero";
import { AuditPriorities, CaseQueueCard, ReportQueueCard } from "@/components/home/WorkQueue";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import { AUDIT_REVIEW_QUEUES, queueHref } from "@/lib/registerQueues";

const BASE = "/audit/recommendations";
const REPORTS = "/audit/reports";

/**
 * Internal audit's home: what is waiting on audit's decision (newest first)
 * and what is late at the departments, with drafts and the latest activity
 * beside them. Every count opens the exact list it counted.
 */
export default function AuditDashboard() {
  useI18n();
  const { data, isLoading, isError, refetch } = useDashboard();
  const awaiting = data ? AUDIT_REVIEW_QUEUES.reduce((sum, queue) => sum + (data.action_center[queue]?.count ?? 0), 0) : 0;
  const stats: HeroStat[] = data
    ? [
        { label: T.queues.statAwaiting, count: awaiting, href: queueHref(BASE, "audit_priorities"), icon: ClipboardList, tone: "primary" },
        {
          label: T.queues.statOverdue,
          count: data.action_center.overdue?.count ?? 0,
          href: queueHref(BASE, "department_overdue"),
          icon: AlarmClock,
          tone: "danger",
        },
        {
          label: T.queues.drafts,
          count: data.draft_reports?.count ?? 0,
          href: `${REPORTS}?status=draft`,
          icon: FilePen,
          tone: "primary",
          desktopOnly: true,
        },
      ]
    : [];

  const hero = (
    <HomeHero
      role="audit"
      title={T.dashboard.auditTitle}
      subtitle={T.dashboard.auditHint}
      stats={stats}
      compact
      actions={[
        { href: "/audit/reports/new", label: T.reports.addReport, icon: FilePlus2, primary: true },
        { href: REPORTS, label: T.nav.reports, icon: FileText },
        { href: BASE, label: T.roleHome.registerShort, shortLabel: T.roleHome.registerTile, icon: ClipboardList },
      ]}
    />
  );

  // The hero renders at once; only the data sections wait for /api/dashboard/.
  if (isLoading || isError || !data) {
    return (
      <DashboardPage>
        {hero}
        {isLoading ? <DashboardBodySkeleton /> : <ErrorBanner message={T.common.error} onRetry={() => refetch()} />}
      </DashboardPage>
    );
  }

  return (
    <DashboardPage>
      {hero}
      <DashboardColumns
        main={
          <>
            <AuditPriorities blocks={data.action_center} detailBase={BASE} registerBase={BASE} />
            <CaseQueueCard
              queue="department_overdue"
              block={data.action_center.overdue}
              detailBase={BASE}
              registerBase={BASE}
              emptyLabel={T.home.noOverdue}
              limit={5}
              testId="department-overdue"
            />
          </>
        }
        aside={
          <>
            <ReportQueueCard
              title={T.queues.drafts}
              hint={T.queues.draftsHint}
              block={data.draft_reports}
              hrefFor={(report) => `${REPORTS}/${report.id}`}
              moreHref={`${REPORTS}?status=draft`}
              emptyLabel={T.home.noDraftReports}
              limit={4}
              testId="draft-reports"
              dense
            />
            {/* Phones reach the same feed from the bell; the home stays short. */}
            <div className="max-md:hidden">
              <RecentActivity role="audit" limit={3} compact />
            </div>
          </>
        }
      />
    </DashboardPage>
  );
}
