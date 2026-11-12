export interface CapabilityMap {
  log_session: boolean;
  open_induction: boolean;
  activate_placement: boolean;
  [capability: string]: boolean;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  registration_number?: string;
  scope?: {
    institution_id?: string;
    institution_name?: string;
    program_id?: string;
    [key: string]: unknown;
  };
  capabilities: CapabilityMap;
  email_verified?: boolean;
  /** True when a published consent wording is waiting for this student or mentor to accept. */
  consent_required?: boolean;
  /** Set for accounts created with an initial password; they must choose their own before doing anything else. */
  must_change_password?: boolean;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone?: string;
  registration_number?: string;
  created_at: string;
  last_active?: string | null;
  scope?: string;
  scope_type?: string;
  institution_id?: string | null;
  facility_id?: string | null;
  can_reissue_invitation?: boolean;
}

export interface PeoplePage {
  results: Person[];
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

export interface ActivityEntry {
  id: string;
  /** Plain-language headline, e.g. "Mentor assigned" or "You logged a session". */
  title: string;
  /** Who or what it concerned, e.g. "Student: Jane Doe · Kenyatta". */
  summary: string;
  actor: string;
  actor_role: string;
  by_me: boolean;
  category: string;
  occurred_at: string;
  details: Array<{ label: string; value: string }>;
}

export interface ActivityPage {
  results: ActivityEntry[];
  pagination: PeoplePage["pagination"];
}

export interface DashboardSummary {
  people_total: number;
  active_people: number;
  invited_people: number;
  suspended_people: number;
  students: number;
  mentors: number;
  programme_staff: number;
  activity_events: number;
  readiness: {
    institutions: number;
    facilities: number;
    wards: number;
    active_coordinators: number;
    active_nurse_managers: number;
    invited_coordinators: number;
    invited_nurse_managers: number;
    unassigned_placements: number;
    placements_missing_setup: number;
  };
}

export interface DashboardIndicators {
  role: string;
  indicators: Record<string, number>;
}

export interface InterruptionReportRow {
  facility_id: string;
  facility_name: string;
  cohort_id: string;
  cohort_name: string;
  reason: string;
  interruptions: number;
  days_interrupted: number;
}

export interface FeedbackAggregate {
  question_code: string;
  responses: number;
  mean_score: number;
}

export interface ExportRecord {
  id: string;
  export_type: string;
  format: string;
  status: "queued" | "running" | "completed" | "failed";
  row_count: number;
  /** Why a failed export failed, e.g. "pdf_too_large". */
  error_code: string | null;
  /** Echo of the request filters. */
  filters: { cohort_id?: string; facility_id?: string; from?: string; to?: string };
  created_at: string;
  completed_at: string | null;
  /** ISO time after which the download link stops working. */
  expires_at: string | null;
  download_url: string | null;
}
export type ExportFormat = "csv" | "xlsx" | "json" | "pdf";
export interface ReportOverview {
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  summary: Record<string, number>;
  comparisons: Record<string, number | null>;
  trend: Array<{
    date: string;
    placements_created: number;
    placements_completed: number;
    sessions_logged: number;
    activity_events: number;
  }>;
}

export interface ProgrammeSettings {
  id: string;
  name: string;
  short_name: string;
  description: string;
  academic_year: string;
  owner_id: string;
  owners?: { id: string; name: string }[];
  require_mentor_training_before_placement: boolean;
  directory_reviewed_at: string | null;
  directory_reviewed_by_name: string | null;
}

export interface Institution {
  id: string;
  name: string;
  type: string;
  county: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  logo_url: string | null;
  is_active?: boolean;
  archived_at?: string | null;
}
export interface Facility {
  id: string;
  name: string;
  county: string;
  level: string;
  maternity_unit_name: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  logo_url: string | null;
  archived_at?: string | null;
}
export interface Ward {
  id: string;
  facility_id: string;
  facility_name: string;
  name: string;
  shift_pattern: string;
  max_students: number;
  allocated_students: number;
  available_slots: number;
  available: boolean;
  archived_at: string | null;
}

export type DirectoryImportKind = "institutions" | "facilities" | "wards";
export interface DirectoryImportPreview {
  kind: DirectoryImportKind;
  rows: Array<{
    row: number;
    name: string;
    status: "ready" | "warning" | "error";
    issues: Array<{ field: string; message: string }>;
  }>;
  errors: Array<{ row: number | null; field: string; message: string }>;
  warnings: Array<{ row: number | null; field: string; message: string }>;
  valid_count: number;
  error_count: number;
  warning_count: number;
  preview_token: string;
  facility_id: string | null;
}
export interface DirectoryImportResult {
  resource_type: DirectoryImportKind;
  created_count?: number;
  replayed?: boolean;
  message?: string;
}
export interface Cohort {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  planned_capacity: number | null;
  member_count: number;
  archived_at?: string | null;
}
export interface CohortProgress {
  cohort_id: string;
  placement_count: number;
  by_state: Record<string, number>;
  students_without_placement: number;
}
export interface InstitutionStudent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  registration_number: string;
  status: string;
  cohort_names?: string[];
}
export interface InstitutionStudentPage {
  results: InstitutionStudent[];
  pagination: PeoplePage["pagination"];
}
export interface FacilityMentor {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  created_at: string;
  active_placements: number;
  accepting_students: boolean;
  max_active_placements: number;
}
export interface FacilityMentorPage {
  results: FacilityMentor[];
  pagination: PeoplePage["pagination"];
}
export interface StudentProfile {
  course_name: string;
  year_of_study: number | null;
  date_of_birth: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

export interface MentorProfile {
  cadre: string;
  department: string;
  years_of_practice: number | null;
  mentorship_experience_years: number | null;
  cpd_identifier: string;
  digital_literacy: number | null;
}

export interface StudentInvitationRow {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  registration_number?: string;
}
export interface BulkInvitationResult {
  results: Array<{
    row: number;
    email: string;
    status: "ready" | "invited" | "rejected";
    code: string;
    message: string;
  }>;
  accepted_count: number;
  rejected_count: number;
  dry_run: boolean;
}

export interface LoginResult {
  authenticated: boolean;
  mfaRequired: boolean;
  mfaSetupRequired: boolean;
  emailMfaAvailable: boolean;
  recoveryContact?: "programme_admin" | "another_program_admin" | "support";
  user?: CurrentUser;
}

export interface ActivationResult {
  emailVerificationRequired: boolean;
  mfaRequired: boolean;
  mfaSetupRequired: boolean;
  user?: CurrentUser;
}

export interface AuthenticatorDevice {
  id: string;
  type: string;
  created_at: string;
  last_used_at: string | null;
}

export interface UserSession {
  id: string;
  device: string;
  ip_address: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  current: boolean;
}

export type PlacementState =
  | "draft"
  | "scheduled"
  | "awaiting_student"
  | "orientation"
  | "induction"
  | "active"
  | "paused"
  | "completed"
  | "archived"
  | "withdrawn";

export interface Placement {
  id: string;
  cohort_id?: string;
  cohort_name?: string;
  institution_id?: string;
  institution_name?: string;
  facility_id?: string | null;
  facility_name?: string | null;
  requested_facility_id?: string | null;
  requested_facility_name?: string | null;
  declined_facility_name?: string | null;
  decline_reason?: string;
  state: PlacementState;
  planned_start: string;
  planned_end: string;
  actual_end: string | null;
  completed_at?: string | null;
  archived_at?: string | null;
  withdrawal_reason?: string | null;
  active_mentor_id: string | null;
  student?: {
    id: string;
    name: string;
    email: string;
    registration_number?: string | null;
  } | null;
  mentor?: { id: string; name: string; email: string } | null;
  ward?: {
    id: string;
    name: string;
    capacity: number;
    occupied: number;
  } | null;
}

export interface PlacementPage {
  results: Placement[];
  pagination: PeoplePage["pagination"];
}
export interface PlacementOptions {
  cohorts: Array<{
    id: string;
    name: string;
    institution_id: string;
    institution_name: string;
    start_date: string;
    end_date: string;
  }>;
  wards: Array<{
    id: string;
    name: string;
    facility_id: string;
    facility_name: string;
    capacity: number;
  }>;
  mentors: Array<{
    id: string;
    name: string;
    email: string;
    facility_id: string | null;
    accepting_students: boolean;
    active_placements: number;
    max_active_placements: number;
  }>;
}

export interface TransitionResponse {
  state: PlacementState;
  available: PlacementState[];
  blocked: Array<{
    command: string;
    reasons: Array<{
      code: string;
      message?: string;
      details?: Record<string, unknown> | null;
    }>;
  }>;
}

export interface FinalAssessmentStatus {
  submitted: boolean;
  can_submit: boolean;
  effective_end: string;
}

export interface PlacementAcknowledgement {
  signed_name: string;
  signed_at: string;
}

export interface PlacementProgress {
  placement_id: string;
  state: PlacementState;
  training: { available: boolean; percentage: number | null };
  induction: {
    available: boolean;
    completed: number;
    total: number;
    percentage: number | null;
  };
  mentorship: { sessions_logged: number; last_session_date: string | null };
  assessment: { baseline_submitted: boolean; final_submitted: boolean };
  orientation?: { acknowledged: boolean };
  safeguarding: {
    open_concerns: number;
    severity?: { low: number; medium: number; high: number };
  };
  overall_percentage: number | null;
}

export interface TrainingModule {
  id: string;
  title: string;
  slug: string;
  description: string;
  pass_mark: number;
  is_required: boolean;
  cover_image: string;
  category: string;
  status: "draft" | "published" | "archived";
  archived_at?: string | null;
  updated_at?: string;
  visible_roles: string[];
  completed: boolean;
  score: number | null;
  completed_at?: string | null;
  attempt_count?: number;
  best_score?: number | null;
  last_score?: number | null;
  last_passed?: boolean | null;
  visited_lesson_ids?: string[];
  checks?: TrainingModule["quiz"];
  certificate_enabled?: boolean;
  version?: number | null;
  version_count?: number;
  has_unpublished_changes?: boolean;
  completed_version?: number | null;
  needs_refresh?: boolean;
  total_minutes?: number;
  has_quiz?: boolean;
  learners_completed?: number;
  learners_attempted?: number;
  lessons: Array<{
    id: string;
    position: number;
    title: string;
    body: string;
    lesson_type: LessonType;
    duration_minutes: number;
    video_url?: string;
    video?: { provider: "youtube" | "vimeo"; id: string; embed_url: string } | null;
    section?: string;
  }>;
  quiz: Array<{
    id: string;
    position: number;
    prompt: string;
    options: string[];
    kind?: "single" | "multi" | "true_false";
    lesson_id?: string;
    scenario?: string;
    explanation?: string;
    choices: Array<{ id: string; text: string; feedback?: string }>;
    correct_option?: string;
    correct_option_id?: string;
    correct_option_ids?: string[];
  }>;
}

export type LessonType = "reading" | "video" | "checklist";

export interface TrainingProgress {
  available: boolean;
  completed: number;
  total: number;
  percentage: number | null;
  required_completed: number;
  required_total: number;
  required_complete: boolean;
}

export interface ContentItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  resource_url: string;
  document_name?: string;
  cover_image: string;
  content_type: string;
  visible_roles: string[];
  tags?: string[];
  facility_ids?: string[];
  published: boolean;
  published_at: string | null;
  category?: string;
  status?: "draft" | "published" | "archived";
  archived_at?: string | null;
  updated_at?: string;
  version?: number;
}

export interface ContentRevisionSummary {
  version: number;
  title: string;
  summary: string;
  edited_by: string;
  created_at: string;
}

type ContentWriteInput = Omit<Partial<ContentItem>, "cover_image"> & {
  title: string;
  slug: string;
  cover_image?: File | null;
  document_file?: File | null;
  /** Keep a live item live while saving edits (otherwise an edit returns it to draft). */
  keep_published?: boolean;
};

export interface LibraryEntry {
  id: string;
  source_id: string;
  kind: "guide" | "module" | "document" | "external";
  title: string;
  summary: string;
  audience: string[];
  category: string;
  tags?: string[];
  status: "draft" | "published" | "archived";
  required: boolean;
  updated_at: string;
  updated_by: string;
  resource_url: string;
  cover_image: string;
  lessons: number;
  completed: boolean;
}

export interface LibraryResponse {
  data: LibraryEntry[];
  meta: {
    total: number;
    tags?: string[];
    counts: Record<
      "all" | "guide" | "module" | "document" | "external",
      number
    >;
  };
}

export interface ApprovedFeedback {
  id: string;
  placement_id: string;
  student_name: string;
  cohort_name: string;
  institution_name: string;
  facility_name: string;
  ward_name: string;
  comments: string;
  improvement_suggestion?: string;
  unresolved_concern: boolean;
  submitted_at: string;
}

export async function getTrainingModules(): Promise<TrainingModule[]> {
  const response = await request<{ data: TrainingModule[] }>(
    "/api/v1/training/modules",
  );
  return response.data;
}

export async function getAdminTrainingModules(): Promise<TrainingModule[]> {
  const response = await request<{ data: TrainingModule[] }>(
    "/api/v1/training/modules/admin",
  );
  return response.data;
}

export async function getTrainingProgress(): Promise<TrainingProgress> {
  const response = await request<{ data: TrainingProgress }>(
    "/api/v1/me/training",
  );
  return response.data;
}

export type AttemptResult = {
  id: string;
  score: number;
  passed: boolean;
  pass_mark: number;
  results?: Array<{
    question_id: string;
    correct: boolean;
    explanation: string;
    feedback: string[];
    correct_option_ids?: string[];
  }>;
};

export async function submitTrainingAttempt(
  moduleId: string,
  answers: Record<string, string | string[]>,
) {
  const response = await request<{ data: AttemptResult }>(`/api/v1/training/modules/${moduleId}/attempts`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ answers }),
  });
  return response.data;
}

export async function getAIStatus() {
  const response = await request<{ data: { lesson_explanations: boolean; assistant: boolean } }>(
    "/api/v1/ai/status",
  );
  return response.data;
}

export interface MentaTurn {
  role: "user" | "assistant";
  content: string;
}

export interface MentaAction {
  id: string;
  label: string;
  href: string;
}

export interface MentaReply {
  reply: string;
  sources: { title: string; kind: string }[];
  actions: MentaAction[];
}

export interface MentaDestination {
  id: string;
  label: string;
  href: string;
  description: string;
  asks: string[];
}

export async function getMentaNavigation(): Promise<MentaDestination[]> {
  const response = await request<{ data: MentaDestination[] }>("/api/v1/assistant/navigation");
  return response.data;
}

export async function askMenta(
  message: string,
  history: MentaTurn[],
  page: string,
): Promise<MentaReply> {
  const response = await request<{ data: MentaReply }>("/api/v1/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ message, history, page }),
  });
  return response.data;
}

export async function explainTrainingLesson(moduleId: string, lessonId: string) {
  const response = await request<{
    data: { lesson_id: string; lesson_title: string; explanation: string };
  }>(`/api/v1/training/modules/${moduleId}/explain-lesson`, {
    method: "POST",
    body: JSON.stringify({ lesson_id: lessonId }),
  });
  return response.data;
}

export async function getContentItems(): Promise<ContentItem[]> {
  const response = await request<{ data: ContentItem[] }>("/api/v1/content");
  return response.data;
}

export async function getContentItem(id: string): Promise<ContentItem> {
  const response = await request<{ data: ContentItem }>(
    `/api/v1/content/${id}`,
  );
  return response.data;
}

export async function getLibrary(
  params?: Record<string, string>,
): Promise<LibraryResponse> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return request<LibraryResponse>(`/api/v1/library${query}`);
}

export type QuizPayloadQuestion = {
  id?: string;
  lesson_id?: string;
  kind: "single" | "multi" | "true_false";
  scenario: string;
  prompt: string;
  explanation: string;
  options: Array<{ id?: string; text: string; feedback: string }>;
  correct_options: string[];
};

export async function createTrainingModule(input: {
  title: string;
  description: string;
  pass_mark: number;
  is_required: boolean;
  certificate_enabled?: boolean;
  visible_roles: string[];
  category: string;
  lessons: Array<{
    title: string;
    body: string;
    lesson_type: LessonType;
    duration_minutes: number;
    video_url?: string;
    id?: string;
    section?: string;
  }>;
  quiz: QuizPayloadQuestion[];
  cover_image?: File | null;
  keep_published?: boolean;
}) {
  const body = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (key === "cover_image" || key === "document_file") {
      if (value instanceof File) body.append(key, value);
    } else if (Array.isArray(value) || typeof value === "object") {
      body.append(key, JSON.stringify(value));
    } else if (value !== undefined && value !== null) {
      body.append(key, String(value));
    }
  });
  const response = await request<{ data: TrainingModule }>(
    "/api/v1/training/modules/admin",
    { method: "POST", body },
  );
  return response.data;
}

export async function reviseTrainingModule(
  id: string,
  input: Parameters<typeof createTrainingModule>[0],
) {
  const body = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (key === "cover_image" || key === "document_file") {
      if (value instanceof File) body.append(key, value);
    } else if (Array.isArray(value) || typeof value === "object") {
      body.append(key, JSON.stringify(value));
    } else if (value !== undefined && value !== null) {
      body.append(key, String(value));
    }
  });
  const response = await request<{ data: TrainingModule }>(
    `/api/v1/training/modules/${id}/revise`,
    { method: "POST", body },
  );
  return response.data;
}

export async function publishTrainingModule(id: string, change?: { kind: "minor" | "major"; note: string }) {
  const response = await request<{ data: TrainingModule }>(
    `/api/v1/training/modules/${id}/publish`,
    { method: "POST", body: JSON.stringify(change ? { change_kind: change.kind, change_note: change.note } : { change_kind: "major", change_note: "Republished" }) },
  );
  return response.data;
}

export async function getTrainingModule(id: string): Promise<TrainingModule> {
  const response = await request<{ data: TrainingModule }>(`/api/v1/training/modules/${id}`);
  return response.data;
}

export async function unpublishTrainingModule(id: string) {
  const response = await request<{ data: TrainingModule }>(`/api/v1/training/modules/${id}/unpublish`, { method: "POST", body: "{}" });
  return response.data;
}

export async function archiveTrainingModule(id: string, restore = false) {
  const response = await request<{ data: TrainingModule }>(`/api/v1/training/modules/${id}/archive`, { method: "POST", body: JSON.stringify({ restore }) });
  return response.data;
}

export async function duplicateTrainingModule(id: string) {
  const response = await request<{ data: TrainingModule }>(`/api/v1/training/modules/${id}/duplicate`, { method: "POST", body: "{}" });
  return response.data;
}

export async function deleteTrainingModule(id: string): Promise<void> {
  await request<void>(`/api/v1/training/modules/${id}`, { method: "DELETE" });
}

export async function completeTrainingModule(id: string) {
  const response = await request<{ data: { id: string; score: number; passed: boolean; pass_mark: number } }>(
    `/api/v1/training/modules/${id}/complete`,
    { method: "POST", body: "{}" },
  );
  return response.data;
}

export async function recordLessonVisit(moduleId: string, lessonId: string) {
  await request<unknown>(`/api/v1/training/modules/${moduleId}/lessons/${lessonId}/visit`, { method: "POST", body: "{}" });
}

export async function unpublishContentItem(id: string) {
  const response = await request<{ data: ContentItem }>(`/api/v1/content/${id}/unpublish`, { method: "POST", body: "{}" });
  return response.data;
}

export async function duplicateContentItem(id: string) {
  const response = await request<{ data: ContentItem }>(`/api/v1/content/${id}/duplicate`, { method: "POST", body: "{}" });
  return response.data;
}

export async function deleteContentItem(id: string): Promise<void> {
  await request<void>(`/api/v1/content/${id}`, { method: "DELETE" });
}

export async function getContentRevisions(id: string): Promise<ContentRevisionSummary[]> {
  const response = await request<{ data: ContentRevisionSummary[] }>(`/api/v1/content/${id}/revisions`);
  return response.data;
}

export async function createContentItem(input: ContentWriteInput) {
  const body = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (key === "cover_image") {
      if (value instanceof File) body.append(key, value);
    } else if (Array.isArray(value)) {
      body.append(key, JSON.stringify(value));
    } else if (value !== undefined && value !== null) {
      body.append(key, String(value));
    }
  });
  const response = await request<{ data: ContentItem }>("/api/v1/content", {
    method: "POST",
    body,
  });
  return response.data;
}

export async function publishContentItem(id: string) {
  const response = await request<{ data: ContentItem }>(
    `/api/v1/content/${id}/publish`,
    { method: "POST", body: "{}" },
  );
  return response.data;
}

export async function archiveContentItem(id: string, restore = false) {
  const response = await request<{ data: ContentItem }>(
    `/api/v1/content/${id}/archive`,
    {
      method: "POST",
      body: JSON.stringify({ restore }),
    },
  );
  return response.data;
}

export async function reviseContentItem(id: string, input: ContentWriteInput) {
  const body = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (key === "cover_image") {
      if (value instanceof File) body.append(key, value);
    } else if (Array.isArray(value)) {
      body.append(key, JSON.stringify(value));
    } else if (value !== undefined && value !== null) {
      body.append(key, String(value));
    }
  });
  const response = await request<{ data: ContentItem }>(
    `/api/v1/content/${id}/revise`,
    {
      method: "POST",
      body,
    },
  );
  return response.data;
}

export async function getApprovedFeedback(): Promise<ApprovedFeedback[]> {
  const response = await request<{ data: ApprovedFeedback[] }>(
    "/api/v1/feedback/approved",
  );
  return response.data;
}

export interface EscalationSummary {
  id: string;
  category: string;
  severity: "low" | "medium" | "high";
  state: string;
  placement_id: string | null;
  submitted_at: string;
  reviewer: string | null;
  routed_to: ConcernAudience;
  rereview_count: number;
  rereview_requested_at: string | null;
  updated_at: string;
  related_escalation_id: string | null;
}
export type ConcernAudience = "coordinator" | "nurse_manager" | "both";
export interface EscalationDetail extends EscalationSummary {
  /** "summary" = in scope but not the assigned reviewer: no narrative until the concern is taken. */
  access: "full" | "summary";
  can_claim: boolean;
  description?: string;
  finding?: string | null;
  action_taken?: string | null;
  resolution_outcome?: string | null;
  referral_note?: string | null;
  rereview_reason?: string | null;
  closure_date?: string | null;
  submitted_by?: string;
  reviewer_id?: string | null;
}

export async function getEscalations(): Promise<EscalationSummary[]> {
  const response = await request<{ data: EscalationSummary[] }>(
    "/api/v1/escalations",
  );
  return response.data;
}
export async function getEscalation(id: string): Promise<EscalationDetail> {
  const response = await request<{ data: EscalationDetail }>(
    `/api/v1/escalations/${id}`,
  );
  return response.data;
}
async function escalationCommand(
  id: string,
  action: string,
  body: Record<string, unknown>,
): Promise<void> {
  await request(`/api/v1/escalations/${id}/${action}`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}
export async function assignEscalationReviewer(
  id: string,
  reviewerId: string,
): Promise<void> {
  await escalationCommand(id, "assign-reviewer", { reviewer_id: reviewerId });
}
export async function recordEscalationFinding(
  id: string,
  finding: string,
): Promise<void> {
  await escalationCommand(id, "record-finding", { finding });
}
export async function recordEscalationAction(
  id: string,
  action_taken: string,
  resolution_outcome: string,
): Promise<void> {
  await escalationCommand(id, "record-action", {
    action_taken,
    resolution_outcome,
  });
}
export async function requestEscalationRereview(
  id: string,
  reason: string,
): Promise<void> {
  await escalationCommand(id, "request-rereview", { reason });
}
export async function closeEscalation(id: string): Promise<void> {
  await escalationCommand(id, "close", {
    closure_date: new Date().toISOString().slice(0, 10),
  });
}

export type FeedbackMode = "confidential" | "anonymous";

export async function submitPlacementFeedback(
  placementId: string,
  input: {
    mode: FeedbackMode;
    comments: string;
    unresolved_concern?: boolean;
    improvement?: string;
    responses?: Array<
      | { question_code: string; scale: "likert_1_5"; value_numeric: number }
      | { question_code: string; scale: "yes_no"; value_boolean: boolean }
    >;
  },
  commandId: string = crypto.randomUUID(),
): Promise<void> {
  const anonymous = input.mode === "anonymous";
  await request(anonymous ? "/api/v1/feedback/anonymous" : `/api/v1/placements/${placementId}/feedback`, {
    method: "POST",
    headers: { "Idempotency-Key": commandId },
    body: JSON.stringify(anonymous ? { ...input, placement_id: placementId } : input),
  });
}

export interface AnonymousFeedbackReportGroup {
  cohort_id: string;
  cohort_name: string;
  facility_id: string;
  facility_name: string;
  ward_id: string;
  ward_name: string;
  submissions: number;
  scores: { question_code: string; scale: string; responses: number; mean_score: number | null }[];
}

export async function getAnonymousFeedbackReport(): Promise<AnonymousFeedbackReportGroup[]> {
  const response = await request<{ data: AnonymousFeedbackReportGroup[] }>("/api/v1/reports/anonymous-feedback");
  return response.data;
}

export async function raiseSafeguardingConcern(input: {
  placement_id: string;
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  routed_to: ConcernAudience;
  related_escalation_id?: string;
}, commandId: string = crypto.randomUUID()): Promise<void> {
  await request("/api/v1/escalations", {
    method: "POST",
    headers: { "Idempotency-Key": commandId },
    body: JSON.stringify(input),
  });
}

export interface SessionInput {
  session_date: string;
  session_type: string;
  topics: string[];
  duration_minutes?: number | null;
  what_was_covered: string;
  feedback_given?: string;
  follow_up_action?: string;
}

export interface MentorshipSession extends SessionInput {
  id: string;
  batch?: string | null;
  placement_id: string;
  submitted_at: string;
  topics: string[];
}

export interface SessionBatchInput extends SessionInput {
  placement_ids: string[];
}

export interface SessionBatchResult {
  batch_id: string;
  created_count: number;
  duplicate_count: number;
  sessions: Array<{
    placement_id: string;
    student_name: string;
    duplicate: boolean;
    session: MentorshipSession;
  }>;
}

class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    status: number,
    options: { code?: string | null; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? status >= 500;
  }
}

function csrfToken(): string | null {
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("csrftoken="));
  return cookie ? decodeURIComponent(cookie.slice("csrftoken=".length)) : null;
}

async function ensureCsrfToken(): Promise<string | null> {
  const existing = csrfToken();
  if (existing) return existing;
  try {
    const response = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    if (!response.ok) throw new ApiError("We couldn’t connect securely. Please try again.", response.status);
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    throw new ApiError("We couldn’t reach MentorMAMA. Check your connection and try again.", 0, { retryable: true });
  }
  return csrfToken();
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method?.toUpperCase() ?? "GET";
  const csrf =
    method === "GET" || method === "HEAD" || method === "OPTIONS"
      ? null
      : await ensureCsrfToken();
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        ...(options?.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(csrf ? { "X-CSRFToken": csrf } : {}),
        ...(method !== "GET" && method !== "HEAD" && method !== "OPTIONS"
          ? { "Idempotency-Key": crypto.randomUUID() }
          : {}),
        ...(options?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("We couldn’t reach MentorMAMA. Check your connection and try again.", 0, { retryable: true });
  }

  if (!response.ok) {
    let message = safeStatusMessage(response.status);
    let code: string | null = null;
    let retryable = response.status >= 500;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; retryable?: boolean };
      };
      code = body.error?.code ?? null;
      // Only use an explicitly versioned API error envelope. DRF's generic
      // `detail` and validation payloads can contain internal serializer or
      // infrastructure wording, so the client uses a calm status fallback.
      if ((response.status < 500 || (code !== null && SAFE_SERVER_ERROR_CODES.has(code))) && typeof body.error?.message === "string") {
        message = body.error.message;
      }
      retryable = body.error?.retryable ?? retryable;
    } catch {
      // Keep the safe status-based message when the server did not return JSON.
    }
    throw new ApiError(message, response.status, { code, retryable });
  }

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("We couldn’t read the response. Please refresh and try again.", 502, { retryable: true });
  }
}

/** 5xx errors whose message was written for people (not internal details), so it can be shown as is. */
const SAFE_SERVER_ERROR_CODES = new Set(["StorageUnavailable"]);

function safeStatusMessage(status: number): string {
  if (status === 413) return "This is too large to save. Make images and files smaller, or upload them separately, then try again.";
  if (status >= 500) return "MentorMAMA is having a brief problem. Please try again shortly.";
  if (status === 401) return "Your sign-in has expired. Sign in again to continue.";
  if (status === 403) return "You don’t have access to do that. Contact your programme team if you need help.";
  if (status === 404) return "We couldn’t find that information. Refresh the page and try again.";
  if (status === 409) return "This information has changed. Refresh the page and try again.";
  if (status === 400 || status === 422) return "Check the information and try again.";
  if (status === 429) return "Too many attempts. Please wait a moment, then try again.";
  return "We couldn’t complete that request. Check the information and try again.";
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await request<{ data: CurrentUser }>("/api/v1/me");
  return response.data;
}

export async function getSessionState(): Promise<{
  authenticated: boolean;
  user: CurrentUser | null;
}> {
  const response = await request<{
    data: { authenticated: boolean; user: CurrentUser | null };
  }>("/api/v1/auth/session");
  return response.data;
}

export async function getPeople(params: {
  page: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
}): Promise<PeoplePage> {
  const query = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize ?? 10),
  });
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);
  if (params.status) query.set("status", params.status);
  const response = await request<{ data: PeoplePage }>(
    `/api/v1/people?${query.toString()}`,
  );
  return response.data;
}

export async function getActivity(
  page: number,
  pageSize = 15,
  filters: {
    actor_id?: string;
    student_id?: string;
    cohort_id?: string;
    placement_id?: string;
    action?: string;
    category?: string;
    date_from?: string;
    date_to?: string;
  } = {},
): Promise<ActivityPage> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const response = await request<{ data: ActivityPage }>(
    `/api/v1/activity?${query.toString()}`,
  );
  return response.data;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await request<{ data: DashboardSummary }>(
    "/api/v1/dashboard/summary",
  );
  return response.data;
}

export async function getDashboardIndicators(): Promise<DashboardIndicators> {
  const response = await request<{ data: DashboardIndicators }>(
    "/api/v1/dashboard",
  );
  return response.data;
}

export async function getReportOverview(
  from: string,
  to: string,
): Promise<ReportOverview> {
  const response = await request<{ data: ReportOverview }>(
    `/api/v1/reports/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  return response.data;
}

export async function getInterruptionReport(): Promise<
  InterruptionReportRow[]
> {
  const response = await request<{ data: InterruptionReportRow[] }>(
    "/api/v1/dashboard/interruptions",
  );
  return response.data;
}

export async function getFeedbackAggregates(): Promise<FeedbackAggregate[]> {
  const response = await request<{ data: FeedbackAggregate[] }>(
    "/api/v1/dashboard/feedback",
  );
  return response.data;
}

export async function getExports(): Promise<ExportRecord[]> {
  const response = await request<{ data: ExportRecord[] }>("/api/v1/exports");
  return response.data;
}
/** Build an ApiError from a failed file download, preferring the server's JSON message. */
async function fileErrorFrom(response: Response): Promise<ApiError> {
  let message = safeStatusMessage(response.status);
  let code: string | null = null;
  try {
    const body = (await response.json()) as { error?: { message?: string; code?: string } };
    if (response.status < 500 && typeof body.error?.message === "string") message = body.error.message;
    if (typeof body.error?.code === "string") code = body.error.code;
  } catch {
    // Keep the safe fallback when the server did not return JSON.
  }
  return new ApiError(message, response.status, { code });
}

export async function downloadExport(record: ExportRecord): Promise<Blob> {
  if (!record.download_url) {
    throw new ApiError("This export is no longer available to download.", 410);
  }
  // The API may advertise its internal absolute host (for example
  // 127.0.0.1:8000 in development). Keep the signed path/token but route the
  // request through the portal origin so the authenticated session cookie is
  // included by the browser.
  const target = new URL(record.download_url, window.location.origin);
  let response: Response;
  try {
    response = await fetch(`${target.pathname}${target.search}`, { credentials: "include" });
  } catch {
    throw new ApiError("We couldn’t reach MentorMAMA. Check your connection and try again.", 0, { retryable: true });
  }
  if (!response.ok) {
    if (response.status === 410 || response.status === 404) {
      throw new ApiError("This export has expired. Request it again.", response.status, { code: "export_expired" });
    }
    throw await fileErrorFrom(response);
  }
  return response.blob();
}
export async function requestExport(
  exportType: "placements" | "cohort" | "training",
  filters: Record<string, string> = {},
  format: ExportFormat = "csv",
): Promise<ExportRecord> {
  const response = await request<{ data: ExportRecord }>("/api/v1/exports", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ export_type: exportType, format, ...filters }),
  });
  return response.data;
}

export async function getProgrammeSettings(): Promise<ProgrammeSettings> {
  const response = await request<{ data: ProgrammeSettings }>(
    "/api/v1/programme/settings",
  );
  return response.data;
}

export async function confirmProgrammeDirectoryReview(): Promise<
  Pick<
    ProgrammeSettings,
    "directory_reviewed_at" | "directory_reviewed_by_name"
  >
> {
  const response = await request<{
    data: Pick<
      ProgrammeSettings,
      "directory_reviewed_at" | "directory_reviewed_by_name"
    >;
  }>("/api/v1/directory-review", { method: "POST", body: JSON.stringify({}) });
  return response.data;
}

export type NotificationPreferences = {
  account_activity: boolean;
  programme_updates: boolean;
  placement_updates: boolean;
  weekly_digest: boolean;
  security_alerts: boolean;
};

export type NotificationItem = {
  id: string;
  event_type: string;
  template_key: string;
  payload: Record<string, string | number | null>;
  status: "queued" | "sent" | "failed" | "not_emailed";
  read_at: string | null;
  created_at: string;
};

export type AccessPolicy = {
  role: string;
  label: string;
  mfa_required: boolean;
  scope: string;
  capabilities: string[];
};

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await request<{ data: NotificationPreferences }>(
    "/api/v1/notification-preferences",
  );
  return response.data;
}

export async function updateNotificationPreferences(
  input: Partial<Omit<NotificationPreferences, "security_alerts">>,
): Promise<NotificationPreferences> {
  const response = await request<{ data: NotificationPreferences }>(
    "/api/v1/notification-preferences",
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return response.data;
}

export async function getNotifications(
  unread = false,
): Promise<NotificationItem[]> {
  const response = await request<{ data: NotificationItem[] }>(
    `/api/v1/me/notifications${unread ? "?unread=true" : ""}`,
  );
  return response.data;
}

export async function markNotificationRead(
  id: string,
): Promise<NotificationItem> {
  const response = await request<{ data: NotificationItem }>(
    `/api/v1/me/notifications/${id}/read`,
    { method: "POST" },
  );
  return response.data;
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await request<{ data: { updated_count: number } }>(
    "/api/v1/me/notifications/read-all",
    { method: "POST" },
  );
  return response.data.updated_count;
}

export async function getAccessPolicies(): Promise<AccessPolicy[]> {
  const response = await request<{ data: AccessPolicy[] }>(
    "/api/v1/access/policies",
  );
  return response.data;
}

export async function updateProgrammeSettings(
  name: string,
  require_mentor_training_before_placement?: boolean,
  input: {
    short_name?: string;
    description?: string;
    academic_year?: string;
    owner_id?: string;
  } = {},
): Promise<ProgrammeSettings> {
  const response = await request<{ data: ProgrammeSettings }>(
    "/api/v1/programme/settings",
    {
      method: "PATCH",
      body: JSON.stringify({
        name,
        require_mentor_training_before_placement,
        ...input,
      }),
    },
  );
  return response.data;
}

export async function getInstitutions(): Promise<Institution[]> {
  const response = await request<{ data: Institution[] }>(
    "/api/v1/institutions",
  );
  return response.data;
}
export async function createInstitution(
  input: Omit<Institution, "id" | "logo_url"> & { logo?: File | null },
): Promise<Institution> {
  const body = directoryForm(input);
  const response = await request<{ data: Institution }>(
    "/api/v1/institutions",
    { method: "POST", body },
  );
  return response.data;
}
export async function updateInstitution(
  id: string,
  input: Partial<Omit<Institution, "id" | "logo_url">> & {
    archived?: boolean;
    logo?: File | null;
    clear_logo?: boolean;
  },
): Promise<Institution> {
  const body = directoryForm(input);
  const response = await request<{ data: Institution }>(
    `/api/v1/institutions/${id}`,
    { method: "PATCH", body },
  );
  return response.data;
}
export async function getFacilities(): Promise<Facility[]> {
  const response = await request<{ data: Facility[] }>("/api/v1/facilities");
  return response.data;
}
export async function createFacility(
  input: Omit<Facility, "id" | "logo_url"> & { logo?: File | null },
): Promise<Facility> {
  const body = directoryForm(input);
  const response = await request<{ data: Facility }>("/api/v1/facilities", {
    method: "POST",
    body,
  });
  return response.data;
}
export async function updateFacility(
  id: string,
  input: Partial<Omit<Facility, "id" | "logo_url">> & {
    archived?: boolean;
    logo?: File | null;
    clear_logo?: boolean;
  },
): Promise<Facility> {
  const body = directoryForm(input);
  const response = await request<{ data: Facility }>(
    `/api/v1/facilities/${id}`,
    { method: "PATCH", body },
  );
  return response.data;
}

function directoryForm(input: object): BodyInit {
  const values = input as Record<
    string,
    string | boolean | File | null | undefined
  >;
  if (values.logo instanceof File) {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (value instanceof File) form.append(key, value);
      else if (value !== undefined && value !== null)
        form.append(key, String(value));
    }
    return form;
  }
  return JSON.stringify(input);
}
export async function getWards(): Promise<Ward[]> {
  const response = await request<{ data: Ward[] }>("/api/v1/wards");
  return response.data;
}

export async function previewDirectoryImport(
  kind: DirectoryImportKind,
  file: File,
  facilityId?: string,
): Promise<DirectoryImportPreview> {
  const body = new FormData();
  body.append("file", file);
  if (facilityId) body.append("facility_id", facilityId);
  const response = await request<{ data: DirectoryImportPreview }>(
    `/api/v1/directory-imports/${kind}/preview`,
    { method: "POST", body },
  );
  return response.data;
}

export async function commitDirectoryImport(input: {
  kind: DirectoryImportKind;
  file: File;
  facilityId?: string;
  previewToken: string;
  confirmWarnings: boolean;
  idempotencyKey: string;
}): Promise<DirectoryImportResult> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("preview_token", input.previewToken);
  body.append("confirm_warnings", String(input.confirmWarnings));
  if (input.facilityId) body.append("facility_id", input.facilityId);
  const response = await request<{ data: DirectoryImportResult }>(
    `/api/v1/directory-imports/${input.kind}/commit`,
    {
      method: "POST",
      body,
      headers: { "Idempotency-Key": input.idempotencyKey },
    },
  );
  return response.data;
}
export async function createWard(input: {
  facility_id: string;
  name: string;
  shift_pattern: string;
  max_students: number;
}): Promise<Ward> {
  const response = await request<{ data: Ward }>("/api/v1/wards", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}
export async function updateWard(
  id: string,
  input: {
    name?: string;
    shift_pattern?: string;
    max_students?: number;
    archived?: boolean;
  },
): Promise<Ward> {
  const response = await request<{ data: Ward }>(`/api/v1/wards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return response.data;
}
export async function getCohorts(): Promise<Cohort[]> {
  const response = await request<{ data: Cohort[] }>("/api/v1/cohorts");
  return response.data;
}
export async function createCohort(input: {
  name: string;
  start_date: string;
  end_date: string;
  planned_capacity: number | null;
}): Promise<Cohort> {
  const response = await request<{ data: Cohort }>("/api/v1/cohorts", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function updateCohort(id: string, input: Partial<Pick<Cohort, "name" | "start_date" | "end_date" | "planned_capacity">>): Promise<Cohort> {
  const response = await request<{ data: Cohort }>(`/api/v1/cohorts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  return response.data;
}
export async function archiveCohort(id: string): Promise<Cohort> {
  const response = await request<{ data: Cohort }>(`/api/v1/cohorts/${id}`, { method: "POST", body: JSON.stringify({}) });
  return response.data;
}
export async function getCohortProgress(id: string): Promise<CohortProgress> {
  const response = await request<{ data: CohortProgress }>(`/api/v1/cohorts/${id}/progress`);
  return response.data;
}
export async function previewCohortEnrolment(id: string, student_ids: string[]) {
  const response = await request<{ data: { cohort_id: string; results: Array<{ student_id: string; name?: string; registration_number?: string; status: "ready" | "already_enrolled" | "overlap" | "unavailable" }>; counts: Record<string, number> } }>(`/api/v1/cohorts/${id}/bulk-enrolments?preview=1`, { method: "POST", body: JSON.stringify({ student_ids }) });
  return response.data;
}
export async function bulkEnrolCohort(id: string, student_ids: string[]) {
  const response = await request<{ data: { enrolled_student_ids: string[]; already_enrolled: number } }>(`/api/v1/cohorts/${id}/bulk-enrolments`, { method: "POST", body: JSON.stringify({ student_ids }) });
  return response.data;
}
export async function removeCohortMembership(id: string, student_id: string, reason: string) {
  return request<{ data: { id: string; removed_at: string } }>(`/api/v1/cohorts/${id}/memberships/remove`, { method: "POST", body: JSON.stringify({ student_id, reason }) });
}
export async function getInstitutionStudents(
  input: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
    cohort_status?: "assigned" | "unassigned";
  } = {},
): Promise<InstitutionStudentPage> {
  const params = new URLSearchParams({
    page: String(input.page ?? 1),
    page_size: String(input.page_size ?? 20),
  });
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  if (input.cohort_status) params.set("cohort_status", input.cohort_status);
  const response = await request<{
    data: InstitutionStudentPage | InstitutionStudent[];
  }>(`/api/v1/institution/students?${params.toString()}`);
  if (Array.isArray(response.data)) {
    return {
      results: response.data,
      pagination: {
        page: 1,
        page_size: response.data.length || input.page_size || 20,
        total_count: response.data.length,
        total_pages: response.data.length ? 1 : 0,
        has_next: false,
        has_previous: false,
      },
    };
  }
  return response.data;
}

export async function getFacilityMentors(
  input: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
  } = {},
): Promise<FacilityMentorPage> {
  const params = new URLSearchParams({
    page: String(input.page ?? 1),
    page_size: String(input.page_size ?? 20),
  });
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  const response = await request<{ data: FacilityMentorPage }>(
    `/api/v1/facility/mentors?${params.toString()}`,
  );
  return response.data;
}

export async function updateFacilityMentor(
  mentorId: string,
  input: {
    accepting_students?: boolean;
    max_active_placements?: number;
    reason: string;
  },
): Promise<{
  id: string;
  accepting_students: boolean;
  max_active_placements: number;
}> {
  const response = await request<{
    data: {
      id: string;
      accepting_students: boolean;
      max_active_placements: number;
    };
  }>(`/api/v1/facility/mentors/${mentorId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return response.data;
}

export interface MentorAvailabilityEvent {
  id: string;
  actor: string;
  actor_role: string;
  occurred_at: string;
  changes: Record<string, unknown>;
  reason: string | null;
}

export async function getMentorAvailabilityHistory(
  mentorId: string,
): Promise<MentorAvailabilityEvent[]> {
  const response = await request<{ data: MentorAvailabilityEvent[] }>(
    `/api/v1/facility/mentors/${mentorId}/activity`,
  );
  return response.data;
}
export async function enrolStudent(
  cohortId: string,
  studentId: string,
): Promise<void> {
  await request<void>(`/api/v1/cohorts/${cohortId}/enrolments`, {
    method: "POST",
    body: JSON.stringify({ student_id: studentId }),
  });
}

export async function updateProfile(input: {
  first_name: string;
  last_name: string;
  phone: string;
}): Promise<CurrentUser> {
  const response = await request<{ data: CurrentUser }>("/api/v1/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function getStudentProfile(): Promise<StudentProfile> {
  const response = await request<{ data: StudentProfile }>(
    "/api/v1/student/profile",
  );
  return response.data;
}

export async function updateStudentProfile(
  input: Partial<StudentProfile>,
): Promise<StudentProfile> {
  const response = await request<{ data: StudentProfile }>(
    "/api/v1/student/profile",
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function getMentorProfile(): Promise<MentorProfile> {
  const response = await request<{ data: MentorProfile }>("/api/v1/mentor/profile");
  return response.data;
}

export async function updateMentorProfile(input: Partial<MentorProfile>): Promise<MentorProfile> {
  const response = await request<{ data: MentorProfile }>("/api/v1/mentor/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function submitMfaRecoveryRequest(reason: string): Promise<void> {
  await request<void>("/api/v1/auth/mfa/recovery-requests", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export interface MFARecoveryRequest {
  id: string; user_id: string; name: string; email: string; role: string;
  reason: string; created_at: string;
}
export async function getMFARecoveryRequests(): Promise<MFARecoveryRequest[]> {
  const response = await request<{ data: MFARecoveryRequest[] }>("/api/v1/auth/mfa/recovery-requests");
  return response.data;
}
export async function resolveMFARecoveryRequest(
  requestId: string, decision: "recover" | "close", reason: string,
): Promise<void> {
  await request(`/api/v1/auth/mfa/recovery-requests/${requestId}/resolve`, {
    method: "POST", body: JSON.stringify({ decision, reason }),
  });
}
export async function revokeAccountSessions(userId: string, reason: string): Promise<number> {
  const response = await request<{ data: { revoked_count: number } }>(
    `/api/v1/auth/users/${userId}/sessions/revoke`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
  return response.data.revoked_count;
}
export interface PersonActivityEntry {
  id: string; action: string; actor_name: string; actor_role: string; occurred_at: string;
}
export async function getPersonActivity(userId: string): Promise<PersonActivityEntry[]> {
  const response = await request<{ data: PersonActivityEntry[] }>(`/api/v1/people/${userId}/activity`);
  return response.data;
}

export async function inviteTeamMember(input: {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone?: string;
  registration_number?: string;
  institution_id?: string;
  facility_id?: string;
}): Promise<{ id: string; email: string; status: string }> {
  const response = await request<{
    data: { id: string; email: string; status: string };
  }>("/api/v1/auth/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function bulkInviteStudents(
  rows: StudentInvitationRow[],
  dryRun: boolean,
): Promise<BulkInvitationResult> {
  const response = await request<{ data: BulkInvitationResult }>(
    "/api/v1/auth/invitations/students/bulk",
    {
      method: "POST",
      body: JSON.stringify({ rows, dry_run: dryRun }),
    },
  );
  return response.data;
}

export async function bulkInviteMentors(
  rows: StudentInvitationRow[],
  dryRun: boolean,
): Promise<BulkInvitationResult> {
  const response = await request<{ data: BulkInvitationResult }>(
    "/api/v1/auth/invitations/mentors/bulk",
    {
      method: "POST",
      body: JSON.stringify({ rows, dry_run: dryRun }),
    },
  );
  return response.data;
}

export async function resendInvitation(userId: string): Promise<void> {
  await request<void>(`/api/v1/auth/invitations/${userId}/resend`, {
    method: "POST",
    body: "{}",
  });
}

export async function updateAccountStatus(
  userId: string,
  status: "active" | "suspended" | "deactivated",
  reason: string,
): Promise<void> {
  await request<void>(`/api/v1/auth/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
}

export async function updateAccountAccess(
  userId: string,
  input: {
    role: string;
    institution_id?: string | null;
    facility_id?: string | null;
    reason: string;
  },
): Promise<void> {
  await request<void>(`/api/v1/auth/users/${userId}/access`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function login(
  email: string,
  password: string,
  /** Which sign-in page is being used. Platform administrators can only sign in at /platform. */
  portal: "workspace" | "platform" = "workspace",
): Promise<LoginResult> {
  const response = await request<{
    data?: {
      mfa_required?: boolean;
      mfa_setup_required?: boolean;
      email_mfa_available?: boolean;
      recovery_contact?: "programme_admin" | "another_program_admin" | "support";
    } & CurrentUser;
  }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, portal }),
  });
  if (response.data?.mfa_required) {
    return {
      authenticated: false,
      mfaRequired: true,
      mfaSetupRequired: Boolean(response.data.mfa_setup_required),
      emailMfaAvailable: Boolean(response.data.email_mfa_available),
      recoveryContact: response.data.recovery_contact,
    };
  }
  return {
    authenticated: true,
    mfaRequired: false,
    mfaSetupRequired: false,
    emailMfaAvailable: false,
    user: response.data as CurrentUser,
  };
}

export async function activateAccount(
  uid: string,
  token: string,
  password: string,
): Promise<ActivationResult> {
  const response = await request<{
    data?: {
      email_verification_required?: boolean;
      mfa_required?: boolean;
      mfa_setup_required?: boolean;
    } & CurrentUser;
  }>("/api/v1/auth/activate", {
    method: "POST",
    body: JSON.stringify({ uid, token, password }),
  });
  return {
    emailVerificationRequired: Boolean(response.data?.email_verification_required),
    mfaRequired: Boolean(response.data?.mfa_required),
    mfaSetupRequired: Boolean(response.data?.mfa_setup_required),
    user: response.data?.id ? response.data : undefined,
  };
}

export async function verifyEmailCode(
  code: string,
): Promise<{ mfaRequired: boolean; mfaSetupRequired: boolean }> {
  const response = await request<{
    data: {
      verified: boolean;
      mfa_required?: boolean;
      mfa_setup_required?: boolean;
    };
  }>("/api/v1/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return {
    mfaRequired: Boolean(response.data.mfa_required),
    mfaSetupRequired: Boolean(response.data.mfa_setup_required),
  };
}

export async function resendEmailVerification(): Promise<void> {
  await request<void>("/api/v1/auth/email/resend", {
    method: "POST",
    body: "{}",
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await request<void>("/api/v1/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(
  uid: string,
  token: string,
  password: string,
): Promise<void> {
  await request<void>("/api/v1/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ uid, token, password }),
  });
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<CurrentUser | null> {
  const response = await request<{ data?: { user?: CurrentUser } } | undefined>("/api/v1/auth/password-change", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  return response?.data?.user ?? null;
}

/**
 * Start (or resume) authenticator setup. The server keeps one pending secret per person, so calling this twice
 * returns the same secret and the QR code on screen always matches what the server checks. Pass `regenerate`
 * only when the person explicitly asks for a fresh code.
 */
export async function beginMfaSetup(regenerate = false): Promise<{
  secret: string;
  otpauth_uri: string;
}> {
  const response = await request<{
    data: { secret: string; otpauth_uri: string };
  }>("/api/v1/auth/mfa/setup", { method: "POST", body: JSON.stringify(regenerate ? { regenerate: true } : {}) });
  return response.data;
}

export async function enableEmailMfa(): Promise<void> {
  await request<void>("/api/v1/auth/mfa/email/setup", {
    method: "POST",
    body: "{}",
  });
}

export async function disableEmailMfa(): Promise<void> {
  await request<void>("/api/v1/auth/mfa/email/setup", { method: "DELETE" });
}

export async function requestEmailMfaChallenge(): Promise<void> {
  await request<void>("/api/v1/auth/mfa/email/challenge", {
    method: "POST",
    body: "{}",
  });
}

export async function verifyEmailMfa(code: string): Promise<CurrentUser> {
  const response = await request<{ data: CurrentUser }>(
    "/api/v1/auth/mfa/email/verify",
    { method: "POST", body: JSON.stringify({ code }) },
  );
  return response.data;
}

export async function verifyMfaSetup(code: string): Promise<string[]> {
  const response = await request<{ data: { recovery_codes: string[] } }>(
    "/api/v1/auth/mfa/setup/verify",
    { method: "POST", body: JSON.stringify({ code }) },
  );
  return response.data.recovery_codes;
}

export async function getMfaDevices(): Promise<
  Array<{
    id: string;
    type: string;
    created_at: string;
    last_used_at: string | null;
  }>
> {
  const response = await request<{
    data: Array<{
      id: string;
      type: string;
      created_at: string;
      last_used_at: string | null;
    }>;
  }>("/api/v1/auth/mfa/devices");
  return response.data;
}

export async function verifyMfa(code: string): Promise<CurrentUser> {
  const response = await request<{ data: CurrentUser }>(
    "/api/v1/auth/mfa/verify",
    { method: "POST", body: JSON.stringify({ code }) },
  );
  return response.data;
}

export async function logout(): Promise<void> {
  await request<void>("/api/v1/auth/logout", { method: "POST", body: "{}" });
}

export async function getSessions(): Promise<UserSession[]> {
  const response = await request<{ data: UserSession[] }>(
    "/api/v1/auth/sessions",
  );
  return response.data;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await request<void>(`/api/v1/auth/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function revokeOtherSessions(): Promise<number> {
  const response = await request<{ data: { revoked: number } }>(
    "/api/v1/auth/sessions/revoke-others",
    { method: "POST", body: "{}" },
  );
  return response.data.revoked;
}

export async function getPlacements(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  state?: string;
  cohort?: string;
  institution?: string;
  facility?: string;
  ward?: string;
  mentor?: string;
}): Promise<PlacementPage> {
  const query = new URLSearchParams({
    page: String(params?.page ?? 1),
    page_size: String(params?.pageSize ?? 12),
  });
  if (params?.search) query.set("search", params.search);
  if (params?.state) query.set("state", params.state);
  if (params?.cohort) query.set("cohort", params.cohort);
  if (params?.institution) query.set("institution", params.institution);
  if (params?.facility) query.set("facility", params.facility);
  if (params?.ward) query.set("ward", params.ward);
  if (params?.mentor) query.set("mentor", params.mentor);
  const response = await request<{ data: PlacementPage }>(
    `/api/v1/placements?${query.toString()}`,
  );
  return response.data;
}

/** Load the complete server-scoped roster for mentor batch actions. */
export async function getAllPlacements(pageSize = 50): Promise<Placement[]> {
  const first = await getPlacements({ page: 1, pageSize });
  const remaining = await Promise.all(
    Array.from({ length: Math.max(0, first.pagination.total_pages - 1) }, (_, index) =>
      getPlacements({ page: index + 2, pageSize }),
    ),
  );
  return [first, ...remaining].flatMap((page) => page.results);
}

export async function getPlacement(placementId: string): Promise<Placement> {
  const response = await request<{ data: Placement }>(
    `/api/v1/placements/${placementId}`,
  );
  return response.data;
}

export async function getPlacementOptions(): Promise<PlacementOptions> {
  const response = await request<{ data: PlacementOptions }>(
    "/api/v1/placements/options",
  );
  return response.data;
}

export type PlacementEligibleStudent = {
  id: string;
  name: string;
  email: string;
  registration_number?: string | null;
};

export type PlacementEligibility = {
  eligible: PlacementEligibleStudent[];
  excluded: Array<
    PlacementEligibleStudent & {
      reason: string;
      placement_id?: string;
      dates?: string;
    }
  >;
  pagination: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
};

export async function getPlacementEligibleStudents(
  cohortId: string,
  dates?: {
    plannedStart?: string;
    plannedEnd?: string;
    page?: number;
    search?: string;
  },
): Promise<PlacementEligibility> {
  const query = new URLSearchParams();
  if (dates?.plannedStart) query.set("planned_start", dates.plannedStart);
  if (dates?.plannedEnd) query.set("planned_end", dates.plannedEnd);
  if (dates?.page) query.set("page", String(dates.page));
  if (dates?.search) query.set("search", dates.search);
  const response = await request<{ data: PlacementEligibility }>(
    `/api/v1/placements/cohorts/${cohortId}/eligible-students${query.size ? `?${query}` : ""}`,
  );
  return response.data;
}

export type PlacementBatchResult = {
  batch_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  created: Placement[];
  skipped: Array<{ student_id: string; reason: string }>;
  error_message?: string;
  replayed?: boolean;
  cohort_id?: string;
  planned_start?: string;
  planned_end?: string;
  all_eligible?: boolean;
  created_at?: string;
};

export async function createPlacementsBulk(input: {
  cohort_id: string;
  student_ids: string[];
  planned_start: string;
  planned_end: string;
  all_eligible?: boolean;
}): Promise<PlacementBatchResult> {
  const response = await request<{ data: PlacementBatchResult }>(
    "/api/v1/placements/bulk",
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function getPlacementBatch(
  batchId: string,
): Promise<PlacementBatchResult> {
  const response = await request<{ data: PlacementBatchResult }>(
    `/api/v1/placements/batches/${batchId}`,
  );
  return response.data;
}

export async function getPlacementBatches(): Promise<PlacementBatchResult[]> {
  const response = await request<{ data: PlacementBatchResult[] }>(
    "/api/v1/placements/batches",
  );
  return response.data;
}

export async function getCohortStudents(
  cohortId: string,
): Promise<Array<{ id: string; name: string; email: string }>> {
  const response = await request<{
    data: Array<{ id: string; name: string; email: string }>;
  }>(`/api/v1/cohorts/${cohortId}/students`);
  return response.data;
}

export async function createPlacement(input: {
  cohort_id: string;
  student_id: string;
  planned_start: string;
  planned_end: string;
}): Promise<Placement> {
  const response = await request<{ data: Placement }>("/api/v1/placements", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
  return response.data;
}

export type ArrangeRow = {
  placement_id: string;
  student: string;
  cohort?: string;
  window?: [string, string];
  ward: { id: string; name: string } | null;
  mentor: { id: string; name: string; trained: boolean } | null;
  issues: string[];
  reason?: string;
};
export type ArrangePlan = {
  seed: string;
  plan_hash: string;
  strategy: "balanced" | "fill";
  assignments: ArrangeRow[];
  unplaced: ArrangeRow[];
  summary: {
    incoming: number;
    arranged: number;
    unplaced: number;
    with_mentor: number;
    wards: Array<{ id: string; name: string; capacity: number; added: number }>;
    mentors: Array<{ id: string; name: string; assigned: number; remaining: number }>;
  };
};
export type ArrangeResult = {
  run_id?: string;
  seed: string;
  arranged: ArrangeRow[];
  unplaced: ArrangeRow[];
  summary: { arranged: number; unplaced: number; mentors_notified: number };
};
export type ArrangeInput = {
  strategy: "balanced" | "fill";
  assign_mentors: boolean;
  seed?: string;
  placement_ids?: string[];
  expected_plan_hash?: string;
};

/** Draft placements that coordinators have requested of this facility. */
export interface OrphanedPlacement {
  placement_id: string;
  state: PlacementState;
  urgent: boolean;
  student_first_name: string;
  mentor_name: string;
  mentor_status: string;
  planned_start: string;
  planned_end: string;
}

/** Open placements whose mentor was suspended or deactivated (need a new mentor). */
export async function getOrphanedPlacements(): Promise<OrphanedPlacement[]> {
  const response = await request<{ data: OrphanedPlacement[] }>("/api/v1/placements/orphaned");
  return response.data;
}

export async function getIncomingPlacements(): Promise<Placement[]> {
  const response = await request<{ data: Placement[] }>("/api/v1/placements/incoming");
  return response.data;
}

export async function previewAutoArrange(input: ArrangeInput): Promise<ArrangePlan> {
  const response = await request<{ data: ArrangePlan }>("/api/v1/placements/auto-arrange", {
    method: "POST",
    body: JSON.stringify({ ...input, preview: true }),
  });
  return response.data;
}

export async function applyAutoArrange(input: ArrangeInput): Promise<ArrangeResult> {
  const response = await request<{ data: ArrangeResult }>("/api/v1/placements/auto-arrange", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ ...input, preview: false }),
  });
  return response.data;
}

export type FacilityRequestInput = {
  placement_ids: string[];
  facility_ids: string[];
  mode: "capacity" | "even";
  seed?: string;
};
export type FacilityRequestPlan = {
  seed: string;
  mode: string;
  facilities: Array<{ facility_id: string; free_capacity: number; requested: number }>;
  assignments: Array<{ placement_id: string; student: string; facility_id: string }>;
  unplaced: Array<{ placement_id: string; student: string; reason: string }>;
};

export async function previewFacilityRequest(input: FacilityRequestInput): Promise<FacilityRequestPlan> {
  const response = await request<{ data: FacilityRequestPlan }>("/api/v1/placements/facility-requests", {
    method: "POST",
    body: JSON.stringify({ ...input, preview: true }),
  });
  return response.data;
}

export async function applyFacilityRequest(
  input: FacilityRequestInput,
): Promise<{ requested: number; by_facility: Record<string, number>; unplaced: unknown[] }> {
  const response = await request<{ data: { requested: number; by_facility: Record<string, number>; unplaced: unknown[] } }>(
    "/api/v1/placements/facility-requests",
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ ...input, preview: false }),
    },
  );
  return response.data;
}

export async function allocateWard(
  placementId: string,
  wardId: string,
): Promise<Placement> {
  const response = await request<{ data: Placement }>(
    `/api/v1/placements/${placementId}/allocate-ward`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ ward_id: wardId }),
    },
  );
  return response.data;
}

export async function assignMentor(
  placementId: string,
  mentorId: string,
  reason = "",
): Promise<Placement> {
  const response = await request<{ data: Placement }>(
    `/api/v1/placements/${placementId}/assign-mentor`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ mentor_id: mentorId, reason }),
    },
  );
  return response.data;
}

export async function reassignMentor(
  placementId: string,
  mentorId: string,
  reason: string,
): Promise<Placement> {
  const response = await request<{ data: Placement }>(
    `/api/v1/placements/${placementId}/reassign-mentor`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ mentor_id: mentorId, reason }),
    },
  );
  return response.data;
}

export async function releasePlacement(
  placementId: string,
): Promise<Placement> {
  const response = await request<{ data: Placement }>(
    `/api/v1/placements/${placementId}/invite`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: "{}",
    },
  );
  return response.data;
}

export async function sendPlacementAcknowledgementReminder(
  placementId: string,
): Promise<Placement> {
  const response = await request<{ data: Placement }>(
    `/api/v1/placements/${placementId}/acknowledgement-reminder`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: "{}",
    },
  );
  return response.data;
}

export async function updatePlacementLifecycle(
  placementId: string,
  action: "pause" | "resume" | "complete" | "withdraw" | "archive",
  reason = "",
  note = "",
): Promise<Placement> {
  const payload =
    action === "pause"
      ? { reason, ...(note ? { note } : {}) }
      : action === "withdraw"
        ? { reason }
        : {};
  const response = await request<{ data: Placement }>(
    `/api/v1/placements/${placementId}/${action}`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function confirmPlacement(
  placementId: string,
  signedName: string,
): Promise<Placement> {
  const response = await request<{ data: Placement }>(
    `/api/v1/placements/${placementId}/confirm`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ signed_name: signedName }),
    },
  );
  return response.data;
}

export async function getPlacementAcknowledgement(
  placementId: string,
): Promise<PlacementAcknowledgement | null> {
  const response = await request<{ data: PlacementAcknowledgement | null }>(
    `/api/v1/placements/${placementId}/acknowledgement`,
  );
  return response.data;
}

export async function getFinalAssessmentStatus(
  placementId: string,
): Promise<FinalAssessmentStatus> {
  const response = await request<{ data: FinalAssessmentStatus }>(
    `/api/v1/placements/${placementId}/assessments/final`,
  );
  return response.data;
}

export async function getPlacementProgress(
  placementId: string,
): Promise<PlacementProgress> {
  const response = await request<{ data: PlacementProgress }>(
    `/api/v1/placements/${placementId}/progress`,
  );
  return response.data;
}

export async function submitFinalAssessment(
  placementId: string,
  input: { confidence_score: number; overall_experience: number },
  commandId: string = crypto.randomUUID(),
): Promise<{ id: string; submitted: boolean }> {
  const response = await request<{ data: { id: string; submitted: boolean } }>(
    `/api/v1/placements/${placementId}/assessments/final`,
    {
      method: "POST",
      headers: { "Idempotency-Key": commandId },
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export interface InductionChecklist {
  id: string;
  placement_id: string;
  template_id: string;
  completed_at: string | null;
  opened_at: string;
  template_version: number;
  signed_by: string | null;
  items: Array<{
    id: string;
    label: string;
    required: boolean;
    response: string | null;
    comment: string | null;
    answered_at: string | null;
  }>;
}

export interface InductionBatch {
  id: string;
  template_version: number;
  items: Array<{ id: string; label: string; required: boolean }>;
  students: Array<{ placement_id: string; checklist: InductionChecklist }>;
}

export interface InductionReadiness {
  placement_id: string;
  state: PlacementState;
  orientation_acknowledged: boolean;
  template_id: string | null;
  template_version: number | null;
  checklist: InductionChecklist | null;
}

export async function getInductionReadiness(placementIds: string[]): Promise<InductionReadiness[]> {
  const response = await request<{ data: InductionReadiness[] }>(
    `/api/v1/induction/readiness?placement_ids=${encodeURIComponent(placementIds.join(","))}`,
  );
  return response.data;
}

export async function remindOrientationBatch(placementIds: string[], commandId: string): Promise<number> {
  const response = await request<{ data: { requested_count: number } }>(
    "/api/v1/induction/orientation-reminders",
    { method: "POST", headers: { "Idempotency-Key": commandId }, body: JSON.stringify({ placement_ids: placementIds }) },
  );
  return response.data.requested_count;
}

export async function openInductionBatch(
  placementIds: string[],
  commandId: string = crypto.randomUUID(),
): Promise<InductionBatch> {
  const response = await request<{ data: InductionBatch }>("/api/v1/induction/batches", {
    method: "POST",
    headers: { "Idempotency-Key": commandId },
    body: JSON.stringify({ placement_ids: placementIds }),
  });
  return response.data;
}

export async function answerInductionBatchItem(
  batchId: string,
  itemId: string,
  responseValue: "yes" | "no" | "not_applicable",
  comment: string,
  commandId: string = crypto.randomUUID(),
): Promise<InductionBatch> {
  const response = await request<{ data: InductionBatch }>(
    `/api/v1/induction/batches/${batchId}/items/${itemId}`,
    {
      method: "POST",
      headers: { "Idempotency-Key": commandId },
      body: JSON.stringify({ response: responseValue, comment }),
    },
  );
  return response.data;
}

export async function signInductionBatch(
  batchId: string,
  commandId: string = crypto.randomUUID(),
): Promise<InductionBatch> {
  const response = await request<{ data: InductionBatch }>(
    `/api/v1/induction/batches/${batchId}/sign`,
    {
      method: "POST",
      headers: { "Idempotency-Key": commandId },
      body: JSON.stringify({}),
    },
  );
  return response.data;
}

export async function acknowledgeOrientation(
  placementId: string,
  input: {
    understands_placement_details: boolean;
    understands_emergency_process: boolean;
    understands_safeguarding: boolean;
    questions?: string;
  },
): Promise<void> {
  await request(`/api/v1/placements/${placementId}/orientation`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
}

export async function getOrientationAcknowledgement(placementId: string): Promise<{
  acknowledged: boolean;
  acknowledged_at: string | null;
}> {
  const response = await request<{
    data: { acknowledged: boolean; acknowledged_at: string | null };
  }>(`/api/v1/placements/${placementId}/orientation`);
  return response.data;
}

export async function getInductionChecklist(
  placementId: string,
): Promise<InductionChecklist | null> {
  const response = await request<{ data: InductionChecklist | null }>(
    `/api/v1/placements/${placementId}/induction/checklist`,
  );
  return response.data;
}

export async function openInduction(
  placementId: string,
): Promise<InductionChecklist> {
  const response = await request<{ data: InductionChecklist }>(
    `/api/v1/placements/${placementId}/induction`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: "{}",
    },
  );
  return response.data;
}

export async function answerInductionItem(
  placementId: string,
  itemId: string,
  response: "yes" | "no" | "not_applicable",
  comment?: string,
): Promise<void> {
  await request(`/api/v1/placements/${placementId}/induction/items/${itemId}`, {
    method: "POST",
    body: JSON.stringify({ response, comment }),
  });
}

export async function signInduction(
  placementId: string,
): Promise<InductionChecklist> {
  const response = await request<{ data: InductionChecklist }>(
    `/api/v1/placements/${placementId}/induction/sign`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: "{}",
    },
  );
  return response.data;
}

export async function getTransitions(
  placementId: string,
): Promise<TransitionResponse> {
  const response = await request<{ data: TransitionResponse }>(
    `/api/v1/placements/${placementId}/transitions`,
  );
  return response.data;
}

export interface PlacementActivityEntry {
  id: string;
  action: string;
  actor: string;
  actor_role: string;
  occurred_at: string;
  changes: Record<string, unknown>;
  override_reason: string | null;
  summary?: string;
  details?: Array<{ label: string; value: string }>;
}

export async function getPlacementActivity(
  placementId: string,
): Promise<PlacementActivityEntry[]> {
  const response = await request<{ data: PlacementActivityEntry[] }>(
    `/api/v1/placements/${placementId}/activity`,
  );
  return response.data;
}

export interface PlacementNote {
  id: string;
  body: string;
  author: string;
  created_at: string;
}

export async function getPlacementNotes(
  placementId: string,
): Promise<PlacementNote[]> {
  const response = await request<{ data: PlacementNote[] }>(
    `/api/v1/placements/${placementId}/notes`,
  );
  return response.data;
}

export async function addPlacementNote(
  placementId: string,
  body: string,
): Promise<PlacementNote> {
  const response = await request<{ data: PlacementNote }>(
    `/api/v1/placements/${placementId}/notes`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ body }),
    },
  );
  return response.data;
}

export async function logSession(
  placementId: string,
  input: SessionInput,
  commandId: string = crypto.randomUUID(),
): Promise<void> {
  await request(`/api/v1/placements/${placementId}/sessions`, {
    method: "POST",
    headers: {
      "Idempotency-Key": commandId,
    },
    body: JSON.stringify(input),
  });
}

export async function logSessionBatch(
  input: SessionBatchInput,
  commandId: string = crypto.randomUUID(),
): Promise<SessionBatchResult> {
  const response = await request<{ data: SessionBatchResult }>(
    "/api/v1/sessions/batch",
    {
      method: "POST",
      headers: { "Idempotency-Key": commandId },
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function getMentorshipSessions(
  placementId: string,
): Promise<MentorshipSession[]> {
  const response = await request<{ data: MentorshipSession[] }>(
    `/api/v1/placements/${placementId}/sessions`,
  );
  return response.data;
}

export type CommandStatus = "committed" | "in_progress" | "missing";

export async function getCommandStatus(
  commandId: string,
): Promise<CommandStatus> {
  try {
    const response = await request<{
      data: { status: "committed" | "in_progress" };
    }>(`/api/v1/commands/${commandId}`);
    return response.data.status;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) return "missing";
    throw cause;
  }
}

export function isRetryableRequestFailure(cause: unknown): boolean {
  if (cause instanceof ApiError) return cause.retryable;
  return cause instanceof TypeError;
}

export { ApiError };

export async function getBaselineAssessmentStatus(placementId: string): Promise<{ submitted: boolean; can_submit: boolean }> {
  const response = await request<{ data: { submitted: boolean; can_submit: boolean } }>(
    `/api/v1/placements/${placementId}/assessments/baseline`,
  );
  return response.data;
}

export async function submitBaselineAssessment(
  placementId: string,
  confidenceScore: number,
  commandId: string = crypto.randomUUID(),
): Promise<void> {
  await request(`/api/v1/placements/${placementId}/assessments/baseline`, {
    method: "POST",
    headers: { "Idempotency-Key": commandId },
    body: JSON.stringify({ confidence_score: confidenceScore }),
  });
}

export interface ReportInsights {
  filters: { from: string; to: string; cohort_id: string | null; facility_id: string | null };
  scope: { role: string; breakdown_kind: "facility" | "cohort" };
  options: { cohorts: Array<{ id: string; name: string }>; facilities: Array<{ id: string; name: string }> };
  kpis: {
    students: number;
    active_students: number;
    placements: number;
    mentors: number;
    induction: { numerator: number; denominator: number; rate: number | null };
    training: { numerator: number; denominator: number; rate: number | null };
    sessions: number;
    sessions_previous: number;
    sessions_per_student_week: number | null;
    students_with_sessions: number;
    open_concerns: number;
    overdue_concerns: number;
    feedback_score: number | null;
    confidence_change: number | null;
    in_progress: number;
  };
  funnel: Array<{ state: string; label: string; count: number }>;
  sessions_weekly: Array<{ week: string; sessions: number }>;
  session_types: Array<{ type: string; count: number }>;
  topics: Array<{ topic: string; count: number }>;
  training: { mentors: number; required_modules: number; modules: Array<{ title: string; required: boolean; completed: number; total: number }> };
  feedback: {
    submissions: number;
    overall_mean: number | null;
    questions: Array<{ code: string; label: string; responses: number; mean: number | null }>;
    follow_ups_flagged: number;
    min_group: number;
  };
  confidence: { pairs: number; min_group: number; baseline_mean: number | null; endline_mean: number | null; change: number | null };
  safeguarding: {
    open: number;
    overdue: number;
    raised_in_period: number;
    resolved_in_period: number;
    overdue_after_days: number;
    by_category: Array<{ category: string; count: number }>;
    by_state: Array<{ state: string; count: number }>;
    by_severity: Array<{ severity: string; count: number }>;
  };
  breakdown: Array<{
    id: string;
    name: string;
    placements: number;
    active_students: number;
    induction_rate: number | null;
    sessions: number;
    sessions_per_student_week: number | null;
    open_concerns: number;
  }>;
}

export async function getReportInsights(params: { from: string; to: string; cohort_id?: string; facility_id?: string }): Promise<ReportInsights> {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  if (params.cohort_id) query.set("cohort_id", params.cohort_id);
  if (params.facility_id) query.set("facility_id", params.facility_id);
  const response = await request<{ data: ReportInsights }>(`/api/v1/reports/insights?${query.toString()}`);
  return response.data;
}

/** Download the allocation list (where each student is placed) as CSV, XLSX or PDF. */
export async function downloadAllocationList(file: "csv" | "xlsx" | "pdf", cohortId?: string, signal?: AbortSignal): Promise<Blob> {
  const query = new URLSearchParams({ file });
  if (cohortId) query.set("cohort_id", cohortId);
  let response: Response;
  try {
    response = await fetch(`/api/v1/placements/allocation-list?${query.toString()}`, { credentials: "include", signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("We couldn’t reach MentorMAMA. Check your connection and try again.", 0, { retryable: true });
  }
  if (!response.ok) throw await fileErrorFrom(response);
  return response.blob();
}

/** Coordinator override: change a placement's ward and/or mentor. The facility is told and sees the reason. */
export async function overrideArrangement(
  placementId: string,
  input: { ward_id?: string; mentor_id?: string; reason: string },
): Promise<Placement> {
  const response = await request<{ data: Placement }>(`/api/v1/placements/${placementId}/override`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
  return response.data;
}

export interface ConsentWording {
  id: string;
  version: number;
  title: string;
  body: string;
  accepted: boolean;
}
export async function acceptConsent(versionId: string): Promise<void> {
  await request("/api/v1/consent/accept", { method: "POST", body: JSON.stringify({ version_id: versionId }) });
}
export async function getConsent(): Promise<ConsentWording | null> {
  const response = await request<{ data: ConsentWording | null }>("/api/v1/consent/current");
  return response.data;
}
export interface ConsentVersionRow {
  id: string;
  version: number;
  title: string;
  body: string;
  published_at: string | null;
  accepted_count: number;
}
export async function getConsentVersions(): Promise<{ versions: ConsentVersionRow[]; starter: { title: string; body: string } }> {
  const response = await request<{ data: ConsentVersionRow[]; meta: { starter: { title: string; body: string } } }>("/api/v1/consent/versions");
  return { versions: response.data, starter: response.meta.starter };
}
export async function createConsentDraft(input: { title: string; body: string }): Promise<void> {
  await request("/api/v1/consent/versions", { method: "POST", body: JSON.stringify(input) });
}
export async function publishConsent(versionId: string): Promise<void> {
  await request(`/api/v1/consent/versions/${versionId}/publish`, { method: "POST", body: JSON.stringify({}) });
}

export interface AllocationRunSummary {
  id: string;
  created_at: string;
  by: string;
  strategy: string;
  status: "running" | "completed" | "partial" | "failed" | "undone";
  arranged: number;
  unplaced: number;
  can_undo: boolean;
  can_retry: boolean;
}
export async function getAllocationRuns(): Promise<AllocationRunSummary[]> {
  const response = await request<{ data: AllocationRunSummary[] }>("/api/v1/placements/allocation-runs");
  return response.data;
}
export async function undoAllocationRun(id: string): Promise<{ reverted: number; kept: Array<{ student: string; reason: string }> }> {
  const response = await request<{ data: { reverted: number; kept: Array<{ student: string; reason: string }> } }>(`/api/v1/placements/allocation-runs/${id}/undo`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({}),
  });
  return response.data;
}
export async function retryAllocationRun(id: string): Promise<ArrangeResult> {
  const response = await request<{ data: ArrangeResult }>(`/api/v1/placements/allocation-runs/${id}/retry`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({}),
  });
  return response.data;
}

/** Email arranged students where they are placed, ahead of release. Repeating only re-sends what changed. */
export async function shareAllocationWithStudents(cohortId?: string): Promise<{ sent: number; updated: number; unchanged: number; not_arranged: number }> {
  const response = await request<{ data: { sent: number; updated: number; unchanged: number; not_arranged: number } }>("/api/v1/placements/share-with-students", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(cohortId ? { cohort_id: cohortId } : {}),
  });
  return response.data;
}

/** A facility declines requested students, with a reason the coordinator sees. */
export async function declineFacilityRequests(placementIds: string[], reason: string): Promise<{ declined: number }> {
  const response = await request<{ data: { declined: number } }>("/api/v1/placements/decline-requests", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ placement_ids: placementIds, reason }),
  });
  return response.data;
}
/** The coordinator takes a request back before the facility has placed the student. */
export async function withdrawFacilityRequests(placementIds: string[]): Promise<{ withdrawn: number }> {
  const response = await request<{ data: { withdrawn: number } }>("/api/v1/placements/withdraw-requests", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ placement_ids: placementIds }),
  });
  return response.data;
}

export type ModuleVersionRow = {
  number: number;
  change_kind: "minor" | "major";
  change_note: string;
  published_at: string;
  published_by: string;
  lessons: number;
  questions: number;
  learners_completed: number;
};

export async function getModuleVersions(id: string): Promise<ModuleVersionRow[]> {
  const response = await request<{ data: ModuleVersionRow[] }>(`/api/v1/training/modules/${id}/versions`);
  return response.data;
}

export async function restoreModuleVersion(id: string, number: number) {
  const response = await request<{ data: TrainingModule }>(`/api/v1/training/modules/${id}/versions/${number}/restore`, { method: "POST", body: "{}" });
  return response.data;
}

export async function uploadLessonImage(file: File, alt: string) {
  const body = new FormData();
  body.append("file", file);
  body.append("alt", alt);
  const response = await request<{ data: { id: string; url: string; alt: string; width: number; height: number } }>(
    "/api/v1/training/media",
    { method: "POST", body },
  );
  return response.data;
}

export async function downloadCertificate(moduleId: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/training/modules/${moduleId}/certificate`, { credentials: "include" });
  } catch {
    throw new ApiError("We couldn’t reach MentorMAMA. Check your connection and try again.", 0, { retryable: true });
  }
  if (!response.ok) {
    throw new ApiError(
      response.status === 404 ? "Complete this module to receive a certificate." : "We could not prepare your certificate. Please try again.",
      response.status,
    );
  }
  return response.blob();
}

export type TrainingReport = {
  summary: { mentors: number; required_modules: number; mentors_complete: number; rate: number | null };
  mentors: Array<{
    id: string;
    name: string;
    email: string;
    required_completed: number;
    required_total: number;
    state: "complete" | "in_progress" | "not_started" | "needs_refresh";
    last_activity: string | null;
  }>;
  modules: Array<{
    id: string;
    title: string;
    required: boolean;
    completed: number;
    in_progress: number;
    not_started: number;
    average_score: number | null;
  }>;
  hard_questions: Array<{ module: string; prompt: string; attempts: number; wrong_rate: number }>;
};

export async function getTrainingReport(): Promise<TrainingReport> {
  const response = await request<{ data: TrainingReport }>("/api/v1/reports/training");
  return response.data;
}

export type CheckResult = NonNullable<AttemptResult["results"]>;

export async function checkLesson(moduleId: string, lessonId: string, answers: Record<string, string | string[]>) {
  const response = await request<{ data: { results: CheckResult } }>(
    `/api/v1/training/modules/${moduleId}/lessons/${lessonId}/check`,
    { method: "POST", body: JSON.stringify({ answers }) },
  );
  return response.data.results;
}

export type BankQuestion = {
  id: string;
  kind: "single" | "multi" | "true_false";
  scenario: string;
  prompt: string;
  explanation: string;
  options: Array<{ text: string; feedback: string }>;
  correct_options: string[];
  tags: string[];
};

export async function getQuestionBank(search = ""): Promise<BankQuestion[]> {
  const response = await request<{ data: BankQuestion[] }>(`/api/v1/training/question-bank?search=${encodeURIComponent(search)}`);
  return response.data;
}

export async function saveToQuestionBank(question: Omit<QuizPayloadQuestion, "id" | "lesson_id"> & { tags?: string[] }): Promise<BankQuestion> {
  const response = await request<{ data: BankQuestion }>("/api/v1/training/question-bank", { method: "POST", body: JSON.stringify(question) });
  return response.data;
}

export async function archiveBankQuestion(id: string): Promise<void> {
  await request<void>(`/api/v1/training/question-bank/${id}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------ platform administration */

export type SystemCheck = { name: string; state: "ok" | "warning" | "down" | "off"; detail: string; ms: number };
export type SystemStatus = {
  overall: "ok" | "warning" | "down";
  checks: SystemCheck[];
  release: string;
  environment: string;
  checked_at: string;
};
export type PlatformOverview = {
  programmes: number;
  accounts: {
    active: number;
    invited: number;
    invitations_expired: number;
    suspended: number;
    deactivated: number;
    by_role: Array<{ role: string; label: string; active: number }>;
  };
  support_pending: number;
  enquiries_new: number;
  enquiries_overdue: number;
  enquiry_emails_failed: number;
  programmes_without_admin: number;
  signins_last_7_days: number;
  system: SystemStatus;
};
export type PlatformProgramme = {
  id: string;
  name: string;
  short_name: string;
  academic_year: string;
  description: string;
  active_people: number;
  invited_people: number;
  active_admins: number;
  invited_admins: number;
  created_at: string;
};
export type PlatformAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  role_label: string;
  status: "invited" | "active" | "suspended" | "deactivated";
  programme_id: string | null;
  programme: string;
  invitation: "pending" | "expired" | "not_sent" | null;
  invitation_sent_at: string | null;
  last_login: string | null;
  created_at: string;
  must_change_password: boolean;
};
export type PlatformSupportRequest = {
  id: string;
  status: "pending" | "reviewed";
  reason: string;
  created_at: string;
  updated_at: string;
  handled_by: "platform" | "programme";
  account: PlatformAccount;
};
export type PlatformActivity = {
  id: string;
  title: string;
  actor: string;
  actor_role: string;
  subject: string;
  reason: string;
  occurred_at: string;
};
export type PersonInput = { email: string; first_name: string; last_name: string; phone?: string };

export async function getPlatformOverview(): Promise<PlatformOverview> {
  return (await request<{ data: PlatformOverview }>("/api/v1/platform/overview")).data;
}

export async function getPlatformStatus(): Promise<SystemStatus> {
  return (await request<{ data: SystemStatus }>("/api/v1/platform/status")).data;
}

export async function getPlatformProgrammes(): Promise<PlatformProgramme[]> {
  return (await request<{ data: PlatformProgramme[] }>("/api/v1/platform/programmes")).data;
}

export async function createPlatformProgramme(input: {
  name: string;
  short_name?: string;
  academic_year?: string;
  description?: string;
  admin?: PersonInput | null;
}) {
  return (await request<{ data: { id: string; name: string; admin_invited: string | null } }>("/api/v1/platform/programmes", {
    method: "POST",
    body: JSON.stringify(input),
  })).data;
}

export async function inviteProgrammeAdmin(programmeId: string, person: PersonInput) {
  return (await request<{ data: { id: string; email: string } }>(`/api/v1/platform/programmes/${programmeId}/admins`, {
    method: "POST",
    body: JSON.stringify(person),
  })).data;
}

export async function invitePlatformAdmin(person: PersonInput) {
  return (await request<{ data: { id: string; email: string } }>("/api/v1/platform/platform-admins", {
    method: "POST",
    body: JSON.stringify(person),
  })).data;
}

export async function getPlatformAccounts(params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "").map(([key, value]) => [key, String(value)]));
  return (await request<{ data: { results: PlatformAccount[]; pagination: { page: number; pages: number; total: number } } }>(
    `/api/v1/platform/accounts?${query.toString()}`,
  )).data;
}

export async function setPlatformAccountStatus(id: string, status: "active" | "suspended" | "deactivated", reason: string) {
  return (await request<{ data: { id: string; status: string } }>(`/api/v1/platform/accounts/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status, reason }),
  })).data;
}

export async function revokePlatformAccountSessions(id: string, reason: string) {
  return (await request<{ data: { revoked_count: number } }>(`/api/v1/platform/accounts/${id}/sessions/revoke`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })).data;
}

export async function resendPlatformInvitation(id: string) {
  return (await request<{ data: { id: string } }>(`/api/v1/platform/accounts/${id}/invitation/resend`, { method: "POST", body: "{}" })).data;
}

export async function getPlatformSupportRequests(): Promise<PlatformSupportRequest[]> {
  return (await request<{ data: PlatformSupportRequest[] }>("/api/v1/platform/support-requests")).data;
}

export async function resolvePlatformSupportRequest(id: string, decision: "recover" | "close", reason: string) {
  return (await request<{ data: { reviewed: boolean } }>(`/api/v1/platform/support-requests/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ decision, reason }),
  })).data;
}

export async function getPlatformActivity(): Promise<PlatformActivity[]> {
  return (await request<{ data: PlatformActivity[] }>("/api/v1/platform/activity")).data;
}


// ---- Website messages: contact, pilot access and support requests

export type EnquiryKind = "contact" | "pilot" | "support";
export type EnquiryStatus = "new" | "in_progress" | "waiting" | "resolved" | "closed" | "spam";
export type EnquiryPriority = "low" | "normal" | "high";
export type EnquiryPerson = { id: string; name: string };
export type EnquiryRow = {
  id: string;
  reference: string;
  kind: EnquiryKind;
  topic: string;
  status: EnquiryStatus;
  priority: EnquiryPriority;
  name: string;
  email: string;
  organisation: string;
  subject: string;
  preview: string;
  unread: boolean;
  overdue: boolean;
  assigned_to: EnquiryPerson | null;
  created_at: string;
  last_activity_at: string;
};
export type EnquiryCounts = { open: number; new: number; done: number; spam: number; unread: number; overdue: number; email_trouble: number };
export type EnquiryEmail = {
  template: string;
  status: "queued" | "sent" | "failed";
  to: string;
  subject: string;
  attempts: number;
  error: string;
  sent_at: string | null;
};
export type EnquiryTimelineEntry = {
  id: string;
  type: "received" | "note" | "reply" | "inbound" | "status" | "assignment" | "priority" | "converted" | "email";
  actor: EnquiryPerson | null;
  body: string;
  text: string;
  meta: { programme?: string; programme_id?: string; sender_notified?: boolean };
  created_at: string;
  email: EnquiryEmail | null;
};
export type EnquiryDetail = EnquiryRow & {
  phone: string;
  message: string;
  details: Record<string, string | number | null>;
  source_page: string;
  consent_at: string;
  first_response_at: string | null;
  closed_at: string | null;
  converted_programme: { id: string; name: string } | null;
  team_alert: "" | "queued" | "sent" | "failed";
  timeline: EnquiryTimelineEntry[];
  assignees: EnquiryPerson[];
};

export async function getPlatformEnquiries(params: Record<string, string | number>) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "").map(([key, value]) => [key, String(value)]));
  return (await request<{ data: { results: EnquiryRow[]; counts: EnquiryCounts; pagination: { page: number; pages: number; total: number } } }>(
    `/api/v1/platform/enquiries?${query.toString()}`,
  )).data;
}

export async function getPlatformEnquiry(id: string): Promise<EnquiryDetail> {
  return (await request<{ data: EnquiryDetail }>(`/api/v1/platform/enquiries/${id}`)).data;
}

async function enquiryAction(id: string, action: string, body: Record<string, unknown>): Promise<EnquiryDetail> {
  return (await request<{ data: EnquiryDetail }>(`/api/v1/platform/enquiries/${id}/${action}`, { method: "POST", body: JSON.stringify(body) })).data;
}

export const assignPlatformEnquiry = (id: string, userId: string | null) => enquiryAction(id, "assign", { user_id: userId });
export const setPlatformEnquiryStatus = (id: string, status: EnquiryStatus, note = "", notify = true) =>
  enquiryAction(id, "status", { status, note, notify });
export const setPlatformEnquiryPriority = (id: string, priority: EnquiryPriority) => enquiryAction(id, "priority", { priority });
export const addPlatformEnquiryNote = (id: string, body: string) => enquiryAction(id, "notes", { body });
export const replyToPlatformEnquiry = (id: string, body: string) => enquiryAction(id, "reply", { body });
export const resendPlatformEnquiryEmail = (id: string, eventId: string) => enquiryAction(id, "email/resend", { event_id: eventId });
export const convertPlatformEnquiry = (
  id: string,
  input: { name: string; short_name?: string; academic_year?: string; note?: string; admin: PersonInput },
) => enquiryAction(id, "convert", input);

export type SavedReply = { id: string; title: string; body: string };
export async function getSavedReplies(): Promise<SavedReply[]> {
  return (await request<{ data: SavedReply[] }>("/api/v1/platform/saved-replies")).data;
}
export async function saveSavedReply(title: string, body: string): Promise<SavedReply> {
  return (await request<{ data: SavedReply }>("/api/v1/platform/saved-replies", { method: "POST", body: JSON.stringify({ title, body }) })).data;
}
export async function deleteSavedReply(id: string): Promise<void> {
  await request<void>(`/api/v1/platform/saved-replies/${id}`, { method: "DELETE" });
}

/** Downloads the current inbox view as CSV. */
export async function exportPlatformEnquiries(params: Record<string, string | number>): Promise<Blob> {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "").map(([key, value]) => [key, String(value)]));
  let response: Response;
  try {
    response = await fetch(`/api/v1/platform/enquiries/export?${query.toString()}`, { credentials: "include" });
  } catch {
    throw new ApiError("We couldn’t reach MentorMAMA. Check your connection and try again.", 0, { retryable: true });
  }
  if (!response.ok) throw new ApiError("We could not export the messages.", response.status);
  return response.blob();
}

/** A signed-in person asks the MentorMAMA team for help. Account details are attached on the server. */
export async function sendHelpRequest(input: { topic: string; message: string; page: string }): Promise<{ reference: string }> {
  return (await request<{ data: { reference: string } }>("/api/v1/support/help", { method: "POST", body: JSON.stringify(input) })).data;
}

// ---- Presentation mode (only exists when the server runs with DEMO_MODE)

export type DemoAccount = { role: string; role_label: string; name: string; email: string };

export async function getDemoAccounts(): Promise<DemoAccount[]> {
  const response = await request<{ data: { enabled: boolean; accounts: DemoAccount[] } }>("/api/v1/auth/demo");
  return response.data.enabled ? response.data.accounts : [];
}

export async function demoLogin(role: string): Promise<CurrentUser> {
  return (await request<{ data: CurrentUser }>("/api/v1/auth/demo/login", { method: "POST", body: JSON.stringify({ role }) })).data;
}
