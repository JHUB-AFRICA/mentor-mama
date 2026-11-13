import { useQuery } from "@tanstack/react-query";

import { request } from "./api";

/**
 * Incoming placement requests for a nurse manager's facility (GET /placements/incoming/summary).
 * Students only appear by name and registration number: no patient data is involved.
 */

export interface IncomingWardRoom {
  ward_id: string;
  name: string;
  shift_pattern: string;
  capacity: number;
  occupied: number;
  free: number;
  over_capacity: boolean;
}

export interface IncomingStudent {
  placement_id: string;
  name: string;
  registration_number: string;
}

export interface IncomingGroup {
  institution: { id: string; name: string };
  cohort: { id: string; name: string };
  planned_start: string;
  planned_end: string;
  count: number;
  placement_ids: string[];
  students: IncomingStudent[];
  requested_since: string | null;
  latest_request: string | null;
  capacity: {
    free: number;
    capacity: number;
    occupied: number;
    wards: IncomingWardRoom[];
    mentor_places_left: number;
  };
  shortfall: number;
  over_capacity: boolean;
  warnings: string[];
}

export interface IncomingSummary {
  facility_id: string;
  total_requested: number;
  groups: IncomingGroup[];
  capacity: {
    free: number;
    capacity: number;
    occupied: number;
    wards: IncomingWardRoom[];
    mentors: { mentors: number; accepting: number; remaining: number; at_limit: number };
    window: { start: string; end: string };
  } | null;
  over_capacity: boolean;
  latest_run: unknown;
}

export const incomingRequestKeys = {
  all: ["incoming-requests"] as const,
  summary: ["incoming-requests", "summary"] as const,
};

export async function getIncomingSummary(): Promise<IncomingSummary> {
  const response = await request<{ data: IncomingSummary }>("/api/v1/placements/incoming/summary");
  return response.data;
}

/** The requests summary, shared by the page and the sidebar badge. */
export function useIncomingSummary(enabled = true) {
  return useQuery({
    queryKey: incomingRequestKeys.summary,
    queryFn: getIncomingSummary,
    enabled,
    staleTime: 30_000,
  });
}

/** Students waiting, for the sidebar badge. Quiet on failure: no badge. */
export function useIncomingCount(enabled = true) {
  return useQuery({
    queryKey: incomingRequestKeys.summary,
    queryFn: getIncomingSummary,
    enabled,
    staleTime: 60_000,
    retry: false,
    select: (summary) => summary.total_requested,
  });
}

/** A stable key for a request group (a school's cohort for one set of dates). */
export function groupKey(group: IncomingGroup): string {
  return `${group.institution.id}:${group.cohort.id}:${group.planned_start}:${group.planned_end}`;
}

/** Whole days since a timestamp (never negative). */
export function daysWaiting(since: string | null, now = Date.now()): number {
  if (!since) return 0;
  const stamp = new Date(since).getTime();
  if (Number.isNaN(stamp)) return 0;
  return Math.max(0, Math.floor((now - stamp) / 86_400_000));
}

export function waitingLabel(since: string | null, now = Date.now()): string {
  const days = daysWaiting(since, now);
  if (days === 0) return "Requested today";
  return `Waiting ${days} ${days === 1 ? "day" : "days"}`;
}
