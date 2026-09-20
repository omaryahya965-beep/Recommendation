import { api } from "@/lib/api";
import type { RecommendationStatus } from "@/lib/types";
import { CLOSED_STATUSES, localizedWorkflowStages, stageIndexForStatus } from "@/lib/workflow";

/**
 * Portfolio analytics, aggregated by the API.
 *
 * This used to page up to 1,200 recommendations into the browser and count
 * them in JavaScript. That shipped every finding's full text just to draw a
 * chart, got slower as a municipality accumulated history, and silently
 * truncated past the page ceiling — so the charts could disagree with the
 * dashboard without saying so.
 *
 * `GET /api/analytics/` returns grouped aggregates computed in SQL under the
 * caller's normal scoping. The payload is a few KB whatever the data volume,
 * and there is no truncation to disclose because nothing is truncated.
 */

export interface AnalyticsTotals {
  total: number;
  open: number;
  closed: number;
  overdue: number;
  high_risk_open: number;
  recurring_confirmed: number;
  recurring_flagged: number;
  with_plan: number;
  completion_rate: number;
  overdue_rate: number;
}

export interface DepartmentRow {
  department: number;
  name: string;
  total: number;
  open: number;
  closed: number;
  overdue: number;
  in_progress: number;
  high_risk: number;
  recurring: number;
  execution_rate: number;
}

export interface VolumePoint {
  month: string;
  created: number;
  closed: number;
}

export interface AnalyticsPayload {
  generated_at: string;
  totals: AnalyticsTotals;
  by_status: Partial<Record<RecommendationStatus, number>>;
  by_risk: Record<string, number>;
  by_engagement_type: Record<string, number>;
  by_department: DepartmentRow[];
  volume: VolumePoint[];
  implementation: {
    average_step_progress: number;
    steps_total: number;
    steps_done: number;
    steps_completion_rate: number;
  };
  recurrence: { confirmed: number; awaiting_confirmation: number };
}

export async function fetchAnalytics(months = 12): Promise<AnalyticsPayload> {
  return api<AnalyticsPayload>(`/api/analytics/?months=${months}`);
}

/* ------------------------------------------------------------------ */
/* Presentation shapes derived from the aggregate payload.            */
/* ------------------------------------------------------------------ */

export interface DepartmentPressure {
  department: number;
  name: string;
  total: number;
  open: number;
  closed: number;
  overdue: number;
  /** Actively being executed, as opposed to sitting in a review queue. */
  inProgress: number;
  highRisk: number;
  recurring: number;
  /** Share of this department's recommendations that reached closure. */
  executionRate: number;
}

export function departmentPressure(payload: AnalyticsPayload): DepartmentPressure[] {
  return payload.by_department
    .map((row) => ({
      department: row.department,
      name: row.name,
      total: row.total,
      open: row.open,
      closed: row.closed,
      overdue: row.overdue,
      inProgress: row.in_progress,
      highRisk: row.high_risk,
      recurring: row.recurring,
      executionRate: Math.round(row.execution_rate),
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
 * Open recommendations per workflow stage — "where is the pipeline stuck",
 * which a raw status histogram does not answer.
 *
 * Folding the status histogram into stages is cheap and stays on the client,
 * because the stage definitions are a UI concern: the server would otherwise
 * have to know about the presentation grouping.
 */
export function stagePressure(payload: AnalyticsPayload): StagePressure[] {
  const stages = localizedWorkflowStages();
  const counts = new Array(stages.length).fill(0) as number[];

  for (const [status, count] of Object.entries(payload.by_status)) {
    const key = status as RecommendationStatus;
    if (CLOSED_STATUSES.has(key)) continue;
    counts[stageIndexForStatus(key)] += count ?? 0;
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

export function portfolioRates(payload: AnalyticsPayload): PortfolioRates {
  const totals = payload.totals;
  return {
    open: totals.open,
    closed: totals.closed,
    total: totals.total,
    completionRate: Math.round(totals.completion_rate),
    overdueRate: Math.round(totals.overdue_rate),
    overdue: totals.overdue,
    highRisk: totals.high_risk_open,
    recurring: totals.recurring_confirmed,
  };
}
