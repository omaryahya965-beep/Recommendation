"use client";

import { Gavel, RotateCcw, Stamp, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ViewAllLink } from "@/components/home/Queues";
import { CardHeader, HeaderMore } from "@/components/home/WorkQueue";
import { DirForward } from "@/components/i18n/DirIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { formatDateTime } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import type { CouncilDecision, DashboardData } from "@/lib/types";

/** "View all" in a card header: a pill on wider screens, a text link on phones. */
function HeaderLink({ href }: { href: string }) {
  return (
    <>
      <span className="max-md:hidden">
        <ViewAllLink href={href} />
      </span>
      <HeaderMore href={href} />
    </>
  );
}

function initial(name: string): string {
  return Array.from(name.trim())[0] ?? "؟";
}

function Count({ value, label, tone }: { value: number; label: string; tone: "neutral" | "danger" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold",
        tone === "danger" && value
          ? "bg-danger-light text-danger-dark"
          : tone === "warning" && value
            ? "bg-warning-light text-warning-dark"
            : "bg-subtle text-ink-soft"
      )}
    >
      <span className="font-mono tabular-nums">{value}</span>
      {label}
    </span>
  );
}

/**
 * Head: who needs attention. Each person's open, overdue and due-soon cases
 * with their share of the department's open work; overdue first (the
 * server's order). Each row opens that person's open cases.
 */
export function TeamPanel({
  team,
  registerBase,
  teamHref,
  className,
}: {
  team: NonNullable<DashboardData["team"]>;
  registerBase: string;
  teamHref: string;
  className?: string;
}) {
  useI18n();
  const totalOpen = team.reduce((sum, row) => sum + row.open, 0);
  return (
    <section
      className={cn("section-elevated flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface", className)}
      aria-labelledby="home-team-title"
    >
      <CardHeader id="home-team-title" title={T.roleHome.teamTitle} hint={T.roleHome.teamHint} aside={<HeaderLink href={teamHref} />} />
      {team.length ? (
        <ul className="divide-y divide-line/60" data-testid="home-team">
          {team.map((row) => {
            const share = totalOpen ? Math.round((row.open / totalOpen) * 100) : 0;
            const state = row.overdue ? "attention" : row.open ? "ok" : "free";
            return (
              <li key={row.employee.id}>
                <Link
                  href={`${registerBase}?responsible_employee=${row.employee.id}&open=true`}
                  className="group flex min-w-0 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/50 active:bg-subtle/70 md:px-6"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ring-1",
                      state === "attention"
                        ? "bg-danger-light text-danger-dark ring-danger/20"
                        : "bg-subtle text-ink-soft ring-line/70"
                    )}
                    aria-hidden
                  >
                    {initial(row.employee.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-bold text-navy group-hover:text-primary-dark">
                        {row.employee.name}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[11.5px] font-bold",
                          state === "attention" ? "text-danger-dark" : state === "ok" ? "text-success-dark" : "text-muted"
                        )}
                      >
                        {state === "attention"
                          ? T.roleHome.teamNeedsAttention
                          : state === "ok"
                            ? T.roleHome.teamOnTrack
                            : T.roleHome.teamFree}
                      </span>
                    </span>
                    <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                      <Count value={row.open} label={T.roleHome.teamActive} tone="neutral" />
                      <Count value={row.overdue} label={T.roleHome.teamOverdue} tone="danger" />
                      <Count value={row.due_soon} label={T.roleHome.teamDueSoon} tone="warning" />
                    </span>
                    {row.open ? (
                      <span className="mt-2 flex items-center gap-2">
                        <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-chart-1-track" aria-hidden>
                          <span className="h-full bg-danger" style={{ width: `${(row.overdue / Math.max(1, totalOpen)) * 100}%` }} />
                          <span
                            className="h-full bg-chart-1"
                            style={{ width: `${((row.open - row.overdue) / Math.max(1, totalOpen)) * 100}%` }}
                          />
                        </span>
                        <span className="shrink-0 text-[11px] text-muted">{T.roleHome.teamLoad.replace("{n}", `${share}%`)}</span>
                      </span>
                    ) : null}
                  </span>
                  <DirForward className="size-4 shrink-0 text-muted group-hover:text-primary-dark" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact icon={<Users className="size-5" />} title={T.home.noTeam} className="border-0 py-8 shadow-none" />
      )}
    </section>
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
    <section className="section-elevated flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <CardHeader title={T.home.recentDecisions} hint={T.home.recentDecisionsHint} />
      {decisions.length ? (
        <ol className="divide-y divide-line/60" data-testid="council-decisions">
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
                    className="mt-0.5 flex min-h-8 min-w-0 items-center gap-2 text-[13px] text-ink hover:text-primary-dark"
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
    </section>
  );
}
