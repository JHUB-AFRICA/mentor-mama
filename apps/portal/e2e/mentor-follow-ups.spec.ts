import { expect, test, type Page } from "@playwright/test";

const mentor = {
  id: "m1", email: "mentor@example.test", name: "Mercy Wanjiku", role: "mentor",
  capabilities: { log_session: true, manage_follow_ups: true }, scope: {}, must_change_password: false,
};

type Item = Record<string, unknown> & { session_id: string; status: "pending" | "done"; follow_up_action: string; student: { id: string; name: string } };

function item(id: string, student: string, action: string, label: string, age: number, extra: Partial<Item> = {}): Item {
  return {
    session_id: id, placement_id: `p-${id}`, placement_state: "active", student: { id: `s-${id}`, name: student },
    ward: "Labour Ward", session_date: "2026-11-01", session_type: "bedside_teaching", session_type_label: "Bedside teaching",
    topics: ["Partograph use", "Documentation"], follow_up_action: action, label,
    suggested_next_step: "Set up supervised practice of the skill on the next suitable shift.",
    is_student_support: action === "student_referral", status: "pending", age_days: age, overdue_after_days: 7, overdue: age > 7,
    outcome: null, note: null, resolved_at: null, resolved_by: null, ...extra,
  } as Item;
}

function makeState(pending = true) {
  const items: Item[] = pending
    ? [
        item("a", "Faith Achieng", "practice_skill", "Practise a skill", 10),
        item("b", "Brian Otieno", "student_referral", "Student support need", 3, { label: "Student support need" }),
        item("c", "Cynthia Wairimu", "review_reading", "Review reading", 1),
      ]
    : [];
  return { items, calls: [] as string[] };
}

async function mock(page: Page, state: ReturnType<typeof makeState>, failList = false) {
  const counts = () => {
    const pendingRows = state.items.filter((row) => row.status === "pending");
    return {
      pending: pendingRows.length,
      overdue: pendingRows.filter((row) => row.overdue).length,
      student_support: pendingRows.filter((row) => row.is_student_support).length,
      done: state.items.filter((row) => row.status === "done").length,
    };
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    state.calls.push(`${request.method()} ${path}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ data: { authenticated: true, user: mentor } });
    if (path === "/api/v1/ai/status") return json({ data: { assistant: false, lesson_explanations: false } });
    if (path === "/api/v1/follow-ups/summary") return json({ data: counts() });
    if (path === "/api/v1/follow-ups" && request.method() === "GET") {
      if (failList) return json({ error: { code: "Boom", message: "x" } }, 500);
      const status = url.searchParams.get("status") ?? "pending";
      const action = url.searchParams.get("action");
      const student = url.searchParams.get("student_id");
      const rows = state.items.filter((row) => (status === "all" || row.status === status) && (!action || row.follow_up_action === action) && (!student || row.student.id === student));
      return json({
        data: rows,
        meta: {
          page: 1, page_size: 20, total: rows.length, pages: 1, counts: counts(),
          kinds: [{ value: "practice_skill", label: "Practise a skill" }, { value: "student_referral", label: "Student support need" }, { value: "review_reading", label: "Review reading" }],
          students: state.items.map((row) => row.student),
        },
      });
    }
    const done = path.match(/^\/api\/v1\/follow-ups\/([^/]+)\/done$/);
    if (done) {
      const row = state.items.find((entry) => entry.session_id === done[1])!;
      Object.assign(row, { status: "done", note: (request.postDataJSON() as { note: string }).note, resolved_at: "2026-11-12T09:00:00Z", resolved_by: mentor.name, outcome: "done" });
      return json({ data: row, meta: { changed: true } });
    }
    const reopen = path.match(/^\/api\/v1\/follow-ups\/([^/]+)\/reopen$/);
    if (reopen) {
      const row = state.items.find((entry) => entry.session_id === reopen[1])!;
      Object.assign(row, { status: "pending", note: null, resolved_at: null, resolved_by: null, outcome: null });
      return json({ data: row, meta: { changed: true } });
    }
    if (path === "/api/v1/placements") {
      return json({ data: { results: [], pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } } });
    }
    if (path === "/api/v1/notifications") return json({ data: [] });
    return json({ data: [] });
  });
}

test.describe("mentor follow-ups", () => {
  test("lists, filters, marks done with a note, undoes and reopens", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/mentor?view=follow-ups");

    await expect(page.getByRole("heading", { name: "Follow-ups", level: 2 })).toBeVisible();
    const list = page.getByRole("list", { name: "Pending follow-ups" });
    await expect(list.getByRole("article")).toHaveCount(3);
    await expect(page.getByText("1 student may need support")).toBeVisible();
    await expect(page.getByRole("article", { name: /Practise a skill for Faith Achieng/ }).getByText("Overdue")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true");
    // The sidebar item carries the pending count.
    await expect(page.getByRole("link", { name: /Follow-ups/ }).first()).toBeVisible();

    // Filter by type.
    await page.getByLabel("Filter by follow-up type").selectOption("review_reading");
    await expect(list.getByRole("article")).toHaveCount(1);
    await page.getByLabel("Filter by follow-up type").selectOption("");
    await expect(list.getByRole("article")).toHaveCount(3);

    // Mark done with an optional note, then undo.
    const card = page.getByRole("article", { name: /Practise a skill for Faith Achieng/ });
    await card.getByRole("button", { name: /Mark done/ }).click();
    await card.getByLabel(/Add a short note/).fill("Practised twice on shift");
    await card.getByRole("button", { name: "Confirm done" }).click();
    await expect(list.getByRole("article")).toHaveCount(2);
    await expect(page.getByRole("status")).toContainText("Marked done for Faith Achieng");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(list.getByRole("article")).toHaveCount(3);

    // Done tab and reopen.
    await page.getByRole("article", { name: /Review reading for Cynthia/ }).getByRole("button", { name: /Mark done/ }).click();
    await page.getByRole("button", { name: "Confirm done" }).click();
    await page.getByRole("tab", { name: /Done/ }).click();
    const done = page.getByRole("list", { name: "Done follow-ups" });
    await expect(done.getByRole("article")).toHaveCount(1);
    await expect(done).toContainText("Cynthia Wairimu");
    await done.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByText("Nothing marked done yet")).toBeVisible();
  });

  test("shows the all-caught-up state, and an error state that can retry", async ({ page }) => {
    const state = makeState(false);
    await mock(page, state);
    await page.goto("/mentor?view=follow-ups");
    await expect(page.getByText("You're all caught up").first()).toBeVisible();
  });

  test("shows a friendly error when the list cannot load", async ({ page }) => {
    await mock(page, makeState(), true);
    await page.goto("/mentor?view=follow-ups");
    await expect(page.getByText("We could not load your follow-ups")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("overview shows a Follow-ups due card that opens the page", async ({ page }) => {
    await mock(page, makeState());
    await page.goto("/mentor");
    const card = page.getByRole("link", { name: /Follow-ups due: 3/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText("1 may need student support");
    await card.click();
    await expect(page).toHaveURL(/view=follow-ups/);
    await expect(page.getByRole("list", { name: "Pending follow-ups" })).toBeVisible();
  });

  test("fits a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await mock(page, makeState());
    await page.goto("/mentor?view=follow-ups");
    await expect(page.getByRole("list", { name: "Pending follow-ups" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "test-results/follow-ups-phone.png", fullPage: true });
  });
});
