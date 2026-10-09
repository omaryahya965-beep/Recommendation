"use client";

import { AlarmClock, ClipboardList, FilePlus2, FileText } from "lucide-react";

import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { HomeHero, type HeroStat, type HeroSummaryItem } from "@/components/home/HomeHero";
import { AuditPriorities, CaseQueueCard, ReportQueueCard } from "@/components/home/WorkQueue";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { plural } from "@/lib/format";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import { AUDIT_REVIEW_QUEUES, queueHref } from "@/lib/registerQueues";

const BASE = "/audit/recommendations";
const REPORTS = "/audit/reports";

/**
 * Internal audit's home: what is waiting on audit's decision (newest first),
 * what is late at the departments, drafts, and the latest activity. Every
 * count opens the exact list it counted.
 */
export default function AuditDashboard() {
  useI18n();
  const { data, isLoading, isError, refetch } = useDashboard();
  const awaiting = data ? AUDIT_REVIEW_QUEUES.reduce((sum, queue) => sum + (data.action_center[queue]?.count ?? 0), 0) : 0;
  const overdue = data?.action_center.overdue?.count ?? 0;
  const summary: HeroSummaryItem[] = data
    ? [
        awaiting
          ? { label: plural(awaiting, T.queues.awaitingYou), href: queueHref(BASE, "audit_priorities"), tone: "primary" as const }
          : { label: T.queues.allClear, href: BASE, tone: "success" as const },
        ...(overdue
          ? [{ label: plural(overdue, T.queues.overdueAtDepartments), href: queueHref(BASE, "department_overdue"), tone: "danger" as const }]
          : []),
      ]
    : [];
  const stats: HeroStat[] = data
    ? [
        { label: T.queues.statAwaiting, count: awaiting, href: queueHref(BASE, "audit_priorities"), icon: ClipboardList, tone: "primary" },
        { label: T.queues.statOverdue, count: overdue, href: queueHref(BASE, "department_overdue"), icon: AlarmClock, tone: "danger" },
      ]
    : [];

  const hero = (
    <HomeHero
      role="audit"
      title={T.dashboard.auditTitle}
      subtitle={T.dashboard.auditHint}
      summary={summary}
      stats={stats}
      actions={[
        { href: "/audit/reports/new", label: T.reports.addReport, icon: FilePlus2, primary: true },
        { href: REPORTS, label: T.nav.reports, icon: FileText },
        { href: BASE, label: T.roleHome.registerShort, shortLabel: T.roleHome.registerTile, icon: ClipboardList },
      ]}
    />
  );
  if (isLoading || isError || !data) {
    return (
      <div className="animate-fade-in min-w-0 space-y-5">
        {hero}
        {isLoading ? <DashboardBodySkeleton /> : <ErrorBanner message={T.common.error} onRetry={() => refetch()} />}
      </div>
    );
  }

  return (
    <div className="animate-fade-in min-w-0 space-y-5 md:space-y-6">
      {hero}

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 md:gap-5 lg:grid-cols-2">
        <AuditPriorities blocks={data.action_center} detailBase={BASE} registerBase={BASE} />
        <div className="flex min-w-0 flex-col">
          <CaseQueueCard
            queue="department_overdue"
            block={data.action_center.overdue}
            detailBase={BASE}
            registerBase={BASE}
            emptyLabel={T.home.noOverdue}
            limit={5}
            testId="department-overdue"
          />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 md:gap-5 lg:grid-cols-2">
        <ReportQueueCard
          title={T.queues.drafts}
          hint={T.queues.draftsHint}
          block={data.draft_reports}
          hrefFor={(report) => `${REPORTS}/${report.id}`}
          moreHref={`${REPORTS}?status=draft`}
          emptyLabel={T.home.noDraftReports}
          limit={4}
          testId="draft-reports"
        />
        {/* Phones reach the same feed from the bell; the home stays short. */}
        <div className="flex min-w-0 flex-col max-md:hidden">
          <RecentActivity role="audit" limit={3} compact />
        </div>
      </div>
    </div>
  );
}
