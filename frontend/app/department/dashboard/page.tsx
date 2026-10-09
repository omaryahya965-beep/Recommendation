"use client";

import {
  AlarmClock,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Hourglass,
  MessageSquareReply,
  Users,
} from "lucide-react";

import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { DashboardColumns, DashboardPage } from "@/components/home/DashboardLayout";
import { HomeHero, type HeroStat } from "@/components/home/HomeHero";
import { TeamPanel } from "@/components/home/RoleBlocks";
import {
  byUrgency,
  QueueListCard,
  REASON_TONE,
  TabbedQueueCard,
  type QueueReason,
  type QueueTab,
} from "@/components/home/WorkQueue";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { caseHref, sectionForStatus } from "@/lib/caseLinks";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";

const BASE = "/department/recommendations";

/** The statuses behind each department queue (the server's definitions). */
const STATUSES = {
  responses_needed: ["pending_response", "returned_for_revision"],
  plans_needed: ["approved_for_implementation", "action_plan_required", "revision_required"],
  implementations_to_review: ["pending_head_review"],
} as const;

type DeptQueue = keyof typeof STATUSES;

/** Every link opens the register with the filter the server used for the count. */
const HREF: Record<DeptQueue | "overdue" | "due_soon" | "waiting" | "priorities", string> = {
  responses_needed: `${BASE}?status__in=${STATUSES.responses_needed.join(",")}`,
  plans_needed: `${BASE}?status__in=${STATUSES.plans_needed.join(",")}`,
  implementations_to_review: `${BASE}?status=pending_head_review`,
  priorities: `${BASE}?status__in=${Object.values(STATUSES).flat().join(",")}`,
  overdue: `${BASE}?overdue=1`,
  due_soon: `${BASE}?due_within=7`,
  waiting: `${BASE}?waiting_on=audit,council`,
};

const detailHref = (item: RecommendationListItem) => caseHref(BASE, item.id, sectionForStatus(item.status));

/**
 * The department head's home: what needs the head in the department now
 * (responses, plans, implementation reviews), what is late, who on the team
 * needs attention, and — apart from that — what waits on audit or Council.
 */
export default function DepartmentDashboard() {
  useI18n();
  const { data, isLoading, isError, refetch } = useDashboard();
  const center = data?.action_center;

  const reasons: Record<DeptQueue | "overdue" | "due_soon" | "waiting", QueueReason> = {
    responses_needed: { id: "responses_needed", label: T.roleHome.statResponses, icon: MessageSquareReply, tone: REASON_TONE.info },
    plans_needed: { id: "plans_needed", label: T.roleHome.statPlans, icon: ClipboardList, tone: REASON_TONE.primary },
    implementations_to_review: {
      id: "implementations_to_review",
      label: T.roleHome.statReviews,
      icon: ClipboardCheck,
      tone: REASON_TONE.warning,
    },
    overdue: { id: "overdue", label: T.roleHome.deptOverdue, icon: AlarmClock, tone: REASON_TONE.danger },
    due_soon: { id: "due_soon", label: T.home.dueSoon, icon: CalendarClock, tone: REASON_TONE.warning },
    waiting: { id: "waiting", label: T.home.waitingOnOthers, icon: Hourglass, tone: REASON_TONE.neutral },
  };

  const stats: HeroStat[] = center
    ? [
        { label: T.roleHome.statResponses, count: center.responses_needed?.count ?? 0, href: HREF.responses_needed, icon: MessageSquareReply, tone: "primary" },
        { label: T.roleHome.statPlans, count: center.plans_needed?.count ?? 0, href: HREF.plans_needed, icon: ClipboardList, tone: "primary" },
        {
          label: T.roleHome.statReviews,
          count: center.implementations_to_review?.count ?? 0,
          href: HREF.implementations_to_review,
          icon: ClipboardCheck,
          tone: "warning",
        },
        { label: T.roleHome.statDeptOverdue, count: center.overdue?.count ?? 0, href: HREF.overdue, icon: AlarmClock, tone: "danger" },
      ]
    : [];

  const hero = (
    <HomeHero
      role="department_head"
      title={T.dashboard.departmentTitle}
      subtitle={T.dashboard.departmentHint}
      stats={stats}
      compact
      actions={[
        { href: BASE, label: T.roleHome.registerShort, shortLabel: T.roleHome.registerTile, icon: ClipboardList, primary: true },
        { href: "/department/team-progress", label: T.nav.teamProgress, icon: Users },
      ]}
    />
  );

  // The hero renders at once; only the data sections wait for /api/dashboard/.
  if (isLoading || isError || !data || !center) {
    return (
      <DashboardPage>
        {hero}
        {isLoading ? <DashboardBodySkeleton /> : <ErrorBanner message={T.common.error} onRetry={() => refetch()} />}
      </DashboardPage>
    );
  }

  const tabs: QueueTab[] = (Object.keys(STATUSES) as DeptQueue[]).map((queue) => ({
    reason: reasons[queue],
    hint: T.roleHome[
      queue === "responses_needed" ? "responsesHint" : queue === "plans_needed" ? "plansHint" : "reviewsHint"
    ],
    block: center[queue],
    href: HREF[queue],
  }));

  return (
    <DashboardPage>
      {hero}
      <DashboardColumns
        main={
          <>
            <TabbedQueueCard
              title={T.dashboard.departmentPriorities}
              hint={T.dashboard.deptActionHint}
              titleId="department-priorities-title"
              tabs={tabs}
              allHref={HREF.priorities}
              order={byUrgency}
              orderLabel={T.roleHome.mostUrgentFirst}
              detailHref={detailHref}
              timing="deadline"
              showDepartment={false}
              limit={5}
              emptyTitle={T.dashboard.nothingPending}
              emptyHint={T.dashboard.nothingPendingHint}
              testId="department-priorities"
              moreTestId="department-priorities-more"
            />
            <QueueListCard
              title={T.roleHome.deptOverdue}
              hint={T.roleHome.deptOverdueHint}
              block={center.overdue}
              href={HREF.overdue}
              reason={reasons.overdue}
              detailHref={detailHref}
              tone="danger"
              timing="deadline"
              showDepartment={false}
              emptyLabel={T.roleHome.noDeptOverdue}
              limit={5}
              testId="department-overdue"
            />
            <TeamPanel team={data.team ?? []} registerBase={BASE} teamHref="/department/team-progress" />
          </>
        }
        aside={
          <>
            <QueueListCard
              title={T.home.dueSoon}
              hint={T.home.dueSoonHint}
              block={data.due_soon}
              href={HREF.due_soon}
              reason={reasons.due_soon}
              detailHref={detailHref}
              tone="warning"
              timing="deadline"
              showDepartment={false}
              emptyLabel={T.home.noDueSoon}
              limit={4}
              testId="due-soon"
              dense
            />
            {/* Not the department's delay: shown for follow-up only, drawn quieter. */}
            <QueueListCard
              title={T.home.waitingOnOthers}
              hint={T.home.waitingOnOthersHint}
              block={data.waiting_on_others}
              href={HREF.waiting}
              reason={reasons.waiting}
              detailHref={detailHref}
              showDepartment={false}
              emptyLabel={T.home.noWaitingOnOthers}
              limit={3}
              testId="waiting-on-others"
              dense
              className="bg-subtle/40 [&_ul]:bg-surface/60"
            />
            {/* Phones reach the same feed from the bell; the home stays short. */}
            <div className="max-md:hidden">
              <RecentActivity role="department_head" limit={3} compact />
            </div>
          </>
        }
      />
    </DashboardPage>
  );
}
