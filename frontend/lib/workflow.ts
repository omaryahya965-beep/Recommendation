import type { RecommendationStatus, Role } from "./types";
import { currentT } from "./i18n/messages";

/**
 * Presentation layer over the backend status machine in
 * `apps/workflow/transitions.py`. Every stage and capability here maps to a
 * real backend status or endpoint — this is not a second workflow.
 */
export type StageState = "completed" | "current" | "next" | "returned" | "skipped";

export type StatusTone = "neutral" | "info" | "primary" | "success" | "warning" | "danger" | "ai";

export interface WorkflowStage {
  id: string;
  label: string;
  /** Who acts while the case sits in this stage. */
  actor: string;
  /** What this stage answers, shown as stage help text. */
  question: string;
  statuses: RecommendationStatus[];
}

/**
 * Nine lifecycle stages covering all 19 backend statuses.
 * `draft` is stage 0; `closed` completes the final stage.
 */
export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: "finding",
    label: "التوصية",
    actor: "وحدة الرقابة الداخلية",
    question: "ما الملاحظة ولماذا صدرت التوصية؟",
    statuses: ["draft"],
  },
  {
    id: "response",
    label: "رد الإدارة",
    actor: "رئيس الدائرة",
    question: "ما موقف الإدارة من التوصية؟",
    statuses: ["pending_response", "returned_for_revision"],
  },
  {
    id: "review",
    label: "مراجعة الرقابة",
    actor: "وحدة الرقابة الداخلية",
    question: "هل رد الإدارة مقبول؟",
    statuses: ["audit_review"],
  },
  {
    id: "council",
    label: "تصديق المجلس",
    actor: "المجلس البلدي",
    question: "هل صادق المجلس على التقرير؟",
    statuses: ["pending_council"],
  },
  {
    id: "plan",
    label: "خطة التنفيذ",
    actor: "رئيس الدائرة",
    question: "كيف ستعالج الإدارة الملاحظة؟",
    statuses: [
      "approved_for_implementation",
      "action_plan_required",
      "action_plan_review",
      "revision_required",
      "action_plan_approved",
    ],
  },
  {
    id: "execution",
    label: "التنفيذ",
    actor: "الموظف المسؤول",
    question: "ما الذي نُفِّذ فعلياً؟",
    statuses: ["in_progress", "returned_insufficient", "partial", "reopened"],
  },
  {
    id: "head_review",
    label: "مراجعة الدائرة",
    actor: "رئيس الدائرة",
    question: "هل التنفيذ جاهز للإحالة إلى الرقابة؟",
    statuses: ["pending_head_review"],
  },
  {
    id: "verify",
    label: "التحقق",
    actor: "وحدة الرقابة الداخلية",
    question: "هل تُثبت الأدلة المعالجة؟",
    statuses: ["submitted_for_verification", "closure_review"],
  },
  {
    id: "closure",
    label: "الإغلاق",
    actor: "المجلس البلدي",
    question: "هل تُغلق التوصية؟",
    statuses: ["pending_closure_council", "closed"],
  },
];

/** Statuses that end the lifecycle. `draft` is excluded because it never started. */
export const CLOSED_STATUSES = new Set<RecommendationStatus>(["closed"]);

/** Statuses where the case was pushed backwards by a reviewer. */
export const RETURNED_STATUSES = new Set<RecommendationStatus>([
  "returned_for_revision",
  "revision_required",
  "returned_insufficient",
  "reopened",
]);

const STATUS_STAGE_INDEX: Record<RecommendationStatus, number> = {
  draft: 0,
  pending_response: 1,
  returned_for_revision: 1,
  audit_review: 2,
  pending_council: 3,
  approved_for_implementation: 4,
  action_plan_required: 4,
  action_plan_review: 4,
  revision_required: 4,
  action_plan_approved: 4,
  in_progress: 5,
  returned_insufficient: 5,
  partial: 5,
  reopened: 5,
  pending_head_review: 6,
  submitted_for_verification: 7,
  closure_review: 7,
  pending_closure_council: 8,
  closed: 8,
};

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

export function stageIndexForStatus(status: RecommendationStatus): number {
  return STATUS_STAGE_INDEX[status] ?? 0;
}

export function stageForStatus(status: RecommendationStatus): WorkflowStage {
  return hydrateStage(WORKFLOW_STAGES[stageIndexForStatus(status)]);
}

function hydrateStage(stage: WorkflowStage): WorkflowStage {
  const T = currentT();
  const id = stage.id as keyof typeof T.workflow.stages;
  return {
    ...stage,
    label: T.workflow.stages[id],
    actor: T.workflow.actors[id],
    question: T.workflow.questions[id],
  };
}

export function localizedWorkflowStages(): WorkflowStage[] {
  return WORKFLOW_STAGES.map(hydrateStage);
}

/** Lifecycle stages this role actually owns or waits on — used by analytics. */
export function analyticsStageIds(role: Role): string[] | null {
  if (role === "employee") return ["execution", "head_review", "verify", "closure"];
  if (role === "department_head") {
    return ["response", "review", "council", "plan", "execution", "head_review", "verify", "closure"];
  }
  if (role === "council") return ["council", "closure"];
  return null;
}

export function isReturned(status: RecommendationStatus): boolean {
  return RETURNED_STATUSES.has(status);
}

export function workflowSnapshot(
  status: RecommendationStatus
): Array<WorkflowStage & { state: StageState }> {
  const current = stageIndexForStatus(status);
  const returned = isReturned(status);
  return WORKFLOW_STAGES.map((stage, index) => {
    let state: StageState = "next";
    if (status === "closed") state = "completed";
    else if (index < current) state = "completed";
    else if (index === current) state = returned ? "returned" : "current";
    return { ...hydrateStage(stage), state };
  });
}

/**
 * Presentation-only beats that explain the lifecycle in more detail than the
 * nine backend stages. Several beats can share one backend status — they never
 * invent a new state machine.
 */
export interface VisualBeat {
  id: string;
  label: string;
  stageIndex: number;
  highlight?: RecommendationStatus[];
}

export const VISUAL_BEATS: VisualBeat[] = [
  { id: "observation", label: "الملاحظة", stageIndex: 0 },
  { id: "recommendation", label: "التوصية", stageIndex: 0, highlight: ["draft"] },
  { id: "dispatch", label: "إرسال للإدارة", stageIndex: 1 },
  {
    id: "response",
    label: "رد الإدارة",
    stageIndex: 1,
    highlight: ["pending_response", "returned_for_revision"],
  },
  { id: "review", label: "المراجعة", stageIndex: 2, highlight: ["audit_review"] },
  { id: "approval", label: "الاعتماد", stageIndex: 2 },
  { id: "ratify", label: "التصديق", stageIndex: 3, highlight: ["pending_council"] },
  {
    id: "plan",
    label: "خطة التنفيذ",
    stageIndex: 4,
    highlight: [
      "approved_for_implementation",
      "action_plan_required",
      "action_plan_review",
      "revision_required",
      "action_plan_approved",
    ],
  },
  {
    id: "execution",
    label: "التنفيذ",
    stageIndex: 5,
    highlight: [
      "in_progress",
      "returned_insufficient",
      "partial",
      "reopened",
      "action_plan_approved",
      "pending_head_review",
    ],
  },
  { id: "evidence", label: "الأدلة", stageIndex: 5 },
  {
    id: "verify",
    label: "التحقق",
    stageIndex: 7,
    highlight: ["submitted_for_verification", "closure_review"],
  },
  { id: "followup", label: "المتابعة", stageIndex: 8, highlight: ["pending_closure_council"] },
  { id: "closure", label: "الإغلاق", stageIndex: 8, highlight: ["closed"] },
];

/** Head review is still implementation; the visual rail does not invent a status. */
function visualStageIndex(status: RecommendationStatus): number {
  const index = stageIndexForStatus(status);
  return index === 6 ? 5 : index;
}

export function visualSnapshot(status: RecommendationStatus): Array<VisualBeat & { state: StageState }> {
  const current = visualStageIndex(status);
  const returned = isReturned(status);
  const closed = status === "closed";

  return VISUAL_BEATS.map((beat, _index, all) => {
    if (closed) return { ...beat, state: "completed" as const };
    if (beat.stageIndex < current) return { ...beat, state: "completed" as const };
    if (beat.stageIndex > current) return { ...beat, state: "next" as const };

    const siblings = all.filter((candidate) => candidate.stageIndex === beat.stageIndex);
    const highlighted = siblings.find((candidate) => candidate.highlight?.includes(status));
    const me = siblings.findIndex((candidate) => candidate.id === beat.id);

    if (highlighted) {
      const hi = siblings.findIndex((candidate) => candidate.id === highlighted.id);
      if (me < hi) return { ...beat, state: "completed" as const };
      if (me > hi) return { ...beat, state: "next" as const };
      return { ...beat, state: (returned ? "returned" : "current") as StageState };
    }

    if (me === 0) return { ...beat, state: (returned ? "returned" : "current") as StageState };
    return { ...beat, state: "next" as const };
  }).map((beat): VisualBeat & { state: StageState } => {
    const T = currentT();
    const label = T.workflow.beats[beat.id as keyof typeof T.workflow.beats];
    return { ...beat, label: label ?? beat.label };
  });
}

/* ------------------------------------------------------------------ */
/* Capabilities — which real endpoint a role may call at this status   */
/* ------------------------------------------------------------------ */

export type CaseAction =
  | "respond"
  | "review_response"
  | "submit_plan"
  | "review_plan"
  | "update_progress"
  | "upload_evidence"
  | "mark_implemented"
  | "review_implementation"
  | "verify"
  | "submit_for_closure"
  | "council_closure"
  | "confirm_recurrence";

const EXECUTION_STATUSES: RecommendationStatus[] = [
  "action_plan_approved",
  "in_progress",
  "returned_insufficient",
  "partial",
  "reopened",
];

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

/** status -> roles allowed, mirroring backend transitions + service guards. */
const ACTION_RULES: Record<CaseAction, { statuses: RecommendationStatus[]; roles: Role[] }> = {
  respond: {
    statuses: ["pending_response", "returned_for_revision"],
    roles: ["department_head"],
  },
  review_response: { statuses: ["audit_review"], roles: ["audit"] },
  submit_plan: {
    statuses: ["approved_for_implementation", "action_plan_required", "revision_required"],
    roles: ["department_head"],
  },
  review_plan: { statuses: ["action_plan_review"], roles: ["audit"] },
  update_progress: { statuses: EXECUTION_STATUSES, roles: ["employee", "department_head"] },
  upload_evidence: {
    statuses: [...EXECUTION_STATUSES, "pending_head_review"],
    roles: ["employee", "department_head"],
  },
  mark_implemented: {
    statuses: ["in_progress", "returned_insufficient", "partial", "reopened"],
    roles: ["employee", "department_head"],
  },
  review_implementation: { statuses: ["pending_head_review"], roles: ["department_head"] },
  verify: { statuses: ["submitted_for_verification"], roles: ["audit"] },
  submit_for_closure: { statuses: ["closure_review"], roles: ["audit"] },
  council_closure: { statuses: ["pending_closure_council"], roles: ["council"] },
  confirm_recurrence: {
    statuses: Object.keys(STATUS_STAGE_INDEX) as RecommendationStatus[],
    roles: ["audit"],
  },
};

export function can(action: CaseAction, status: RecommendationStatus, role: Role): boolean {
  const rule = ACTION_RULES[action];
  return rule.roles.includes(role) && rule.statuses.includes(status);
}

/** All actions the given role may perform right now. */
export function availableActions(status: RecommendationStatus, role: Role): CaseAction[] {
  return (Object.keys(ACTION_RULES) as CaseAction[]).filter((action) => can(action, status, role));
}

/** True when the case is waiting on this role specifically. */
export function isWaitingOn(status: RecommendationStatus, role: Role): boolean {
  return availableActions(status, role).some((action) => action !== "confirm_recurrence");
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
