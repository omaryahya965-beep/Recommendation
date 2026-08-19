"use client";

import Link from "next/link";

import { DirBack } from "@/components/i18n/DirIcon";

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

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  useI18n();
  return (
    <div className="min-w-0 border-s border-line px-4 py-3 first:border-s-0 first:ps-0">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <div className="mt-1 truncate text-[13px] font-medium text-ink">{children}</div>
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
  useI18n();
  const progress = planProgress(rec.action_plan);
  const title = caseTitle(rec.text, 120);
  const stage = stageForStatus(rec.status);
  const owner =
    rec.action_plan?.responsible_employee_detail?.full_name_ar ?? rec.responsible_employee ?? T.common.none;

  return (
    <header className="border-b border-line pb-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-navy"
      >
        <DirBack className="size-4" />
        {backLabel}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm tracking-wide text-muted" dir="ltr">
            {recordCode(rec.id)}
          </p>
          <h1 className="mt-1 font-heading text-xl font-bold leading-snug text-navy">
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={rec.status} size="lg" />
          {rec.is_recurring ? (
            <span className="inline-flex items-center rounded-md border border-warning/30 bg-warning-light px-2 py-0.5 text-[12px] font-medium text-warning-dark">
              {rec.recurrence_confirmed ? T.case.recurrenceConfirmed : T.common.recurringBadge}
            </span>
          ) : null}
        </div>
      </div>

      {rec.resolution ? (
        <p className="mt-3 inline-flex rounded-md bg-success-light px-2.5 py-1 text-[13px] font-medium text-success-dark">
          {T.case.resolution}: {RESOLUTION_LABELS[rec.resolution] ?? rec.resolution}
        </p>
      ) : null}

      <dl className="mt-4 flex flex-wrap rounded-(--radius-card) border border-line bg-surface">
        <Meta label={T.common.risk}>
          <RiskBadge level={rec.risk_level} />
        </Meta>
        <Meta label={T.common.priority}>
          <span dir="ltr">{rec.priority_score}</span>
        </Meta>
        <Meta label={T.common.department}>{rec.department_name}</Meta>
        <Meta label={T.common.responsible}>{owner}</Meta>
        <Meta label={T.common.targetDate}>
          <span className="inline-flex items-center gap-2">
            <span dir="ltr">{formatDate(rec.target_date)}</span>
            {rec.target_date ? <OverdueBadge targetDate={rec.target_date} overdue={rec.overdue} /> : null}
          </span>
        </Meta>
        <Meta label={T.case.currentStage}>{stage.label}</Meta>
        {rec.action_plan ? (
          <Meta label={T.case.progress}>
            <div className="min-w-[8rem]">
              <ProgressBar value={progress} label={T.case.progress} />
            </div>
          </Meta>
        ) : null}
      </dl>
    </header>
  );
}
