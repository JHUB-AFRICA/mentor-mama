import { useQuery } from "@tanstack/react-query";

import { request } from "./api";

/**
 * Mentor follow-ups (concept note 7.2 step 13).
 * Items never carry the free-text session notes: this is a to-do list, not the session record.
 */

export type FollowUpStatus = "pending" | "done";

export interface FollowUp {
  session_id: string;
  placement_id: string;
  placement_state: string;
  student: { id: string; name: string } | null;
  ward: string | null;
  session_date: string;
  session_type: string;
  session_type_label: string;
  topics: string[];
  follow_up_action: string;
  label: string;
  suggested_next_step: string;
  is_student_support: boolean;
  status: FollowUpStatus;
  age_days: number;
  overdue_after_days: number;
  overdue: boolean;
  outcome: "done" | "not_needed" | null;
  note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface FollowUpCounts {
  pending: number;
  overdue: number;
  student_support: number;
  done: number;
}

export interface FollowUpPage {
  data: FollowUp[];
  meta: {
    page: number;
    page_size: number;
    total: number;
    pages: number;
    counts: FollowUpCounts;
    kinds: Array<{ value: string; label: string }>;
    students: Array<{ id: string; name: string }>;
  };
}

export interface FollowUpQuery {
  status?: FollowUpStatus | "all";
  action?: string;
  studentId?: string;
  placementId?: string;
  page?: number;
  pageSize?: number;
}

export function listFollowUps(query: FollowUpQuery = {}): Promise<FollowUpPage> {
  const params = new URLSearchParams();
  params.set("status", query.status ?? "pending");
  if (query.action) params.set("action", query.action);
  if (query.studentId) params.set("student_id", query.studentId);
  if (query.placementId) params.set("placement_id", query.placementId);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize) params.set("page_size", String(query.pageSize));
  return request<FollowUpPage>(`/api/v1/follow-ups?${params.toString()}`);
}

export async function getFollowUpCounts(): Promise<FollowUpCounts> {
  return (await request<{ data: FollowUpCounts }>("/api/v1/follow-ups/summary")).data;
}

export async function markFollowUpDone(sessionId: string, note = ""): Promise<FollowUp> {
  const response = await request<{ data: FollowUp }>(`/api/v1/follow-ups/${encodeURIComponent(sessionId)}/done`, {
    method: "POST",
    body: JSON.stringify({ note: note.trim() }),
  });
  return response.data;
}

export async function reopenFollowUp(sessionId: string): Promise<FollowUp> {
  const response = await request<{ data: FollowUp }>(`/api/v1/follow-ups/${encodeURIComponent(sessionId)}/reopen`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return response.data;
}

export const followUpKeys = {
  all: ["follow-ups"] as const,
  counts: ["follow-ups", "counts"] as const,
};

/** Pending counts for the sidebar badge and the overview card. Mentors only; quiet on failure. */
export function useFollowUpCounts(enabled: boolean) {
  return useQuery({
    queryKey: followUpKeys.counts,
    queryFn: getFollowUpCounts,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
