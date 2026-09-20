"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, LayoutList, Rows3, Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { Button, ProgressBar, Select, TextInput } from "@/components/ui/Base";
import { EmptyState, TableSkeleton } from "@/components/ui/EmptyState";
import { LedgerCell, LedgerTable, RecordId } from "@/components/ui/Ledger";
import { ErrorBanner } from "@/components/ui/Base";
import { OverdueBadge } from "@/components/ui/OverdueBadge";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusBadge } from "@/components/ui/StampBadge";
import { api, downloadFile, errorMessage, loadAuth } from "@/lib/api";
import { cn } from "@/lib/cn";
import { caseTitle } from "@/lib/finding";
import { formatDate } from "@/lib/format";
import { useDepartments } from "@/lib/hooks";
import { RISK_LABELS, STATUS_LABELS, T, useI18n } from "@/lib/i18n";
import type { Paginated, RecommendationListItem, RecommendationStatus } from "@/lib/types";
import {
  EMPLOYEE_WORK_STATUSES,
  STATUS_NEXT_ACTION,
  WORKFLOW_STAGES,
  localizedWorkflowStages,
} from "@/lib/workflow";

const PAGE_SIZE = 25;

function sortOptions() {
  return [
    { value: "-priority_score", label: T.register.sortPriority },
    { value: "-created_at", label: T.register.sortNewest },
    { value: "created_at", label: T.register.sortOldest },
    { value: "risk_level", label: T.register.sortRisk },
  ] as const;
}

function assignedToMe(item: RecommendationListItem) {
  const auth = loadAuth();
  if (!auth) return false;
  const owner = (item.responsible_employee ?? "").trim();
  if (!owner) return true;
  const name = (auth.user.full_name_ar || "").trim();
  return owner === name || owner === auth.user.username;
}

const RISK_BORDER_TONES: Record<string, string> = {
  high: "border-s-danger",
  medium: "border-s-warning",
  low: "border-s-success",
};

function RegisterCard({
  item,
  href,
  mine = false,
  hideDepartment = false,
}: {
  item: RecommendationListItem;
  href: string;
  mine?: boolean;
  hideDepartment?: boolean;
}) {
  useI18n();
  const next = STATUS_NEXT_ACTION[item.status];
  const borderTone = RISK_BORDER_TONES[item.risk_level] || "border-s-line";

  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group block rounded-xl border border-line bg-surface p-5 transition-all duration-200 border-s-4",
          borderTone,
          "hover:border-primary/40 hover:shadow-md",
          item.overdue && "border-danger/30"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <RecordId id={item.id} />
              {item.is_recurring ? (
                <span className="rounded-full bg-warning-light/50 px-2.5 py-0.5 text-[11px] font-bold text-warning-dark ring-1 ring-warning/30">
                  {item.recurrence_confirmed ? T.case.recurrenceConfirmed : T.common.recurringBadge}
                </span>
              ) : null}
            </div>
            <h3 className="mt-3 font-heading text-[16px] font-semibold leading-snug text-navy group-hover:text-primary transition-colors">
              {caseTitle(item.text, 130)}
            </h3>
            <p className="mt-1 text-[13px] text-ink-soft">
              {hideDepartment ? item.report_title : `${item.department_name} • ${item.report_title}`}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <RiskBadge level={item.risk_level} />
          </div>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4 bg-subtle/30 rounded-lg p-3">
          {mine ? null : (
            <div>
              <dt className="text-muted font-semibold text-[11px] uppercase tracking-wider mb-0.5">{T.common.responsible}</dt>
              <dd className="truncate font-medium text-ink">{item.responsible_employee ?? T.common.none}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted font-semibold text-[11px] uppercase tracking-wider mb-0.5">{T.common.targetDate}</dt>
            <dd className="flex items-center gap-2 font-medium text-ink">
              <span className="font-mono text-muted" dir="ltr">{formatDate(item.target_date)}</span>
              <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
            </dd>
          </div>
          <div>
            <dt className="text-muted font-semibold text-[11px] uppercase tracking-wider mb-0.5">{T.common.priority}</dt>
            <dd className="mt-1">
              <ProgressBar value={item.priority_score} showValue tone="primary" />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted font-semibold text-[11px] uppercase tracking-wider mb-0.5">{T.workflow.requiredAction}</dt>
            <dd className="truncate font-bold text-primary-dark uppercase tracking-wide text-[12px]" title={next.action}>
              {next.action}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

function CompactTable({
  items,
  detailBase,
  hideDepartment = false,
}: {
  items: RecommendationListItem[];
  detailBase: string;
  hideDepartment?: boolean;
}) {
  useI18n();
  return (
    <LedgerTable
      headers={[
        T.table.number,
        T.table.recommendation,
        ...(hideDepartment ? [] : [T.common.department]),
        T.common.status,
        T.common.risk,
        T.common.targetDate,
      ]}
    >
      {items.map((item) => (
        <tr key={item.id} className="group transition-colors hover:bg-subtle/60">
          <LedgerCell mono>
            <Link href={`${detailBase}/${item.id}`} className="font-bold text-primary hover:text-primary-dark hover:underline">
              <RecordId id={item.id} />
            </Link>
          </LedgerCell>
          <LedgerCell>
            <Link href={`${detailBase}/${item.id}`} className="font-medium text-ink group-hover:text-primary transition-colors">
              {caseTitle(item.text, 80)}
            </Link>
          </LedgerCell>
          {hideDepartment ? null : <LedgerCell>{item.department_name}</LedgerCell>}
          <LedgerCell>
            <StatusBadge status={item.status} />
          </LedgerCell>
          <LedgerCell>
            <RiskBadge level={item.risk_level} />
          </LedgerCell>
          <LedgerCell mono>
            <span className="font-mono font-medium text-muted" dir="ltr">{formatDate(item.target_date)}</span>
          </LedgerCell>
        </tr>
      ))}
    </LedgerTable>
  );
}

export function RecommendationRegister(props: {
  detailBase: string;
  showDepartmentFilter?: boolean;
  createHref?: string;
  mine?: boolean;
  departmentOnly?: boolean;
}) {
  useI18n();
  return (
    <Suspense fallback={<TableSkeleton />}>
      <RegisterInner {...props} />
    </Suspense>
  );
}

function RegisterInner({
  detailBase,
  showDepartmentFilter = false,
  createHref,
  mine = false,
  departmentOnly = false,
}: {
  detailBase: string;
  showDepartmentFilter?: boolean;
  createHref?: string;
  mine?: boolean;
  departmentOnly?: boolean;
}) {
  const { locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"list" | "compact">("compact");

  const stage = searchParams.get("stage") ?? "";
  const status = searchParams.get("status") ?? "";
  const risk = searchParams.get("risk_level") ?? "";
  const department = searchParams.get("report__department") ?? "";
  const search = searchParams.get("search") ?? "";
  const ordering = searchParams.get("ordering") ?? "-priority_score";
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const overdueOnly = searchParams.get("overdue") === "1";
  const recurringOnly = searchParams.get("is_recurring") === "true";

  const [searchDraft, setSearchDraft] = useState(search);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in patch)) next.set("page", "1");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  useEffect(() => {
    const next = searchDraft.trim();
    if (next === search) return;
    const timer = window.setTimeout(() => {
      setParams({ search: next || null });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search]);

  const params = useMemo(() => {
    const query = new URLSearchParams();
    const allowed = new Set<RecommendationStatus>(EMPLOYEE_WORK_STATUSES);

    if (mine) {
      if (status && allowed.has(status as RecommendationStatus)) {
        query.set("status", status);
      } else if (stage) {
        const definition = WORKFLOW_STAGES.find((item) => item.id === stage);
        const overlap = (definition?.statuses ?? []).filter((item) => allowed.has(item));
        if (overlap.length) query.set("status__in", overlap.join(","));
        else query.set("status", "draft");
      } else {
        query.set("status__in", EMPLOYEE_WORK_STATUSES.join(","));
      }
    } else if (status) {
      query.set("status", status);
    } else if (stage) {
      const definition = WORKFLOW_STAGES.find((item) => item.id === stage);
      if (definition?.statuses.length) query.set("status__in", definition.statuses.join(","));
    }
    if (risk) query.set("risk_level", risk);
    if (department && !mine && !departmentOnly) query.set("report__department", department);
    if (search) query.set("search", search);
    if (recurringOnly) query.set("is_recurring", "true");
    // Evaluated in SQL so the count and pagination are correct.
    if (overdueOnly) query.set("overdue", "true");
    if (searchParams.get("open") === "true") query.set("open", "true");
    query.set("ordering", ordering);
    query.set("page", String(page));
    return query;
  }, [mine, departmentOnly, stage, status, risk, department, search, recurringOnly, overdueOnly, ordering, page, searchParams]);

  const scopeKey = mine ? "mine" : departmentOnly ? "department" : "all";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["recommendations", scopeKey, params.toString()],
    queryFn: () => api<Paginated<RecommendationListItem>>(`/api/recommendations/?${params}`),
  });

  const { data: departments } = useDepartments();

  const hideDepartment = mine || departmentOnly;
  const myDepartment = loadAuth()?.user.department ?? null;
  const items = (data?.results ?? []).filter((item) => {
    if (mine && !assignedToMe(item)) return false;
    if (mine && !EMPLOYEE_WORK_STATUSES.includes(item.status)) return false;
    if (departmentOnly && myDepartment != null && item.department !== myDepartment) return false;
    return true;
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  const stages = localizedWorkflowStages().filter((item) =>
    mine ? item.statuses.some((statusId) => EMPLOYEE_WORK_STATUSES.includes(statusId)) : true
  );
  const statusOptions = Object.entries(STATUS_LABELS).filter(([value]) =>
    mine ? EMPLOYEE_WORK_STATUSES.includes(value as RecommendationStatus) : true
  );
  const chips = [
    stage ? { key: "stage", label: stages.find((item) => item.id === stage)?.label ?? stage } : null,
    status ? { key: "status", label: STATUS_LABELS[status] ?? status } : null,
    risk ? { key: "risk_level", label: RISK_LABELS[risk] ?? risk } : null,
    department && !departmentOnly
      ? {
          key: "report__department",
          label: departments?.results.find((item) => String(item.id) === department)?.name ?? department,
        }
      : null,
    search ? { key: "search", label: `"${search}"` } : null,
    overdueOnly ? { key: "overdue", label: T.filters.overdueOnly } : null,
    recurringOnly ? { key: "is_recurring", label: T.filters.recurringOnly } : null,
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  // Exports the complete filtered result set from the server (not just this page).
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const query = new URLSearchParams(params);
      query.delete("page");
      await downloadFile(
        `/api/recommendations/export/?${query.toString()}`,
        `recommendations-${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const DirForward = locale === "ar" ? ChevronLeft : ChevronRight;
  const DirBack = locale === "ar" ? ChevronRight : ChevronLeft;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-sm md:flex-row md:flex-wrap md:items-center">
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setParams({ search: searchDraft || null });
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
            <TextInput
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={T.nav.searchPlaceholder}
              className="ps-9 bg-subtle/50 focus:bg-surface transition-all"
              aria-label={T.common.search}
            />
          </div>
        </form>

        <Button
          type="button"
          variant={filtersOpen || chips.length ? "secondary" : "ghost"}
          onClick={() => setFiltersOpen((value) => !value)}
          className="font-bold gap-2"
        >
          <SlidersHorizontal className="size-4" />
          {T.filters.title}
          {chips.length ? <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-primary-dark text-[11px] font-bold font-mono">{chips.length}</span> : null}
        </Button>

        <Select
          value={ordering}
          onChange={(event) => setParams({ ordering: event.target.value })}
          className="w-auto font-medium"
          aria-label={T.register.sortBy}
        >
          {sortOptions().map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
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

        <Button type="button" variant="ghost" onClick={exportCsv} disabled={exporting || !data?.count} className="font-bold gap-1.5">
          <Download className="size-4" />
          {T.register.export}
        </Button>

        {createHref ? (
          <Link href={createHref} className="w-full md:w-auto">
            <Button className="min-h-12 w-full font-bold shadow-md md:w-auto">{T.register.new}</Button>
          </Link>
        ) : null}
      </div>

      {/* Filter panel */}
      {filtersOpen ? (
        <div className="grid grid-cols-1 gap-5 rounded-xl border border-line bg-surface p-5 shadow-inner ring-1 ring-inset ring-line/50 md:grid-cols-2 lg:grid-cols-4 animate-scale-in">
          <label className="block text-sm">
            <span className="mb-2 block text-[13px] font-bold text-navy">{T.register.stage}</span>
            <Select value={stage} onChange={(event) => setParams({ stage: event.target.value || null, status: null })}>
              <option value="">{T.common.all}</option>
              {stages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="block text-sm">
            <span className="mb-2 block text-[13px] font-bold text-navy">{T.common.status}</span>
            <Select value={status} onChange={(event) => setParams({ status: event.target.value || null, stage: null })}>
              <option value="">{T.common.all}</option>
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>

          <label className="block text-sm">
            <span className="mb-2 block text-[13px] font-bold text-navy">{T.common.risk}</span>
            <Select value={risk} onChange={(event) => setParams({ risk_level: event.target.value || null })}>
              <option value="">{T.common.all}</option>
              {Object.entries(RISK_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>

          {showDepartmentFilter && !mine && !departmentOnly ? (
            <label className="block text-sm">
              <span className="mb-2 block text-[13px] font-bold text-navy">{T.common.department}</span>
              <Select
                value={department}
                onChange={(event) => setParams({ report__department: event.target.value || null })}
              >
                <option value="">{T.common.all}</option>
                {departments?.results.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-line/60 pt-4 mt-1 md:col-span-2 md:flex-row md:flex-wrap md:items-center md:gap-6 lg:col-span-4">
            <label className="flex min-h-11 items-center gap-2.5 text-[14px] font-bold text-navy cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => setParams({ overdue: event.target.checked ? "1" : null })}
                className="size-4.5 rounded border-line text-primary focus:ring-primary accent-primary"
              />
              {T.filters.overdueOnly}
            </label>
            <label className="flex min-h-11 items-center gap-2.5 text-[14px] font-bold text-navy cursor-pointer select-none">
              <input
                type="checkbox"
                checked={recurringOnly}
                onChange={(event) => setParams({ is_recurring: event.target.checked ? "true" : null })}
                className="size-4.5 rounded border-line text-primary focus:ring-primary accent-primary"
              />
              {T.filters.recurringOnly}
            </label>
            <div className="flex w-full flex-col gap-2 md:ms-auto md:w-auto md:flex-row">
              <Button type="button" className="min-h-12 w-full md:w-auto" onClick={() => setFiltersOpen(false)}>
                {T.filters.apply}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-12 w-full md:w-auto"
                onClick={() => {
                  setSearchDraft("");
                  router.replace(pathname);
                }}
              >
                {T.filters.reset}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Active filters + result count */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink-soft">
          <span className="font-mono font-bold text-navy bg-subtle px-2 py-0.5 rounded border border-line" dir="ltr">
            {data?.count ?? 0}
          </span>{" "}
          {T.register.resultCount}
        </span>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => {
              if (chip.key === "search") setSearchDraft("");
              setParams({ [chip.key]: null });
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/20 bg-primary-light/50 px-3 py-1 text-[13px] font-bold text-primary-dark"
          >
            {chip.label}
            <X className="size-3.5" />
          </button>
        ))}
        {chips.length ? (
          <button
            type="button"
            onClick={() => {
              setSearchDraft("");
              router.replace(pathname);
            }}
            className="min-h-11 text-[13px] font-bold text-primary-dark"
          >
            {T.register.clearFilters}
          </button>
        ) : null}
      </div>

      {exportError ? <ErrorBanner message={exportError} onRetry={() => void exportCsv()} /> : null}

      {/* Results */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Search className="size-8" />}
          title={chips.length ? T.empty.search : T.empty.generic}
          description={chips.length ? T.register.clearFilters : undefined}
          className="bg-surface py-16"
        />
      ) : (
        <>
          <ul className={cn("space-y-3", view === "compact" && "md:hidden")}>
            {items.map((item) => (
              <RegisterCard
                key={item.id}
                item={item}
                href={`${detailBase}/${item.id}`}
                mine={mine}
                hideDepartment={hideDepartment}
              />
            ))}
          </ul>
          {view === "compact" ? (
            <div className="hidden md:block">
              <CompactTable items={items} detailBase={detailBase} hideDepartment={hideDepartment} />
            </div>
          ) : null}
        </>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-4 pt-4" aria-label={T.common.page}>
          <Button variant="ghost" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })} className="font-bold gap-1">
            <DirBack className="size-4" />
            {T.common.prev}
          </Button>
          <span className="font-mono text-sm font-bold text-navy bg-subtle px-3 py-1 rounded-md border border-line" dir="ltr">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setParams({ page: String(page + 1) })}
            className="font-bold gap-1"
          >
            {T.common.next}
            <DirForward className="size-4" />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
