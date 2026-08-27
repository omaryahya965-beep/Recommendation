"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, FileText, LayoutList, Plus, Rows3, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ReportPipeline, REPORT_STATUS_FAMILY, type ReportStatus } from "@/components/reports/ReportPipeline";
import { Button, ErrorBanner, Select, TextInput } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { LedgerCell, LedgerTable, RecordId } from "@/components/ui/Ledger";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { daysUntil, formatDate, recordCode } from "@/lib/format";
import { ENGAGEMENT_LABELS, REPORT_STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import type { AuditReport, Paginated } from "@/lib/types";

const STATUS_FILTERS: Array<ReportStatus | "all"> = [
  "all",
  "draft",
  "pending_response",
  "under_review",
  "pending_council",
  "ratified",
];

type SortId = "newest" | "oldest" | "deadline" | "title";

function nextAction(report: AuditReport) {
  if (report.status === "draft") {
    return report.recommendations_count > 0 ? T.reports.nextDraftReady : T.reports.nextDraftEmpty;
  }
  if (report.status === "pending_response") return T.reports.nextPendingResponse;
  if (report.status === "under_review") return T.reports.nextUnderReview;
  if (report.status === "pending_council") return T.reports.nextCouncil;
  return T.reports.nextRatified;
}

function matchesSearch(report: AuditReport, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const id = String(report.id);
  const code = recordCode(report.id, "RPT").toLowerCase();
  const auditor = (report.created_by_detail?.full_name_ar || report.created_by_detail?.username || "").toLowerCase();
  return (
    report.title.toLowerCase().includes(q) ||
    report.department_name.toLowerCase().includes(q) ||
    auditor.includes(q) ||
    ENGAGEMENT_LABELS[report.engagement_type].toLowerCase().includes(q) ||
    REPORT_STATUS_LABELS[report.status].toLowerCase().includes(q) ||
    id.includes(q) ||
    code.includes(q) ||
    code.replace("rpt-", "").includes(q.replace(/^rpt-?/i, ""))
  );
}

function deadlineOverdue(report: AuditReport) {
  if (report.status === "ratified" || !report.response_deadline) return false;
  const days = daysUntil(report.response_deadline);
  return days !== null && days < 0;
}

function ReportCard({ report }: { report: AuditReport }) {
  const { locale } = useI18n();
  const late = deadlineOverdue(report);
  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <Link
      href={`/audit/reports/${report.id}`}
      className={cn(
        "group block rounded-xl border bg-surface p-5 transition-all duration-200 hover:border-primary/40 hover:shadow-md",
        late ? "border-danger/30 border-s-4 border-s-danger" : "border-line border-s-4 border-s-primary"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <RecordId id={report.id} prefix="RPT" />
            <span className="rounded-full bg-subtle px-2.5 py-0.5 text-[11px] font-bold text-ink-soft border border-line">
              {ENGAGEMENT_LABELS[report.engagement_type]}
            </span>
            {late ? (
              <span className="rounded-full bg-danger-light px-2.5 py-0.5 text-[11px] font-bold text-danger-dark ring-1 ring-danger/20">
                {T.reports.overdueDeadline}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 font-heading text-[16px] font-semibold leading-relaxed text-navy group-hover:text-primary transition-colors">
            {report.title}
          </h3>
          <p className="mt-1 text-[13px] font-bold text-primary-dark uppercase tracking-wide">{nextAction(report)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="text-end">
            <StatusBadge
              status={REPORT_STATUS_FAMILY[report.status]}
              label={REPORT_STATUS_LABELS[report.status]}
            />
            <p className="mt-1.5 font-mono text-[11px] font-bold text-muted" dir="ltr">
              {report.recommendations_count} {T.reports.recCount}
            </p>
          </div>
          <DirForward className="size-5 text-muted group-hover:text-primary transition-colors" />
        </div>
      </div>

      <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-line pt-4 text-[13px] bg-subtle/30 rounded-lg p-3 sm:grid-cols-3">
        <div>
          <dt className="text-muted font-semibold text-[11px] uppercase tracking-wider mb-0.5">{T.common.department}</dt>
          <dd className="font-medium text-ink">{report.department_name}</dd>
        </div>
        <div>
          <dt className="text-muted font-semibold text-[11px] uppercase tracking-wider mb-0.5">{T.create.auditor}</dt>
          <dd className="font-medium text-ink">
            {report.created_by_detail?.full_name_ar || report.created_by_detail?.username || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted font-semibold text-[11px] uppercase tracking-wider mb-0.5">{T.create.deadline}</dt>
          <dd className="inline-flex items-center gap-1.5 font-medium text-ink">
            <CalendarClock className="size-4 text-muted" />
            <time className="font-mono" dir="ltr">
              {formatDate(report.response_deadline)}
            </time>
          </dd>
        </div>
      </dl>

      <ReportPipeline status={report.status} compact className="mt-4" />
    </Link>
  );
}

export function ReportsRegister() {
  useI18n();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReportStatus | "all">("all");
  const [department, setDepartment] = useState("");
  const [engagement, setEngagement] = useState("");
  const [sort, setSort] = useState<SortId>("newest");
  const [view, setView] = useState<"list" | "compact">("compact");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reports"],
    queryFn: () => api<Paginated<AuditReport>>("/api/reports/?page_size=100"),
  });

  const all = data?.results ?? [];
  const departments = useMemo(() => {
    const names = [...new Set(all.map((item) => item.department_name))].sort((a, b) => a.localeCompare(b, "ar"));
    return names;
  }, [all]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: all.length };
    for (const report of all) map[report.status] = (map[report.status] ?? 0) + 1;
    return map;
  }, [all]);

  const visible = useMemo(() => {
    const rows = all.filter((report) => {
      if (status !== "all" && report.status !== status) return false;
      if (department && report.department_name !== department) return false;
      if (engagement && report.engagement_type !== engagement) return false;
      return matchesSearch(report, search);
    });

    rows.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "ar");
      if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
      if (sort === "deadline") {
        return (a.response_deadline ?? "9999").localeCompare(b.response_deadline ?? "9999");
      }
      return b.created_at.localeCompare(a.created_at);
    });
    return rows;
  }, [all, status, department, engagement, search, sort]);

  const chips = [
    status !== "all" ? { key: "status", label: REPORT_STATUS_LABELS[status] } : null,
    department ? { key: "department", label: department } : null,
    engagement ? { key: "engagement", label: ENGAGEMENT_LABELS[engagement] } : null,
    search.trim() ? { key: "search", label: `"${search.trim()}"` } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setDepartment("");
    setEngagement("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={T.reports.searchPlaceholder}
            className="ps-9 bg-subtle/50 focus:bg-surface transition-all"
            aria-label={T.common.search}
          />
        </div>

        <Select
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="w-full min-w-0 font-medium md:w-auto md:min-w-[11rem]"
          aria-label={T.common.department}
        >
          <option value="">{T.common.department}: {T.common.all}</option>
          {departments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>

        <Select
          value={engagement}
          onChange={(event) => setEngagement(event.target.value)}
          className="w-full min-w-0 font-medium md:w-auto md:min-w-[10rem]"
          aria-label={T.create.engagement}
        >
          <option value="">{T.create.engagement}: {T.common.all}</option>
          <option value="assurance">{ENGAGEMENT_LABELS.assurance}</option>
          <option value="advisory">{ENGAGEMENT_LABELS.advisory}</option>
        </Select>

        <Select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortId)}
          className="w-auto font-medium"
          aria-label={T.register.sortBy}
        >
          <option value="newest">{T.reports.sortNewest}</option>
          <option value="oldest">{T.reports.sortOldest}</option>
          <option value="deadline">{T.reports.sortDeadline}</option>
          <option value="title">{T.reports.sortTitle}</option>
        </Select>

        <div className="hidden overflow-hidden rounded-lg border border-line shadow-sm md:flex">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label={T.register.viewList}
            className={cn("p-2.5 transition-colors", view === "list" ? "bg-primary text-white" : "text-ink-soft hover:bg-subtle")}
          >
            <LayoutList className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("compact")}
            aria-pressed={view === "compact"}
            aria-label={T.register.viewCompact}
            className={cn("p-2.5 transition-colors", view === "compact" ? "bg-primary text-white" : "text-ink-soft hover:bg-subtle")}
          >
            <Rows3 className="size-4.5" />
          </button>
        </div>
      </div>

      <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            aria-pressed={status === item}
            className={cn(
              "min-h-11 whitespace-nowrap rounded-full border px-4 text-[13px] font-bold transition-all duration-200",
              status === item
                ? "border-primary bg-primary text-white shadow-sm"
                : "border-line bg-surface text-ink-soft hover:border-primary/45 hover:text-primary-dark"
            )}
          >
            {item === "all" ? T.reports.filterAll : REPORT_STATUS_LABELS[item]}
            <span className={cn("ms-2 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-full", status === item ? "bg-white/20 text-white" : "bg-subtle text-ink-soft")} dir="ltr">
              {counts[item] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-soft">
          <span className="font-mono font-bold text-navy bg-subtle px-2 py-0.5 rounded border border-line" dir="ltr">
            {visible.length}
          </span>{" "}
          {T.reports.resultCount}
        </span>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => {
              if (chip.key === "status") setStatus("all");
              if (chip.key === "department") setDepartment("");
              if (chip.key === "engagement") setEngagement("");
              if (chip.key === "search") setSearch("");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-light/50 px-3 py-1 text-xs font-bold text-primary-dark transition-all hover:bg-primary/20 hover:border-primary/40"
          >
            {chip.label}
            <X className="size-3.5" />
          </button>
        ))}
        {chips.length ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-bold text-primary-dark hover:text-primary hover:underline ml-2"
          >
            {T.register.clearFilters}
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8" />}
          title={all.length ? T.empty.search : T.reports.empty}
          description={all.length ? T.register.clearFilters : T.reports.emptyHint}
          className="bg-surface py-16"
        />
      ) : (
        <>
          <div className={cn("space-y-3.5", view === "compact" && "md:hidden")}>
            {visible.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
          {view === "compact" ? (
            <div className="hidden md:block">
              <LedgerTable
                headers={[
                  T.reports.number,
                  T.reports.reportTitle,
                  T.common.department,
                  T.common.status,
                  T.reports.recCount,
                  T.create.deadline,
                  T.workflow.requiredAction,
                ]}
              >
                {visible.map((report) => {
                  const late = deadlineOverdue(report);
                  return (
                    <tr key={report.id} className="group transition-colors hover:bg-subtle/60">
                      <LedgerCell mono>
                        <Link href={`/audit/reports/${report.id}`} className="font-bold text-primary hover:text-primary-dark hover:underline">
                          <RecordId id={report.id} prefix="RPT" />
                        </Link>
                      </LedgerCell>
                      <LedgerCell>
                        <Link href={`/audit/reports/${report.id}`} className="font-semibold text-ink group-hover:text-primary transition-colors">
                          {report.title}
                        </Link>
                        <p className="mt-0.5 text-[11px] font-semibold text-muted/80">{ENGAGEMENT_LABELS[report.engagement_type]}</p>
                      </LedgerCell>
                      <LedgerCell>{report.department_name}</LedgerCell>
                      <LedgerCell>
                        <StatusBadge
                          status={REPORT_STATUS_FAMILY[report.status]}
                          label={REPORT_STATUS_LABELS[report.status]}
                        />
                      </LedgerCell>
                      <LedgerCell mono>
                        <span className="font-mono font-bold text-navy" dir="ltr">{report.recommendations_count}</span>
                      </LedgerCell>
                      <LedgerCell mono>
                        <span className={cn("font-mono font-medium", late ? "font-bold text-danger-dark" : "text-muted")} dir="ltr">
                          {formatDate(report.response_deadline)}
                        </span>
                      </LedgerCell>
                      <LedgerCell>
                        <span className="text-[13px] font-medium text-ink-soft">{nextAction(report)}</span>
                      </LedgerCell>
                    </tr>
                  );
                })}
              </LedgerTable>
            </div>
          ) : null}
        </>
      )}

      {!all.length && !isLoading && !isError ? (
        <div className="text-center pt-4">
          <Link href="/audit/reports/new">
            <Button className="font-bold shadow-md">
              <Plus className="size-4.5" />
              {T.reports.addReport}
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
