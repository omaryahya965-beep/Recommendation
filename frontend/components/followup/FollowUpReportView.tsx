"use client";

import { AlertTriangle, CalendarClock, CalendarRange, History, Printer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button, Callout } from "@/components/ui/Base";
import { LedgerCell, LedgerTable, RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StampBadge } from "@/components/ui/StampBadge";
import { loadAuth } from "@/lib/api";
import { cn } from "@/lib/cn";
import { caseTitle } from "@/lib/finding";
import { dayCount, formatDate, formatNumber, plural } from "@/lib/format";
import { STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import type {
  FollowUpExecutiveSummary,
  FollowUpItem,
  FollowUpSnapshot,
  StageId,
  User,
} from "@/lib/types";
import { localizedWorkflowStages } from "@/lib/workflow";

export function recommendationHref(id: number) {
  const role = loadAuth()?.user.role;
  if (role === "department_head") return `/department/recommendations/${id}`;
  if (role === "council") return `/council/recommendations/${id}`;
  if (role === "employee") return `/employee/my-tasks/${id}`;
  return `/audit/recommendations/${id}`;
}

function itemTitle(item: FollowUpItem) {
  return item.title || caseTitle(item.text ?? "", 120);
}

function Kpi({
  label,
  value,
  suffix,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | undefined;
  suffix?: string;
  hint?: string | null;
  tone?: "neutral" | "danger" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "danger" && value ? "border-danger/25 bg-danger-light/40" : "border-line/60 bg-subtle/40",
        tone === "success" && "border-success/25 bg-success-light/30"
      )}
    >
      <dt className="text-[12px] font-semibold text-ink-soft">{label}</dt>
      <dd className="mt-1.5 font-heading text-[1.6rem] font-bold leading-none text-navy">
        <span className="font-mono" dir="ltr">
          {formatNumber(value ?? 0)}
        </span>
        {suffix ? <span className="ms-0.5 text-[14px] font-bold text-ink-soft">{suffix}</span> : null}
      </dd>
      {hint ? <p className="mt-1.5 text-[11.5px] font-medium text-ink-soft">{hint}</p> : null}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 font-heading text-[15px] font-bold text-navy">
      <span className="h-3.5 w-1 rounded-full bg-primary" aria-hidden />
      {children}
    </h3>
  );
}

function StageBars({ byStage }: { byStage: Partial<Record<StageId, number>> }) {
  useI18n();
  const stages = localizedWorkflowStages();
  const max = Math.max(1, ...stages.map((stage) => byStage[stage.id] ?? 0));
  return (
    <ul className="space-y-2">
      {stages.map((stage) => {
        const count = byStage[stage.id] ?? 0;
        return (
          <li key={stage.id} className="grid grid-cols-[minmax(7rem,11rem)_1fr_2.5rem] items-center gap-3">
            <span className="truncate text-[13px] font-medium text-ink">{stage.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-subtle">
              <span
                className={cn("block h-full rounded-full", stage.id === "closed" ? "bg-success" : "bg-primary")}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className="text-end font-mono text-[13px] font-bold text-navy" dir="ltr">
              {count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CaseTable({
  items,
  showDeadline,
  legacy = false,
}: {
  items: FollowUpItem[];
  showDeadline: boolean;
  legacy?: boolean;
}) {
  useI18n();
  return (
    <LedgerTable
      headers={[
        T.table.number,
        T.table.recommendation,
        T.common.department,
        T.common.risk,
        T.followup.statusAsOf,
        showDeadline ? T.followup.deadlineCol : T.common.date,
      ]}
      empty={T.followup.nothing}
    >
      {items.map((item) => {
        const href = recommendationHref(item.id);
        return (
          <tr key={item.id} className="align-top transition-colors hover:bg-subtle/60">
            <LedgerCell mono>
              <Link href={href} className="hover:text-primary-dark">
                <RecordId id={item.id} />
              </Link>
            </LedgerCell>
            <LedgerCell className="max-w-md">
              <Link href={href} className="block font-medium text-ink hover:text-primary-dark hover:underline">
                <span className="line-clamp-2">{itemTitle(item)}</span>
              </Link>
              {item.responsible ? <span className="mt-0.5 block text-[12px] text-muted">{item.responsible}</span> : null}
            </LedgerCell>
            <LedgerCell>{item.department}</LedgerCell>
            <LedgerCell>
              <RiskBadge level={item.risk_level} />
            </LedgerCell>
            <LedgerCell>
              {item.status_label ? (
                <span className="text-[13px] font-semibold text-navy">{item.status_label}</span>
              ) : (
                <StampBadge status={item.status} />
              )}
            </LedgerCell>
            <LedgerCell mono>
              {showDeadline ? (
                <span className="flex flex-col gap-1">
                  {/* Only a deadline that binds the department; none while it waits on audit/council. */}
                  <time className="font-mono text-ink-soft" dir="ltr">
                    {formatDate(legacy ? item.target_date : (item.deadline ?? null))}
                  </time>
                  {item.overdue ? (
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-danger-light px-2 py-0.5 text-[11.5px] font-bold text-danger-dark">
                      <AlertTriangle className="size-3" aria-hidden />
                      {T.followup.daysLate.replace("{days}", dayCount(item.days_overdue ?? 0, "accusative"))}
                    </span>
                  ) : null}
                </span>
              ) : (
                <time className="font-mono text-ink-soft" dir="ltr">
                  {formatDate(item.closed_at ?? null)}
                </time>
              )}
            </LedgerCell>
          </tr>
        );
      })}
    </LedgerTable>
  );
}

function ExecutiveSummary({ summary }: { summary: FollowUpExecutiveSummary }) {
  useI18n();
  const findings = summary.key_findings ?? [];
  const steps = summary.recommended_next_steps ?? [];
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <SectionTitle>{summary.title || T.ai.summary}</SectionTitle>
      {summary.text ? <p className="text-[14.5px] font-medium leading-relaxed text-ink">{summary.text}</p> : null}
      {findings.length ? (
        <ul className="mt-4 space-y-2">
          {findings.map((item, index) => {
            const focusId = summary.focus?.[index]?.id;
            return (
              <li key={index} className="flex gap-2 text-[13.5px] font-medium text-ink">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                {focusId ? (
                  <Link href={recommendationHref(focusId)} className="hover:text-primary-dark hover:underline">
                    {item.text}
                  </Link>
                ) : (
                  <span>{item.text}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {steps.length ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[12.5px] font-bold text-success-dark">{T.followup.nextForFollowup}</p>
          <ul className="space-y-1.5 text-[13.5px] font-medium text-ink">
            {steps.map((item, index) => (
              <li key={index}>{item.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * A follow-up report (preview or archived). Version 2 snapshots describe the
 * register at the end of the period; version 1 snapshots (generated before
 * Raqeeb V2) are shown with a notice that they reflect the generation day.
 */
export function FollowUpReportView({
  snapshot,
  summary,
  periodStart,
  periodEnd,
  reportId,
  generatedAt,
  generatedBy,
  headerAction,
}: {
  snapshot: FollowUpSnapshot;
  summary?: FollowUpExecutiveSummary | null;
  periodStart: string;
  periodEnd: string;
  reportId?: number;
  generatedAt?: string;
  generatedBy?: User | null;
  headerAction?: ReactNode;
}) {
  useI18n();
  const v2 = (snapshot.methodology_version ?? 1) >= 2;
  const totals = snapshot.totals;
  const items = snapshot.items ?? [];
  const closedInPeriod = items.filter((item) => item.closed_in_period);
  const openAtEnd = items
    .filter((item) => item.status !== "closed")
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (b.days_overdue ?? 0) - (a.days_overdue ?? 0));
  const byId = new Map(items.map((item) => [item.id, item]));
  const majorRisks = (snapshot.major_risks ?? []).map((id) => byId.get(id)).filter(Boolean) as FollowUpItem[];

  return (
    <article className="space-y-6 print:space-y-4" data-testid="followup-report">
      {/* Cover */}
      <header className="rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-muted">
              {reportId ? <RecordId id={reportId} prefix="FUP" /> : null}
              {T.followup.reportTitle}
            </p>
            <p className="inline-flex items-center gap-2 text-[14px] font-bold text-navy">
              <CalendarRange className="size-4 text-muted" aria-hidden />
              {T.followup.period}:
              <span className="font-mono" dir="ltr">
                {formatDate(periodStart)} — {formatDate(periodEnd)}
              </span>
            </p>
            {v2 && snapshot.as_of_date ? (
              <p
                className="inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary-light/50 px-3 py-1.5 text-[14px] font-bold text-primary-dark"
                data-testid="followup-as-of"
              >
                <CalendarClock className="size-4" aria-hidden />
                {T.followup.asOf}:
                <span className="font-mono" dir="ltr">
                  {formatDate(snapshot.as_of_date)}
                </span>
              </p>
            ) : null}
            <p className="text-[12.5px] font-medium text-ink-soft">
              {T.followup.generatedAt}:{" "}
              <span className="font-mono" dir="ltr">
                {formatDate(generatedAt ?? snapshot.generated_at)}
              </span>
              {generatedBy ? (
                <>
                  {" · "}
                  {T.followup.generatedBy}:{" "}
                  <span className="font-bold text-ink">{generatedBy.full_name_ar || generatedBy.username}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {headerAction}
            <Button type="button" variant="secondary" onClick={() => window.print()} className="gap-1.5">
              <Printer className="size-4" aria-hidden />
              {T.followup.print}
            </Button>
          </div>
        </div>
        {v2 ? (
          <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-ink-soft">
            <span className="font-bold text-ink">{T.followup.methodology}:</span> {T.followup.methodologyV2}
          </p>
        ) : (
          <Callout tone="warning" icon={<History className="size-4" />} className="mt-3">
            {T.followup.legacyNotice}
          </Callout>
        )}
      </header>

      {/* KPIs */}
      {v2 ? (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label={T.followup.openAtStart} value={totals.open_at_start} />
          <Kpi label={T.followup.issuedInPeriod} value={totals.issued_in_period} />
          <Kpi
            label={T.followup.closedInPeriod}
            value={totals.closed_in_period}
            tone="success"
            hint={T.followup.closedBreakdown
              .replace("{implemented}", String(totals.closed_implemented_in_period ?? 0))
              .replace("{disagreement}", String(totals.closed_disagreement_in_period ?? 0))}
          />
          <Kpi label={T.followup.openAtEnd} value={totals.open_at_end} />
          <Kpi
            label={T.followup.overdueAtEnd}
            value={totals.overdue}
            tone="danger"
            hint={
              totals.became_overdue_in_period
                ? T.followup.becameOverdue.replace("{count}", String(totals.became_overdue_in_period))
                : null
            }
          />
          <Kpi label={T.stats.completionRate} value={totals.completion_rate} suffix="%" />
        </dl>
      ) : (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label={T.stats.total} value={totals.total} />
          <Kpi label={T.stats.closed} value={totals.closed} />
          <Kpi label={T.stats.completionRate} value={totals.completion_rate} suffix="%" />
          <Kpi label={T.stats.overdue} value={totals.overdue} tone="danger" />
        </dl>
      )}

      {summary ? <ExecutiveSummary summary={summary} /> : null}

      {v2 && snapshot.by_stage ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <SectionTitle>{T.followup.stageDistribution}</SectionTitle>
          <StageBars byStage={snapshot.by_stage} />
        </section>
      ) : null}

      {v2 && snapshot.departments?.length ? (
        <section>
          <SectionTitle>{T.followup.departments}</SectionTitle>
          <LedgerTable
            headers={[
              T.common.department,
              T.stats.total,
              T.followup.colOpen,
              T.followup.colClosedInPeriod,
              T.followup.colOverdue,
              T.followup.colOverdueRate,
              T.followup.colMedianDays,
              T.followup.colExecutionRate,
            ]}
            empty={T.followup.nothing}
          >
            {snapshot.departments.map((row) => (
              <tr key={row.department} className="hover:bg-subtle/60">
                <LedgerCell className="font-semibold text-ink">{row.name}</LedgerCell>
                <LedgerCell mono>{row.total}</LedgerCell>
                <LedgerCell mono>{row.open}</LedgerCell>
                <LedgerCell mono>{row.closed_in_period}</LedgerCell>
                <LedgerCell mono>
                  <span className={row.overdue ? "font-bold text-danger-dark" : undefined}>{row.overdue}</span>
                </LedgerCell>
                <LedgerCell mono>{row.overdue_rate}%</LedgerCell>
                <LedgerCell mono>{row.median_days_overdue}</LedgerCell>
                <LedgerCell mono>{row.execution_rate}%</LedgerCell>
              </tr>
            ))}
          </LedgerTable>
        </section>
      ) : null}

      {v2 && majorRisks.length ? (
        <section>
          <SectionTitle>{T.followup.majorRisks}</SectionTitle>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {majorRisks.map((item) => (
              <li key={item.id} className="rounded-xl border border-s-4 border-line border-s-danger bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <RecordId id={item.id} />
                  <span className="text-[12px] text-muted">{item.department}</span>
                  {item.overdue ? (
                    <span className="rounded-full bg-danger-light px-2 py-0.5 text-[11.5px] font-bold text-danger-dark">
                      {T.followup.daysLate.replace("{days}", dayCount(item.days_overdue ?? 0, "accusative"))}
                    </span>
                  ) : null}
                </div>
                <Link
                  href={recommendationHref(item.id)}
                  className="mt-1.5 block font-semibold text-ink hover:text-primary-dark hover:underline"
                >
                  {itemTitle(item)}
                </Link>
                <p className="mt-1 text-[12.5px] text-ink-soft">{item.status_label ?? STATUS_LABELS[item.status]}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {v2 ? (
        <section>
          <SectionTitle>{T.followup.closedList}</SectionTitle>
          <CaseTable items={closedInPeriod} showDeadline={false} />
        </section>
      ) : null}

      <section>
        <SectionTitle>{v2 ? T.followup.openList : T.followup.snapshot}</SectionTitle>
        <CaseTable items={v2 ? openAtEnd : items} showDeadline legacy={!v2} />
      </section>

      {v2 ? (
        <footer className="space-y-1.5 border-t border-line pt-4 text-[12px] leading-relaxed text-ink-soft">
          <p>{T.followup.footnoteOverdue}</p>
          {totals.late_in_review ? (
            <p>{plural(totals.late_in_review, T.followup.footnoteLateInReview)}</p>
          ) : null}
          {totals.history_incomplete ? (
            <p>{plural(totals.history_incomplete, T.followup.footnoteHistory)}</p>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
