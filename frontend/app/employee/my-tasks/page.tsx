"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";

import { rank, splitDue, type ActionSource } from "@/components/dashboard/AttentionBoard";
import { EmployeeEvidence, EmployeePlans } from "@/components/dashboard/EmployeeDesk";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { ErrorBanner } from "@/components/ui/Base";
import { DashboardSkeleton } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { useDashboard } from "@/lib/hooks";
import { caseTitle } from "@/lib/finding";
import { T, useI18n } from "@/lib/i18n";
import { STATUS_NEXT_ACTION } from "@/lib/workflow";

const HOME = "/employee/my-tasks";
const REGISTER = "/employee/recommendations";

export default function MyTasksPage() {
  useI18n();
  const { data, isLoading, isError, refetch } = useDashboard();

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
  const next = rank(sources)[0];
  const nextAction = next ? STATUS_NEXT_ACTION[next.item.status] : null;

  return (
    <div className="animate-fade-in space-y-5">
      <HomeHero
        role="employee"
        title={T.dashboard.employeeTitle}
        subtitle={T.dashboard.employeeHint}
        actions={[{ href: REGISTER, label: T.dashboard.myRecommendations, icon: ClipboardList, primary: true }]}
      />

      {next ? (
        <section className="section-elevated border-transparent bg-gradient-to-br from-inverse via-inverse to-[#1a4b66] p-5 md:p-6 text-on-inverse shadow-[0_8px_32px_rgba(24,59,78,0.25)] relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.03)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_8s_linear_infinite]" aria-hidden />
          <div className="relative z-10">
            <p className="text-[13px] font-bold text-white/70 uppercase tracking-wide">{T.workflow.actNow}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RecordId id={next.item.id} />
              <RiskBadge level={next.item.risk_level} />
              <OverdueBadge targetDate={next.item.target_date} overdue={next.item.overdue} />
            </div>
            <h2 className="mt-4 font-heading text-[1.375rem] font-bold leading-snug drop-shadow-sm">
              {nextAction?.action ?? T.dashboard.open}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-white/90">{caseTitle(next.item.text, 140)}</p>
            <Link
              href={`${HOME}/${next.item.id}`}
              className="mt-5 flex min-h-12 w-full sm:w-auto sm:px-8 sm:inline-flex items-center justify-center rounded-lg bg-white text-[15px] font-bold text-inverse shadow-md transition-all hover:bg-white/90 hover:shadow-lg active:scale-95"
            >
              {T.dashboard.open}
            </Link>
          </div>
        </section>
      ) : null}

      <ActionNow
        sources={sources}
        detailBase={HOME}
        viewAllHref={REGISTER}
        title={T.dashboard.myActions}
        hint={T.dashboard.myActionsHint}
      />

      <RecentActivity detailBase={HOME} compact />

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <EmployeePlans items={tasks} detailBase={HOME} />
        <EmployeeEvidence items={tasks} detailBase={HOME} />
      </div>
    </div>
  );
}
