"use client";

import { ClipboardList, FilePlus2, FileText } from "lucide-react";

import { queueLabel, type ActionSource } from "@/components/dashboard/AttentionBoard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { PriorityMetrics } from "@/components/home/PriorityMetrics";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton } from "@/components/ui/EmptyState";
import { useDashboard } from "@/lib/hooks";
import { T, useI18n } from "@/lib/i18n";

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
  const { data, isLoading, isError, refetch } = useDashboard();

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const sources: ActionSource[] = QUEUES.filter((queue) => data.action_center[queue.key]).map((queue) => ({
    key: queue.key,
    block: data.action_center[queue.key],
    href: queue.href,
  }));
  return (
    <div className="animate-fade-in min-w-0 space-y-5">
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

      <PriorityMetrics
        items={sources.slice(0, 5).map((source) => ({
          label: queueLabel(source.key),
          value: source.block.count,
          href: source.href,
          tone: source.key === "overdue" ? "danger" : source.key.includes("review") ? "warning" : "primary",
        }))}
      />

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
        <ActionNow
          className="h-full"
          sources={sources}
          detailBase={BASE}
          viewAllHref={BASE}
          limit={3}
          title={T.dashboard.hottest}
          hint={T.dashboard.auditReviewHint}
        />
        <RecentActivity detailBase={BASE} moreHref="/audit/notifications" />
      </div>
    </div>
  );
}
