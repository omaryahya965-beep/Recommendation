"use client";

import { ClipboardList, Users } from "lucide-react";

import { queueLabel, type ActionSource } from "@/components/dashboard/AttentionBoard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { ExecutionNow } from "@/components/home/ExecutionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { PriorityMetrics } from "@/components/home/PriorityMetrics";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardBodySkeleton } from "@/components/ui/EmptyState";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";

const BASE = "/department/recommendations";

const QUEUES: Array<{ key: string; href: string }> = [
  { key: "overdue", href: `${BASE}?overdue=1` },
  { key: "responses_needed", href: `${BASE}?status=pending_response` },
  { key: "plans_needed", href: `${BASE}?status=action_plan_required` },
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
  const inExecution = data.in_execution?.items ?? [];

  return (
    <div className="animate-fade-in space-y-5">
      {hero}

      <PriorityMetrics
        items={sources.slice(0, 4).map((source) => ({
          label: queueLabel(source.key),
          value: source.block.count,
          href: source.href,
          tone: source.key === "overdue" ? "danger" : "warning",
        }))}
      />

      <ExecutionNow
        items={inExecution}
        detailHref={(item) => `${BASE}/${item.id}`}
        viewAllHref="/department/team-progress"
      />

      <ActionNow
        sources={sources}
        detailBase={BASE}
        viewAllHref={BASE}
        title={T.dashboard.departmentPriorities}
        hint={T.dashboard.deptActionHint}
        showDepartment={false}
      />

      <RecentActivity detailBase={BASE} compact />
    </div>
  );
}
