"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FilePlus2, FileText } from "lucide-react";

import { approachingSource, type ActionSource } from "@/components/dashboard/AttentionBoard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { RecurrenceWatch } from "@/components/home/RecurrenceWatch";
import { TodayAgenda } from "@/components/home/TodayAgenda";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { uniqueRecommendations } from "@/lib/home";
import { T, useI18n } from "@/lib/i18n";
import type { DashboardData } from "@/lib/types";

const BASE = "/audit/recommendations";

const QUEUES: Array<{ key: string; href: string }> = [
  { key: "overdue", href: `${BASE}?overdue=1` },
  { key: "responses_to_review", href: `${BASE}?status=audit_review` },
  { key: "plans_to_review", href: `${BASE}?status=action_plan_review` },
  { key: "verifications_pending", href: `${BASE}?status=submitted_for_verification` },
  { key: "closure_reviews", href: `${BASE}?status=closure_review` },
];

export default function AuditDashboard() {
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
  const approaching = approachingSource(sources, BASE);
  const recurrences = data.action_center.possible_recurrences?.items ?? [];

  return (
    <div className="animate-fade-in space-y-4">
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

      <ActionNow
        sources={sources}
        detailBase={BASE}
        viewAllHref={BASE}
        title={T.dashboard.hottest}
        hint={T.dashboard.auditReviewHint}
      />

      <RecurrenceWatch
        items={recurrences}
        detailHref={(item) => `${BASE}/${item.id}`}
        viewAllHref={`${BASE}?is_recurring=true`}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <TodayAgenda
          items={uniqueRecommendations(approaching ? [...sources, approaching] : sources)}
          detailHref={(item) => `${BASE}/${item.id}`}
        />
        <RecentActivity detailBase={BASE} limit={7} />
      </div>
    </div>
  );
}
