import { expect, test, type Page } from "@playwright/test";

const manager = {
  id: "nm1", email: "grace@knh.example", name: "Grace Muthoni", role: "nurse_manager",
  capabilities: { manage_follow_ups: true }, scope: { facility_id: "f1", facility_name: "Kenyatta National Hospital" }, must_change_password: false,
};

type Item = Record<string, unknown> & { session_id: string; status: "pending" | "done"; mentor: { id: string; name: string }; student: { id: string; name: string }; age_days: number };

function item(id: string, student: string, mentor: { id: string; name: string }, age: number): Item {
  return {
    session_id: id, placement_id: `p-${id}`, placement_state: "active", student: { id: `s-${id}`, name: student }, mentor,
    ward: "Labour Ward", session_date: "2026-11-01", session_type: "bedside_teaching", session_type_label: "Bedside teaching",
    topics: ["Partograph use", "Documentation"], follow_up_action: "supervisor_follow_up", label: "Supervisor review",
    suggested_next_step: "Speak to the nurse manager about what was raised and agree who acts.", is_student_support: false,
    status: "pending", age_days: age, overdue_after_days: 7, overdue: age > 7, outcome: null, note: null, resolved_at: null, resolved_by: null,
  } as Item;
}

const mercy = { id: "m1", name: "Mercy Wanjiku" };
const peter = { id: "m2", name: "Peter Ochieng" };

function makeState(rows: Item[]) {
  return { items: rows, calls: [] as string[], queries: [] as string[] };
}

async function mock(page: Page, state: ReturnType<typeof makeState>, opts: { failList?: boolean } = {}) {
  const control = { failing: Boolean(opts.failList) };
  const counts = () => {
    const pending = state.items.filter((row) => row.status === "pending");
    return { pending: pending.length, overdue: pending.filter((row) => row.age_days > 7).length, student_support: 0, done: state.items.length - pending.length };
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    state.calls.push(`${request.method()} ${path}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ data: { authenticated: true, user: manager } });
    if (path === "/api/v1/ai/status") return json({ data: { assistant: false, lesson_explanations: false } });
    if (path === "/api/v1/follow-ups/summary") return json({ data: counts() });
    if (path === "/api/v1/follow-ups" && request.method() === "GET") {
      state.queries.push(url.search);
      if (control.failing) return json({ error: { code: "Boom", message: "x" } }, 500);
      const status = url.searchParams.get("status") ?? "pending";
      const mentor = url.searchParams.get("mentor_id");
      const student = url.searchParams.get("student_id");
      const minAge = Number(url.searchParams.get("min_age_days") ?? 0);
      const pageSize = Number(url.searchParams.get("page_size") ?? 20);
      const rows = state.items.filter((row) => row.status === status && (!mentor || row.mentor.id === mentor) && (!student || (row.student as { id: string }).id === student) && row.age_days >= minAge);
      return json({
        data: rows.slice(0, pageSize),
        meta: {
          page: 1, page_size: pageSize, total: rows.length, pages: 1, counts: counts(), kinds: [],
          students: state.items.map((row) => row.student), mentors: [mercy, peter],
        },
      });
    }
    const done = path.match(/^\/api\/v1\/follow-ups\/([^/]+)\/done$/);
    if (done) {
      const row = state.items.find((entry) => entry.session_id === done[1])!;
      Object.assign(row, { status: "done", note: (request.postDataJSON() as { note: string }).note, resolved_at: "2026-11-12T09:00:00Z", resolved_by: manager.name, outcome: "done" });
      return json({ data: row, meta: { changed: true } });
    }
    const reopen = path.match(/^\/api\/v1\/follow-ups\/([^/]+)\/reopen$/);
    if (reopen) {
      const row = state.items.find((entry) => entry.session_id === reopen[1])!;
      Object.assign(row, { status: "pending", note: null, resolved_at: null, resolved_by: null, outcome: null });
      return json({ data: row, meta: { changed: true } });
    }
    if (path === "/api/v1/mentors/activity") return json({ data: { definition: { days: 14, min_days: 7, max_days: 60, default_days: 14, induction_waiting_days: 7, live_states: [] }, as_of: "2026-11-12", summary: { inactive: 0, induction_waiting: 0, mentors_considered: 0 }, results: [] } });
    const empty = { page: 1, page_size: 50, total_count: 0, total_pages: 1, has_next: false, has_previous: false };
    if (path === "/api/v1/dashboard") return json({ data: { indicators: {} } });
    if (path === "/api/v1/facility/mentors" || path === "/api/v1/placements") return json({ data: { results: [], pagination: empty } });
    return json({ data: [] });
  });
  return control;
}

const seed = () => [
  item("a", "Faith Achieng", mercy, 10),
  item("b", "Brian Otieno", peter, 3),
  item("c", "Cynthia Wairimu", mercy, 1),
];

test.describe("supervisor follow-ups", () => {
  test("lists, filters, marks done with a note, undoes, and shows the done tab", async ({ page }) => {
    const state = makeState(seed());
    await mock(page, state);
    await page.goto("/facility/follow-ups");

    await expect(page.getByRole("heading", { name: "Supervisor follow-ups", level: 2 })).toBeVisible();
    const list = page.getByRole("list", { name: "Pending supervisor follow-ups" });
    await expect(list.getByRole("article")).toHaveCount(3);
    await expect(page.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true");

    // Sidebar item with the pending badge.
    await expect(page.getByRole("link", { name: /Follow-ups/ }).or(page.getByRole("button", { name: /Follow-ups/ })).first()).toContainText("3");

    // Card content: student, ward, who asked, date and topics, overdue chip, reason line, links.
    const faith = page.getByRole("article", { name: /Supervisor review for Faith Achieng/ });
    await expect(faith).toContainText("Labour Ward");
    await expect(faith).toContainText("Bedside teaching on 1 Nov 2026");
    await expect(faith).toContainText("Partograph use · Documentation");
    await expect(faith).toContainText("10 days ago");
    await expect(faith.getByText("Overdue")).toBeVisible();
    await expect(faith).toContainText("Mercy Wanjiku asked for your review after a bedside teaching session");
    await expect(faith.getByRole("link", { name: "Faith Achieng" })).toHaveAttribute("href", "/placements/p-a");
    await expect(faith.getByRole("link", { name: "Mentor", exact: true })).toHaveAttribute("href", "/facility/mentors/m1");
    await expect(page.getByRole("article", { name: /for Cynthia/ }).getByText("Overdue")).toHaveCount(0);

    // Filters: mentor, student, age.
    await page.getByLabel("Filter by mentor").selectOption("m2");
    await expect(list.getByRole("article")).toHaveCount(1);
    await page.getByLabel("Filter by mentor").selectOption("");
    await page.getByLabel("Filter by student").selectOption("s-c");
    await expect(list.getByRole("article")).toHaveCount(1);
    await page.getByLabel("Filter by student").selectOption("");
    await page.getByLabel("Filter by age").selectOption("7");
    await expect(list.getByRole("article")).toHaveCount(1);
    expect(state.queries.some((query) => query.includes("min_age_days=7"))).toBe(true);
    await page.getByLabel("Filter by age").selectOption("");
    await expect(list.getByRole("article")).toHaveCount(3);

    // Mark done with a note, then undo.
    await faith.getByRole("button", { name: /Mark done/ }).click();
    await faith.getByLabel(/Add a short note/).fill("Spoke to Mercy and agreed a plan");
    await faith.getByRole("button", { name: "Confirm done" }).click();
    await expect(list.getByRole("article")).toHaveCount(2);
    await expect(page.getByRole("status").filter({ hasText: "Marked done for Faith Achieng" })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(list.getByRole("article")).toHaveCount(3);

    // Done tab and reopen.
    await page.getByRole("article", { name: /for Cynthia/ }).getByRole("button", { name: /Mark done/ }).click();
    await page.getByRole("button", { name: "Confirm done" }).click();
    await page.getByRole("tab", { name: /Done/ }).click();
    const doneList = page.getByRole("list", { name: "Done supervisor follow-ups" });
    await expect(doneList.getByRole("article")).toHaveCount(1);
    await expect(doneList).toContainText("by Grace Muthoni");
    await doneList.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByText("Nothing marked done yet")).toBeVisible();
    await page.getByRole("tab", { name: /Pending/ }).click();
    await expect(page.getByRole("list", { name: "Pending supervisor follow-ups" }).getByRole("article")).toHaveCount(3);
  });

  test("shows a calm empty state, and an error with retry", async ({ page }) => {
    const state = makeState([]);
    await mock(page, state);
    await page.goto("/facility/follow-ups");
    await expect(page.getByText("Nothing waiting for you")).toBeVisible();

    const failing = makeState(seed());
    const control = await mock(page, failing, { failList: true });
    await page.goto("/facility/follow-ups?x=1");
    await expect(page.getByText("We could not load the follow-ups")).toBeVisible({ timeout: 20_000 });
    control.failing = false;
    await page.getByRole("button", { name: /try again|retry/i }).first().click();
    await expect(page.getByRole("article")).toHaveCount(3);
  });

  test("dashboard shows an attention card that links to the page", async ({ page }) => {
    const state = makeState(seed());
    await mock(page, state);
    await page.goto("/facility");
    const card = page.getByRole("region", { name: /3 supervisor follow-ups are waiting/ });
    await expect(card).toContainText("1 has been waiting over a week");
    await expect(card).toContainText("Asked by Mercy Wanjiku");
    await card.getByRole("button", { name: "Open follow-ups" }).click();
    await expect(page).toHaveURL(/\/facility\/follow-ups$/);
  });

  test("works on a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await mock(page, makeState(seed()));
    await page.goto("/facility/follow-ups");
    await expect(page.getByRole("article")).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("article").first().getByRole("button", { name: /Mark done/ })).toBeVisible();
  });
});
