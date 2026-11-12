import { expect, test, type Page } from "@playwright/test";

const admin = {
  id: "pa1", email: "admin@programme.example", name: "Programme Administrator", role: "program_admin",
  capabilities: { manage_induction_template: true }, scope: {}, must_change_password: false,
};

type Item = {
  section: string; label: string; guidance: string; is_required: boolean;
  completed_by_role: string; response_kind: string;
};

const item = (section: string, label: string, extra: Partial<Item> = {}): Item => ({
  section, label, guidance: "", is_required: true, completed_by_role: "mentor", response_kind: "standard", ...extra,
});

function summary(overrides: Record<string, unknown>) {
  return {
    id: "t1", version: 1, status: "published", title: "", notes: "", source: "", created_at: "2026-07-01T08:00:00Z",
    published_at: "2026-07-01T08:00:00Z", retired_at: null, item_count: 2, required_count: 2,
    checklists: { in_progress: 3, completed: 12 }, editable: false, ...overrides,
  };
}

function makeState() {
  const v1Items = [item("", "Student welcomed and introduced to the ward team."), item("", "Student oriented to shift times and reporting lines.")];
  const enhanced = [
    item("Welcome and introductions", "Student welcomed and introduced to the ward team, including the shift lead.", { guidance: "Introduce the student by name." }),
    item("Welcome and introductions", "Student told who their mentor is and how to reach them."),
    item("Planning", "First mentorship session scheduled. Add the agreed date and time.", { response_kind: "scheduled_date", completed_by_role: "mentor_and_student" }),
  ];
  return {
    v1: summary({}), v1Items, enhanced,
    draft: null as null | { summary: Record<string, unknown>; items: Item[]; title: string },
    live: "v1" as "v1" | "draft",
    published: null as null | { items: Item[]; title: string },
    calls: [] as string[], saved: null as null | Item[],
  };
}

type State = ReturnType<typeof makeState>;

function detail(state: State) {
  const d = state.draft!;
  return { ...d.summary, title: d.title, item_count: d.items.length, required_count: d.items.filter((i) => i.is_required).length, items: d.items.map((i, n) => ({ ...i, id: `i${n}`, position: n + 1 })), issues: [] };
}

function overview(state: State) {
  const versions: unknown[] = [];
  let live: unknown = null;
  if (state.published) {
    const published = summary({ id: "t2", version: 2, title: state.published.title, item_count: state.published.items.length, checklists: { in_progress: 0, completed: 0 } });
    versions.push(published);
    live = published;
    versions.push(summary({ status: "retired", retired_at: "2026-07-10T08:00:00Z" }));
  } else {
    live = state.v1;
    versions.push(state.v1);
  }
  return { live, draft: state.draft ? { ...state.draft.summary, item_count: state.draft.items.length } : null, versions };
}

async function mock(page: Page, state: State) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    state.calls.push(`${method} ${path}`);

    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ authenticated: true, user: admin });
    if (path === "/api/v1/ai/status") return json({ assistant: false, lesson_explanations: false });

    if (path === "/api/v1/induction/templates" && method === "GET") return json(overview(state));
    if (path === "/api/v1/induction/templates" && method === "POST") {
      const body = request.postDataJSON() as { mode: string };
      const items = body.mode === "enhanced" ? state.enhanced : body.mode === "clone" ? state.v1Items : [];
      state.draft = { summary: summary({ id: "t3", version: 2, status: "draft", published_at: null, editable: true, checklists: { in_progress: 0, completed: 0 } }), items: items.map((i) => ({ ...i })), title: body.mode === "enhanced" ? "Labour ward induction checklist (enhanced draft)" : "" };
      return json(detail(state), 201);
    }
    if (path === "/api/v1/induction/templates/t3" && method === "GET") return json(detail(state));
    if (path === "/api/v1/induction/templates/t3" && method === "PUT") {
      const body = request.postDataJSON() as { title: string; items: Item[] };
      state.draft!.items = body.items;
      state.draft!.title = body.title;
      state.saved = body.items;
      return json(detail(state));
    }
    if (path === "/api/v1/induction/templates/t3/publish") {
      state.published = { items: state.draft!.items, title: state.draft!.title };
      state.draft = null;
      return json({ id: "t3", version: 2, status: "published" });
    }
    if (path === "/api/v1/induction/templates/t3/discard") {
      state.draft = null;
      return json({ id: "t3", status: "discarded" });
    }
    if (path.startsWith("/api/v1/me/notifications")) return json([]);
    return json({});
  });
}

test.describe("induction checklist editor (mocked API)", () => {
  test("start from the enhanced draft, edit, reorder and publish", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/admin/induction-checklist");

    await expect(page.getByRole("heading", { name: "Induction checklist", level: 2 })).toBeVisible();
    await expect(page.getByText("Live now · Version 1")).toBeVisible();
    await expect(page.getByRole("button", { name: /Start from the enhanced draft/ })).toBeEnabled();

    await page.getByRole("button", { name: /Start from the enhanced draft/ }).click();
    await expect(page.getByRole("heading", { name: "Draft version 2" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Item 1 text/ })).toHaveValue(/including the shift lead/);

    // Edit the first item.
    await page.getByRole("textbox", { name: /Item 1 text/ }).fill("Student welcomed by the ward team and the nurse manager.");
    // Move the second item above the first.
    await page.getByRole("button", { name: "Move item 2 up" }).click();
    await expect(page.getByRole("textbox", { name: /Item 1 text/ })).toHaveValue("Student told who their mentor is and how to reach them.");
    await expect(page.getByRole("textbox", { name: /Item 2 text/ })).toHaveValue("Student welcomed by the ward team and the nurse manager.");
    await expect(page.getByRole("button", { name: "Move item 1 up" })).toBeDisabled();

    // Preview as a mentor shows sections, guidance and the date-and-time note.
    await page.getByRole("tab", { name: "Preview as mentor" }).click();
    await expect(page.getByText("Welcome and introductions", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Guidance: Introduce the student by name.")).toBeVisible();
    await expect(page.getByText("The mentor adds the agreed date and time before marking this as done.")).toBeVisible();
    await page.getByRole("tab", { name: "Edit" }).click();

    // Publishing saves first, then explains the impact.
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/3 checklists are in progress and keep the version they started with/)).toBeVisible();
    await dialog.getByRole("button", { name: "Publish version" }).click();

    await expect(page.getByText("Live now · Version 2")).toBeVisible();
    expect(state.saved?.[0].label).toBe("Student told who their mentor is and how to reach them.");
    expect(state.saved?.[1].label).toBe("Student welcomed by the ward team and the nurse manager.");
    const put = state.calls.indexOf("PUT /api/v1/induction/templates/t3");
    const publish = state.calls.indexOf("POST /api/v1/induction/templates/t3/publish");
    expect(put).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(put);
  });

  test("shows inline problems and blocks publishing until fixed", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/admin/induction-checklist");
    await page.getByRole("button", { name: /Start blank/ }).click();
    await expect(page.getByRole("heading", { name: "Draft version 2" })).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "before publishing" })).toContainText("Add at least one checklist item");
    expect(state.calls).not.toContain("POST /api/v1/induction/templates/t3/publish");

    await page.getByRole("button", { name: "Add section" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Write the item text.").first()).toBeVisible();
    await page.getByRole("textbox", { name: /Item 1 text/ }).fill("Show the emergency exits and assembly point.");
    await expect(page.getByText("Write the item text.")).toHaveCount(0);

    // Discarding asks first and returns to the overview.
    await page.getByRole("button", { name: "Discard this draft" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Discard draft" }).click();
    await expect(page.getByText("Live now · Version 1")).toBeVisible();
  });

  test("fits a phone screen", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/admin/induction-checklist");
    await page.getByRole("button", { name: /Start from the enhanced draft/ }).click();
    await expect(page.getByRole("heading", { name: "Draft version 2" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
