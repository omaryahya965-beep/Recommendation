"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, Building2, User, Calendar, BarChart4 } from "lucide-react";

import { ProgressBar } from "@/components/ui/Base";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { planProgress } from "@/lib/case";
import { caseTitle } from "@/lib/finding";
import { formatDate, recordCode } from "@/lib/format";
import { RESOLUTION_LABELS, T, useI18n } from "@/lib/i18n";
import type { RecommendationDetail } from "@/lib/types";
import { stageForStatus } from "@/lib/workflow";

function Meta({ label, children, icon: Icon }: { label: string; children: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) {
  useI18n();
  return (
    <div className="min-w-0 border-b border-line px-3 py-3 first:ps-3 sm:flex sm:items-start sm:gap-2.5 sm:border-b-0 sm:border-s sm:px-5 sm:py-3.5 sm:first:border-s-0 sm:first:ps-0">
      <div className="mb-1 hidden p-2 bg-subtle rounded-lg text-muted shrink-0 sm:mb-0 sm:block">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="mb-0.5 text-[13px] font-bold text-muted">{label}</p>
        <div className="truncate text-[14px] font-bold text-navy">{children}</div>
      </div>
    </div>
  );
}

/**
 * Identity strip for one audit case. Kept quieter than the current-action
 * band so the file answers "what is this?" without competing with "what now?".
 */
export function CaseHeader({
  rec,
  backHref,
  backLabel,
}: {
  rec: RecommendationDetail;
  backHref: string;
  backLabel: string;
}) {
  const { locale } = useI18n();
  const progress = planProgress(rec.action_plan);
  const title = caseTitle(rec.text, 120);
  const stage = stageForStatus(rec.status);
  const owner =
    rec.action_plan?.responsible_employee_detail?.full_name_ar ?? rec.responsible_employee ?? T.common.none;

  const DirBack = locale === "ar" ? ChevronRight : ChevronLeft;

  return (
    <header className="border-b border-line pb-6">
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-primary-dark"
      >
        <DirBack className="size-4" />
        {backLabel}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold text-muted" dir="ltr">
            {recordCode(rec.id)}
          </p>
          <h1 className="mt-1.5 font-heading text-[1.375rem] font-bold leading-tight text-navy md:text-2xl">
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={rec.status} size="lg" />
          {rec.is_recurring ? (
            <span className="inline-flex items-center rounded-full bg-warning-light/50 px-3 py-1 text-[12px] font-bold text-warning-dark ring-1 ring-warning/30">
              {rec.recurrence_confirmed ? T.case.recurrenceConfirmed : T.common.recurringBadge}
            </span>
          ) : null}
        </div>
      </div>

      {rec.resolution ? (
        <p className="mt-3 inline-flex rounded-md bg-success-light px-3 py-1 text-[13px] font-bold text-success-dark ring-1 ring-success/20">
          {T.case.resolution}: {RESOLUTION_LABELS[rec.resolution] ?? rec.resolution}
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-1 rounded-xl border border-line bg-surface shadow-sm sm:flex sm:flex-wrap sm:p-1">
        <Meta label={T.common.risk} icon={AlertIcon}>
          <RiskBadge level={rec.risk_level} />
        </Meta>
        <Meta label={T.common.priority} icon={BarChart4}>
          <span dir="ltr">{rec.priority_score}</span>
        </Meta>
        <Meta label={T.common.department} icon={Building2}>{rec.department_name}</Meta>
        <Meta label={T.common.responsible} icon={User}>{owner}</Meta>
        <Meta label={T.common.targetDate} icon={Calendar}>
          <span className="inline-flex items-center gap-2">
            <span dir="ltr">{formatDate(rec.target_date)}</span>
            {rec.target_date ? <OverdueBadge targetDate={rec.target_date} overdue={rec.overdue} /> : null}
          </span>
        </Meta>
        <Meta label={T.case.currentStage} icon={Clock}>{stage.label}</Meta>
        {rec.action_plan ? (
          <Meta label={T.case.progress} icon={BarChart4}>
            <div className="min-w-[8rem]">
              <ProgressBar value={progress} />
            </div>
          </Meta>
        ) : null}
      </dl>
    </header>
  );
}

function AlertIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
