export type Role = "audit" | "department_head" | "employee" | "council";

export interface User {
  id: number;
  username: string;
  full_name_ar: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: Role;
  department: number | null;
  department_name?: string;
  municipality: number | null;
  municipality_name?: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type RecommendationStatus =
  | "draft"
  | "pending_response"
  | "audit_review"
  | "returned_for_revision"
  | "pending_council"
  | "approved_for_implementation"
  | "action_plan_required"
  | "action_plan_review"
  | "revision_required"
  | "action_plan_approved"
  | "in_progress"
  | "pending_head_review"
  | "submitted_for_verification"
  | "returned_insufficient"
  | "partial"
  | "reopened"
  | "closure_review"
  | "pending_closure_council"
  | "closed";

/** The ten business stages (backend apps/workflow/presentation.py). */
export type StageId =
  | "preparation"
  | "response"
  | "audit_review"
  | "council"
  | "plan"
  | "execution"
  | "head_review"
  | "verification"
  | "closure"
  | "closed";

/** Who a case is waiting on. Department overdue only applies to "department". */
export type WaitingOn = "department" | "audit" | "council" | "none";

export type DeadlineSource = "plan" | "verification" | "response";

/** Every action the API can offer on a case (apps/workflow/guards.py). */
export type CaseActionId =
  | "edit_draft"
  | "respond"
  | "review_response"
  | "submit_plan"
  | "review_plan"
  | "update_progress"
  | "upload_evidence"
  | "delete_evidence"
  | "mark_implemented"
  | "review_implementation"
  | "verify"
  | "submit_for_closure"
  | "council_closure"
  | "confirm_recurrence";

export interface ActionBlocker {
  code: string;
  params?: Record<string, unknown>;
}

export interface ActionAvailability {
  id: CaseActionId;
  enabled: boolean;
  blockers: ActionBlocker[];
}

/** The case detail's `workflow` block: where it stands and what this user may do. */
export interface WorkflowBlock {
  status: RecommendationStatus;
  status_label: string;
  stage: StageId;
  stage_index: number;
  stage_count: number;
  returned: boolean;
  waiting_on: WaitingOn;
  next_actor: {
    role: Role;
    side: Exclude<WaitingOn, "none">;
    user: { id: number; name: string } | null;
  } | null;
  waiting_since: string | null;
  days_waiting: number;
  deadline: { date: string; source: DeadlineSource } | null;
  original_target_date: string | null;
  is_overdue: boolean;
  days_overdue: number;
  due_in_days: number | null;
  response_overdue: boolean;
  my_turn: boolean;
  available_actions: ActionAvailability[];
  primary_action: CaseActionId | null;
  report_action:
    | { id: "submit_report_to_department" | "submit_report_to_council" | "ratify_report"; report: number }
    | null;
  combined_closure_available: boolean;
}

export interface RecommendationListItem {
  id: number;
  report: number;
  report_title: string;
  /** Assurance or advisory — inherited from the recommendation's report. */
  engagement_type: "assurance" | "advisory";
  department: number;
  department_name: string;
  /** One-line title derived from the stored text (never the full text). */
  title: string;
  excerpt: string;
  risk_level: "high" | "medium" | "low";
  priority_score: number;
  status: RecommendationStatus;
  resolution: string;
  is_recurring: boolean;
  recurrence_confirmed: boolean;
  /** The action plan's own target date (kept visible after W1 replaces it). */
  target_date: string | null;
  responsible_employee: string | null;
  /** Department overdue: binding deadline passed while the department owns the action. */
  overdue: boolean;
  stage: StageId;
  waiting_on: WaitingOn;
  next_role: Role | null;
  /** The binding deadline (plan, audit-set after verification, or response). */
  deadline: string | null;
  deadline_source: DeadlineSource | null;
  days_overdue: number;
  due_in_days: number | null;
  response_overdue: boolean;
  /** Days since the case entered its current status (queue age). */
  days_waiting: number;
  /** True when the case is waiting on the requesting user. */
  my_turn: boolean;
  created_at: string;
  closed_at: string | null;
}

export interface ActionStep {
  id: number;
  title: string;
  order: number;
  depends_on: number | null;
  is_done: boolean;
  progress_percent: number;
  comments: string;
  is_required_for_closure: boolean;
  updated_at: string;
}

export interface ActionPlan {
  id: number;
  responsible_employee: number;
  responsible_employee_detail: User;
  target_date: string;
  notes: string;
  status: "submitted" | "revision_required" | "approved";
  review_notes: string;
  revision_count: number;
  steps: ActionStep[];
  created_at: string;
}

export interface ManagementResponse {
  id: number;
  decision: "agree" | "disagree";
  justification: string;
  attachment: string | null;
  submitted_by_detail: User;
  review_status: "pending" | "accepted" | "rejected";
  audit_review_notes: string;
  revision_count: number;
  created_at: string;
}

export interface ApprovalRecord {
  id: number;
  approval_type:
    | "audit_approval"
    | "council_ratification"
    | "head_implementation_review"
    | "closure_review"
    | "closure_council";
  approved_by_detail: User;
  notes: string;
  created_at: string;
}

export interface Evidence {
  id: number;
  step: number | null;
  file: string;
  file_url: string | null;
  uploaded_by_detail: User;
  notes: string;
  uploaded_at: string;
  /** Whether the requesting user may delete this file now (server rule). */
  can_delete?: boolean;
}

export interface VerificationDecision {
  id: number;
  decision: "sufficient" | "partial" | "insufficient";
  reviewed_by_detail: User;
  notes: string;
  rejected_items: string;
  rejection_reason: string;
  required_action: string;
  action_deadline: string | null;
  assigned_to_detail: User | null;
  created_at: string;
}

export interface TrailEntry {
  id: number;
  action: string;
  user: string;
  user_full_name: string;
  user_role: Role;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RecommendationDetail extends RecommendationListItem {
  /** The full stored finding text (detail only). */
  text: string;
  root_cause: string;
  similar_recommendation: number | null;
  similar_recommendation_text: string | null;
  similarity_score: number | null;
  response: ManagementResponse | null;
  action_plan: ActionPlan | null;
  approvals: ApprovalRecord[];
  evidence_files: Evidence[];
  verifications: VerificationDecision[];
  trail: TrailEntry[];
  /** Null only when the response was not built for a signed-in user. */
  workflow: WorkflowBlock | null;
  updated_at: string;
}

export interface AuditReport {
  id: number;
  municipality: number;
  department: number;
  department_name: string;
  title: string;
  engagement_type: "advisory" | "assurance";
  status: "draft" | "pending_response" | "under_review" | "pending_council" | "ratified";
  created_by_detail: User;
  response_deadline: string | null;
  council_approval_date: string | null;
  recommendations_count: number;
  created_at: string;
  recommendations?: ReportRecommendationItem[];
}

/** A recommendation as listed inside its report (adds the response decision). */
export interface ReportRecommendationItem extends RecommendationListItem {
  response_decision?: "agree" | "disagree" | null;
}

export interface Department {
  id: number;
  name: string;
}

export interface AppNotification {
  id: number;
  recommendation: number | null;
  /** Report-level events: one notification per report. */
  report?: number | null;
  recommendation_text: string | null;
  department_name: string | null;
  report_title: string | null;
  status: RecommendationStatus | null;
  risk_level: "high" | "medium" | "low" | null;
  target_date: string | null;
  responsible_employee: string | null;
  overdue: boolean;
  type: NotificationType;
  message: string;
  is_read: boolean;
  sent_at: string;
}

export type NotificationType =
  | "deadline_approaching"
  | "due_today"
  | "overdue"
  | "response_needed"
  | "returned"
  | "action_required"
  | "status_change";

export interface ReminderRule {
  id: number;
  offset_days: number;
  enabled: boolean;
  recipient_role: "employee" | "department_head" | "audit";
  label: string;
}

export interface WorkflowPolicy {
  id: number;
  require_plan_with_response: boolean;
}

export interface FollowUpItem {
  id: number;
  reference?: string;
  /** v2: derived title/excerpt. v1 snapshots carry only the full text. */
  title?: string;
  excerpt?: string;
  text?: string;
  department: string;
  department_id?: number;
  report: string;
  report_id?: number;
  engagement_type?: "assurance" | "advisory";
  risk_level: "high" | "medium" | "low";
  /** v2: the status at the end of the period. v1: at generation time. */
  status: RecommendationStatus;
  status_label?: string;
  stage?: StageId;
  status_now?: RecommendationStatus;
  is_recurring: boolean;
  responsible: string | null;
  target_date: string | null;
  deadline?: string | null;
  deadline_source?: DeadlineSource | null;
  overdue: boolean;
  days_overdue?: number;
  became_overdue?: boolean;
  response_overdue?: boolean;
  late_in_review?: boolean;
  issued_at?: string | null;
  issued_in_period?: boolean;
  open_at_start?: boolean;
  closed_at?: string | null;
  closed_in_period?: boolean;
  resolution?: string;
  history_incomplete?: boolean;
}

export interface FollowUpDepartmentRow {
  department: number;
  name: string;
  total: number;
  open: number;
  closed_in_period: number;
  overdue: number;
  overdue_rate: number;
  median_days_overdue: number;
  execution_rate: number;
  high_risk_open: number;
}

export interface FollowUpSnapshot {
  /** 2 = states as of the period end; absent/1 = states at generation time. */
  methodology_version?: number;
  generated_at: string;
  as_of?: string;
  as_of_date?: string;
  period_start?: string;
  period_end?: string;
  totals: {
    total: number;
    closed: number;
    completion_rate: number;
    overdue: number;
    open_at_start?: number;
    issued_in_period?: number;
    closed_in_period?: number;
    closed_implemented_in_period?: number;
    closed_disagreement_in_period?: number;
    open_at_end?: number;
    overdue_rate?: number;
    became_overdue_in_period?: number;
    late_in_review?: number;
    response_overdue?: number;
    high_risk_open?: number;
    history_incomplete?: number;
  };
  by_status: Record<string, number>;
  by_stage?: Partial<Record<StageId, number>>;
  by_risk: Record<string, number>;
  by_department: Record<string, number>;
  departments?: FollowUpDepartmentRow[];
  by_engagement_type?: Record<string, number>;
  major_risks?: number[];
  items: FollowUpItem[];
}

export interface FollowUpExecutiveSummary {
  title: string;
  text: string;
  key_findings: Array<{ text: string }>;
  recommended_next_steps: Array<{ text: string }>;
  focus: Array<{
    id: number;
    department?: string;
    status?: string;
    risk_level?: string;
    overdue?: boolean;
    text?: string;
  }>;
}

export interface FollowUpPreview {
  period_start: string;
  period_end: string;
  snapshot: FollowUpSnapshot;
  executive_summary: FollowUpExecutiveSummary;
}

export interface FollowUpReport {
  id: number;
  period_start: string;
  period_end: string;
  generated_by_detail: User;
  snapshot: FollowUpSnapshot;
  executive_summary?: FollowUpExecutiveSummary;
  language?: string;
  created_at: string;
}

export interface ActionCenterBlock<T = RecommendationListItem> {
  count: number;
  items: T[];
}

export interface DashboardStats {
  total: number;
  open: number;
  closed: number;
  completion_rate: number;
  overdue: number;
  by_status: Record<string, number>;
  by_risk: Record<string, number>;
}

export interface DashboardData {
  role: Role;
  action_center: Record<string, ActionCenterBlock<never>> & Record<string, ActionCenterBlock>;
  stats: DashboardStats;
  in_execution?: ActionCenterBlock;
  active_tasks?: ActionCenterBlock;
}

export interface AIAnalysisEnvelope {
  id: number;
  analysis_type: string;
  target_type: string;
  target_id: number;
  provider: string;
  model: string;
  output: Record<string, unknown>;
  confidence: number | null;
  human_reviewed: boolean;
  created_at: string;
  advisory: boolean;
  human_decision_required: boolean;
  live?: boolean;
}

export interface AIJob {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  job_type: string;
  target_type: string;
  target_id: number | null;
  error: string;
  started_at: string | null;
  completed_at: string | null;
  analysis: AIAnalysisEnvelope | null;
}

export interface AIMatch {
  matched_id: number;
  matched_reference: string;
  matched_title?: string;
  matched_text: string;
  matched_status: string;
  matched_status_label?: string;
  matched_department: string;
  similarity_percent: number;
  reasons: string[];
  suggested_recurring: "LIKELY_RECURRING" | "POSSIBLY_RELATED";
  requires_human_confirmation: boolean;
}

export interface AIInsightBucket {
  count: number;
  items: RecommendationListItem[];
}

export interface AIDashboardInsights {
  available: boolean;
  detail?: string;
  provider?: string;
  model?: string;
  generated_at?: string;
  advisory_notice?: string;
  cards?: Record<string, AIInsightBucket>;
  buckets?: Record<string, AIInsightBucket>;
  department_overdue?: Array<{ department: string; count: number }>;
  department_recurring?: Array<{ department: string; count: number }>;
  narratives?: string[];
  human_decision_required?: boolean;
}

export interface AIAssistantResponse {
  conversation_id: number;
  answer: string;
  tools: string[];
  tool_results?: Record<string, unknown>;
  provider: string;
  model: string;
  advisory: boolean;
  messages: Array<{ role: string; content: string; created_at: string; metadata?: Record<string, unknown> }>;
}
