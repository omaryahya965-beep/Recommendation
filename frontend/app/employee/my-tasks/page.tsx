"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";

import { splitDue, type ActionSource } from "@/components/dashboard/AttentionBoard";
import { EmployeeEvidence, EmployeePlans } from "@/components/dashboard/EmployeeDesk";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { TodayAgenda } from "@/components/home/TodayAgenda";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { uniqueRecommendations } from "@/lib/home";
import { T, useI18n } from "@/lib/i18n";
import type { DashboardData } from "@/lib/types";

const HOME = "/employee/my-tasks";
const REGISTER = "/employee/recommendations";

export default function MyTasksPage() {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/api/dashboard/"),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const sources: ActionSource[] = [];
  const overdue = data.action_center.overdue;
  if (overdue) sources.push({ key: "overdue", block: overdue, href: REGISTER });
  const returned = data.action_center.returned_for_more_evidence;
  if (returned) sources.push({ key: "returned_for_more_evidence", block: returned, href: REGISTER });
  sources.push(...splitDue(data.action_center.upcoming_deadlines, REGISTER));
  const waiting = data.action_center.waiting_head_review;
  if (waiting) sources.push({ key: "waiting_head_review", block: waiting, href: REGISTER });

  const tasks = data.active_tasks?.items ?? [];

  return (
    <div className="animate-fade-in space-y-4">
      <HomeHero
        role="employee"
        title={T.dashboard.employeeTitle}
        subtitle={T.dashboard.employeeHint}
        actions={[{ href: REGISTER, label: T.dashboard.myRecommendations, icon: ClipboardList, primary: true }]}
      />

      <ActionNow
        sources={sources}
        detailBase={HOME}
        viewAllHref={REGISTER}
        title={T.dashboard.myActions}
        hint={T.dashboard.myActionsHint}
      />

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <TodayAgenda items={uniqueRecommendations(sources, tasks)} detailHref={(item) => `${HOME}/${item.id}`} />
        <RecentActivity detailBase={HOME} limit={5} compact />
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <EmployeePlans items={tasks} detailBase={HOME} />
        <EmployeeEvidence items={tasks} detailBase={HOME} />
      </div>
    </div>
  );
}
