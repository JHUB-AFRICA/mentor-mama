import { request } from "./api";

/** Mentors who may need a check-in (GET /api/v1/mentors/activity). Session metadata only: no notes, no student names. */
export interface MentorActivityRow {
  id: string;
  name: string;
  email: string;
  status: "active" | "invited" | string;
  last_sign_in: string | null;
  last_session_date: string | null;
  days_since_last_session: number | null;
  sessions_in_window: number;
  live_placements: number;
  live_students: number;
  students_without_recent_session: number;
  training: { required_completed: number; required_total: number };
  accepting_students: boolean;
  /** True when the mentor appears because of the "inactive" definition. */
  inactive: boolean;
  reason_codes: Array<"no_recent_session" | "never_logged" | "not_signed_in" | "invitation_pending" | string>;
  reasons: string[];
  /** Separate flag, not part of "inactive": an induction has waited for sign-off for a while. */
  induction_waiting: boolean;
  inductions_waiting: number;
  induction_note: string;
}

export interface MentorActivity {
  definition: {
    days: number;
    min_days: number;
    max_days: number;
    default_days: number;
    induction_waiting_days: number;
    live_states: string[];
  };
  as_of: string;
  summary: { inactive: number; induction_waiting: number; mentors_considered: number };
  results: MentorActivityRow[];
}

export const ACTIVITY_DAY_OPTIONS = [7, 14, 21, 30] as const;

export async function getMentorActivity(days = 14): Promise<MentorActivity> {
  const response = await request<{ data: MentorActivity }>(`/api/v1/mentors/activity?days=${encodeURIComponent(String(days))}`);
  return response.data;
}

export type ActivitySort = "quiet_longest" | "quiet_shortest" | "name";

/** Mentors who never logged a session count as "quietest" so they are not hidden at the bottom. */
export function sortActivity(rows: MentorActivityRow[], sort: ActivitySort): MentorActivityRow[] {
  const copy = [...rows];
  const quiet = (row: MentorActivityRow) => row.days_since_last_session ?? Number.POSITIVE_INFINITY;
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  copy.sort((a, b) => (quiet(a) === quiet(b) ? a.name.localeCompare(b.name) : sort === "quiet_longest" ? quiet(b) - quiet(a) : quiet(a) - quiet(b)));
  return copy;
}

export function activityCsvRows(rows: MentorActivityRow[], days: number): unknown[][] {
  return [
    ["Mentor", "Email", "Account", "Last sign-in", "Last session", "Days since last session", `Sessions in last ${days} days`, "Live students", "Students with no recent session", "Required training done", "Required training total", "Accepting students", "Why listed"],
    ...rows.map((row) => [
      row.name, row.email, row.status, row.last_sign_in?.slice(0, 10) ?? "", row.last_session_date ?? "", row.days_since_last_session ?? "",
      row.sessions_in_window, row.live_students, row.students_without_recent_session, row.training.required_completed, row.training.required_total,
      row.accepting_students ? "Yes" : "No", [...row.reasons, row.induction_note].filter(Boolean).join("; "),
    ]),
  ];
}
