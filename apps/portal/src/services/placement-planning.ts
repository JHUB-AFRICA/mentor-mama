/**
 * Client for the coordinator's placement planning and allocation result screens.
 * Reads come from `/placements/planning/*` and `/placements/allocation-runs/*`; the request and release actions
 * reuse the facility-request and release endpoints. Every function throws an `ApiError` with a readable message.
 */
import { ApiError, request } from "./api";

export type PipelineStatus =
  | "not_placed"
  | "not_requested"
  | "declined"
  | "requested"
  | "partly_arranged"
  | "arranged"
  | "shared"
  | "released"
  | "confirmed"
  | "active"
  | "paused"
  | "completed"
  | "withdrawn"
  | "archived";

export type StatusCounts = Record<PipelineStatus, number> & { total: number; ready_to_release: number; needs_attention: number };

export interface PlanningCohortCard {
  id: string;
  name: string;
  institution_id: string;
  institution_name: string;
  start_date: string;
  end_date: string;
  planned_capacity: number | null;
  phase: "upcoming" | "current";
  days_until_start: number;
  counts: StatusCounts;
}

export interface PlanningOverview {
  today: string;
  cohorts: PlanningCohortCard[];
  next_cohort_id: string | null;
  statuses: Array<{ code: PipelineStatus; label: string }>;
}

export interface WardCapacity {
  ward_id: string;
  name: string;
  shift_pattern?: string;
  capacity: number;
  occupied: number;
  free: number;
  over_capacity: boolean;
}

export interface FacilityCapacity {
  facility_id: string;
  name: string;
  county?: string;
  wards: WardCapacity[];
  capacity: number;
  occupied: number;
  free: number;
  pending_requests: number;
  mentors: { mentors: number; accepting: number; remaining: number; at_limit: number };
  no_wards: boolean;
  warnings: string[];
}

export interface PlanningCohortSummary {
  cohort: PlanningCohortCard;
  window: { start: string; end: string; basis: "placements" | "cohort" };
  capacity: {
    total_free: number;
    total_capacity: number;
    students_to_place: number;
    students_in_facility_queues: number;
    shortfall: number;
    facilities: FacilityCapacity[];
  };
  warnings: string[];
}

export interface PlanningStudentRow {
  student: { id: string; name: string; email: string; registration_number: string; account_status: string };
  placement_id: string | null;
  status: PipelineStatus;
  status_label: string;
  next_action: string;
  state: string | null;
  facility: { id: string; name: string } | null;
  requested_facility: { id: string; name: string } | null;
  requested_at: string | null;
  declined: { facility: string; reason: string; at: string | null } | null;
  ward: { id: string; name: string } | null;
  mentor: { id: string; name: string } | null;
  planned_start: string | null;
  planned_end: string | null;
  shared_at: string | null;
  ready_to_release: boolean;
  blockers: string[];
  needs_attention: boolean;
}

export interface Pagination {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export type PlanningSort = "name" | "registration_number" | "status" | "start" | "facility" | "ward" | "mentor";

export interface PlanningStudentQuery {
  status?: string;
  ward_id?: string;
  search?: string;
  facility_id?: string;
  ready?: boolean;
  needs_attention?: boolean;
  sort?: PlanningSort;
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface PlanningStudents {
  cohort: { id: string; name: string; start_date: string; end_date: string };
  counts: StatusCounts;
  results: PlanningStudentRow[];
  pagination: Pagination;
}

function queryString(values: Record<string, string | number | boolean | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function getPlanningOverview(): Promise<PlanningOverview> {
  return (await request<{ data: PlanningOverview }>("/api/v1/placements/planning/overview")).data;
}

export async function getPlanningCohort(cohortId: string): Promise<PlanningCohortSummary> {
  return (await request<{ data: PlanningCohortSummary }>(`/api/v1/placements/planning/cohorts/${cohortId}`)).data;
}

export async function getPlanningStudents(cohortId: string, query: PlanningStudentQuery = {}): Promise<PlanningStudents> {
  const path = `/api/v1/placements/planning/cohorts/${cohortId}/students${queryString({ ...query })}`;
  return (await request<{ data: PlanningStudents }>(path)).data;
}

export interface PlanningStudentIds {
  count: number;
  placement_ids: string[];
  student_ids: string[];
  without_placement_student_ids: string[];
}

/** Every student matching the filter (not just the visible page), for "apply to everyone in this view". */
export async function getPlanningStudentIds(cohortId: string, query: PlanningStudentQuery = {}): Promise<PlanningStudentIds> {
  const { page: _page, page_size: _size, ...rest } = query;
  void _page;
  void _size;
  const path = `/api/v1/placements/planning/cohorts/${cohortId}/students${queryString({ ...rest, ids_only: true })}`;
  return (await request<{ data: PlanningStudentIds }>(path)).data;
}

// ------------------------------------------------------------------ release

export interface ReleaseResult {
  released: number;
  already_released: number;
  not_arranged: number;
  blocked: Array<{ placement_id: string; student: string; reason: string }>;
  released_students: Array<{ placement_id: string; student: string }>;
  total: number;
}

export async function releasePlacements(input: { placement_ids?: string[]; cohort_id?: string }): Promise<ReleaseResult> {
  const response = await request<{ data: ReleaseResult }>("/api/v1/placements/release", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(input),
  });
  return response.data;
}

// ------------------------------------------------------------------ request facilities (split preview + apply)

export type SplitMode = "capacity" | "even";
export type SplitBasis = "wards" | "wards_and_mentors";

export interface SplitInput {
  placement_ids: string[];
  facility_ids: string[];
  mode: SplitMode;
  basis: SplitBasis;
  seed: string;
  net_of_pending?: boolean;
}

export interface SplitPlan {
  seed: string;
  mode: SplitMode;
  basis: SplitBasis;
  plan_hash: string;
  facilities: Array<{
    facility_id: string;
    name: string;
    free_capacity: number;
    usable_capacity: number;
    requested: number;
    pending_requests: number;
    mentor_places_left: number;
  }>;
  assignments: Array<{ placement_id: string; student: string; facility_id: string }>;
  unplaced: Array<{ placement_id: string; student: string; reason: string }>;
  skipped: Array<{ placement_id: string; student?: string; reason: string }>;
  warnings: string[];
  window: { start: string; end: string };
}

export interface SplitResult {
  run_id: string;
  seed: string;
  requested: number;
  by_facility: Record<string, number>;
  unplaced: Array<{ placement_id: string; student: string; reason: string }>;
  skipped: Array<{ placement_id: string; student?: string; reason: string }>;
}

export async function previewFacilitySplit(input: SplitInput): Promise<SplitPlan> {
  const response = await request<{ data: SplitPlan }>("/api/v1/placements/facility-requests", {
    method: "POST",
    body: JSON.stringify({ ...input, preview: true }),
  });
  return response.data;
}

/** Applies exactly the reviewed split: the server refuses if capacity changed since `planHash` was shown. */
export async function applyFacilitySplit(input: SplitInput, planHash: string): Promise<SplitResult> {
  const response = await request<{ data: SplitResult }>("/api/v1/placements/facility-requests", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ ...input, preview: false, expected_plan_hash: planHash }),
  });
  return response.data;
}

// ------------------------------------------------------------------ allocation runs

export type RunMode = "facility_split" | "auto_arrange";
export type RunStatus = "running" | "completed" | "partial" | "failed" | "undone";

export interface AllocationRunRow {
  id: string;
  mode: RunMode;
  created_at: string;
  by: string;
  strategy: string;
  status: RunStatus;
  facility_id: string | null;
  facility_name: string | null;
  arranged: number;
  unplaced: number;
  requested: number | null;
  can_undo: boolean;
  can_retry: boolean;
}

export async function listAllocationRuns(limit = 50, mode?: RunMode): Promise<AllocationRunRow[]> {
  return (await request<{ data: AllocationRunRow[] }>(`/api/v1/placements/allocation-runs${queryString({ limit, mode })}`)).data;
}

export interface RunPlacementRow {
  placement_id: string;
  student: string;
  registration_number: string;
  cohort: string;
  outcome: "placed" | "unplaced" | "requested";
  facility: { id: string; name: string; requested?: boolean } | null;
  ward: { id: string; name: string } | null;
  mentor: { id: string; name: string } | null;
  planned_start: string | null;
  planned_end: string | null;
  state: string;
  status: PipelineStatus;
  status_label: string;
  reason: string;
  issues: string[];
  moved_since: boolean;
}

export interface RunFacilityFill {
  facility_id: string;
  name: string;
  capacity?: number | null;
  before?: number | null;
  added?: number;
  after?: number | null;
  free_after?: number | null;
  requested?: number;
}

export interface RunWardFill {
  id: string;
  name: string;
  capacity: number | null;
  before: number | null;
  added: number;
  after: number | null;
  free_after: number | null;
}

export interface AllocationRunDetail {
  run: {
    id: string;
    mode: RunMode;
    status: RunStatus;
    strategy: string;
    seed: string;
    plan_hash: string;
    created_at: string;
    by: string;
    facility: { id: string; name: string } | null;
    institution: { id: string; name: string } | null;
    can_undo: boolean;
    can_retry: boolean;
    retried_by: string | null;
  };
  summary: {
    requested: number;
    placed: number;
    unplaced: number;
    with_mentor: number;
    without_mentor: number;
    unplaced_reasons: Array<{ reason: string; count: number }>;
  };
  facilities: RunFacilityFill[];
  wards: RunWardFill[];
  mentors: Array<{
    id: string;
    name: string;
    assigned_in_run: number;
    open_placements_now: number | null;
    limit: number | null;
    remaining_now: number | null;
  }>;
  placements: RunPlacementRow[];
  pagination: Pagination;
  downloads: { endpoint: string; params: { run_id: string }; formats: string[] };
  detail_available: boolean;
}

export interface RunDetailQuery {
  outcome?: "placed" | "unplaced" | "requested";
  search?: string;
  page?: number;
  page_size?: number;
}

export async function getAllocationRunDetail(runId: string, query: RunDetailQuery = {}): Promise<AllocationRunDetail> {
  return (await request<{ data: AllocationRunDetail }>(`/api/v1/placements/allocation-runs/${runId}${queryString({ ...query })}`)).data;
}

// ------------------------------------------------------------------ download

/** Download the allocation list for a cohort or for one run (the API takes one or the other). */
export async function downloadAllocation(input: { file: "csv" | "xlsx" | "pdf"; cohortId?: string; runId?: string }, signal?: AbortSignal): Promise<Blob> {
  const path = `/api/v1/placements/allocation-list${queryString({ file: input.file, cohort_id: input.cohortId, run_id: input.runId })}`;
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("We couldn’t reach MentorMAMA. Check your connection and try again.", 0, { retryable: true });
  }
  if (!response.ok) {
    let message = "We couldn’t prepare that list. Please try again.";
    let code: string | null = null;
    if (response.status < 500) {
      try {
        const body = (await response.json()) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? null;
        if (typeof body.error?.message === "string") message = body.error.message;
      } catch {
        // Keep the calm default.
      }
    }
    throw new ApiError(message, response.status, { code });
  }
  return response.blob();
}

/** Plain-language message for any failure from this module. */
export function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;
}
