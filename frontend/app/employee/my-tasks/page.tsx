"use client";

import { AlarmClock, CalendarClock, CheckCircle2, ClipboardList, Hourglass, PlayCircle, RotateCcw } from "lucide-react";

import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { DashboardColumns, DashboardPage } from "@/components/home/DashboardLayout";
import { HomeHero, type HeroStat } from "@/components/home/HomeHero";
import { groupTasks, NextTaskCard, TaskBoard } from "@/components/home/TaskList";
import { QueueListCard, REASON_TONE } from "@/components/home/WorkQueue";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { caseHref, sectionForStatus } from "@/lib/caseLinks";
import { formatDate } from "@/lib/format";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import type { RecommendationListItem } from "@/lib/types";

const HOME = "/employee/my-tasks";
const REGISTER = "/employee/recommendations";

/** Every link opens the register with the filter the server used for the count. */
const LINKS = {
  returned: `${REGISTER}?status__in=returned_insufficient,partial,reopened`,
  overdue: `${REGISTER}?overdue=1`,
  upcoming: `${REGISTER}?due_within=30`,
  reviewing: `${REGISTER}?status__in=pending_head_review,submitted_for_verification,closure_review,pending_closure_council`,
};

const taskHref = (item: RecommendationListItem) => caseHref(HOME, item.id, sectionForStatus(item.status));

/**
 * The employee's home is a task list: the one task to do next, then every
 * task once in its most urgent group, and — apart — the work under review.
 */
export default function MyTasksPage() {
  useI18n();
  const { data, isLoading, isError, refetch } = useDashboard();
  const center = data?.action_center;

  const stats: HeroStat[] = center
    ? [
        { label: T.roleHome.statReturned, count: center.returned_for_more_evidence?.count ?? 0, href: LINKS.returned, icon: RotateCcw, tone: "danger" },
        { label: T.roleHome.statOverdue, count: center.overdue?.count ?? 0, href: LINKS.overdue, icon: AlarmClock, tone: "danger" },
        { label: T.roleHome.statDue, count: center.upcoming_deadlines?.count ?? 0, href: LINKS.upcoming, icon: CalendarClock, tone: "warning" },
        { label: T.roleHome.statInReview, count: data?.waiting_on_others?.count ?? 0, href: LINKS.reviewing, icon: Hourglass, tone: "primary" },
      ]
    : [];

  const hero = (
    <HomeHero
      role="employee"
      title={T.dashboard.employeeTitle}
      subtitle={T.dashboard.employeeHint}
      stats={stats}
      compact
      actions={[{ href: REGISTER, label: T.dashboard.myRecommendations, icon: ClipboardList, primary: true }]}
    />
  );

  // The hero is static: it renders at once, while only the data sections
  // wait for /api/dashboard/. Same wrapper in both branches, so the hero is
  // updated in place (not remounted) when the data arrives.
  if (isLoading || isError || !data || !center) {
    return (
      <DashboardPage>
        {hero}
        {isLoading ? <DashboardBodySkeleton /> : <ErrorBanner message={T.common.error} onRetry={() => refetch()} />}
      </DashboardPage>
    );
  }

  const facts = data.task_facts ?? {};
  const groups = groupTasks([
    { id: "returned", title: T.home.returnedWork, icon: RotateCcw, tone: "danger", href: LINKS.returned, block: center.returned_for_more_evidence },
    { id: "overdue", title: T.home.overdueWork, icon: AlarmClock, tone: "danger", href: LINKS.overdue, block: center.overdue },
    { id: "due", title: T.home.dueWork, icon: CalendarClock, tone: "warning", href: LINKS.upcoming, block: center.upcoming_deadlines },
    { id: "active", title: T.roleHome.inProgress, icon: PlayCircle, tone: "primary", href: REGISTER, block: data.active_tasks },
  ]);
  const firstGroup = groups.find((group) => group.items.length);
  const next = firstGroup?.items[0];

  return (
    <DashboardPage>
      {hero}

      <DashboardColumns
        main={
          <>
            {next && firstGroup ? (
              <NextTaskCard item={next} facts={facts[String(next.id)]} href={taskHref(next)} returned={firstGroup.id === "returned"} />
            ) : (
              <section
                className="flex items-center gap-4 rounded-2xl border border-success/25 bg-success-light/40 p-5"
                data-testid="all-clear"
              >
                <CheckCircle2 className="size-8 shrink-0 text-success-dark" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-[16px] font-bold text-success-dark">{T.home.allClear}</p>
                  <p className="text-[13px] text-ink-soft">
                    {T.home.nextDeadline}:{" "}
                    <span className="font-mono font-semibold text-ink" dir="ltr">
                      {data.next_deadline ? formatDate(data.next_deadline) : T.home.noNextDeadline}
                    </span>
                  </p>
                </div>
              </section>
            )}
            <TaskBoard groups={groups} facts={facts} hrefFor={taskHref} />
          </>
        }
        aside={
          <>
            {/* Submitted work: nothing to do but wait — drawn quieter. */}
            <QueueListCard
              title={T.home.waitingOnReviewers}
              hint={T.home.waitingOnReviewersHint}
              block={data.waiting_on_others}
              href={LINKS.reviewing}
              reason={{ id: "in_review", label: T.roleHome.statInReview, icon: Hourglass, tone: REASON_TONE.neutral }}
              detailHref={taskHref}
              showDepartment={false}
              emptyLabel={T.home.noWaitingOnReviewers}
              limit={4}
              testId="in-review"
              dense
              className="bg-subtle/40"
            />
            <div className="max-md:hidden">
              <RecentActivity role="employee" limit={3} compact />
            </div>
          </>
        }
      />
    </DashboardPage>
  );
}
