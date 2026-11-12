import { expect, test, type Page } from "@playwright/test";

const manager = { id: "m1", email: "grace@knh.example", name: "Grace Muthoni", role: "nurse_manager", capabilities: {}, scope: { facility_id: "f1" }, must_change_password: false };

const row = (over: Record<string, unknown>) => ({
  id: "x", name: "Mentor", email: "mentor@knh.example", status: "active", last_sign_in: "2026-11-10T08:00:00Z", last_session_date: null,
  days_since_last_session: null, sessions_in_window: 0, live_placements: 1, live_students: 1, students_without_recent_session: 1,
  training: { required_completed: 1, required_total: 3 }, accepting_students: true, inactive: true, reason_codes: [], reasons: [],
  induction_waiting: false, inductions_waiting: 0, induction_note: "", ...over,
});

const results = [
  row({ id: "a1", name: "Amina Otieno", email: "amina@knh.example", last_session_date: "2026-10-20", days_since_last_session: 23, reason_codes: ["no_recent_session"], reasons: ["No session in 23 days"], live_students: 2, students_without_recent_session: 2 }),
  row({ id: "b2", name: "Brian Kamau", email: "brian@knh.example", reason_codes: ["never_logged"], reasons: ["Never logged a session"] }),
  row({ id: "c3", name: "Carol Wanjiru", email: "carol@knh.example", status: "invited", last_sign_in: null, live_students: 0, live_placements: 0, students_without_recent_session: 0, reason_codes: ["invitation_pending"], reasons: ["Invitation not accepted yet"] }),
  row({ id: "d4", name: "Daniel Mwangi", email: "daniel@knh.example", inactive: false, last_session_date: "2026-11-10", days_since_last_session: 2, sessions_in_window: 3, students_without_recent_session: 0, induction_waiting: true, inductions_waiting: 1, induction_note: "1 induction open for over 7 days" }),
];

function payload(days: number) {
  const list = results.filter((r) => r.inactive || r.induction_waiting);
  return {
    definition: { days, min_days: 7, max_days: 60, default_days: 14, induction_waiting_days: 7, live_states: [] },
    as_of: "2026-11-12",
    summary: { inactive: results.filter((r) => r.inactive).length, induction_waiting: 1, mentors_considered: 6 },
    results: list,
  };
}

async function mock(page: Page, opts: { empty?: boolean; failFirst?: boolean } = {}) {
  const calls: string[] = [];
  const control = { failing: Boolean(opts.failFirst) };
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ authenticated: true, user: manager });
    if (path === "/api/v1/ai/status") return json({ assistant: false, lesson_explanations: false });
    if (path === "/api/v1/mentors/activity") {
      calls.push(url.search);
      if (control.failing) {
        return route.fulfill({ status: 500, json: { error: { code: "Boom", message: "Server error" } } });
      }
      const body = payload(Number(url.searchParams.get("days") ?? 14));
      if (opts.empty) return json({ ...body, summary: { ...body.summary, inactive: 0, induction_waiting: 0 }, results: [] });
      return json(body);
    }
    if (path === "/api/v1/dashboard") return json({ indicators: {} });
    if (path === "/api/v1/facility/mentors") return json({ results: [], pagination: { page: 1, page_size: 15, total_count: 0, total_pages: 1, has_next: false, has_previous: false } });
    if (path === "/api/v1/placements") return json({ results: [], pagination: { page: 1, page_size: 50, total_count: 0, total_pages: 1, has_next: false, has_previous: false } });
    return json([]);
  });
  return Object.assign(calls, { control });
}

test.describe("inactive mentors", () => {
  test("dashboard card links to the list; list shows reasons, sorts, changes period, switches list and exports", async ({ page }) => {
    const calls = await mock(page);
    await page.goto("/facility");

    await expect(page.getByText("3 mentors may welcome a check-in")).toBeVisible();
    await expect(page.getByText("No session in 23 days", { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: "View inactive mentors" }).click();

    await expect(page).toHaveURL(/\/facility\/mentors\?view=inactive/);
    await expect(page.getByRole("tab", { name: /Inactive/ })).toHaveAttribute("aria-selected", "true");
    const list = page.getByRole("list", { name: "Mentors who may need a check-in" });
    const names = list.locator(".im-card__name");
    // Longest quiet first; mentors who never logged a session lead.
    await expect(names).toHaveText(["Brian Kamau", "Carol Wanjiru", "Amina Otieno"]);
    await expect(list.getByText("Never logged a session")).toBeVisible();
    await expect(list.getByText("Invitation not accepted yet")).toBeVisible();
    await expect(page.getByText("Daniel Mwangi")).toHaveCount(0);
    await expect(list.getByRole("link", { name: "Amina Otieno" })).toHaveAttribute("href", "/facility/mentors/a1");

    await page.getByLabel("Sort order").selectOption("quiet_shortest");
    await expect(names).toHaveText(["Amina Otieno", "Brian Kamau", "Carol Wanjiru"]);
    await page.getByLabel("Sort order").selectOption("name");
    await expect(names).toHaveText(["Amina Otieno", "Brian Kamau", "Carol Wanjiru"]);

    await page.getByLabel("Period without a session").selectOption("21");
    await expect.poll(() => calls.some((call) => call.includes("days=21"))).toBe(true);

    await page.getByLabel("Which list to show").selectOption("induction");
    await expect(page.getByRole("list", { name: "Mentors with inductions waiting" }).getByText("1 induction open for over 7 days")).toBeVisible();

    await page.getByLabel("Which list to show").selectOption("inactive");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    expect((await download).suggestedFilename()).toMatch(/^mentormama-inactive-mentors-21-days-\d{4}-\d{2}-\d{2}\.csv$/);

    await list.getByRole("link", { name: "Amina Otieno" }).click();
    await expect(page).toHaveURL(/\/facility\/mentors\/a1$/);
  });

  test("empty state is supportive", async ({ page }) => {
    await mock(page, { empty: true });
    await page.goto("/facility/mentors?view=inactive");
    await expect(page.getByText("Every mentor with students has logged a session recently")).toBeVisible();
    await page.goto("/facility");
    await expect(page.getByText("Mentors are logging sessions")).toBeVisible();
  });

  test("error state offers a retry", async ({ page }) => {
    const calls = await mock(page, { failFirst: true });
    await page.goto("/facility/mentors?view=inactive");
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    calls.control.failing = false;
    await page.getByRole("button", { name: /try again|retry/i }).first().click();
    await expect(page.locator(".im-card__name").first()).toBeVisible();
  });

  test("phone layout does not scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await mock(page);
    await page.goto("/facility/mentors?view=inactive");
    await expect(page.locator(".im-card").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/inactive-mentors-phone.png", fullPage: true });
  });
});
