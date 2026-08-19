import { api } from "@/lib/api";
import type { Paginated, RecommendationListItem } from "@/lib/types";
import { CLOSED_STATUSES, localizedWorkflowStages, stageIndexForStatus } from "@/lib/workflow";

/**
 * The backend caps `page_size` at 100 and exposes no per-department aggregation
 * endpoint, so portfolio analytics are derived on the client from the real
 * recommendation records. Nothing here is estimated or fabricated: every number
 * is a count over rows the API actually returned.
 *
 * `truncated` is surfaced so the UI can say so instead of quietly showing a
 * partial picture.
 */
export interface Portfolio {
  items: RecommendationListItem[];
  total: number;
  truncated: boolean;
}

const PAGE_SIZE = 100;
/** Hard ceiling so a large municipality can never spin the browser. */
const MAX_PAGES = 12;

export async function fetchPortfolio(query = ""): Promise<Portfolio> {
  const items: RecommendationListItem[] = [];
  let total = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const search = new URLSearchParams(query);
    search.set("page_size", String(PAGE_SIZE));
    search.set("page", String(page));

    const chunk = await api<Paginated<RecommendationListItem>>(
      `/api/recommendations/?${search.toString()}`
    );
    total = chunk.count;
    items.push(...chunk.results);
    if (!chunk.next) break;
  }

  return { items, total, truncated: items.length < total };
}

const IN_PROGRESS_STATUSES = new Set([
  "in_progress",
  "partial",
  "returned_insufficient",
  "reopened",
  "pending_head_review",
]);

export interface DepartmentPressure {
  department: number;
  name: string;
  total: number;
  open: number;
  closed: number;
  overdue: number;
  inProgress: number;
  highRisk: number;
  recurring: number;
  /** Share of this department's recommendations that reached closure. */
  executionRate: number;
}

export function departmentPressure(items: RecommendationListItem[]): DepartmentPressure[] {
  const rows = new Map<number, DepartmentPressure>();

  for (const item of items) {
    const row = rows.get(item.department) ?? {
      department: item.department,
      name: item.department_name,
      total: 0,
      open: 0,
      closed: 0,
      overdue: 0,
      inProgress: 0,
      highRisk: 0,
      recurring: 0,
      executionRate: 0,
    };

    const closed = CLOSED_STATUSES.has(item.status);
    row.total += 1;
    if (closed) row.closed += 1;
    else row.open += 1;
    if (IN_PROGRESS_STATUSES.has(item.status)) row.inProgress += 1;
    if (item.overdue) row.overdue += 1;
    if (item.risk_level === "high" && !closed) row.highRisk += 1;
    if (item.is_recurring) row.recurring += 1;

    rows.set(item.department, row);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      executionRate: row.total ? Math.round((row.closed / row.total) * 100) : 0,
    }))
    .sort((a, b) => b.overdue - a.overdue || b.highRisk - a.highRisk || b.open - a.open);
}

export interface StagePressure {
  index: number;
  label: string;
  actor: string;
  count: number;
}

/**
 * Counts open recommendations per workflow stage. This answers "where is the
 * pipeline stuck", which a raw status histogram does not.
 */
export function stagePressure(items: RecommendationListItem[]): StagePressure[] {
  const stages = localizedWorkflowStages();
  const counts = new Array(stages.length).fill(0) as number[];

  for (const item of items) {
    if (CLOSED_STATUSES.has(item.status)) continue;
    counts[stageIndexForStatus(item.status)] += 1;
  }

  return stages.map((stage, index) => ({
    index,
    label: stage.label,
    actor: stage.actor,
    count: counts[index],
  }));
}

export interface PortfolioRates {
  open: number;
  closed: number;
  total: number;
  /** Closed as a share of all recommendations. */
  completionRate: number;
  /** Overdue as a share of the still-open population. */
  overdueRate: number;
  overdue: number;
  highRisk: number;
  recurring: number;
}

export function portfolioRates(items: RecommendationListItem[]): PortfolioRates {
  let open = 0;
  let closed = 0;
  let overdue = 0;
  let highRisk = 0;
  let recurring = 0;

  for (const item of items) {
    if (CLOSED_STATUSES.has(item.status)) closed += 1;
    else {
      open += 1;
      if (item.risk_level === "high") highRisk += 1;
    }
    if (item.overdue) overdue += 1;
    if (item.is_recurring) recurring += 1;
  }

  const total = open + closed;
  return {
    open,
    closed,
    total,
    completionRate: total ? Math.round((closed / total) * 100) : 0,
    overdueRate: open ? Math.round((overdue / open) * 100) : 0,
    overdue,
    highRisk,
    recurring,
  };
}
