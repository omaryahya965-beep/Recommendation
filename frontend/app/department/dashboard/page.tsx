"use client";

import { ClipboardList, Users } from "lucide-react";

import { queueLabel, type ActionSource } from "@/components/dashboard/queues";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { PriorityMetrics } from "@/components/home/PriorityMetrics";
import { QueuePanel } from "@/components/home/Queues";
import { TeamPanel } from "@/components/home/RoleBlocks";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";

const BASE = "/department/recommendations";

/** Every link opens the register with the filter the server used for the count. */
const QUEUES: Array<{ key: string; href: string }> = [
  { key: "overdue", href: `${BASE}?overdue=1` },
  { key: "responses_needed", href: `${BASE}?status__in=pending_response,returned_for_revision` },
  {
    key: "plans_needed",
    href: `${BASE}?status__in=approved_for_implementation,action_plan_required,revision_required`,
  },
  { key: "implementations_to_review", href: `${BASE}?status=pending_head_review` },
];

export default function DepartmentDashboard() {
  useI18n();
  const { data, isLoading, isError, refetch } = useDashboard();

  const hero = (
    <HomeHero
      role="department_head"
      title={T.dashboard.departmentTitle}
      subtitle={T.dashboard.departmentHint}
      actions={[
        { href: BASE, label: T.register.title, icon: ClipboardList, primary: true },
        { href: "/department/team-progress", label: T.nav.teamProgress, icon: Users },
      ]}
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

  const sources: ActionSource[] = QUEUES.filter((queue) => data.action_center[queue.key]).map((queue) => ({
    key: queue.key,
    block: data.action_center[queue.key],
    href: queue.href,
  }));
  const dueSoonHref = `${BASE}?due_within=7`;

  return (
    <div className="animate-fade-in space-y-5">
      {hero}

      <PriorityMetrics
        items={[
          ...sources.map((source) => ({
            label: queueLabel(source.key),
            value: source.block.count,
            href: source.href,
            tone: source.key === "overdue" ? ("danger" as const) : ("warning" as const),
          })),
          { label: T.home.dueSoon, value: data.due_soon?.count ?? 0, href: dueSoonHref, tone: "warning" as const },
        ]}
      />

      <ActionNow
        sources={sources}
        detailBase={BASE}
        viewAllHref={BASE}
        title={T.dashboard.departmentPriorities}
        hint={T.dashboard.deptActionHint}
        showDepartment={false}
      />

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <QueuePanel
          title={T.home.dueSoon}
          hint={T.home.dueSoonHint}
          block={data.due_soon}
          href={dueSoonHref}
          detailBase={BASE}
          showDepartment={false}
          tone="warning"
          emptyLabel={T.home.noDueSoon}
          testId="due-soon"
        />
        <QueuePanel
          title={T.home.waitingOnOthers}
          hint={T.home.waitingOnOthersHint}
          block={data.waiting_on_others}
          href={`${BASE}?waiting_on=audit,council`}
          detailBase={BASE}
          meta="waiting"
          showDepartment={false}
          emptyLabel={T.home.noWaitingOnOthers}
          testId="waiting-on-others"
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <TeamPanel team={data.team ?? []} registerBase={BASE} teamHref="/department/team-progress" />
        <QueuePanel
          title={T.dashboard.executionBoard}
          hint={T.dashboard.executionBoardHint}
          block={data.in_execution}
          href={`${BASE}?stage=execution`}
          detailBase={BASE}
          showDepartment={false}
          emptyLabel={T.dashboard.queueEmpty}
        />
      </div>

      <RecentActivity role="department_head" compact />
    </div>
  );
}
