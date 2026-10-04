/**
 * The workflow contract exported by the backend
 * (`python manage.py export_workflow_contract` → workflow.json).
 *
 * Stage order, the stage of every status, who acts next and the full list of
 * error codes come from here, so the browser describes the workflow exactly
 * as the API enforces it. Never edit workflow.json by hand.
 */
import contract from "./workflow.json";

import type { CaseActionId, RecommendationStatus, Role, StageId, WaitingOn } from "../types";

interface ContractStage {
  id: StageId;
  ar: string;
  en: string;
}

export const STAGES = contract.stages as ContractStage[];

export const STAGE_IDS: StageId[] = STAGES.map((stage) => stage.id);

export const STATUS_STAGE = contract.status_stage as Record<RecommendationStatus, StageId>;

export const STATUS_LABELS = contract.status_labels as Record<RecommendationStatus, { ar: string; en: string }>;

export const CLOSED_LABELS = contract.closed_labels as Record<string, { ar: string; en: string }>;

export const NEXT_ROLE = contract.next_role as Record<RecommendationStatus, Role | null>;

export const RETURNED_STATUSES = new Set(contract.returned_statuses as RecommendationStatus[]);

/** System waypoints the case leaves at once; never offered as filters. */
export const TRANSIENT_STATUSES = new Set(contract.transient_statuses as RecommendationStatus[]);

/** Statuses in which a passed deadline is the department's delay (W2). */
export const DEPARTMENT_DEADLINE_STATUSES = new Set(
  contract.department_deadline_statuses as RecommendationStatus[]
);

export const AUDIT_QUEUE_STATUSES = new Set(contract.audit_queue_statuses as RecommendationStatus[]);

export const COUNCIL_QUEUE_STATUSES = new Set(contract.council_queue_statuses as RecommendationStatus[]);

export const ACTION_RULES = contract.actions as Record<
  CaseActionId,
  { statuses: RecommendationStatus[]; roles: Role[] }
>;

export const ERROR_CODES: string[] = contract.error_codes;

export const FIELD_ERROR_CODES: string[] = contract.field_error_codes;

export const ALL_STATUSES = Object.keys(STATUS_STAGE) as RecommendationStatus[];

const ROLE_SIDE: Record<Role, Exclude<WaitingOn, "none">> = {
  audit: "audit",
  council: "council",
  department_head: "department",
  employee: "department",
};

/** Who a status waits on when nothing else is known about the case. */
export function sideForStatus(status: RecommendationStatus): WaitingOn {
  const role = NEXT_ROLE[status];
  return role ? ROLE_SIDE[role] : "none";
}

export function statusesForStage(stage: StageId): RecommendationStatus[] {
  return ALL_STATUSES.filter((status) => STATUS_STAGE[status] === stage);
}
