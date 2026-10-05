"use client";

import { CalendarClock, CheckCircle2, ClipboardList } from "lucide-react";
import Link from "next/link";

import { rank, type ActionSource } from "@/components/dashboard/queues";
import { EmployeeEvidence, EmployeePlans } from "@/components/dashboard/EmployeeDesk";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { HomeHero } from "@/components/home/HomeHero";
import { CaseDue, QueuePanel } from "@/components/home/Queues";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { clipTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";
import { STATUS_NEXT_ACTION } from "@/lib/workflow";

const HOME = "/employee/my-tasks";
const REGISTER = "/employee/recommendations";

/** Every link opens the register with the filter the server used for the count. */
const LINKS = {
  returned: `${REGISTER}?status__in=returned_insufficient,partial,reopened`,
  overdue: `${REGISTER}?overdue=1`,
  upcoming: `${REGISTER}?due_within=30`,
  reviewing: `${REGISTER}?status__in=pending_head_review,submitted_for_verification,closure_review,pending_closure_council`,
};

export default function MyTasksPage() {
  useI18n();
  const { data, isLoading, isError, refetch } = useDashboard();

  const hero = (
    <HomeHero
      role="employee"
      title={T.dashboard.employeeTitle}
      subtitle={T.dashboard.employeeHint}
      actions={[{ href: REGISTER, label: T.dashboard.myRecommendations, icon: ClipboardList, primary: true }]}
    />
  );

  // The hero is static: it renders at once, while only the data sections
  // wait for /api/dashboard/. Same wrapper in both branches, so the hero is
  // updated in place (not remounted) when the data arrives.
  if (isLoading || isError || !data) {
    return (
      <div className="animate-fade-in space-y-5">
        {hero}
        {isLoading ? <DashboardBodySkeleton /> : <ErrorBanner message={T.common.error} onRetry={() => refetch()} />}
      </div>
    );
  }

  const center = data.action_center;
  const sources: ActionSource[] = [
    { key: "returned_for_more_evidence", block: center.returned_for_more_evidence, href: LINKS.returned },
    { key: "overdue", block: center.overdue, href: LINKS.overdue },
    { key: "upcoming_deadlines", block: center.upcoming_deadlines, href: LINKS.upcoming },
  ].filter((source) => source.block);
  const next = rank(sources)[0];
  const nextAction = next ? STATUS_NEXT_ACTION[next.item.status] : null;
  const tasks = data.active_tasks?.items ?? [];

  return (
    <div className="animate-fade-in space-y-5">
      {hero}

      {next ? (
        <section
          className="rounded-2xl bg-inverse p-5 text-on-inverse shadow-sm md:p-6"
          aria-labelledby="next-task-title"
          data-testid="next-task"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] font-bold uppercase tracking-wider text-white/65">{T.workflow.actNow}</p>
            <p className="text-[12.5px] text-white/75">
              {T.home.taskCounts
                .replace("{active}", String(data.active_tasks?.count ?? 0))
                .replace("{returned}", String(center.returned_for_more_evidence?.count ?? 0))
                .replace("{overdue}", String(center.overdue?.count ?? 0))}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RecordId id={next.item.id} />
            <RiskBadge level={next.item.risk_level} />
            <CaseDue item={next.item} />
          </div>
          <h2 id="next-task-title" className="mt-3 font-heading text-xl font-bold leading-snug text-white">
            {nextAction?.action ?? T.dashboard.open}
          </h2>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-white/85">{clipTitle(next.item.title, 140)}</p>
          <Link
            href={`${HOME}/${next.item.id}`}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-white px-8 text-[15px] font-bold text-navy shadow-sm hover:bg-white/90 sm:w-auto"
          >
            {T.dashboard.open}
          </Link>
        </section>
      ) : (
        <section className="flex items-center gap-4 rounded-2xl border border-success/25 bg-success-light/40 p-5" data-testid="all-clear">
          <CheckCircle2 className="size-8 shrink-0 text-success-dark" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[16px] font-bold text-success-dark">{T.home.allClear}</p>
            <p className="text-[13px] text-ink-soft">{T.home.allClearHint}</p>
          </div>
          <p className="hidden shrink-0 items-center gap-1.5 text-[12.5px] text-ink-soft sm:inline-flex">
            <CalendarClock className="size-4" aria-hidden />
            {T.home.nextDeadline}:{" "}
            <span className="font-mono font-semibold text-ink" dir="ltr">
              {data.next_deadline ? formatDate(data.next_deadline) : T.home.noNextDeadline}
            </span>
          </p>
        </section>
      )}

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <QueuePanel
          title={T.home.returnedWork}
          block={center.returned_for_more_evidence}
          href={LINKS.returned}
          detailBase={HOME}
          showDepartment={false}
          tone="danger"
          emptyLabel={T.dashboard.queueEmpty}
          testId="returned-work"
        />
        <QueuePanel
          title={T.home.overdueWork}
          block={center.overdue}
          href={LINKS.overdue}
          detailBase={HOME}
          showDepartment={false}
          tone="danger"
          emptyLabel={T.dashboard.queueEmpty}
        />
        <QueuePanel
          title={T.home.dueWork}
          block={center.upcoming_deadlines}
          href={LINKS.upcoming}
          detailBase={HOME}
          showDepartment={false}
          tone="warning"
          emptyLabel={T.dashboard.queueEmpty}
        />
        <QueuePanel
          title={T.home.waitingOnReviewers}
          hint={T.home.waitingOnReviewersHint}
          block={data.waiting_on_others}
          href={LINKS.reviewing}
          detailBase={HOME}
          meta="waiting"
          showDepartment={false}
          emptyLabel={T.home.noWaitingOnReviewers}
        />
      </div>

      <QueuePanel
        title={T.home.activeTasks}
        hint={T.home.activeTasksHint}
        block={data.active_tasks}
        href={REGISTER}
        detailBase={HOME}
        showDepartment={false}
        limit={10}
        emptyLabel={T.home.noActiveTasks}
        testId="active-tasks"
      />

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <EmployeePlans items={tasks} detailBase={HOME} />
        <EmployeeEvidence items={tasks} detailBase={HOME} />
      </div>

      <RecentActivity detailBase={HOME} compact />
    </div>
  );
}
