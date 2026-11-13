import { expect, test, type Page } from "@playwright/test";

const manager = {
  id: "nm1", email: "grace@knh.example", name: "Grace Muthoni", role: "nurse_manager",
  capabilities: {}, scope: { facility_id: "f1", facility_name: "Kenyatta National Hospital" }, must_change_password: false,
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

type Student = { placement_id: string; name: string; registration_number: string };
type Group = {
  institution: { id: string; name: string }; cohort: { id: string; name: string };
  planned_start: string; planned_end: string; count: number; placement_ids: string[]; students: Student[];
  requested_since: string; latest_request: string;
  capacity: { free: number; capacity: number; occupied: number; mentor_places_left: number; wards: Array<Record<string, unknown>> };
  shortfall: number; over_capacity: boolean; warnings: string[];
};

function students(prefix: string, names: string[]): Student[] {
  return names.map((name, index) => ({ placement_id: `${prefix}${index + 1}`, name, registration_number: `${prefix.toUpperCase()}/${100 + index}/2024` }));
}

function makeGroups(): Group[] {
  const a = students("a", ["Faith Achieng", "Brian Otieno", "Cynthia Wairimu", "David Kamau", "Esther Njeri"]);
  const b = students("b", ["Grace Atieno", "Hassan Ali"]);
  return [
    {
      institution: { id: "i1", name: "Rosami College of Health Sciences" }, cohort: { id: "c1", name: "Cohort A 2026" },
      planned_start: "2026-12-01", planned_end: "2027-02-27", count: 5, placement_ids: a.map((s) => s.placement_id), students: a,
      requested_since: daysAgo(3), latest_request: daysAgo(1),
      capacity: {
        free: 4, capacity: 12, occupied: 8, mentor_places_left: 3,
        wards: [
          { ward_id: "w1", name: "Labour Ward", shift_pattern: "", capacity: 8, occupied: 4, free: 4, over_capacity: false },
          { ward_id: "w2", name: "Postnatal Ward", shift_pattern: "", capacity: 4, occupied: 4, free: 0, over_capacity: false },
        ],
      },
      shortfall: 1, over_capacity: true,
      warnings: ["5 students are requested but only 4 ward places are free for these dates. 1 would stay unplaced.", "Only 3 mentor places are left, so some students would need a mentor assigned later."],
    },
    {
      institution: { id: "i2", name: "MentorMAMA School of Nursing" }, cohort: { id: "c2", name: "Cohort B 2026" },
      planned_start: "2027-01-11", planned_end: "2027-03-12", count: 2, placement_ids: b.map((s) => s.placement_id), students: b,
      requested_since: daysAgo(0), latest_request: daysAgo(0),
      capacity: {
        free: 6, capacity: 12, occupied: 6, mentor_places_left: 6,
        wards: [{ ward_id: "w1", name: "Labour Ward", shift_pattern: "", capacity: 12, occupied: 6, free: 6, over_capacity: false }],
      },
      shortfall: 0, over_capacity: false, warnings: [],
    },
  ];
}

function makeState(groups: Group[] = makeGroups()) {
  return {
    groups,
    calls: [] as string[],
    previews: [] as Array<{ placement_ids: string[] }>,
    applied: [] as Array<{ placement_ids: string[]; expected_plan_hash?: string }>,
    declined: [] as Array<{ placement_ids: string[]; reason: string }>,
    failSummary: false,
    failPreview: false,
  };
}

function summaryOf(state: ReturnType<typeof makeState>) {
  const total = state.groups.reduce((sum, group) => sum + group.count, 0);
  return {
    facility_id: "f1", total_requested: total, groups: state.groups,
    capacity: total ? { free: 4, capacity: 12, occupied: 8, wards: [], mentors: { mentors: 4, accepting: 3, remaining: 3, at_limit: 1 }, window: { start: "2026-12-01", end: "2027-03-12" } } : null,
    over_capacity: total > 4, latest_run: null,
  };
}

function removeStudents(state: ReturnType<typeof makeState>, ids: string[]) {
  for (const group of state.groups) {
    group.placement_ids = group.placement_ids.filter((id) => !ids.includes(id));
    group.students = group.students.filter((student) => !ids.includes(student.placement_id));
    group.count = group.students.length;
  }
  state.groups = state.groups.filter((group) => group.count > 0);
}

async function mock(page: Page, state: ReturnType<typeof makeState>) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    state.calls.push(`${request.method()} ${path}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ data: { authenticated: true, user: manager } });
    if (path === "/api/v1/ai/status") return json({ data: { assistant: false, lesson_explanations: false } });
    if (path === "/api/v1/follow-ups/summary") return json({ data: { pending: 0, overdue: 0, student_support: 0, done: 0 } });
    if (path === "/api/v1/placements/incoming/summary") {
      if (state.failSummary) return json({ error: { code: "Boom", message: "The server had a problem." } }, 500);
      return json({ data: summaryOf(state) });
    }
    if (path === "/api/v1/placements/auto-arrange") {
      const body = request.postDataJSON() as { placement_ids: string[]; preview: boolean; expected_plan_hash?: string };
      const rows = body.placement_ids.map((id, index) => {
        const student = state.groups.flatMap((group) => group.students).find((entry) => entry.placement_id === id)!;
        return { placement_id: id, student: student.name, ward: { id: "w1", name: "Labour Ward" }, mentor: index % 2 ? { id: "m2", name: "Peter Ochieng", trained: true } : { id: "m1", name: "Mercy Wanjiku", trained: true }, issues: [] };
      });
      const unplaced = rows.length > 4 ? [{ ...rows.pop()!, ward: null, mentor: null, reason: "No free ward place for these dates" }] : [];
      if (body.preview) {
        state.previews.push({ placement_ids: body.placement_ids });
        if (state.failPreview) return json({ error: { code: "Boom", message: "Preview failed on the server." } }, 400);
        return json({
          data: {
            seed: "abcd1234", plan_hash: "a".repeat(64), strategy: "balanced", assignments: rows, unplaced,
            summary: { incoming: body.placement_ids.length, arranged: rows.length, unplaced: unplaced.length, with_mentor: rows.length, wards: [], mentors: [] },
          },
        });
      }
      state.applied.push({ placement_ids: body.placement_ids, expected_plan_hash: body.expected_plan_hash });
      removeStudents(state, rows.map((row) => row.placement_id));
      return json({ data: { run_id: "run1", seed: "abcd1234", arranged: rows, unplaced, summary: { arranged: rows.length, unplaced: unplaced.length, mentors_notified: 2 } } }, 201);
    }
    if (path === "/api/v1/placements/decline-requests") {
      const body = request.postDataJSON() as { placement_ids: string[]; reason: string };
      state.declined.push(body);
      removeStudents(state, body.placement_ids);
      return json({ data: { declined: body.placement_ids.length } });
    }
    if (path === "/api/v1/placements/allocation-runs") {
      return json({ data: [{ id: "run0", created_at: "2026-11-10T09:30:00Z", by: "Grace Muthoni", strategy: "balanced", status: "completed", arranged: 6, unplaced: 0, can_undo: true, can_retry: false }] });
    }
    if (path === "/api/v1/dashboard") return json({ data: { indicators: {} } });
    if (path === "/api/v1/mentors/activity") return json({ data: { definition: { days: 14, min_days: 7, max_days: 60, default_days: 14, induction_waiting_days: 7, live_states: [] }, as_of: "2026-11-12", summary: { inactive: 0, induction_waiting: 0, mentors_considered: 0 }, results: [] } });
    const empty = { page: 1, page_size: 50, total_count: 0, total_pages: 1, has_next: false, has_previous: false };
    if (path === "/api/v1/follow-ups") return json({ data: [], meta: { page: 1, page_size: 3, total: 0, pages: 1, counts: { pending: 0, overdue: 0, student_support: 0, done: 0 }, kinds: [], students: [] } });
    if (path === "/api/v1/facility/mentors" || path === "/api/v1/placements") return json({ data: { results: [], pagination: empty } });
    return json({ data: [] });
  });
}

test.describe("incoming placement requests", () => {
  test("shows totals, request groups, capacity warning and the students", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/facility/requests");

    await expect(page.getByRole("heading", { name: "Incoming requests", level: 2 })).toBeVisible();
    // Header totals: students waiting, schools, earliest start.
    await expect(page.getByText("Students waiting", { exact: true })).toBeVisible();
    const stats = page.locator(".pa-stats");
    await expect(stats).toContainText("7");
    await expect(stats).toContainText("Schools");
    await expect(stats).toContainText("1 Dec 2026");

    // Sidebar item with the pending badge.
    await expect(page.getByRole("link", { name: /Incoming requests/ }).or(page.getByRole("button", { name: /Incoming requests/ })).first()).toContainText("7");

    const groups = page.getByRole("list", { name: "Incoming request groups" });
    await expect(groups.getByRole("article")).toHaveCount(2);

    const rosami = page.getByRole("article", { name: /Rosami College of Health Sciences/ });
    await expect(rosami).toContainText("Cohort A 2026");
    await expect(rosami).toContainText("5students");
    await expect(rosami).toContainText("1 Dec – 27 Feb 2027");
    await expect(rosami).toContainText("Waiting 3 days");
    // Capacity warning: short by one place, the full ward is named as the limit, and mentors are short too.
    await expect(rosami.getByText("Short by 1 place")).toBeVisible();
    await expect(rosami).toContainText("5 students are requested but only 4 ward places are free");
    await expect(rosami).toContainText("Limit: Postnatal Ward is full");
    await expect(rosami).toContainText("Mentors: only 3 places left for 5 students");
    await expect(rosami.getByRole("list", { name: "Free places per ward" })).toContainText("Labour Ward");
    await expect(rosami.getByRole("list", { name: "Free places per ward" })).toContainText("Full of 4");

    const nursing = page.getByRole("article", { name: /MentorMAMA School of Nursing/ });
    await expect(nursing.getByText("Room for everyone")).toBeVisible();
    await expect(nursing).toContainText("Requested today");

    // Expand to list the students: name, registration number, dates.
    await expect(rosami.getByRole("list", { name: /Students from/ })).toHaveCount(0);
    await rosami.getByRole("button", { name: /Show 5 students/ }).click();
    const list = rosami.getByRole("list", { name: "Students from Rosami College of Health Sciences" });
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(list).toContainText("Faith Achieng");
    await expect(list).toContainText("Reg. A/100/2024");
    await expect(list).toContainText("1 Dec – 27 Feb");
    await rosami.getByRole("button", { name: /Hide students/ }).click();
    await expect(rosami.getByRole("list", { name: /Students from/ })).toHaveCount(0);

    // Recent arrangements are shown with undo.
    await expect(page.getByText("Recent arrangements")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  test("previews an arrangement first, then applies it and shows the result", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/facility/requests");

    const nursing = page.getByRole("article", { name: /MentorMAMA School of Nursing/ });
    await nursing.getByRole("button", { name: "Arrange automatically" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("2 of 2 students can be placed")).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Placed by ward" })).toContainText("Labour Ward");
    await expect(dialog.getByRole("list", { name: "Placed by ward" })).toContainText("2 students");
    await expect(dialog.getByRole("list", { name: "Placed by mentor" })).toContainText("Mercy Wanjiku");
    await expect(dialog.getByRole("list", { name: "Placed by mentor" })).toContainText("Peter Ochieng");
    // Preview only: nothing applied yet.
    expect(state.previews).toHaveLength(1);
    expect(state.applied).toHaveLength(0);

    await dialog.getByRole("button", { name: /Confirm 2 placements/ }).click();
    await expect(dialog.getByText("Arrangement complete")).toBeVisible();
    await expect(dialog.getByText(/2 arranged · 0 not placed/)).toBeVisible();
    expect(state.applied).toEqual([{ placement_ids: ["b1", "b2"], expected_plan_hash: "a".repeat(64) }]);
    await expect(dialog.getByRole("link", { name: "Open Placements register" })).toHaveAttribute("href", "/placements");
    await dialog.getByRole("button", { name: "Done" }).click();

    // Counts refresh: only the other school's group is left and the badge follows.
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.locator(".pa-stats")).toContainText("5");
    await expect(page.getByText("Students arranged", { exact: true })).toBeVisible();
  });

  test("arranges only the selected students and names the ones who cannot be placed", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/facility/requests");

    const rosami = page.getByRole("article", { name: /Rosami College/ });
    await rosami.getByRole("button", { name: /Show 5 students/ }).click();
    await rosami.getByLabel("Select Faith Achieng").check();
    await rosami.getByLabel("Select Brian Otieno").check();
    await rosami.getByRole("button", { name: "Arrange 2 selected automatically" }).click();
    await expect(page.getByRole("dialog").getByText("2 of 2 students can be placed")).toBeVisible();
    expect(state.previews[0].placement_ids).toEqual(["a1", "a2"]);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await rosami.getByLabel("Select Faith Achieng").uncheck();
    await rosami.getByLabel("Select Brian Otieno").uncheck();

    // The whole group: five students, one cannot be placed and the reason is shown.
    await rosami.getByRole("button", { name: /Hide students/ }).click();
    await rosami.getByRole("button", { name: "Arrange automatically" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("4 of 5 students can be placed; 1 cannot")).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Students who cannot be placed" })).toContainText("No free ward place for these dates");
  });

  test("shows a clear error when the preview fails and lets you retry", async ({ page }) => {
    const state = makeState();
    state.failPreview = true;
    await mock(page, state);
    await page.goto("/facility/requests");
    await page.getByRole("article", { name: /MentorMAMA School/ }).getByRole("button", { name: "Arrange automatically" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("alert")).toContainText("Preview failed on the server.");
    state.failPreview = false;
    await dialog.getByRole("button", { name: "Try again" }).click();
    await expect(dialog.getByText("2 of 2 students can be placed")).toBeVisible();
  });

  test("declining needs a reason and a confirmation", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/facility/requests");

    const rosami = page.getByRole("article", { name: /Rosami College/ });
    await rosami.getByRole("button", { name: /Show 5 students/ }).click();
    await rosami.getByLabel("Select Esther Njeri").check();
    await rosami.getByRole("button", { name: "Decline 1 selected" }).click();

    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Decline 1 student" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Reason/).fill("No");
    await expect(confirm).toBeDisabled();
    expect(state.declined).toHaveLength(0);
    await dialog.getByLabel(/Reason/).fill("Ward closed for refurbishment");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText("Sent back to the school", { exact: true })).toBeVisible();
    expect(state.declined).toEqual([{ placement_ids: ["a5"], reason: "Ward closed for refurbishment" }]);
    await expect(page.getByRole("article", { name: /Rosami College/ })).toContainText("4students");
    await expect(page.locator(".pa-stats")).toContainText("6");
  });

  test("shows a calm empty state", async ({ page }) => {
    await mock(page, makeState([]));
    await page.goto("/facility/requests");
    await expect(page.getByText("No requests waiting").first()).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  });

  test("shows an error with a way to retry", async ({ page }) => {
    const state = makeState();
    state.failSummary = true;
    await mock(page, state);
    await page.goto("/facility/requests");
    await expect(page.getByText("We could not load the incoming requests")).toBeVisible({ timeout: 20_000 });
    state.failSummary = false;
    await page.getByRole("button", { name: /try again/i }).first().click();
    await expect(page.getByRole("article")).toHaveCount(2);
  });

  test("the dashboard card links to the page", async ({ page }) => {
    await mock(page, makeState());
    await page.goto("/facility");
    const card = page.getByRole("region", { name: /Incoming placement requests: 7 students are waiting/ });
    await expect(card).toContainText("Rosami College of Health Sciences");
    await expect(card).toContainText("Short of room");
    await card.getByRole("button", { name: "Review requests" }).click();
    await expect(page).toHaveURL(/\/facility\/requests$/);
  });

  test("the dashboard has no card when nothing is waiting", async ({ page }) => {
    await mock(page, makeState([]));
    await page.goto("/facility");
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: /Incoming placement requests/ })).toHaveCount(0);
  });

  test("works on a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await mock(page, makeState());
    await page.goto("/facility/requests");
    await expect(page.getByRole("article")).toHaveCount(2);
    const rosami = page.getByRole("article", { name: /Rosami College/ });
    await rosami.getByRole("button", { name: /Show 5 students/ }).click();
    await expect(rosami.getByRole("button", { name: "Arrange automatically" })).toBeVisible();
    await expect(rosami.getByRole("button", { name: "Decline" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await rosami.getByRole("button", { name: "Arrange automatically" }).click();
    await expect(page.getByRole("dialog").getByText(/can be placed/)).toBeVisible();
    const dialogOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(dialogOverflow).toBeLessThanOrEqual(0);
  });

  test("the placements page points to the requests", async ({ page }) => {
    await mock(page, makeState());
    await page.route("**/api/v1/placements/incoming", (route) =>
      route.fulfill({ json: { data: [{ id: "a1", student: { name: "Faith Achieng" }, cohort_name: "Cohort A", planned_start: "2026-12-01", planned_end: "2027-02-27" }] } }),
    );
    await page.goto("/placements");
    const link = page.getByRole("link", { name: "Review incoming requests" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/facility\/requests$/);
  });
});
