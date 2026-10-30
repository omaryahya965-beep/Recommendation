"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  FileText,
  Hourglass,
  ListChecks,
  MessageSquareReply,
  Pencil,
  Plus,
  SearchX,
  Send,
  Stamp,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { CaseSkeleton } from "@/components/case/CaseHeader";
import { CaseDue } from "@/components/home/Queues";
import { DirBack, DirForward } from "@/components/i18n/DirIcon";
import { StickyActionBar } from "@/components/mobile/StickyActionBar";
import { ReportStepper, REPORT_STATUS_FAMILY } from "@/components/reports/ReportPipeline";
import { Button, ErrorBanner } from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { RecordId } from "@/components/ui/Ledger";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { clipTitle } from "@/lib/finding";
import { formatDate, plural, recordCode } from "@/lib/format";
import { DECISION_LABELS, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, RISK_LABELS, T, useI18n } from "@/lib/i18n";
import { invalidateRecommendationViews, MODERATE } from "@/lib/queryPolicy";
import type { AuditReport, ReportRecommendationItem } from "@/lib/types";
import { useIsPhone } from "@/lib/useMediaQuery";
import { stageForStatus } from "@/lib/workflow";
import { useGuardedMutation } from "@/lib/useGuardedMutation";

type ReportStatus = AuditReport["status"];

const NEXT_ICON: Record<ReportStatus, LucideIcon> = {
  draft: FilePlus2,
  pending_response: Hourglass,
  under_review: ClipboardCheck,
  pending_council: Stamp,
  ratified: CheckCircle2,
};

const RISK_BAR = { high: "bg-danger", medium: "bg-warning", low: "bg-success" } as const;

/** What happens next on the report, and whose move it is. */
function nextStep(report: AuditReport, count: number) {
  const next = T.reportView.next;
  const body = T.reportView.nextBody;
  switch (report.status) {
    case "draft":
      return count
        ? {
            title: next.draft,
            body: body.draft.replace("{n}", String(count)).replace("{dept}", report.department_name),
          }
        : { title: next.draftEmpty, body: T.reports.needsRecommendations };
    case "under_review":
      return report.ready_for_council
        ? { title: next.ready, body: body.ready }
        : { title: next.under_review, body: body.under_review };
    default:
      return { title: next[report.status], body: body[report.status] };
  }
}

function MetaGroup({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 px-4 py-4 md:px-5", className)}>
      <h3 className="mb-2.5 inline-flex items-center gap-2 text-[13px] font-bold text-navy">
        <Icon className="size-4 text-muted" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, children, emphasis }: { label: string; children: ReactNode; emphasis?: boolean }) {
  return (
    // A value that does not fit beside its label drops under it, whole.
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
      <dt className="shrink-0 text-[12.5px] text-ink-soft">{label}</dt>
      <dd className={cn("ms-auto min-w-0 text-end text-[12.5px]", emphasis ? "font-bold text-navy" : "font-semibold text-ink")}>
        {children}
      </dd>
    </div>
  );
}

/** One recommendation of the report: reference, title, stage, response, owner, deadline. */
function RecommendationRow({ item, index, editable }: { item: ReportRecommendationItem; index: number; editable: boolean }) {
  useI18n();
  const stage = stageForStatus(item.status);
  const response = item.response_decision ? DECISION_LABELS[item.response_decision] : T.reportView.noResponse;
  const deadline = item.deadline ?? item.target_date;
  return (
    <li className="flex min-w-0 items-stretch" data-testid="report-recommendation" data-id={item.id}>
      <Link
        href={`/audit/recommendations/${item.id}`}
        className="group flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/50 active:bg-subtle/70 md:gap-4 md:px-6 md:py-4"
      >
        <span
          className="mt-0.5 hidden size-8 shrink-0 items-center justify-center rounded-full bg-subtle font-mono text-[11.5px] font-bold text-ink-soft ring-1 ring-line/70 sm:flex"
          aria-hidden
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <RecordId id={item.id} />
            <StatusBadge status={item.status} />
            <span className="ms-auto">
              <RiskBadge level={item.risk_level} />
            </span>
          </span>
          <span className="mt-1.5 line-clamp-2 text-[14.5px] font-bold leading-snug text-navy group-hover:text-primary-dark md:text-[15px]">
            <bdi>{clipTitle(item.title, 160)}</bdi>
          </span>
          <span className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-ink-soft">
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">{T.case.currentStage}: </span>
              {stage.label}
            </span>
            <span className={cn("inline-flex items-center gap-1", !item.response_decision && "text-muted")}>
              <MessageSquareReply className="size-3.5 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">{T.reportView.response}: </span>
              {response}
            </span>
            {item.responsible_employee ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <UserRound className="size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="truncate">{item.responsible_employee}</span>
              </span>
            ) : null}
            {deadline ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="size-3.5 shrink-0 text-muted" aria-hidden />
                <span className="font-mono text-[12px]" dir="ltr">
                  {formatDate(deadline)}
                </span>
                {item.deadline ? <CaseDue item={item} /> : null}
              </span>
            ) : null}
          </span>
        </span>
        {editable ? null : <DirForward className="mt-1 size-4 shrink-0 text-muted group-hover:text-primary-dark" />}
      </Link>
      {editable ? (
        <div className="flex shrink-0 items-center pe-3 md:pe-5">
          <Link
            href={`/audit/recommendations/${item.id}/edit`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-primary-dark ring-1 ring-primary/25 hover:bg-primary-light/50"
          >
            <Pencil className="size-3.5" aria-hidden />
            {T.reportView.edit}
          </Link>
        </div>
      ) : null}
    </li>
  );
}

/**
 * One audit report as an engagement workspace: what it is and where it
 * stands (header with the lifecycle), what happens next and the action for
 * it, the engagement details, and its recommendations.
 */
export default function ReportDetailPage() {
  useI18n();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const phone = useIsPhone();
  const [error, setError] = useState<string | null>(null);
  // Irreversible report moves are confirmed first (BUG-09).
  const [confirming, setConfirming] = useState<"submit-to-department/" | "submit-to-council/" | null>(null);

  const { data: report, isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ["report", id],
    queryFn: () => api<AuditReport>(`/api/reports/${id}/`),
    ...MODERATE,
  });

  const reportAction = useGuardedMutation({
    mutationFn: (path: string) => api(`/api/reports/${id}/${path}`, { method: "POST" }),
    onSuccess: () => {
      setError(null);
      // Report actions move every recommendation in the report at once.
      invalidateRecommendationViews(queryClient, { reportId: id, allCases: true });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) {
    return (
      <CaseSkeleton id={id} prefix="RPT" backHref="/audit/reports" backLabel={T.reports.title} backClassName="text-ink-soft" />
    );
  }
  if (loadError instanceof ApiError && (loadError.status === 403 || loadError.status === 404)) {
    return (
      <EmptyState
        icon={<SearchX className="size-6" aria-hidden />}
        title={T.reports.unavailableTitle}
        description={T.errors.notFoundDescription}
        actions={
          <Link
            href="/audit/reports"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-[14px] font-bold text-white hover:bg-primary-dark"
          >
            {T.reports.title}
          </Link>
        }
      />
    );
  }
  if (isError || !report) return <ErrorBanner message={T.common.error} onRetry={() => refetch()} />;

  const recommendations = report.recommendations ?? [];
  const isDraft = report.status === "draft";
  const canSendToDepartment = isDraft && recommendations.length > 0;
  const actionable = isDraft || report.status === "under_review";
  const notAtCouncilGate = recommendations.filter((item) => item.status !== "pending_council").length;
  const next = nextStep(report, recommendations.length);
  const NextIcon = NEXT_ICON[report.status];
  const auditor = report.created_by_detail?.full_name_ar || report.created_by_detail?.username || "—";
  const risks = (["high", "medium", "low"] as const).map((level) => ({
    level,
    n: recommendations.filter((item) => item.risk_level === level).length,
  }));
  const stages = Object.values(
    recommendations.reduce<Record<string, { label: string; n: number }>>((acc, item) => {
      const stage = stageForStatus(item.status);
      acc[stage.label] = { label: stage.label, n: (acc[stage.label]?.n ?? 0) + 1 };
      return acc;
    }, {})
  );

  // The report's actions, rendered once: in the next-step card, or pinned
  // above the home indicator on phones.
  const addLink = (
    <Link
      href={`/audit/recommendations/new?report=${report.id}`}
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-bold md:w-auto",
        canSendToDepartment
          ? "bg-surface text-navy ring-1 ring-line hover:bg-subtle"
          : "bg-primary text-white hover:bg-primary-dark"
      )}
    >
      <Plus className="size-4" aria-hidden />
      {T.reports.addRecommendation}
    </Link>
  );
  const actions = actionable ? (
    isDraft ? (
      <>
        <Button
          className="min-h-11 w-full font-bold md:w-auto"
          onClick={() => setConfirming("submit-to-department/")}
          disabled={reportAction.isPending || !canSendToDepartment}
        >
          <Send className="size-4" />
          {T.reports.submitToDepartment}
        </Button>
        {addLink}
      </>
    ) : (
      <>
        <Button
          className="min-h-11 w-full font-bold md:w-auto"
          onClick={() => setConfirming("submit-to-council/")}
          disabled={reportAction.isPending || !report.ready_for_council}
          aria-describedby={report.ready_for_council ? undefined : "council-not-ready"}
        >
          <Stamp className="size-4" />
          {T.reports.submitToCouncil}
        </Button>
        {report.ready_for_council ? null : (
          <p id="council-not-ready" className="text-[12.5px] font-medium text-warning-dark">
            {plural(notAtCouncilGate, T.reports.councilNotReady)}
          </p>
        )}
      </>
    )
  ) : null;

  return (
    <article className="animate-fade-in min-w-0 space-y-5">
      <header>
        <Link href="/audit/reports" className="inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-bold text-primary-dark hover:underline max-md:hidden">
          <DirBack className="size-4" />
          {T.reports.title}
        </Link>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-section md:mt-2" data-testid="report-header">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 pb-4 pt-4 md:px-6 md:pt-5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-soft">
                <span className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[12px] font-bold text-ink-soft ring-1 ring-line/70" dir="ltr">
                  {recordCode(report.id, "RPT")}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Building2 className="size-3.5 text-muted" aria-hidden />
                  {report.department_name}
                </span>
                <span aria-hidden className="text-line">•</span>
                <span className="rounded-full bg-primary-light px-2 py-0.5 text-[11.5px] font-bold text-primary-dark">
                  {REPORT_TYPE_LABELS[report.engagement_type]}
                </span>
              </p>
              <h1 className="mt-2 font-heading text-[1.3rem] font-bold leading-snug text-navy md:text-[1.5rem]">
                <bdi>{report.title}</bdi>
              </h1>
              <p className="mt-1 text-[12.5px] text-muted">
                {T.reports.document} · {T.create.auditor}: {auditor}
              </p>
            </div>
            <StatusBadge status={REPORT_STATUS_FAMILY[report.status]} label={REPORT_STATUS_LABELS[report.status]} size="lg" />
          </div>
          <div className="border-t border-line/70 bg-subtle/35">
            <ReportStepper
              status={report.status}
              dates={{ draft: report.created_at, ratified: report.council_approval_date }}
            />
          </div>
        </div>
      </header>

      <ErrorBanner message={error} />

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,30%)] xl:grid-rows-[auto_1fr]">
        {/* What happens next — and, when it is audit's move, the action. */}
        <section
          className={cn(
            "rounded-2xl border px-4 py-4 shadow-section md:px-5 xl:col-start-1 xl:row-start-1",
            actionable ? "border-primary/20 bg-primary-light/30" : "border-line bg-surface"
          )}
          aria-labelledby="report-next-title"
          data-testid="report-next"
        >
          <div className="flex items-start gap-3.5">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                report.status === "ratified"
                  ? "bg-success-light text-success-dark"
                  : actionable
                    ? "bg-surface text-primary-dark ring-1 ring-inset ring-primary/15"
                    : "bg-subtle text-ink-soft"
              )}
              aria-hidden
            >
              <NextIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-bold text-primary-dark">{T.reportView.nextEyebrow}</p>
              <h2 id="report-next-title" className="mt-0.5 font-heading text-[1.05rem] font-bold leading-snug text-navy md:text-[1.1rem]">
                {next.title}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{next.body}</p>
              {report.status !== "ratified" ? (
                <p className="mt-1.5 text-[12px] font-semibold text-muted">
                  {T.reportView.owner.replace("{who}", T.workflow.reportActors[report.status])}
                </p>
              ) : null}
              {actions && !phone ? <div className="mt-3.5 flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
          </div>
        </section>

        {/* Engagement details: beside the work from 1280px, before the list below that. */}
        <aside
          className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1"
          aria-label={T.reportView.detailsTitle}
        >
          <div className="grid grid-cols-1 divide-y divide-line/70 overflow-hidden rounded-2xl border border-line bg-surface shadow-section md:grid-cols-3 md:divide-x md:divide-y-0 xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
            <MetaGroup title={T.reportView.scopeTitle} icon={FileText}>
              <dl className="divide-y divide-line/60">
                <Row label={T.reportView.engagement}>{REPORT_TYPE_LABELS[report.engagement_type]}</Row>
                <Row label={T.reportView.auditedDepartment}>{report.department_name}</Row>
                <Row label={T.create.auditor}>{auditor}</Row>
              </dl>
            </MetaGroup>
            <MetaGroup title={T.reportView.datesTitle} icon={CalendarDays}>
              <dl className="divide-y divide-line/60">
                <Row label={T.reports.period}>
                  <span className="inline-flex flex-col items-end whitespace-nowrap font-mono">
                    <span>{formatDate(report.created_at)} —</span>
                    <span>{formatDate(report.response_deadline)}</span>
                  </span>
                </Row>
                <Row label={T.reportView.responseDeadline} emphasis>
                  <span className="whitespace-nowrap font-mono" dir="ltr">
                    {formatDate(report.response_deadline)}
                  </span>
                </Row>
                <Row label={T.reports.approvedAt}>
                  <span className="whitespace-nowrap font-mono" dir="ltr">
                    {formatDate(report.council_approval_date)}
                  </span>
                </Row>
              </dl>
            </MetaGroup>
            {/* Phones: the list header already carries the risk mix. */}
            <MetaGroup title={T.reportView.summaryTitle} icon={ListChecks} className="max-md:hidden">
              {recommendations.length ? (
                <>
                  <p className="flex items-baseline justify-between text-[12.5px] text-ink-soft">
                    {T.reports.riskSummary}
                    <span className="font-mono font-bold text-ink">{recommendations.length}</span>
                  </p>
                  <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                    {risks.map(({ level, n }) =>
                      n ? <span key={level} className={RISK_BAR[level]} style={{ width: `${(n / recommendations.length) * 100}%` }} /> : null
                    )}
                  </span>
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-soft">
                    {risks.map(({ level, n }) => (
                      <li key={level} className="inline-flex items-center gap-1.5">
                        <span className={cn("size-2 rounded-full", RISK_BAR[level])} aria-hidden />
                        {RISK_LABELS[level]} <span className="font-mono font-bold text-ink">{n}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[12px] font-semibold text-muted">{T.reportView.byStage}</p>
                  <dl className="mt-1 divide-y divide-line/60">
                    {stages.map((stage) => (
                      <Row key={stage.label} label={stage.label}>
                        <span className="font-mono">{stage.n}</span>
                      </Row>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="text-[12.5px] text-muted">{T.reports.noRecommendations}</p>
              )}
            </MetaGroup>
          </div>
        </aside>

        <section
          className="section-elevated min-w-0 overflow-hidden rounded-2xl border border-line bg-surface xl:col-start-1 xl:row-start-2 xl:self-start"
          aria-labelledby="report-recs-title"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-4 py-3.5 md:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-5 w-[3px] shrink-0 rounded-full bg-primary" aria-hidden />
              <h2 id="report-recs-title" className="flex items-center gap-2 font-heading text-[16.5px] font-bold text-navy">
                {T.reportView.recommendationsTitle}
                <span className="rounded-full bg-subtle px-2 py-0.5 font-mono text-[12px] font-bold text-ink-soft" dir="ltr">
                  {recommendations.length}
                </span>
              </h2>
            </div>
            {recommendations.length ? (
              <ul className="flex flex-wrap items-center gap-1.5" aria-label={T.reports.riskSummary}>
                {risks
                  .filter(({ n }) => n)
                  .map(({ level, n }) => (
                    <li
                      key={level}
                      className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-[11.5px] font-bold text-ink-soft"
                    >
                      <span className={cn("size-2 rounded-full", RISK_BAR[level])} aria-hidden />
                      <span className="font-mono">{n}</span>
                      {RISK_LABELS[level]}
                    </li>
                  ))}
              </ul>
            ) : null}
          </header>
          {recommendations.length ? (
            <ol className="divide-y divide-line/60">
              {recommendations.map((item, index) => (
                <RecommendationRow key={item.id} item={item} index={index} editable={isDraft} />
              ))}
            </ol>
          ) : (
            <EmptyState
              compact
              icon={<FileText className="size-6" />}
              title={T.reports.noRecommendations}
              description={isDraft ? T.empty.recommendationsHint : T.reports.draftOnlyEditable}
              className="border-0 py-10 shadow-none"
            />
          )}
        </section>
      </div>

      {actions && phone ? <StickyActionBar>{actions}</StickyActionBar> : null}
      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === "submit-to-council/"
            ? T.reports.confirmCouncilTitle
            : T.reports.confirmSendTitle.replace("{dept}", report.department_name)
        }
        body={
          <div className="space-y-2">
            <p>
              {plural(
                recommendations.length,
                confirming === "submit-to-council/" ? T.reports.confirmCouncilBody : T.reports.confirmSendBody
              )}
            </p>
            <p className="text-[12px] text-ink-soft">{T.confirm.irreversible}</p>
          </div>
        }
        confirmLabel={confirming === "submit-to-council/" ? T.reports.submitToCouncil : T.reports.submitToDepartment}
        busy={reportAction.isPending}
        onConfirm={() => {
          if (confirming) reportAction.mutate(confirming, { onSettled: () => setConfirming(null) });
        }}
        onCancel={() => setConfirming(null)}
      />
    </article>
  );
}
