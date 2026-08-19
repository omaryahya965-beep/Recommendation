"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Users } from "lucide-react";

import { type ActionSource } from "@/components/dashboard/AttentionBoard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { ExecutionNow } from "@/components/home/ExecutionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { TodayAgenda } from "@/components/home/TodayAgenda";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { uniqueRecommendations } from "@/lib/home";
import { T, useI18n } from "@/lib/i18n";
import type { DashboardData } from "@/lib/types";

const BASE = "/department/recommendations";

const QUEUES: Array<{ key: string; href: string }> = [
  { key: "overdue", href: `${BASE}?overdue=1` },
  { key: "responses_needed", href: `${BASE}?status=pending_response` },
  { key: "plans_needed", href: `${BASE}?status=action_plan_required` },
  { key: "implementations_to_review", href: `${BASE}?status=pending_head_review` },
];

export default function DepartmentDashboard() {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard/"),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const sources: ActionSource[] = QUEUES.filter((queue) => data.action_center[queue.key]).map((queue) => ({
    key: queue.key,
    block: data.action_center[queue.key],
    href: queue.href,
  }));
  const inExecution = data.in_execution?.items ?? [];

  return (
    <div className="animate-fade-in space-y-4">
      <HomeHero
        role="department_head"
        title={T.dashboard.departmentTitle}
        subtitle={T.dashboard.departmentHint}
        actions={[
          { href: BASE, label: T.register.title, icon: ClipboardList, primary: true },
          { href: "/department/team-progress", label: T.nav.teamProgress, icon: Users },
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

      <ExecutionNow
        items={inExecution}
        detailHref={(item) => `${BASE}/${item.id}`}
        viewAllHref="/department/team-progress"
      />

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <TodayAgenda
          items={uniqueRecommendations(sources, inExecution)}
          detailHref={(item) => `${BASE}/${item.id}`}
          showDepartment={false}
        />
        <RecentActivity detailBase={BASE} limit={5} compact />
      </div>
    </div>
  );
}
