"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ClipboardCheck, ClipboardList, FileCheck2, Gavel, Stamp } from "lucide-react";
import { useState } from "react";

import { type ActionSource } from "@/components/dashboard/AttentionBoard";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ActionNow } from "@/components/home/ActionNow";
import { HomeHero } from "@/components/home/HomeHero";
import { RecommendationTable } from "@/components/RecommendationTable";
import { Button, Callout, ErrorBanner, Field, TextArea } from "@/components/ui/Base";
import { DashboardBodySkeleton, EmptyState } from "@/components/ui/EmptyState";
import { Section } from "@/components/ui/Section";
import { useDashboard } from "@/lib/hooks";
import { api, errorMessage } from "@/lib/api";
import { invalidateRecommendationViews } from "@/lib/queryPolicy";
import { REPORT_TYPE_LABELS, T, useI18n } from "@/lib/i18n";
import { LIVE } from "@/lib/queryPolicy";
import type { AuditReport } from "@/lib/types";

const BASE = "/council/recommendations";

function PendingReportCard({ report }: { report: AuditReport }) {
  useI18n();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ["report", report.id],
    queryFn: () => api<AuditReport>(`/api/reports/${report.id}/`),
    enabled: expanded,
  });

  const ratify = useMutation({
    mutationFn: () => api(`/api/reports/${report.id}/ratify/`, { method: "POST", body: { notes } }),
    onSuccess: () => {
      setError(null);
      // Ratification moves every recommendation in the report at once.
      invalidateRecommendationViews(queryClient, { reportId: report.id, allCases: true });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <li className="border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-[16px] font-semibold text-ink">{report.title}</h3>
          <p className="mt-1 text-[13px] text-ink-soft">
            {report.department_name} · {REPORT_TYPE_LABELS[report.engagement_type]} ·{" "}
            <span dir="ltr">{report.recommendations_count}</span> {T.reports.recommendations}
          </p>
        </div>
        <Button variant="ghost" className="min-h-12 w-full justify-center sm:w-auto" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {expanded ? T.common.details : T.dashboard.ratifyDecision}
        </Button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-3">
          {detail?.recommendations ? (
            <RecommendationTable
              items={detail.recommendations}
              showDepartment={false}
              detailHref={(item) => `${BASE}/${item.id}`}
            />
          ) : null}
          <Field label={`${T.common.notes} (${T.common.optional})`}>
            <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </Field>
          <ErrorBanner message={error} />
          <Button onClick={() => ratify.mutate()} disabled={ratify.isPending} className="min-h-12 w-full sm:w-auto">
            <Stamp className="size-4" />
            {T.council.ratifyReport}
          </Button>
          <Callout tone="neutral">{T.council.ratifyHint}</Callout>
        </div>
      ) : null}
    </li>
  );
}

export default function PendingApprovalsPage() {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: () => api<AuditReport[]>("/api/council/pending-approvals/"),
    ...LIVE,
  });
  const { data: dashboard } = useDashboard();

  const hero = (
    <HomeHero
      role="council"
      title={T.dashboard.councilTitle}
      subtitle={T.dashboard.councilHint}
      actions={[
        { href: "/council/pending-approvals", label: T.nav.pendingApprovals, icon: ClipboardCheck, primary: true },
        { href: "/council/closure-reviews", label: T.nav.closureReviews, icon: Gavel },
        { href: BASE, label: T.nav.recommendations, icon: ClipboardList },
      ]}
    />
  );

  // The hero is static: it renders at once, while only the data sections
  // wait for /api/dashboard/. Same wrapper in both branches, so the hero is
  // updated in place (not remounted) when the data arrives.
  if (isLoading || isError) {
    return (
      <div className="animate-fade-in space-y-5">
        {hero}
        {isLoading ? <DashboardBodySkeleton /> : <ErrorBanner message={T.common.error} onRetry={() => refetch()} />}
      </div>
    );
  }

  const pendingReports = data ?? [];
  const sources: ActionSource[] = dashboard?.action_center.closures_pending
    ? [
        {
          key: "closures_pending",
          block: dashboard.action_center.closures_pending,
          href: "/council/closure-reviews",
        },
      ]
    : [];

  return (
    <div className="animate-fade-in space-y-5">
      {hero}

      <Section title={T.dashboard.decisionCenter} hint={T.dashboard.decisionCenterHint}>
        {pendingReports.length ? (
          <ul>
            {pendingReports.map((report) => (
              <PendingReportCard key={report.id} report={report} />
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<FileCheck2 className="size-5" />}
            title={T.council.emptyPendingReports}
            className="border-0 shadow-none"
          />
        )}
      </Section>

      <ActionNow
        sources={sources}
        detailBase={BASE}
        viewAllHref="/council/closure-reviews"
        title={T.dashboard.closureQueue}
        hint={T.dashboard.closureQueueHint}
      />

      <RecentActivity detailBase={BASE} />
    </div>
  );
}
