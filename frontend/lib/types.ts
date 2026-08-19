export type Role = "audit" | "department_head" | "employee" | "council";

export interface User {
  id: number;
  username: string;
  full_name_ar: string;
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

export interface RecommendationListItem {
  id: number;
  report: number;
  report_title: string;
  department: number;
  department_name: string;
  text: string;
  risk_level: "high" | "medium" | "low";
  priority_score: number;
  status: RecommendationStatus;
  is_recurring: boolean;
  recurrence_confirmed: boolean;
  target_date: string | null;
  responsible_employee: string | null;
  overdue: boolean;
  created_at: string;
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
  root_cause: string;
  resolution: string;
  similar_recommendation: number | null;
  similar_recommendation_text: string | null;
  similarity_score: number | null;
  response: ManagementResponse | null;
  action_plan: ActionPlan | null;
  approvals: ApprovalRecord[];
  evidence_files: Evidence[];
  verifications: VerificationDecision[];
  trail: TrailEntry[];
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
  recommendations?: RecommendationListItem[];
}

export interface Department {
  id: number;
  name: string;
}

export interface AppNotification {
  id: number;
  recommendation: number | null;
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

export interface FollowUpReport {
  id: number;
  period_start: string;
  period_end: string;
  generated_by_detail: User;
  snapshot: {
    generated_at: string;
    totals: { total: number; closed: number; completion_rate: number; overdue: number };
    by_status: Record<string, number>;
    by_risk: Record<string, number>;
    by_department: Record<string, number>;
    items: Array<{
      id: number;
      text: string;
      department: string;
      report: string;
      risk_level: string;
      status: string;
      is_recurring: boolean;
      target_date: string | null;
      responsible: string | null;
      overdue: boolean;
    }>;
  };
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
  tool_results: Record<string, unknown>;
  provider: string;
  model: string;
  advisory: boolean;
  messages: Array<{ role: string; content: string; created_at: string }>;
}
