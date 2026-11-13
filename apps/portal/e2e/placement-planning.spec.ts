/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed API mocks */
import { expect, test, type Page } from "@playwright/test";

const coordinator = {
  id: "co1", email: "coordinator@example.test", name: "Amina Mwangi", role: "coordinator",
  capabilities: { request_facility: true, release_placement: true, create_placement: true },
  scope: { institution_id: "i1", institution_name: "Rosami College of Health Sciences" }, must_change_password: false,
};

const STATUS_LABEL: Record<string, string> = {
  not_requested: "Awaiting a facility request", declined: "Declined by facility", requested: "Requested of a facility",
  arranged: "Arranged", released: "Released, awaiting student", active: "Active",
};
const ORDER = ["not_placed", "not_requested", "declined", "requested", "partly_arranged", "arranged", "shared", "released", "confirmed", "active"];
const CODES = ["not_placed", "not_requested", "declined", "requested", "partly_arranged", "arranged", "shared", "released", "confirmed", "active", "paused", "completed", "withdrawn", "archived"];

type Row = Record<string, any>;

function makeStudents(): Row[] {
  const plan: Array<[string, number]> = [["not_requested", 12], ["declined", 3], ["requested", 10], ["arranged", 12], ["released", 8], ["active", 15]];
  const rows: Row[] = [];
  let n = 0;
  for (const [status, count] of plan) {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const placed = status === "arranged" || status === "released" || status === "active";
      rows.push({
        student: { id: `s${n}`, name: `Student ${String(n).padStart(2, "0")} Achieng`, email: `s${n}@example.test`, registration_number: `RC/${1000 + n}/2024`, account_status: "active" },
        placement_id: `p${n}`, status, status_label: STATUS_LABEL[status], next_action: status === "arranged" ? "Share with the student or release" : "", state: "draft",
        facility: placed ? { id: n % 2 ? "f1" : "f2", name: n % 2 ? "Kenyatta National Hospital" : "Mama Lucy Hospital" } : null,
        requested_facility: status === "requested" ? { id: "f1", name: "Kenyatta National Hospital" } : null,
        requested_at: null,
        declined: status === "declined" ? { facility: "Mama Lucy Hospital", reason: "No mentor on that ward this term", at: null } : null,
        ward: placed ? { id: n % 2 ? "w1" : "w2", name: n % 2 ? "Labour Ward" : "Postnatal Ward" } : null,
        mentor: placed ? { id: "m1", name: "Mercy Wanjiku" } : null,
        planned_start: "2027-01-11", planned_end: "2027-03-12", shared_at: null,
        ready_to_release: status === "arranged" && n % 3 !== 0, blockers: status === "arranged" && n % 3 === 0 ? ["The mentor has not finished required training."] : [],
        needs_attention: status === "declined" || status === "not_requested",
      });
    }
  }
  return rows;
}

function countsOf(rows: Row[]) {
  const counts: Record<string, number> = Object.fromEntries(CODES.map((code) => [code, 0]));
  for (const row of rows) counts[row.status] += 1;
  return { ...counts, total: rows.length, ready_to_release: rows.filter((r) => r.ready_to_release).length, needs_attention: rows.filter((r) => r.needs_attention).length };
}

const facilityCapacity = [
  { facility_id: "f1", name: "Kenyatta National Hospital", county: "Nairobi", capacity: 20, occupied: 6, free: 14, pending_requests: 4, no_wards: false, warnings: [],
    mentors: { mentors: 4, accepting: 4, remaining: 6, at_limit: 0 },
    wards: [{ ward_id: "w1", name: "Labour Ward", capacity: 12, occupied: 4, free: 8, over_capacity: false }, { ward_id: "w3", name: "Theatre", capacity: 8, occupied: 2, free: 6, over_capacity: false }] },
  { facility_id: "f2", name: "Mama Lucy Hospital", county: "Nairobi", capacity: 10, occupied: 8, free: 2, pending_requests: 0, no_wards: false, warnings: [],
    mentors: { mentors: 2, accepting: 2, remaining: 1, at_limit: 0 },
    wards: [{ ward_id: "w2", name: "Postnatal Ward", capacity: 10, occupied: 8, free: 2, over_capacity: false }] },
];

function makeState() {
  const students = makeStudents();
  return {
    students, calls: [] as string[], studentQueries: [] as URLSearchParams[], previews: [] as Record<string, any>[], applied: [] as Record<string, any>[], releases: [] as Record<string, any>[],
  };
}

async function mock(page: Page, state: ReturnType<typeof makeState>, options: { cohorts?: boolean; overviewFails?: boolean } = {}) {
  const cohorts = options.cohorts === false ? [] : [
    { id: "c1", name: "Cohort A 2027", institution_id: "i1", institution_name: "Rosami College of Health Sciences", start_date: "2027-01-11", end_date: "2027-03-12", planned_capacity: 60, phase: "upcoming", days_until_start: 40, counts: countsOf(state.students) },
    { id: "c2", name: "Cohort B 2027", institution_id: "i1", institution_name: "Rosami College of Health Sciences", start_date: "2027-05-03", end_date: "2027-07-02", planned_capacity: 20, phase: "upcoming", days_until_start: 160, counts: countsOf([]) },
  ];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    state.calls.push(`${request.method()} ${path}${url.search}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ data: { authenticated: true, user: coordinator } });
    if (path === "/api/v1/ai/status") return json({ data: { assistant: false, lesson_explanations: false } });
    if (path === "/api/v1/placements/planning/overview") {
      if (options.overviewFails) return json({ error: { code: "Boom", message: "x" } }, 500);
      return json({ data: { today: "2026-12-01", cohorts, next_cohort_id: cohorts[0]?.id ?? null, statuses: CODES.map((code) => ({ code, label: STATUS_LABEL[code] ?? code })) } });
    }
    const summary = path.match(/^\/api\/v1\/placements\/planning\/cohorts\/([^/]+)$/);
    if (summary) {
      const cohort = cohorts.find((c) => c.id === summary[1])!;
      return json({ data: { cohort, window: { start: "2027-01-11", end: "2027-03-12", basis: "placements" },
        capacity: { total_free: 16, total_capacity: 30, students_to_place: 25, students_in_facility_queues: 10, shortfall: 9, facilities: facilityCapacity },
        warnings: ["35 students still need a place but the programme has 16 free places for 11 Jan to 12 Mar."] } });
    }
    const list = path.match(/^\/api\/v1\/placements\/planning\/cohorts\/([^/]+)\/students$/);
    if (list) {
      state.studentQueries.push(url.searchParams);
      const q = url.searchParams;
      let rows = list[1] === "c1" ? state.students.slice() : [];
      const status = (q.get("status") ?? "").split(",").filter(Boolean);
      if (status.length) rows = rows.filter((r) => status.includes(r.status));
      if (q.get("ready") === "true") rows = rows.filter((r) => r.ready_to_release);
      if (q.get("facility_id")) rows = rows.filter((r) => [r.facility?.id, r.requested_facility?.id].includes(q.get("facility_id")));
      const term = (q.get("search") ?? "").toLowerCase();
      if (term) rows = rows.filter((r) => r.student.name.toLowerCase().includes(term) || r.student.registration_number.toLowerCase().includes(term));
      const sort = q.get("sort") ?? "status";
      const dir = q.get("order") === "desc" ? -1 : 1;
      rows.sort((a, b) => dir * (sort === "name" ? a.student.name.localeCompare(b.student.name) : ORDER.indexOf(a.status) - ORDER.indexOf(b.status)));
      if (q.get("ids_only") === "true") {
        return json({ data: { count: rows.length, placement_ids: rows.map((r) => r.placement_id), student_ids: rows.map((r) => r.student.id), without_placement_student_ids: [] } });
      }
      const size = Number(q.get("page_size") ?? 50);
      const page_ = Number(q.get("page") ?? 1);
      const pages = Math.max(1, Math.ceil(rows.length / size));
      return json({ data: { cohort: { id: list[1], name: "Cohort", start_date: "2027-01-11", end_date: "2027-03-12" }, counts: countsOf(list[1] === "c1" ? state.students : []),
        results: rows.slice((page_ - 1) * size, page_ * size),
        pagination: { page: page_, page_size: size, total_count: rows.length, total_pages: pages, has_next: page_ < pages, has_previous: page_ > 1 } } });
    }
    if (path === "/api/v1/placements/facility-requests") {
      const body = request.postDataJSON() as Record<string, any>;
      const ids: string[] = body.placement_ids;
      const half = Math.ceil(ids.length * 0.7);
      if (body.preview) {
        state.previews.push(body);
        return json({ data: { seed: body.seed, mode: body.mode, basis: body.basis, plan_hash: "a".repeat(64),
          facilities: [
            { facility_id: "f1", name: "Kenyatta National Hospital", free_capacity: 14, usable_capacity: 14, requested: half, pending_requests: 4, mentor_places_left: 6 },
            { facility_id: "f2", name: "Mama Lucy Hospital", free_capacity: 2, usable_capacity: 2, requested: ids.length - half, pending_requests: 0, mentor_places_left: 1 },
          ],
          assignments: ids.map((id, i) => ({ placement_id: id, student: id, facility_id: i < half ? "f1" : "f2" })), unplaced: [], skipped: [], warnings: ["Mama Lucy Hospital would receive 3 requests for 2 free places."],
          window: { start: "2027-01-11", end: "2027-03-12" } } });
      }
      state.applied.push(body);
      return json({ data: { run_id: "run-1", seed: body.seed, requested: ids.length, by_facility: { f1: half, f2: ids.length - half }, unplaced: [], skipped: [] } }, 201);
    }
    if (path === "/api/v1/placements/planning/cohorts/c1/auto-request") {
      const body = request.postDataJSON() as Record<string, any>;
      if (body.preview) {
        state.previews.push(body);
        return json({ data: { seed: body.seed, mode: body.mode, basis: body.basis, plan_hash: "b".repeat(64), to_create: 15, candidates: 30,
          facilities: [
            { facility_id: "f1", name: "Kenyatta National Hospital", free_capacity: 14, usable_capacity: 14, requested: 14, pending_requests: 4, mentor_places_left: 6 },
            { facility_id: "f2", name: "Mama Lucy Hospital", free_capacity: 2, usable_capacity: 2, requested: 2, pending_requests: 0, mentor_places_left: 1 },
          ],
          assignments: Array.from({ length: 16 }, (_, i) => ({ placement_id: null, student_id: `s${i}`, student: `Student ${i}`, facility_id: i < 14 ? "f1" : "f2" })),
          unplaced: Array.from({ length: 14 }, (_, i) => ({ placement_id: null, student_id: `u${i}`, student: `Left ${i}`, reason: "The chosen facilities have 16 free places for these dates, fewer than the 30 students." })),
          skipped: [], warnings: [], window: { start: "2027-01-11", end: "2027-03-12" } } });
      }
      state.applied.push(body);
      return json({ data: { run_id: "run-1", seed: body.seed, requested: 16, by_facility: { f1: 14, f2: 2 }, unplaced: [], skipped: [] } }, 201);
    }
    if (path === "/api/v1/placements/release") {
      state.releases.push(request.postDataJSON());
      return json({ data: { released: 2, already_released: 1, not_arranged: 1, total: 5, released_students: [], blocked: [{ placement_id: "p27", student: "Student 27 Achieng", reason: "The mentor has not finished required training." }] } });
    }
    if (path.startsWith("/api/v1/placements/allocation-runs/run-1")) {
      return json({ data: { run: { id: "run-1", mode: "facility_split", status: "completed", strategy: "capacity", seed: "abc", plan_hash: "", created_at: "2026-12-01T09:00:00Z", by: "Amina Mwangi", facility: null, institution: null, can_undo: false, can_retry: false, retried_by: null },
        summary: { requested: 3, placed: 3, unplaced: 0, with_mentor: 0, without_mentor: 0, unplaced_reasons: [] }, facilities: [], wards: [], mentors: [], placements: [],
        pagination: { page: 1, page_size: 25, total_count: 0, total_pages: 1, has_next: false, has_previous: false }, downloads: { endpoint: "", params: { run_id: "run-1" }, formats: [] }, detail_available: false } });
    }
    if (path === "/api/v1/placements/options") return json({ data: { cohorts: [], wards: [], students: [] } });
    return json({ data: [] });
  });
}

const rowsOf = (page: Page) => page.getByRole("table", { name: /Students in/ }).locator("tbody tr");

test.describe("placement planning", () => {
  test("shows the next cohort, its pipeline and capacity, and switches cohort", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/coordinator/placements/planning");

    await expect(page.getByRole("heading", { name: "Placement planning", level: 2 })).toBeVisible();
    const cohorts = page.getByRole("group", { name: "Choose a cohort" });
    await expect(cohorts.getByRole("button", { name: /Cohort A 2027/ })).toHaveAttribute("aria-pressed", "true");
    await expect(cohorts.getByRole("button", { name: /Cohort A 2027/ })).toContainText("60 students");

    const strip = page.getByRole("list", { name: "Placement progress" });
    await expect(strip.getByRole("button", { name: /Not placed/ })).toContainText("15");
    await expect(strip.getByRole("button", { name: /^10\s*Requested/ })).toBeVisible();
    await expect(strip.getByRole("button", { name: /Confirmed or active/ })).toContainText("15");

    // Capacity context for the cohort dates.
    await expect(page.getByText("Room at partner facilities")).toBeVisible();
    await expect(page.getByRole("img", { name: /Kenyatta National Hospital: 6 of 20 places taken, 4 requested and waiting, 14 free/ })).toBeVisible();
    await expect(page.getByText(/35 students still need a place/)).toBeVisible();

    // Comprehensive row: status chip, facility, ward, mentor, dates, decline reason.
    await expect(rowsOf(page)).toHaveCount(25);
    await expect(page.getByText("Declined by Mama Lucy Hospital: No mentor on that ward this term").first()).toBeVisible();

    await cohorts.getByRole("button", { name: /Cohort B 2027/ }).click();
    await expect(page.getByText("No students in this cohort yet")).toBeVisible();
  });

  test("filters, searches, sorts and pages on the server", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/coordinator/placements/planning");
    await expect(rowsOf(page)).toHaveCount(25);
    await expect(page.getByText("Page 1 of 3")).toBeVisible();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("Page 2 of 3")).toBeVisible();
    expect(state.studentQueries.some((q) => q.get("page") === "2" && q.get("page_size") === "25")).toBe(true);

    // Pipeline step filter.
    await page.getByRole("list", { name: "Placement progress" }).getByRole("button", { name: /^12\s*Arranged/ }).click();
    await expect(rowsOf(page)).toHaveCount(12);
    await expect(page.getByText("Page 1")).toHaveCount(0);

    // Ready-to-release marker and filter.
    await expect(page.getByText("Ready to release").first()).toBeVisible();
    await page.getByLabel("Only students ready to release").click();
    await expect(page.getByLabel("Only students ready to release")).toBeChecked();
    await expect(rowsOf(page)).toHaveCount(8);

    // Status select, facility select, search.
    await page.getByLabel("Only students ready to release").click();
    await expect(page.getByLabel("Only students ready to release")).not.toBeChecked();
    await page.getByRole("combobox", { name: "Status" }).selectOption("declined");
    await expect(rowsOf(page)).toHaveCount(3);
    await page.getByRole("combobox", { name: "Status" }).selectOption("");
    await page.getByRole("combobox", { name: "Facility" }).selectOption("f2");
    await expect.poll(() => state.studentQueries.at(-1)?.get("facility_id")).toBe("f2");
    await page.getByRole("combobox", { name: "Facility" }).selectOption("");
    await page.getByRole("searchbox", { name: "Search students" }).fill("Student 07");
    await expect(rowsOf(page)).toHaveCount(1);
    await expect(rowsOf(page).first()).toContainText("RC/1007/2024");

    // Sorting by name toggles direction and is announced.
    await page.getByRole("searchbox", { name: "Search students" }).fill("");
    await page.getByRole("button", { name: "Student", exact: true }).click();
    await expect(page.getByRole("columnheader", { name: "Student", exact: true })).toHaveAttribute("aria-sort", "ascending");
    await page.getByRole("button", { name: "Student", exact: true }).click();
    await expect(page.getByRole("columnheader", { name: "Student", exact: true })).toHaveAttribute("aria-sort", "descending");

    // A search with no matches shows the empty state with a way back.
    await page.getByRole("searchbox", { name: "Search students" }).fill("zzzz");
    await expect(page.getByText("No students match")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(rowsOf(page)).toHaveCount(25);
  });

  test("previews the facility split for the whole filter and confirms it, then opens the result", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/coordinator/placements/planning");
    await page.getByRole("combobox", { name: "Status" }).selectOption("not_requested");
    await expect(rowsOf(page)).toHaveCount(12);

    await page.getByRole("checkbox", { name: "Select all students on this page" }).check();
    await expect(page.getByRole("status").filter({ hasText: "12 selected" })).toBeVisible();
    await page.getByRole("button", { name: "Request facilities" }).click();

    const dialog = page.getByRole("dialog", { name: "Request facilities" });
    await expect(dialog.getByText("12 students selected")).toBeVisible();
    const split = dialog.getByRole("table", { name: /shared across facilities/ });
    await expect(split.getByRole("row", { name: /Kenyatta National Hospital/ })).toContainText("14");
    await expect(split.getByRole("row", { name: /Mama Lucy Hospital/ })).toBeVisible();
    await expect(dialog.getByText("Mama Lucy Hospital would receive 3 requests for 2 free places.")).toBeVisible();
    expect(state.previews.at(-1)).toMatchObject({ mode: "capacity", basis: "wards", preview: true });
    expect(state.previews.at(-1)?.placement_ids).toHaveLength(12);

    // Nothing is sent until confirmed; the applied plan is the reviewed one.
    expect(state.applied).toHaveLength(0);
    const seen = state.previews.at(-1)!;
    await dialog.getByRole("button", { name: /Send 12 requests/ }).click();
    await expect(page).toHaveURL(/\/coordinator\/placements\/runs\/run-1$/);
    expect(state.applied).toHaveLength(1);
    expect(state.applied[0]).toMatchObject({ seed: seen.seed, expected_plan_hash: "a".repeat(64), preview: false });
    await expect(page.getByRole("heading", { name: "Allocation result", level: 2 })).toBeVisible();
  });

  test("one button shares everyone who still needs a facility, after a preview", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/coordinator/placements/planning");
    const card = page.getByRole("heading", { name: "Place everyone who still needs a facility" });
    await expect(card).toBeVisible();
    await expect(page.getByText(/15 students still need a facility/)).toBeVisible();
    await page.getByRole("button", { name: "Share automatically" }).click();

    const dialog = page.getByRole("dialog", { name: "Share the cohort across partner facilities" });
    await expect(dialog.getByText(/15 students in Cohort A 2027 still need a facility/)).toBeVisible();
    await expect(dialog.getByText("15 students have no placement yet; one is created for them when you send.")).toBeVisible();
    await expect(dialog.getByText("14 would be left without a request")).toBeVisible();
    expect(state.applied).toHaveLength(0);
    expect(state.previews.at(-1)).toMatchObject({ mode: "capacity", preview: true });
    expect(state.previews.at(-1)).not.toHaveProperty("placement_ids");

    const seen = state.previews.at(-1)!;
    await dialog.getByRole("button", { name: "Send 16 requests" }).click();
    await expect(page).toHaveURL(/\/coordinator\/placements\/runs\/run-1$/);
    expect(state.applied[0]).toMatchObject({ seed: seen.seed, expected_plan_hash: "b".repeat(64), preview: false });
  });

  test("selects everyone matching the filter across pages", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/coordinator/placements/planning");
    await page.getByRole("checkbox", { name: "Select all students on this page" }).check();
    await page.getByRole("button", { name: "Select all 60 matching" }).click();
    await expect(page.getByRole("status").filter({ hasText: "60 selected" })).toBeVisible();
    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(page.getByRole("status").filter({ hasText: "selected" })).toHaveCount(0);
  });

  test("releases selected students and reports every outcome", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/coordinator/placements/planning?status=arranged");
    await expect(rowsOf(page)).toHaveCount(12);
    await page.getByRole("checkbox", { name: /^Select Student 26/ }).check();
    await page.getByRole("checkbox", { name: /^Select Student 27/ }).check();
    await page.getByRole("button", { name: "Release to students" }).click();

    const dialog = page.getByRole("dialog", { name: "Release to students" });
    await expect(dialog.getByText("2 selected")).toBeVisible();
    await expect(dialog.getByText(/Everyone ready in Cohort A 2027 \(8\)/)).toBeVisible();
    await dialog.getByRole("button", { name: "Release 2 students" }).click();

    await expect(page.getByRole("dialog", { name: "Release result" })).toBeVisible();
    expect(state.releases[0]).toEqual({ placement_ids: ["p26", "p27"] });
    await expect(page.getByText("2 released", { exact: true })).toBeVisible();
    await expect(page.getByText("1 already released")).toBeVisible();
    await expect(page.getByText("1 not arranged yet")).toBeVisible();
    await expect(page.getByText("The mentor has not finished required training.").last()).toBeVisible();
  });

  test("shows an empty state when there is no cohort to plan, and a retryable error", async ({ page }) => {
    await mock(page, makeState(), { cohorts: false });
    await page.goto("/coordinator/placements/planning");
    await expect(page.getByText("No upcoming cohorts to plan")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to cohorts" })).toBeVisible();
  });

  test("shows an error state when planning cannot load", async ({ page }) => {
    await mock(page, makeState(), { overviewFails: true });
    await page.goto("/coordinator/placements/planning");
    await expect(page.getByRole("alert")).toContainText("We couldn’t load this page");
    await expect(page.getByRole("button", { name: /Try again/ })).toBeVisible();
  });

  test("is reachable from the Placements sub-navigation and fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mock(page, makeState());
    await page.goto("/coordinator/placements");
    const nav = page.getByRole("navigation", { name: "Placements sections" });
    await expect(nav.getByRole("link", { name: "Placements register" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Planning" }).click();
    await expect(page).toHaveURL(/\/coordinator\/placements\/planning/);
    await expect(rowsOf(page)).toHaveCount(25);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/planning-phone.png", fullPage: false });
  });
});
