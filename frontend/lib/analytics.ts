import { api } from "@/lib/api";
import type { RecommendationStatus, StageId } from "@/lib/types";
import { localizedWorkflowStages } from "@/lib/workflow";

/**
 * Portfolio analytics, aggregated by the API (`GET /api/analytics/`) under
 * the caller's normal scoping. Every definition lives in one place —
 * backend apps/core/analytics.py — and the role dashboards read the same
 * totals, so a tile here and a tile on the home page can never disagree.
 *
 *   total        issued recommendations; drafts are counted apart (`drafts`)
 *   overdue      binding deadline passed while the department owns the action
 *   overdue_rate overdue / open cases that have a binding deadline
 *   volume       created per month (created_at) and closed per month
 *                (closed_at), two separate series
 */

export interface AnalyticsTotals {
  total: number;
  drafts: number;
  all_records: number;
  open: number;
  closed: number;
  closed_implemented: number;
  closed_disagreement: number;
  completion_rate: number;
  overdue: number;
  overdue_base: number;
  overdue_rate: number;
  high_risk_open: number;
  in_execution: number;
  in_progress: number;
  awaiting_head_review: number;
  awaiting_verification: number;
  awaiting_closure_audit: number;
  awaiting_closure_council: number;
  awaiting_ratification: number;
  awaiting_response: number;
  response_overdue: number;
  late_in_review: number;
  recurring_confirmed: number;
  recurring_flagged: number;
  with_plan: number;
}

export interface DepartmentRow {
  department: number;
  name: string;
  total: number;
  open: number;
  closed: number;
  closed_implemented: number;
  overdue: number;
  overdue_rate: number;
  in_progress: number;
  /** Open high-risk recommendations. */
  high_risk: number;
  recurring: number;
  /** Closed as implemented / cases that reached the plan stage (disagreements excluded). */
  execution_rate: number;
}

export interface VolumePoint {
  month: string;
  created: number;
  closed: number;
}

export interface QueueAge {
  count: number;
  average_days: number;
  max_days: number;
}

export interface AnalyticsPayload {
  generated_at: string;
  definitions_version: number;
  totals: AnalyticsTotals;
  by_status: Partial<Record<RecommendationStatus, number>>;
  by_stage: Partial<Record<StageId, number>>;
  by_risk: Record<string, number>;
  by_engagement_type: Record<string, number>;
  by_department: DepartmentRow[];
  volume: VolumePoint[];
  implementation: {
    average_step_progress: number;
    cases_in_execution: number;
    steps_total: number;
    steps_done: number;
    steps_completion_rate: number;
  };
  queues: Record<"department" | "audit" | "council", QueueAge>;
  overdue_aging: Record<string, number>;
  decisions: {
    closure_decisions: number;
    closed: number;
    reopened: number;
    reopen_rate: number;
    ratified: number;
    per_month: Array<{ month: string; closed: number; reopened: number; ratified: number }>;
  };
  recurrence: { confirmed: number; awaiting_confirmation: number };
}

export async function fetchAnalytics(months = 12): Promise<AnalyticsPayload> {
  return api<AnalyticsPayload>(`/api/analytics/?months=${months}`);
}

export interface StagePressure {
  id: StageId;
  label: string;
  actor: string;
  count: number;
}

/** Open recommendations per business stage: where the pipeline is waiting. */
export function stagePressure(payload: Pick<AnalyticsPayload, "by_stage">): StagePressure[] {
  return localizedWorkflowStages()
    .filter((stage) => stage.id !== "closed")
    .map((stage) => ({
      id: stage.id,
      label: stage.label,
      actor: stage.actor,
      count: payload.by_stage[stage.id] ?? 0,
    }));
}

/** Departments, most pressing first: overdue, then open high risk, then open. */
export function departmentPressure(payload: Pick<AnalyticsPayload, "by_department">): DepartmentRow[] {
  return [...payload.by_department].sort(
    (a, b) => b.overdue - a.overdue || b.high_risk - a.high_risk || b.open - a.open
  );
}

/** Council decisions per month, aligned to the same months as `volume`. */
export function decisionSeries(payload: Pick<AnalyticsPayload, "volume" | "decisions">) {
  const byMonth = new Map(payload.decisions.per_month.map((row) => [row.month, row]));
  return payload.volume.map((point) => ({
    month: point.month,
    closed: byMonth.get(point.month)?.closed ?? 0,
    reopened: byMonth.get(point.month)?.reopened ?? 0,
  }));
}

/** Overdue aging buckets in display order. */
export const AGING_ORDER = ["1-30", "31-90", "91+"] as const;
