"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Gavel,
  RotateCcw,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import { useState } from "react";

import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { DashboardColumns, DashboardPage } from "@/components/home/DashboardLayout";
import { HomeHero, type HeroStat } from "@/components/home/HomeHero";
import { DecisionFeed } from "@/components/home/RoleBlocks";
import { CardHeader, QueueListCard, REASON_TONE } from "@/components/home/WorkQueue";
import { RecommendationTable } from "@/components/RecommendationTable";
import { Button, Callout, ErrorBanner, Field, TextArea } from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RecordId } from "@/components/ui/Ledger";
import { DashboardBodySkeleton, EmptyState } from "@/components/ui/EmptyState";
import { useDashboard } from "@/lib/hooks";
import { api, errorMessage } from "@/lib/api";
import { invalidateRecommendationViews } from "@/lib/queryPolicy";
import { caseHref, sectionForStatus } from "@/lib/caseLinks";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { formatDate, plural } from "@/lib/format";
import { REPORT_TYPE_LABELS, RISK_LABELS, T, useI18n } from "@/lib/i18n";
import { LIVE } from "@/lib/queryPolicy";
import type { AuditReport, RecommendationListItem } from "@/lib/types";
import { useGuardedMutation } from "@/lib/useGuardedMutation";
import { NOTE_MAX } from "@/lib/limits";

const BASE = "/council/recommendations";

const RISK_DOT = { high: "bg-danger", medium: "bg-warning", low: "bg-success" } as const;

/**
 * One report awaiting ratification: what it holds (risk mix, what will be
 * implemented and what ratification closes), then — on "decide" — its
 * recommendations, notes and the confirmed ratification.
 */
function PendingReportCard({ report, updatedAt }: { report: AuditReport; updatedAt: string | null }) {
  useI18n();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Loaded up front: the card's summary (risk mix, what closes) needs it.
  const { data: detail } = useQuery({
    queryKey: ["report", report.id],
    queryFn: () => api<AuditReport>(`/api/reports/${report.id}/`),
  });

  const ratify = useGuardedMutation({
    mutationFn: () => api(`/api/reports/${report.id}/ratify/`, { method: "POST", body: { notes } }),
    onSuccess: () => {
      setError(null);
      setConfirming(false);
      // Ratification moves every recommendation in the report at once.
      invalidateRecommendationViews(queryClient, { reportId: report.id, allCases: true });
    },
    onError: (err) => {
      setConfirming(false);
      setError(errorMessage(err));
    },
  });

  // Ratification closes every recommendation whose disagreement audit
  // accepted; the council must see those before it decides.
  const items = detail?.recommendations ?? [];
  const closing = items.filter((item) => item.response_decision === "disagree");
  const implementing = items.length - closing.length;
  const risks = (["high", "medium", "low"] as const)
    .map((level) => ({ level, n: items.filter((item) => item.risk_level === level).length }))
    .filter((entry) => entry.n);

  return (
    <li className="px-4 py-4 md:px-6 md:py-5" data-testid="ratify-card">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-[16px] font-bold leading-snug text-navy">
            <bdi>{report.title}</bdi>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-soft">
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3.5 text-muted" aria-hidden />
              {report.department_name}
            </span>
            <span aria-hidden className="text-line">•</span>
            <span>{REPORT_TYPE_LABELS[report.engagement_type]}</span>
            <span aria-hidden className="text-line">•</span>
            <span>{plural(report.recommendations_count, T.home.recommendationsCount)}</span>
            {updatedAt ? (
              <>
                <span aria-hidden className="text-line">•</span>
                <span className="font-mono text-[11.5px] text-muted">{T.roleHome.updatedOn.replace("{date}", formatDate(updatedAt))}</span>
              </>
            ) : null}
          </p>
          {detail ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {risks.map(({ level, n }) => (
                <span key={level} className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-[11.5px] font-bold text-ink-soft">
                  <span className={cn("size-2 rounded-full", RISK_DOT[level])} aria-hidden />
                  <span className="font-mono tabular-nums">{n}</span>
                  {RISK_LABELS[level]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2.5 py-1 text-[11.5px] font-bold text-primary-dark">
                <span className="font-mono tabular-nums">{implementing}</span>
                {T.roleHome.willImplement}
              </span>
              {closing.length ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-light px-2.5 py-1 text-[11.5px] font-bold text-warning-dark">
                  <span className="font-mono tabular-nums">{closing.length}</span>
                  {T.roleHome.willClose}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button
          variant={expanded ? "ghost" : "primary"}
          className={cn("min-h-11 w-full shrink-0 justify-center font-bold md:w-auto", expanded && "ring-1 ring-line")}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="size-4" /> : <Stamp className="size-4" />}
          {expanded ? T.common.details : T.dashboard.ratifyDecision}
          {expanded ? null : <ChevronDown className="size-4 opacity-70" />}
        </Button>
      </div>
      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-line/70 pt-4">
          {detail?.recommendations ? (
            <RecommendationTable
              items={detail.recommendations}
              showDepartment={false}
              detailHref={(item) => `${BASE}/${item.id}`}
            />
          ) : null}
          <Field label={`${T.common.notes} (${T.common.optional})`}>
            <TextArea maxLength={NOTE_MAX} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </Field>
          <ErrorBanner message={error} />
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Button
              onClick={() => setConfirming(true)}
              disabled={ratify.isPending || !detail}
              className="min-h-12 w-full font-bold md:w-auto"
            >
              <Stamp className="size-4" />
              {T.council.ratifyReport}
            </Button>
            <p className="text-[12.5px] text-ink-soft">{T.confirm.irreversible}</p>
          </div>
          <Callout tone="neutral">{T.council.ratifyHint}</Callout>
          <ConfirmDialog
            open={confirming}
            title={T.council.ratifyConfirmTitle}
            body={
              <div className="space-y-3 text-[13.5px] leading-relaxed">
                <p className="font-bold text-navy"><bdi>{report.title}</bdi></p>
                <p>{plural(implementing, T.council.ratifyConfirmImplement)}</p>
                {closing.length ? (
                  <div>
                    <p className="font-semibold text-warning-dark">
                      {plural(closing.length, T.council.ratifyConfirmClose)}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {closing.map((item) => (
                        <li key={item.id} className="flex items-baseline gap-2">
                          <RecordId id={item.id} />
                          <span className="min-w-0 truncate"><bdi>{clipTitle(item.title, 70)}</bdi></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-ink-soft">{T.council.ratifyConfirmNoClose}</p>
                )}
                <p className="text-[12px] text-ink-soft">{T.confirm.irreversible}</p>
              </div>
            }
            confirmLabel={T.council.ratifyReport}
            busy={ratify.isPending}
            onConfirm={() => ratify.mutate()}
            onCancel={() => setConfirming(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

const closureHref = (item: RecommendationListItem) => caseHref(BASE, item.id, sectionForStatus(item.status));

/**
 * The Council's home is its decision center: reports to ratify and
 * recommendations awaiting a closure decision first, then what it reopened
 * and what it recently decided.
 */
export default function PendingApprovalsPage() {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: () => api<AuditReport[]>("/api/council/pending-approvals/"),
    ...LIVE,
  });
  const { data: dashboard } = useDashboard();
  const pendingReports = data ?? [];
  const closures = dashboard?.action_center.closures_pending;
  const reportRows = dashboard?.action_center.reports_pending_ratification?.items as
    | Array<{ id: number; updated_at?: string }>
    | undefined;

  const stats: HeroStat[] = dashboard
    ? [
        { label: T.roleHome.statToRatify, count: pendingReports.length, href: "#council-ratify", icon: Stamp, tone: "primary" },
        { label: T.roleHome.statToClose, count: closures?.count ?? 0, href: "/council/closure-reviews", icon: Gavel, tone: "primary" },
        { label: T.roleHome.statReopened, count: dashboard.reopened?.count ?? 0, href: `${BASE}?status=reopened`, icon: RotateCcw, tone: "warning" },
      ]
    : [];

  const hero = (
    <HomeHero
      role="council"
      title={T.dashboard.councilTitle}
      subtitle={T.dashboard.councilHint}
      stats={stats}
      compact
      actions={[
        { href: "/council/pending-approvals", label: T.nav.pendingApprovals, icon: ClipboardCheck, primary: true },
        { href: "/council/closure-reviews", label: T.nav.closureReviews, icon: Gavel },
        { href: BASE, label: T.roleHome.registerShort, shortLabel: T.roleHome.registerTile, icon: ClipboardList },
      ]}
    />
  );

  // The hero is static: it renders at once, while only the data sections
  // wait for their data. Same wrapper in both branches, so the hero is
  // updated in place (not remounted) when the data arrives.
  if (isLoading || isError) {
    return (
      <DashboardPage>
        {hero}
        {isLoading ? <DashboardBodySkeleton /> : <ErrorBanner message={T.common.error} onRetry={() => refetch()} />}
      </DashboardPage>
    );
  }

  return (
    <DashboardPage>
      {hero}

      <DashboardColumns
        main={
          <>
            <section
              id="council-ratify"
              className="section-elevated scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface"
              aria-labelledby="council-ratify-title"
              data-testid="council-ratify"
            >
              <CardHeader id="council-ratify-title" title={T.roleHome.ratifyTitle} hint={T.roleHome.ratifyHint} count={pendingReports.length} tone="warning" />
              {pendingReports.length ? (
                <ul className="divide-y divide-line/70">
                  {pendingReports.map((report) => (
                    <PendingReportCard
                      key={report.id}
                      report={report}
                      updatedAt={reportRows?.find((row) => row.id === report.id)?.updated_at ?? null}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon={<FileCheck2 className="size-5" />}
                  title={T.roleHome.noRatify}
                  className="border-0 py-8 shadow-none"
                />
              )}
            </section>

            <QueueListCard
              title={T.roleHome.closeTitle}
              hint={T.roleHome.closeHint}
              block={closures}
              href="/council/closure-reviews"
              reason={{ id: "closures_pending", label: T.roleHome.auditRecommendsClosure, icon: ShieldCheck, tone: REASON_TONE.success }}
              detailHref={closureHref}
              tone="warning"
              showReason
              emptyLabel={T.roleHome.noClose}
              limit={5}
              testId="council-closures"
            />
          </>
        }
        aside={
          dashboard ? (
            <>
              <QueueListCard
                title={T.home.reopened}
                hint={T.home.reopenedHint}
                block={dashboard.reopened}
                href={`${BASE}?status=reopened`}
                reason={{ id: "reopened", label: T.home.reopened, icon: RotateCcw, tone: REASON_TONE.warning }}
                detailHref={closureHref}
                timing="deadline"
                emptyLabel={T.home.noReopened}
                limit={3}
                dense
              />
              <DecisionFeed decisions={(dashboard.recent_decisions ?? []).slice(0, 5)} detailBase={BASE} />
              <div className="max-md:hidden">
                <RecentActivity role="council" limit={3} compact />
              </div>
            </>
          ) : null
        }
      />
    </DashboardPage>
  );
}
