import type {
  ActionAvailability,
  CaseActionId,
  RecommendationStatus,
  Role,
  StageId,
  WorkflowBlock,
} from "./types";
import {
  NEXT_ROLE,
  RETURNED_STATUSES as CONTRACT_RETURNED,
  STAGE_IDS,
  STATUS_STAGE,
  statusesForStage,
} from "./contract";
import { currentT } from "./i18n/messages";

/**
 * Presentation layer over the backend workflow.
 *
 * The backend owns the workflow: which statuses exist, which stage each one
 * belongs to (lib/contract, generated from apps/workflow/presentation.py) and
 * which actions a user may take on a case (the case's `workflow` block,
 * computed by apps/workflow/guards.py — the same rules the endpoints
 * enforce). This file only decides how that looks: labels, tones, the stage
 * rail. It never grants anything.
 */
export type StageState = "completed" | "current" | "next" | "returned";

export type StatusTone = "neutral" | "info" | "primary" | "success" | "warning" | "danger" | "ai";

export interface WorkflowStage {
  id: StageId;
  label: string;
  /** Who acts while the case sits in this stage. */
  actor: string;
  /** What this stage answers, shown as stage help text. */
  question: string;
  statuses: RecommendationStatus[];
}

/** The ten business stages, in lifecycle order (labels hydrated per locale). */
export const WORKFLOW_STAGES: WorkflowStage[] = STAGE_IDS.map((id) => ({
  id,
  label: id,
  actor: "",
  question: "",
  statuses: statusesForStage(id),
}));

/** Statuses that end the lifecycle. `draft` is excluded because it never started. */
export const CLOSED_STATUSES = new Set<RecommendationStatus>(["closed"]);

/** Statuses where the case was pushed backwards by a reviewer. */
export const RETURNED_STATUSES = CONTRACT_RETURNED;

export const STATUS_TONE: Record<RecommendationStatus, StatusTone> = {
  draft: "neutral",
  pending_response: "info",
  audit_review: "info",
  returned_for_revision: "danger",
  pending_council: "info",
  approved_for_implementation: "primary",
  action_plan_required: "warning",
  action_plan_review: "info",
  revision_required: "danger",
  action_plan_approved: "primary",
  in_progress: "primary",
  pending_head_review: "info",
  submitted_for_verification: "warning",
  returned_insufficient: "danger",
  partial: "warning",
  reopened: "danger",
  closure_review: "info",
  pending_closure_council: "info",
  closed: "success",
};

/** Who must act next, and what they must do. Labels follow the active locale. */
export const STATUS_NEXT_ACTION: Record<RecommendationStatus, { role: string; action: string }> =
  new Proxy({} as Record<RecommendationStatus, { role: string; action: string }>, {
    get(_, status: string) {
      const T = currentT();
      return {
        role: T.workflow.nextRole[status as RecommendationStatus],
        action: T.workflow.nextAction[status as RecommendationStatus],
      };
    },
  });

/** 0-based position of the status's stage among the ten. */
export function stageIndexForStatus(status: RecommendationStatus): number {
  const index = STAGE_IDS.indexOf(STATUS_STAGE[status]);
  return index < 0 ? 0 : index;
}

function hydrateStage(stage: WorkflowStage): WorkflowStage {
  const T = currentT();
  return {
    ...stage,
    label: T.workflow.stages[stage.id],
    actor: T.workflow.actors[stage.id],
    question: T.workflow.questions[stage.id],
  };
}

export function stageForStatus(status: RecommendationStatus): WorkflowStage {
  return hydrateStage(WORKFLOW_STAGES[stageIndexForStatus(status)]);
}

export function localizedWorkflowStages(): WorkflowStage[] {
  return WORKFLOW_STAGES.map(hydrateStage);
}

/** Old `?stage=` values (nine-stage model) still found in saved links. */
const LEGACY_STAGE_IDS: Record<string, StageId> = {
  finding: "preparation",
  review: "audit_review",
  verify: "verification",
};

export function normalizeStageId(value: string | null | undefined): StageId | null {
  if (!value) return null;
  if ((STAGE_IDS as string[]).includes(value)) return value as StageId;
  return LEGACY_STAGE_IDS[value] ?? null;
}

export function isReturned(status: RecommendationStatus): boolean {
  return RETURNED_STATUSES.has(status);
}

/** Statuses the assigned employee actually works or has already worked. */
export const EMPLOYEE_WORK_STATUSES: RecommendationStatus[] = [
  "action_plan_approved",
  "in_progress",
  "returned_insufficient",
  "partial",
  "reopened",
  "pending_head_review",
  "submitted_for_verification",
  "closure_review",
  "pending_closure_council",
  "closed",
];

/** True when a case in `status` is waiting on `role` (by status alone). */
export function isWaitingOn(status: RecommendationStatus, role: Role): boolean {
  return NEXT_ROLE[status] === role;
}

/* ------------------------------------------------------------------ */
/* Actions — decided by the server, displayed here                     */
/* ------------------------------------------------------------------ */

type WithWorkflow = { workflow?: WorkflowBlock | null };

/** The server's answer for one action: offered (maybe disabled) or null. */
export function caseAction(rec: WithWorkflow | null | undefined, id: CaseActionId): ActionAvailability | null {
  return rec?.workflow?.available_actions.find((item) => item.id === id) ?? null;
}

/** Offered to this user for this case (enabled or with blockers). */
export function isOffered(rec: WithWorkflow | null | undefined, id: CaseActionId): boolean {
  return caseAction(rec, id) !== null;
}

/** Offered and all preconditions met. */
export function canAct(rec: WithWorkflow | null | undefined, id: CaseActionId): boolean {
  return Boolean(caseAction(rec, id)?.enabled);
}

/* ------------------------------------------------------------------ */
/* Tones                                                               */
/* ------------------------------------------------------------------ */

export const TONE_CLASSES: Record<
  StatusTone,
  { fg: string; bg: string; border: string; dot: string; solid: string }
> = {
  neutral: {
    fg: "text-neutral",
    bg: "bg-subtle",
    border: "border-line",
    dot: "bg-neutral",
    solid: "bg-neutral text-white",
  },
  info: {
    fg: "text-info-dark",
    bg: "bg-info-light",
    border: "border-info/25",
    dot: "bg-info",
    solid: "bg-info text-white",
  },
  primary: {
    fg: "text-primary-dark",
    bg: "bg-primary-light",
    border: "border-primary/25",
    dot: "bg-primary",
    solid: "bg-primary text-white",
  },
  success: {
    fg: "text-success-dark",
    bg: "bg-success-light",
    border: "border-success/25",
    dot: "bg-success",
    solid: "bg-success text-white",
  },
  warning: {
    fg: "text-warning-dark",
    bg: "bg-warning-light",
    border: "border-warning/30",
    dot: "bg-warning",
    solid: "bg-warning-dark text-white",
  },
  danger: {
    fg: "text-danger-dark",
    bg: "bg-danger-light",
    border: "border-danger/25",
    dot: "bg-danger",
    solid: "bg-danger-dark text-white",
  },
  ai: {
    fg: "text-ai-dark",
    bg: "bg-ai-light",
    border: "border-ai/25",
    dot: "bg-ai",
    solid: "bg-ai text-white",
  },
};
