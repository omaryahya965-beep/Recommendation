"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { FollowUpReportView } from "@/components/followup/FollowUpReportView";
import { Button, ErrorBanner } from "@/components/ui/Base";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { api, errorMessage, loadAuth } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { T, useI18n } from "@/lib/i18n";
import { MODERATE } from "@/lib/queryPolicy";
import type { FollowUpPreview, FollowUpReport, Paginated } from "@/lib/types";
import { useGuardedMutation } from "@/lib/useGuardedMutation";

/** A preview, shown in full while the auditor decides to save it. Once saved it is no longer session-only. */
export function FollowUpSessionCard({ preview, saved = false }: { preview: FollowUpPreview; saved?: boolean }) {
  useI18n();
  return (
    <div className="space-y-3">
      {saved ? null : <p className="text-[13px] text-ink-soft">{T.followup.sessionOnly}</p>}
      <FollowUpReportView
        snapshot={preview.snapshot}
        summary={preview.executive_summary}
        periodStart={String(preview.period_start)}
        periodEnd={String(preview.period_end)}
      />
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" }) {
  return (
    <div className="min-w-[4.5rem]">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={tone === "danger" ? "mt-0.5 text-[17px] font-semibold tabular-nums text-danger-dark" : "mt-0.5 text-[17px] font-semibold tabular-nums text-navy"}>
        {value}
      </dd>
    </div>
  );
}

function ArchiveCard({ report }: { report: FollowUpReport }) {
  useI18n();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Only Internal Audit may delete a saved report (the API enforces it too).
  const canDelete = loadAuth()?.user.role === "audit";
  const remove = useGuardedMutation({
    mutationFn: () => api(`/api/followup-reports/${report.id}/`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (err) => {
      setConfirming(false);
      setError(errorMessage(err));
    },
  });
  const snapshot = report.snapshot;
  const totals = snapshot.totals;
  const author = report.generated_by_detail.full_name_ar || report.generated_by_detail.username;
  return (
    <li className="rounded-xl border border-line bg-surface">
      <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-navy">
              {formatDate(report.period_start)} – {formatDate(report.period_end)}
            </h3>
            <span className="rounded bg-subtle px-1.5 py-0.5 text-[11.5px] text-ink-soft" dir="ltr">
              FUP-{String(report.id).padStart(4, "0")}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            {snapshot.as_of_date ? (
              <>
                {T.followup.asOf} {formatDate(snapshot.as_of_date)}
                <span className="mx-1.5 text-line" aria-hidden>|</span>
              </>
            ) : null}
            {T.followup.generatedBy} {author} · {formatDate(report.created_at)}
          </p>
        </div>

        <dl className="flex gap-6">
          <Figure label={T.stats.total} value={totals.total} />
          <Figure label={T.stats.overdue} value={totals.overdue} tone={totals.overdue ? "danger" : undefined} />
          <Figure label={T.stats.completionRate} value={<span dir="ltr">{totals.completion_rate}%</span>} />
        </dl>

        <div className="flex items-center gap-2 md:justify-end">
          <Button
            type="button"
            variant="secondary"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="gap-1.5"
          >
            {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
            {open ? T.followup.hideReport : T.followup.viewReport}
          </Button>
          {canDelete ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={remove.isPending}
              aria-label={T.followup.deleteReport}
              title={T.followup.deleteReport}
              className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-light hover:text-danger-dark focus-visible:outline-2 focus-visible:outline-danger disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="px-5 pb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={T.followup.deleteTitle}
        body={T.followup.deleteBody}
        confirmLabel={T.followup.deleteReport}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
      />
      {open ? (
        <div className="border-t border-line p-5">
          <FollowUpReportView
            snapshot={snapshot}
            summary={report.executive_summary}
            periodStart={report.period_start}
            periodEnd={report.period_end}
            reportId={report.id}
            generatedAt={report.created_at}
            generatedBy={report.generated_by_detail}
          />
        </div>
      ) : null}
    </li>
  );
}

/** The archive of saved (frozen) follow-up reports. */
export function FollowUpList({ actions }: { actions?: ReactNode }) {
  useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["followups"],
    queryFn: () => api<Paginated<FollowUpReport>>("/api/followup-reports/"),
    ...MODERATE,
  });
  const reports = data?.results ?? [];

  return (
    <div className="space-y-6">
      {actions}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : reports.length ? (
        <ul className="space-y-3">
          {reports.map((report) => (
            <ArchiveCard key={report.id} report={report} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<CalendarRange className="size-8" />}
          title={T.followup.empty}
          description={T.followup.emptyHint}
          className="bg-surface py-16"
        />
      )}
    </div>
  );
}
