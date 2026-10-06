"use client";

import { FileText, Gavel, RotateCcw, Stamp, UserRound, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { CountChip, ViewAllLink } from "@/components/home/Queues";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import { REPORT_TYPE_LABELS, T, useI18n } from "@/lib/i18n";
import type { ActionCenterBlock, CouncilDecision, DashboardData, DashboardReport } from "@/lib/types";

/** Reports in one state (ready for council, drafts), each linking to its page. */
export function ReportQueuePanel({
  title,
  hint,
  block,
  hrefFor,
  viewAllHref,
  emptyLabel,
  testId,
}: {
  title: string;
  hint?: ReactNode;
  block: ActionCenterBlock<DashboardReport> | undefined;
  hrefFor: (report: DashboardReport) => string;
  viewAllHref: string;
  emptyLabel: string;
  testId?: string;
}) {
  useI18n();
  const items = block?.items ?? [];
  const count = block?.count ?? 0;
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          {title}
          <CountChip count={count} />
        </span>
      }
      hint={hint}
      actions={count > items.length ? <ViewAllLink href={viewAllHref} /> : null}
    >
      <div data-testid={testId}>
        {items.length ? (
          <ul className="divide-y divide-line/70">
            {items.map((report) => (
              <li key={report.id}>
                <Link
                  href={hrefFor(report)}
                  className="group flex min-h-14 items-start gap-3 px-4 py-3 transition-colors hover:bg-subtle/50 md:px-6"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-dark">
                    <FileText className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-snug text-navy group-hover:text-primary-dark">
                      <bdi>{report.title}</bdi>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-soft">
                      {report.department_name} · {REPORT_TYPE_LABELS[report.engagement_type]} ·{" "}
                      {plural(report.recommendations_count, T.home.recommendationsCount)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11.5px] text-muted" dir="ltr">
                    {formatDate(report.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted md:px-6">{emptyLabel}</p>
        )}
      </div>
    </Section>
  );
}

/** Head: open and overdue cases per employee, each opening that person's list. */
export function TeamPanel({
  team,
  registerBase,
  teamHref,
}: {
  team: NonNullable<DashboardData["team"]>;
  registerBase: string;
  teamHref: string;
}) {
  useI18n();
  const max = Math.max(1, ...team.map((row) => row.open));
  return (
    <Section title={T.home.team} hint={T.home.teamHint} actions={<ViewAllLink href={teamHref} />}>
      {team.length ? (
        <ul className="divide-y divide-line/70" data-testid="home-team">
          {team.map((row) => (
            <li key={row.employee.id}>
              <Link
                href={`${registerBase}?responsible_employee=${row.employee.id}&open=true`}
                className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/50 md:px-6"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-soft">
                  <UserRound className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink group-hover:text-primary-dark">
                      {row.employee.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-ink-soft">
                      {T.home.teamOpen.replace("{n}", String(row.open))}
                      {row.overdue ? (
                        <span className="font-bold text-danger-dark">
                          {" · "}
                          {T.home.teamOverdue.replace("{n}", String(row.overdue))}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-chart-1-track" aria-hidden>
                    <span
                      className="h-full bg-danger"
                      style={{ width: `${(row.overdue / max) * 100}%` }}
                    />
                    <span
                      className="h-full bg-chart-1"
                      style={{ width: `${((row.open - row.overdue) / max) * 100}%` }}
                    />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={<Users className="size-5" />} title={T.home.noTeam} className="border-0 py-8 shadow-none" />
      )}
    </Section>
  );
}

const DECISION_ICON: Record<CouncilDecision["kind"], ReactNode> = {
  ratified: <Stamp className="size-4" aria-hidden />,
  closed: <Gavel className="size-4" aria-hidden />,
  reopened: <RotateCcw className="size-4" aria-hidden />,
};

const DECISION_TONE: Record<CouncilDecision["kind"], string> = {
  ratified: "bg-primary-light text-primary-dark",
  closed: "bg-success-light text-success-dark",
  reopened: "bg-warning-light text-warning-dark",
};

/** Council: the latest ratifications and closure decisions. */
export function DecisionFeed({ decisions, detailBase }: { decisions: CouncilDecision[]; detailBase: string }) {
  useI18n();
  return (
    <Section title={T.home.recentDecisions} hint={T.home.recentDecisionsHint}>
      {decisions.length ? (
        <ol className="divide-y divide-line/70" data-testid="council-decisions">
          {decisions.map((decision) => (
            <li key={decision.id} className="flex gap-3 px-4 py-3 md:px-6">
              <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", DECISION_TONE[decision.kind])}>
                {DECISION_ICON[decision.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13.5px] font-bold text-navy">{T.home.decisionKinds[decision.kind]}</p>
                  <span className="font-mono text-[11.5px] text-muted" dir="ltr">
                    {formatDateTime(decision.at)}
                  </span>
                </div>
                {decision.recommendation ? (
                  <Link
                    href={`${detailBase}/${decision.recommendation.id}`}
                    className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-ink hover:text-primary-dark"
                  >
                    <RecordId id={decision.recommendation.id} />
                    <span className="truncate"><bdi>{clipTitle(decision.recommendation.title, 80)}</bdi></span>
                  </Link>
                ) : decision.report ? (
                  <p className="mt-0.5 truncate text-[13px] text-ink">{decision.report.title}</p>
                ) : null}
                {decision.notes.trim() ? (
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-soft">{decision.notes}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState compact icon={<Gavel className="size-5" />} title={T.home.noDecisions} className="border-0 py-8 shadow-none" />
      )}
    </Section>
  );
}
