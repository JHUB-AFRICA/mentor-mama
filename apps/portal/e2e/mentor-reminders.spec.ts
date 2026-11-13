import { expect, test, type Page } from "@playwright/test";

const manager = { id: "m1", email: "grace@knh.example", name: "Grace Muthoni", role: "nurse_manager", capabilities: {}, scope: { facility_id: "f1" }, must_change_password: false };

const base = {
  email: "mentor@knh.example", status: "active", last_sign_in: "2026-11-10T08:00:00Z", last_session_date: null, days_since_last_session: null,
  sessions_in_window: 0, live_placements: 1, live_students: 1, students_without_recent_session: 1, training: { required_completed: 1, required_total: 3 },
  accepting_students: true, inactive: true, remindable: true, can_remind: true, last_reminded_at: null as string | null, next_reminder_at: null as string | null,
  reason_codes: ["no_recent_session"], reasons: ["No session in 23 days"], induction_waiting: false, inductions_waiting: 0, induction_note: "",
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function makeRows() {
  return [
    { ...base, id: "a1", name: "Amina Otieno", email: "amina@knh.example", days_since_last_session: 23, last_session_date: "2026-10-20" },
    { ...base, id: "b2", name: "Brian Kamau", email: "brian@knh.example", reason_codes: ["never_logged"], reasons: ["Never logged a session"] },
    { ...base, id: "c3", name: "Carol Wanjiru", email: "carol@knh.example", last_reminded_at: daysAgo(2), next_reminder_at: daysAgo(-1), can_remind: false, reasons: ["No session in 30 days"], days_since_last_session: 30 },
    { ...base, id: "d4", name: "Daniel Invited", email: "daniel@knh.example", status: "invited", last_sign_in: null, remindable: false, can_remind: false, live_students: 0, reason_codes: ["invitation_pending"], reasons: ["Invitation not accepted yet"] },
  ];
}

type Row = ReturnType<typeof makeRows>[number];

async function mock(page: Page, rows: Row[], opts: { rejectSingle?: { status: number; code: string; message: string } } = {}) {
  const posts: Array<{ path: string; body: Record<string, unknown> }> = [];
  const markSent = (row: Row) => {
    row.last_reminded_at = new Date().toISOString();
    row.next_reminder_at = new Date(Date.now() + 3 * 86_400_000).toISOString();
    row.can_remind = false;
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ authenticated: true, user: manager });
    if (path === "/api/v1/ai/status") return json({ assistant: false, lesson_explanations: false });
    if (path === "/api/v1/mentors/activity") {
      return json({
        definition: { days: Number(url.searchParams.get("days") ?? 14), min_days: 7, max_days: 60, default_days: 14, induction_waiting_days: 7, live_states: [] },
        as_of: "2026-11-12", summary: { inactive: rows.length, induction_waiting: 0, mentors_considered: 6 }, results: rows,
      });
    }
    if (path === "/api/v1/mentors/remind" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      posts.push({ path, body });
      const due = rows.filter((row) => row.can_remind);
      due.forEach(markSent);
      return json({
        results: due.map((row) => ({ mentor_id: row.id, status: "sent", last_reminded_at: row.last_reminded_at, next_reminder_at: row.next_reminder_at })),
        summary: { sent: due.length, already_reminded: 0, not_listed: 0, remaining: 0, cap: 50 },
      }, 200);
    }
    const single = path.match(/^\/api\/v1\/mentors\/([^/]+)\/remind$/);
    if (single && request.method() === "POST") {
      posts.push({ path, body: request.postDataJSON() as Record<string, unknown> });
      if (opts.rejectSingle) return route.fulfill({ status: opts.rejectSingle.status, json: { error: { code: opts.rejectSingle.code, message: opts.rejectSingle.message } } });
      const row = rows.find((entry) => entry.id === single[1])!;
      markSent(row);
      return json({ mentor_id: row.id, status: "sent", last_reminded_at: row.last_reminded_at, next_reminder_at: row.next_reminder_at }, 201);
    }
    if (path === "/api/v1/dashboard") return json({ indicators: {} });
    if (path === "/api/v1/facility/mentors") return json({ results: [], pagination: { page: 1, page_size: 15, total_count: 0, total_pages: 1, has_next: false, has_previous: false } });
    return json([]);
  });
  return posts;
}

const card = (page: Page, name: string) => page.locator(".im-card").filter({ hasText: name });

test.describe("mentor reminders", () => {
  test("sends one reminder, then shows when and disables the button", async ({ page }) => {
    const posts = await mock(page, makeRows());
    await page.goto("/facility/mentors?view=inactive");

    // Already reminded two days ago: note shown, button disabled. Invited accounts have no button.
    await expect(card(page, "Carol Wanjiru")).toContainText("Reminded 2 days ago");
    await expect(card(page, "Carol Wanjiru").getByRole("button", { name: /Send reminder/ })).toBeDisabled();
    await expect(card(page, "Daniel Invited").getByRole("button", { name: /Send reminder/ })).toHaveCount(0);

    const amina = card(page, "Amina Otieno");
    await expect(amina.getByRole("button", { name: "Send reminder to Amina Otieno" })).toBeEnabled();
    await amina.getByRole("button", { name: /Send reminder/ }).click();

    await expect(page.getByRole("status").filter({ hasText: "Reminder sent to Amina Otieno" })).toBeVisible();
    await expect(amina).toContainText("Reminded today");
    await expect(amina.getByRole("button", { name: /Send reminder/ })).toBeDisabled();
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe("/api/v1/mentors/a1/remind");
    expect(posts[0].body).toEqual({ days: 14 });
  });

  test("bulk: confirmation shows how many, cancel sends nothing, confirm sends and disables", async ({ page }) => {
    const posts = await mock(page, makeRows());
    await page.goto("/facility/mentors?view=inactive");

    // Amina and Brian can be reminded now; Carol (2 days ago) and Daniel (invited) cannot.
    await page.getByRole("button", { name: "Remind all listed (2)" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Remind 2 mentors?" })).toBeVisible();
    await expect(dialog.getByTestId("remind-all-count")).toContainText("2 mentors will be reminded");
    await expect(dialog).toContainText("No student names are included");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(posts).toHaveLength(0);

    await page.getByRole("button", { name: "Remind all listed (2)" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send 2 reminders" }).click();
    await expect(page.getByRole("status").filter({ hasText: "2 reminders sent" })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ days: 14, all_listed: true });

    for (const name of ["Amina Otieno", "Brian Kamau"]) {
      await expect(card(page, name)).toContainText("Reminded today");
      await expect(card(page, name).getByRole("button", { name: /Send reminder/ })).toBeDisabled();
    }
    await expect(page.getByRole("button", { name: /Remind all listed/ })).toHaveCount(0);
  });

  test("a refusal from the server is shown kindly and the list refreshes", async ({ page }) => {
    await mock(page, makeRows(), { rejectSingle: { status: 429, code: "ReminderTooSoon", message: "This mentor was reminded recently. Please give them a few days before reminding again." } });
    await page.goto("/facility/mentors?view=inactive");
    await card(page, "Amina Otieno").getByRole("button", { name: /Send reminder/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "reminded recently" })).toBeVisible();
  });

  test("works on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await mock(page, makeRows());
    await page.goto("/facility/mentors?view=inactive");
    await expect(card(page, "Amina Otieno").getByRole("button", { name: /Send reminder/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remind all listed (2)" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
