"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, LayoutList, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
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
import { api, loadAuth } from "@/lib/api";
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

function toCsv(items: RecommendationListItem[]): string {
  const header = [
    T.table.number,
    T.table.recommendation,
    T.common.department,
    T.common.status,
    T.common.risk,
    T.common.priority,
    T.common.responsible,
    T.common.targetDate,
    T.common.overdueBadge,
  ];
  const rows = items.map((item) => [
    `REC-${String(item.id).padStart(4, "0")}`,
    caseTitle(item.text, 200).replace(/"/g, '""'),
    item.department_name,
    STATUS_LABELS[item.status] ?? item.status,
    RISK_LABELS[item.risk_level] ?? item.risk_level,
    String(item.priority_score),
    item.responsible_employee ?? "",
    item.target_date ?? "",
    item.overdue ? T.common.yes : T.common.no,
  ]);
  return [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\r\n");
}

/** Detailed register row — the default view. */
function assignedToMe(item: RecommendationListItem) {
  const auth = loadAuth();
  if (!auth) return false;
  const owner = (item.responsible_employee ?? "").trim();
  if (!owner) return true;
  const name = (auth.user.full_name_ar || "").trim();
  return owner === name || owner === auth.user.username;
}

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
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group block rounded-(--radius-card) border bg-surface p-4 transition-all",
          "hover:border-primary/40 hover:shadow-(--shadow-card)",
          item.overdue ? "border-danger/30" : "border-line"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <RecordId id={item.id} />
              {item.is_recurring ? (
                <span className="rounded-md border border-warning/30 bg-warning-light px-1.5 py-0.5 text-[11px] font-medium text-warning-dark">
                  {item.recurrence_confirmed ? T.case.recurrenceConfirmed : T.common.recurringBadge}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 font-medium leading-relaxed text-ink group-hover:text-primary-dark">
              {caseTitle(item.text, 130)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {hideDepartment ? item.report_title : `${item.department_name} · ${item.report_title}`}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <RiskBadge level={item.risk_level} />
          </div>
        </div>

        <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-line pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {mine ? null : (
            <div>
              <dt className="text-muted">{T.common.responsible}</dt>
              <dd className="mt-0.5 truncate text-ink">{item.responsible_employee ?? T.common.none}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted">{T.common.targetDate}</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-ink">
              <span dir="ltr">{formatDate(item.target_date)}</span>
              <OverdueBadge targetDate={item.target_date} overdue={item.overdue} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{T.common.priority}</dt>
            <dd className="mt-0.5">
              <ProgressBar value={item.priority_score} showValue tone="primary" label={T.common.priority} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted">{T.workflow.requiredAction}</dt>
            <dd className="mt-0.5 truncate text-ink" title={next.action}>
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
        <tr key={item.id} className="transition-colors hover:bg-subtle">
          <LedgerCell mono>
            <Link href={`${detailBase}/${item.id}`} className="text-primary-dark hover:underline">
              <RecordId id={item.id} />
            </Link>
          </LedgerCell>
          <LedgerCell>
            <Link href={`${detailBase}/${item.id}`} className="hover:text-primary-dark hover:underline">
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
            <span dir="ltr">{formatDate(item.target_date)}</span>
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
  useI18n();
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
    // setParams reads the latest searchParams on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    query.set("ordering", ordering);
    query.set("page", String(page));
    return query;
  }, [mine, departmentOnly, stage, status, risk, department, search, recurringOnly, ordering, page]);

  const scopeKey = mine ? "mine" : departmentOnly ? "department" : "all";
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["recommendations", scopeKey, params.toString()],
    queryFn: () => api<Paginated<RecommendationListItem>>(`/api/recommendations/?${params}`),
  });

  const { data: departments } = useDepartments();

  const hideDepartment = mine || departmentOnly;
  const myDepartment = loadAuth()?.user.department ?? null;
  const items = (data?.results ?? []).filter((item) => {
    if (overdueOnly && !item.overdue) return false;
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

  const exportCsv = () => {
    const blob = new Blob([`\ufeff${toCsv(items)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `recommendations-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-(--radius-card) border border-line bg-surface p-3">
        <form
          className="flex min-w-[220px] flex-1 items-center gap-2"
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
              className="ps-9"
              aria-label={T.common.search}
            />
          </div>
        </form>

        <Button
          type="button"
          variant={filtersOpen || chips.length ? "secondary" : "ghost"}
          onClick={() => setFiltersOpen((value) => !value)}
        >
          <SlidersHorizontal className="size-4" />
          {T.filters.title}
          {chips.length ? <span className="font-mono text-xs">({chips.length})</span> : null}
        </Button>

        <Select
          value={ordering}
          onChange={(event) => setParams({ ordering: event.target.value })}
          className="w-auto"
          aria-label={T.register.sortBy}
        >
          {sortOptions().map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </Select>

        <div className="flex overflow-hidden rounded-(--radius-btn) border border-line">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            aria-label={T.register.viewList}
            className={cn("p-2 transition-colors", view === "list" ? "bg-primary text-white" : "text-ink-soft")}
          >
            <LayoutList className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("compact")}
            aria-pressed={view === "compact"}
            aria-label={T.register.viewCompact}
            className={cn("p-2 transition-colors", view === "compact" ? "bg-primary text-white" : "text-ink-soft")}
          >
            <Rows3 className="size-4" />
          </button>
        </div>

        <Button type="button" variant="ghost" onClick={exportCsv} disabled={!items.length}>
          <Download className="size-4" />
          {T.register.export}
        </Button>

        {createHref ? (
          <Link href={createHref}>
            <Button>{T.register.new}</Button>
          </Link>
        ) : null}
      </div>

      {/* Filter panel */}
      {filtersOpen ? (
        <div className="grid gap-4 rounded-(--radius-card) border border-line bg-surface p-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">{T.register.stage}</span>
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
            <span className="mb-1 block font-medium text-ink">{T.common.status}</span>
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
            <span className="mb-1 block font-medium text-ink">{T.common.risk}</span>
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
              <span className="mb-1 block font-medium text-ink">{T.common.department}</span>
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

          <div className="flex flex-wrap items-center gap-4 md:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => setParams({ overdue: event.target.checked ? "1" : null })}
                className="size-4 accent-primary"
              />
              {T.filters.overdueOnly}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={recurringOnly}
                onChange={(event) => setParams({ is_recurring: event.target.checked ? "true" : null })}
                className="size-4 accent-primary"
              />
              {T.filters.recurringOnly}
            </label>
          </div>
        </div>
      ) : null}

      {/* Active filters + result count */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">
          <span className="font-mono font-semibold text-ink" dir="ltr">
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
            className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary-light px-2 py-0.5 text-xs font-medium text-primary-dark transition-colors hover:bg-primary/15"
          >
            {chip.label}
            <X className="size-3" />
          </button>
        ))}
        {chips.length ? (
          <button
            type="button"
            onClick={() => {
              setSearchDraft("");
              router.replace(pathname);
            }}
            className="text-xs font-medium text-ink-soft hover:text-ink hover:underline"
          >
            {T.register.clearFilters}
          </button>
        ) : null}
      </div>

      {/* Results */}
      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorBanner message={T.common.error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Search className="size-6" />}
          title={chips.length ? T.empty.search : T.empty.generic}
          description={chips.length ? T.register.clearFilters : undefined}
        />
      ) : view === "list" ? (
        <ul className="space-y-2.5">
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
      ) : (
        <CompactTable items={items} detailBase={detailBase} hideDepartment={hideDepartment} />
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-3" aria-label={T.common.page}>
          <Button variant="ghost" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
            {T.common.prev}
          </Button>
          <span className="font-mono text-xs text-ink-soft" dir="ltr">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => setParams({ page: String(page + 1) })}
          >
            {T.common.next}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
