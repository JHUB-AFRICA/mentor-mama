/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed API mocks */
import { expect, test, type Page } from "@playwright/test";

const coordinator = {
  id: "co1", email: "coordinator@example.test", name: "Amina Mwangi", role: "coordinator",
  capabilities: { request_facility: true, release_placement: true, create_placement: true },
  scope: { institution_id: "i1", institution_name: "Rosami College of Health Sciences" }, must_change_password: false,
};

type Row = Record<string, any>;

function placed(n: number, mode: "auto_arrange" | "facility_split"): Row {
  const split = mode === "facility_split";
  return {
    placement_id: `p${n}`, student: `Placed Student ${String(n).padStart(2, "0")}`, registration_number: `RC/${2000 + n}/2024`, cohort: "Cohort A 2027",
    outcome: split ? "requested" : "placed",
    facility: { id: "f1", name: "Kenyatta National Hospital", ...(split ? { requested: true } : {}) },
    ward: split ? null : { id: "w1", name: n % 2 ? "Labour Ward" : "Postnatal Ward" },
    mentor: split ? null : { id: "m1", name: "Mercy Wanjiku" },
    planned_start: "2027-01-11", planned_end: "2027-03-12", state: "draft", status: split ? "requested" : "arranged", status_label: split ? "Requested of a facility" : "Arranged",
    reason: "", issues: [], moved_since: n === 3 && !split,
  };
}
function unplaced(n: number): Row {
  return {
    placement_id: `u${n}`, student: `Unplaced Student ${n}`, registration_number: `RC/${3000 + n}/2024`, cohort: "Cohort A 2027", outcome: "unplaced",
    facility: null, ward: null, mentor: null, planned_start: "2027-01-11", planned_end: "2027-03-12", state: "draft", status: "not_requested", status_label: "Awaiting a facility request",
    reason: "Every ward is full for these dates.", issues: [], moved_since: false,
  };
}

function makeRun(mode: "auto_arrange" | "facility_split", flags: { can_undo?: boolean; can_retry?: boolean } = {}) {
  const split = mode === "facility_split";
  const rows = [...Array.from({ length: 30 }, (_, i) => placed(i + 1, mode)), unplaced(1), unplaced(2)];
  return {
    rows,
    run: { id: "run-9", mode, status: "partial", strategy: split ? "capacity" : "balanced", seed: "k3x9q2", plan_hash: "h", created_at: "2026-12-01T09:30:00Z", by: split ? "Amina Mwangi" : "Grace Muthoni",
      facility: split ? null : { id: "f1", name: "Kenyatta National Hospital" }, institution: { id: "i1", name: "Rosami College of Health Sciences" },
      can_undo: flags.can_undo ?? false, can_retry: flags.can_retry ?? false, retried_by: null },
    summary: { requested: 32, placed: 30, unplaced: 2, with_mentor: split ? 0 : 29, without_mentor: split ? 0 : 1,
      unplaced_reasons: [{ reason: "Every ward is full for these dates.", count: 2 }] },
    facilities: split
      ? [{ facility_id: "f1", name: "Kenyatta National Hospital", requested: 22 }, { facility_id: "f2", name: "Mama Lucy Hospital", requested: 8 }]
      : [{ facility_id: "f1", name: "Kenyatta National Hospital", capacity: 40, before: 8, added: 30, after: 38, free_after: 2 }],
    wards: split ? [] : [
      { id: "w1", name: "Labour Ward", capacity: 20, before: 4, added: 15, after: 19, free_after: 1 },
      { id: "w2", name: "Postnatal Ward", capacity: 20, before: 4, added: 15, after: 19, free_after: 1 },
    ],
    mentors: split ? [] : [{ id: "m1", name: "Mercy Wanjiku", assigned_in_run: 29, open_placements_now: 33, limit: 40, remaining_now: 7 }],
  };
}

function makeState(mode: "auto_arrange" | "facility_split" = "auto_arrange", flags: { can_undo?: boolean; can_retry?: boolean } = {}) {
  return { fixture: makeRun(mode, flags), calls: [] as string[], undone: 0, retried: 0, withdrawn: [] as string[][], detailQueries: [] as URLSearchParams[], applied: [] as Record<string, any>[] };
}

async function mock(page: Page, state: ReturnType<typeof makeState>, options: { detailFails?: boolean; runs?: unknown[]; runsFail?: boolean } = {}) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    state.calls.push(`${request.method()} ${path}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ data: { authenticated: true, user: coordinator } });
    if (path === "/api/v1/ai/status") return json({ data: { assistant: false, lesson_explanations: false } });
    if (path === "/api/v1/placements/allocation-runs" && request.method() === "GET") {
      if (options.runsFail) return json({ error: { code: "Boom", message: "x" } }, 500);
      return json({ data: options.runs ?? [] });
    }
    const undo = path.match(/^\/api\/v1\/placements\/allocation-runs\/([^/]+)\/undo$/);
    if (undo) { state.undone += 1; return json({ data: { run_id: undo[1], reverted: 28, kept: [{ student: "Placed Student 03", reason: "Already moved on, so it was left as it is." }] } }); }
    const retry = path.match(/^\/api\/v1\/placements\/allocation-runs\/([^/]+)\/retry$/);
    if (retry) { state.retried += 1; return json({ data: { run_id: "run-10", seed: "z", arranged: [], unplaced: [], summary: { arranged: 1, unplaced: 1, mentors_notified: 0 } } }, 201); }
    const detail = path.match(/^\/api\/v1\/placements\/allocation-runs\/([^/]+)$/);
    if (detail) {
      if (options.detailFails || detail[1] === "missing") return json({ error: { code: "NotFound", message: "We couldn’t find that allocation run." } }, 404);
      const q = url.searchParams;
      state.detailQueries.push(q);
      let rows = state.fixture.rows.slice();
      if (detail[1] === "run-10") rows = [unplaced(2)];
      const outcome = q.get("outcome");
      if (outcome) rows = rows.filter((r) => r.outcome === outcome);
      const term = (q.get("search") ?? "").toLowerCase();
      if (term) rows = rows.filter((r) => r.student.toLowerCase().includes(term));
      const size = Number(q.get("page_size") ?? 100);
      const p = Number(q.get("page") ?? 1);
      const pages = Math.max(1, Math.ceil(rows.length / size));
      const { rows: _all, ...rest } = state.fixture;
      void _all;
      return json({ data: { ...rest, run: { ...rest.run, id: detail[1] }, placements: rows.slice((p - 1) * size, p * size),
        pagination: { page: p, page_size: size, total_count: rows.length, total_pages: pages, has_next: p < pages, has_previous: p > 1 },
        downloads: { endpoint: "placements/allocation-list", params: { run_id: detail[1] }, formats: ["csv", "xlsx", "pdf"] }, detail_available: true } });
    }
    if (path === "/api/v1/placements/withdraw-requests") { state.withdrawn.push((request.postDataJSON() as Record<string, any>).placement_ids); return json({ data: { withdrawn: 30 } }); }
    if (path === "/api/v1/placements/options") {
      return json({ data: { cohorts: [], students: [], wards: [
        { id: "w1", name: "Labour Ward", facility_id: "f1", facility_name: "Kenyatta National Hospital" },
        { id: "w2", name: "Postnatal Ward", facility_id: "f2", facility_name: "Mama Lucy Hospital" },
      ] } });
    }
    if (path === "/api/v1/placements/facility-requests") {
      const body = request.postDataJSON() as Record<string, any>;
      if (body.preview) {
        return json({ data: { seed: body.seed, mode: body.mode, basis: body.basis, plan_hash: "b".repeat(64),
          facilities: [{ facility_id: "f1", name: "Kenyatta National Hospital", free_capacity: 5, usable_capacity: 5, requested: 1, pending_requests: 0, mentor_places_left: 3 },
            { facility_id: "f2", name: "Mama Lucy Hospital", free_capacity: 5, usable_capacity: 5, requested: 1, pending_requests: 0, mentor_places_left: 3 }],
          assignments: body.placement_ids.map((id: string, i: number) => ({ placement_id: id, student: id, facility_id: i ? "f2" : "f1" })), unplaced: [], skipped: [], warnings: [],
          window: { start: "2027-01-11", end: "2027-03-12" } } });
      }
      state.applied.push(body);
      return json({ data: { run_id: "run-10", seed: body.seed, requested: 2, by_facility: {}, unplaced: [], skipped: [] } }, 201);
    }
    return json({ data: [] });
  });
}

const resultRows = (page: Page) => page.getByRole("table", { name: "Students in this allocation run" }).locator("tbody tr");

test.describe("allocation result", () => {
  test("shows the summary, capacity before and after, mentor spread and unplaced reasons", async ({ page }) => {
    await mock(page, makeState("auto_arrange", { can_retry: true, can_undo: true }));
    await page.goto("/coordinator/placements/runs/run-9");

    await expect(page.getByRole("heading", { name: "Allocation result", level: 2 })).toBeVisible();
    await expect(page.getByText(/Run by Grace Muthoni/)).toBeVisible();
    await expect(page.getByText(/Shuffle code k3x9q2/)).toBeVisible();
    await expect(page.getByText("Partly placed").first()).toBeVisible();

    const stats = page.locator(".pa-stats");
    await expect(stats).toContainText("32");
    await expect(stats).toContainText("30");
    await expect(stats).toContainText("29 with a mentor");

    // Why some students were not placed, in plain language.
    const why = page.getByRole("region", { name: "Why some students were not placed" });
    await expect(why.getByRole("list", { name: "Reasons students were not placed" })).toContainText("2 students: Every ward is full for these dates.");

    // Capacity bars with an accessible summary, and the mentor spread.
    await expect(page.getByRole("img", { name: /Labour Ward: 4 taken before, 15 added, capacity 20/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Kenyatta National Hospital: 8 places taken before, 30 added, capacity 40/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Mercy Wanjiku: 29 students in this run, limit 40/ })).toBeVisible();
    await expect(page.getByText("29 in this run · 7 places left")).toBeVisible();

    // Students table: first page, then the changed-since flag.
    await expect(resultRows(page)).toHaveCount(25);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(resultRows(page)).toHaveCount(7);
    await expect(page.getByRole("link", { name: "Back to planning" })).toHaveAttribute("href", "/coordinator/placements/planning");
  });

  test("filters the students, searches them and shows unplaced reasons per student", async ({ page }) => {
    const state = makeState("auto_arrange");
    await mock(page, state);
    await page.goto("/coordinator/placements/runs/run-9");
    await expect(resultRows(page)).toHaveCount(25);

    await page.getByRole("button", { name: /^Unplaced \(2\)/ }).click();
    await expect(resultRows(page)).toHaveCount(2);
    await expect(resultRows(page).first()).toContainText("Every ward is full for these dates.");

    await page.getByRole("button", { name: /^Placed \(30\)/ }).click();
    await expect(resultRows(page)).toHaveCount(25);
    expect(state.detailQueries.some((q) => q.get("outcome") === "placed")).toBe(true);

    await page.getByRole("searchbox", { name: "Search the students in this run" }).fill("Student 07");
    await expect(resultRows(page)).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Search the students in this run" }).fill("nobody");
    await expect(page.getByText("No students match")).toBeVisible();
  });

  test("retries the unplaced students and opens the new result", async ({ page }) => {
    const state = makeState("auto_arrange", { can_retry: true });
    await mock(page, state);
    await page.goto("/coordinator/placements/runs/run-9");
    await page.getByRole("region", { name: "Why some students were not placed" }).getByRole("button", { name: "Retry unplaced" }).click();
    await expect(page).toHaveURL(/\/runs\/run-10$/);
    expect(state.retried).toBe(1);
  });

  test("asks for confirmation that explains what undo reverts, then undoes", async ({ page }) => {
    const state = makeState("auto_arrange", { can_undo: true });
    await mock(page, state);
    await page.goto("/coordinator/placements/runs/run-9");
    await page.getByRole("button", { name: "Undo this arrangement" }).click();

    const dialog = page.getByRole("dialog", { name: "Undo this arrangement?" });
    await expect(dialog).toContainText("back to the facility’s incoming queue");
    await expect(dialog).toContainText("already moved on");
    await expect(dialog).toContainText("within 24 hours");
    expect(state.undone).toBe(0);

    await dialog.getByRole("button", { name: "Keep the arrangement" }).click();
    expect(state.undone).toBe(0);
    await page.getByRole("button", { name: "Undo this arrangement" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Undo for 30 students" }).click();
    await expect(page.getByText("28 students back in the incoming queue; 1 had already moved on")).toBeVisible();
    expect(state.undone).toBe(1);
  });

  test("a facility request run offers other facilities for the unplaced and can withdraw waiting requests", async ({ page }) => {
    const state = makeState("facility_split");
    await mock(page, state);
    await page.goto("/coordinator/placements/runs/run-9");
    await expect(page.getByText("Requests per facility")).toBeVisible();
    await expect(page.getByRole("img", { name: "Kenyatta National Hospital: 22 students requested" })).toBeVisible();
    await expect(page.getByText("Mentor spread")).toHaveCount(0);

    await page.getByRole("button", { name: "Choose other facilities" }).click();
    const dialog = page.getByRole("dialog", { name: "Request facilities" });
    await expect(dialog.getByText("2 students selected")).toBeVisible();
    await dialog.getByRole("checkbox", { name: /Mama Lucy Hospital/ }).check();
    await dialog.getByRole("checkbox", { name: /Kenyatta National Hospital/ }).check();
    await dialog.getByRole("button", { name: /Send 2 requests/ }).click();
    await expect(page).toHaveURL(/\/runs\/run-10$/);
    expect(state.applied[0]).toMatchObject({ expected_plan_hash: "b".repeat(64) });

    await page.goto("/coordinator/placements/runs/run-9");
    await page.getByRole("button", { name: "Withdraw waiting requests" }).click();
    await page.getByRole("dialog", { name: "Withdraw the waiting requests?" }).getByRole("button", { name: "Withdraw requests" }).click();
    await expect(page.getByText("30 students no longer requested.")).toBeVisible();
    expect(state.withdrawn[0]).toHaveLength(30);
  });

  test("shows an error with a way back when the run cannot be opened", async ({ page }) => {
    await mock(page, makeState());
    await page.goto("/coordinator/placements/runs/missing");
    await expect(page.getByRole("alert")).toContainText("We couldn’t open this result");
    await expect(page.getByRole("alert")).toContainText("We couldn’t find that allocation run.");
    await expect(page.getByRole("link", { name: "Back to allocation runs" })).toBeVisible();
  });

  test("lists allocation runs, filters by type and opens one", async ({ page }) => {
    const runs = [
      { id: "run-9", mode: "auto_arrange", created_at: "2026-12-01T09:30:00Z", by: "Grace Muthoni", strategy: "balanced", status: "partial", facility_id: "f1", facility_name: "Kenyatta National Hospital", arranged: 30, unplaced: 2, requested: null, can_undo: false, can_retry: false },
      { id: "run-8", mode: "facility_split", created_at: "2026-11-28T14:00:00Z", by: "Amina Mwangi", strategy: "capacity", status: "completed", facility_id: null, facility_name: null, arranged: 0, unplaced: 0, requested: 40, can_undo: false, can_retry: false },
    ];
    await mock(page, makeState(), { runs });
    await page.goto("/coordinator/placements/runs");
    await expect(page.getByRole("navigation", { name: "Placements sections" }).getByRole("link", { name: "Allocation runs" })).toHaveAttribute("aria-current", "page");
    const table = page.getByRole("table", { name: "Recent allocation runs" });
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table).toContainText("Grace Muthoni");
    await expect(table).toContainText("In proportion to free places");
    await table.getByRole("link", { name: /1 Dec 2026/ }).click();
    await expect(page).toHaveURL(/\/runs\/run-9$/);
    await expect(page.getByRole("heading", { name: "Allocation result", level: 2 })).toBeVisible();
  });

  test("shows empty and error states for the runs list", async ({ page }) => {
    await mock(page, makeState(), { runs: [] });
    await page.goto("/coordinator/placements/runs");
    await expect(page.getByText("No allocation runs yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Plan the next cohort" })).toBeVisible();

    const failing = await page.context().newPage();
    await mock(failing, makeState(), { runsFail: true });
    await failing.goto("/coordinator/placements/runs");
    await expect(failing.getByRole("alert")).toContainText("We couldn’t load the allocation runs");
    await expect(failing.getByRole("button", { name: /Try again/ })).toBeVisible();
  });

  test("fits a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mock(page, makeState("auto_arrange", { can_retry: true, can_undo: true }));
    await page.goto("/coordinator/placements/runs/run-9");
    await expect(resultRows(page)).toHaveCount(25);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/result-phone.png", fullPage: true });
  });
});
