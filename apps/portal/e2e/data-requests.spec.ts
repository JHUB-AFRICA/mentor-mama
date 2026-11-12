import { expect, test, type Page } from "@playwright/test";

/** Mocked-API journeys for formal data requests: a student asks, a programme administrator works the queue. */

type Row = Record<string, unknown>;

function makeRequest(overrides: Row = {}): Row {
  return {
    id: "r1", request_type: "correction", request_type_label: "Correct my information", subject_area: "profile",
    subject_area_label: "My profile details", description: "My surname is spelled wrongly.", requested_change: "It should read Wanjiku.",
    reason: "", status: "received", status_label: "Received", response_note: "", routed_to: "programme", enquiry_reference: "",
    reviewed_by: null, created_at: "2026-11-01T08:00:00Z", updated_at: "2026-11-01T08:00:00Z", reviewed_at: null, closed_at: null,
    due_at: "2026-12-01T08:00:00Z", is_open: true, age_days: 3, days_left: 27, overdue: false, days_overdue: 0, ...overrides,
  };
}

const person = (role: string, caps: Record<string, boolean>) => ({
  id: "u1", email: `${role}@example.test`, name: role === "student" ? "Grace Wanjiku" : "Ada Admin", role, phone: "",
  capabilities: caps, scope: { program_id: "prog1" }, must_change_password: false, email_verified: true, consent_required: false,
});

async function mock(page: Page, user: ReturnType<typeof person>, state: { rows: Row[]; calls: string[]; posted: Row[] }) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (data: unknown, status = 200, extra: Row = {}) => route.fulfill({ status, json: { data, ...extra } });
    state.calls.push(`${request.method()} ${path}`);
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ authenticated: true, user });
    if (path === "/api/v1/me") return json(user);
    if (path === "/api/v1/ai/status") return json({ assistant: false, lesson_explanations: false });
    if (path === "/api/v1/privacy/requests" && request.method() === "GET") return json(state.rows, 200, { meta: { response_days: 30 } });
    if (path === "/api/v1/privacy/requests" && request.method() === "POST") {
      const body = request.postDataJSON() as Row;
      state.posted.push(body);
      const created = makeRequest({ ...body, request_type_label: "Correct my information", subject_area_label: "My profile details" });
      state.rows = [created, ...state.rows];
      return json(created, 201);
    }
    if (path === "/api/v1/privacy/requests/r1/withdraw") {
      state.rows = state.rows.map((row) => (row.id === "r1" ? { ...row, status: "withdrawn", is_open: false, closed_at: "2026-11-04T08:00:00Z" } : row));
      return json(state.rows.find((row) => row.id === "r1"));
    }
    if (path === "/api/v1/privacy/requests/admin") {
      const open = state.rows.filter((row) => row.is_open);
      const wanted = url.searchParams.get("status") ?? "open";
      const shown = wanted === "open" ? open : state.rows;
      return json({
        results: shown,
        counts: { open: open.length, in_review: open.filter((row) => row.status === "in_review").length, overdue: open.filter((row) => row.overdue).length },
        pagination: { page: 1, page_size: 20, total_count: shown.length, total_pages: 1, has_next: false, has_previous: false },
      });
    }
    const action = path.match(/^\/api\/v1\/privacy\/requests\/admin\/r1\/(review|complete|decline)$/);
    if (action) {
      const body = (request.postDataJSON() ?? {}) as { note?: string };
      state.calls.push(`ACTION ${action[1]} ${body.note ?? ""}`);
      const next = { review: "in_review", complete: "completed", decline: "declined" }[action[1]] as string;
      state.rows = state.rows.map((row) => (row.id === "r1"
        ? { ...row, status: next, is_open: next === "in_review", response_note: body.note ?? "", reviewed_by: "Ada Admin", closed_at: next === "in_review" ? null : "2026-11-05T08:00:00Z" }
        : row));
      return json(state.rows.find((row) => row.id === "r1"));
    }
    if (path === "/api/v1/notifications") return json([]);
    return json([]);
  });
}

test.describe("data requests", () => {
  test("a student sends a correction request and can withdraw it", async ({ page }) => {
    const state = { rows: [] as Row[], calls: [] as string[], posted: [] as Row[] };
    await mock(page, person("student", { submit_data_request: true }), state);
    await page.goto("/account?tab=privacy");

    await expect(page.getByRole("heading", { name: "Ask about your information" })).toBeVisible();
    await expect(page.getByText("Do not type patient information.")).toBeVisible();
    await expect(page.getByText("You have not sent any requests.")).toBeVisible();

    const send = page.getByRole("button", { name: "Send request" });
    await expect(send).toBeDisabled();
    await page.getByLabel("What is wrong?").fill("My surname is spelled wrongly on my profile.");
    await expect(send).toBeDisabled(); // a correction also needs "what should it say"
    await page.getByLabel("What should it say?").fill("It should read Wanjiku.");
    await send.click();

    await expect(page.getByRole("list", { name: "Your data requests" })).toBeVisible();
    await expect(page.getByTestId("data-request")).toContainText("Received");
    expect(state.posted[0]).toMatchObject({ request_type: "correction", subject_area: "profile", requested_change: "It should read Wanjiku." });
    await page.screenshot({ path: "test-results/data-request-student.png", fullPage: true });

    await page.getByRole("button", { name: "Withdraw request" }).click();
    await page.getByRole("button", { name: "Yes, withdraw it" }).click();
    await expect(page.getByTestId("data-request")).toContainText("Withdrawn");
    await expect(page.getByRole("button", { name: "Withdraw request" })).toHaveCount(0);
  });

  test("a programme administrator reviews, completes and declines from the Data requests tab", async ({ page }) => {
    const state = {
      rows: [
        makeRequest({ requester: { id: "u9", name: "Grace Wanjiku", email: "grace@students.example", role: "student", role_label: "Student", status: "active", institution_id: null, facility_id: null } }),
        makeRequest({ id: "r2", request_type: "access", request_type_label: "Show me what you hold about me", subject_area: "other", subject_area_label: "Something else",
          overdue: true, days_overdue: 4, days_left: 0, age_days: 34, requester: { id: "u8", name: "Peter Otieno", email: "peter@knh.example", role: "mentor", role_label: "Clinical Mentor", status: "active", institution_id: null, facility_id: null } }),
      ] as Row[],
      calls: [] as string[],
      posted: [] as Row[],
    };
    await mock(page, person("program_admin", { manage_data_requests: true, submit_data_request: true }), state);
    await page.goto("/admin/people?section=requests");

    await expect(page.getByRole("tab", { name: /Data requests/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Data requests" })).toBeVisible();
    await expect(page.getByText("4 days overdue")).toBeVisible();
    await expect(page.getByText("27 days left")).toBeVisible();

    await page.getByRole("button", { name: "Open request from Grace Wanjiku" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("It should read Wanjiku.")).toBeVisible();
    await expect(drawer.getByText("grace@students.example")).toBeVisible();
    await expect(drawer.getByText(/Settings, then Profile/)).toBeVisible();
    await page.screenshot({ path: "test-results/data-request-admin.png", fullPage: true });

    await drawer.getByRole("button", { name: "Start review" }).click();
    await expect(drawer.getByText("In review").first()).toBeVisible();

    // A note is required to finish, and nothing is sent without it.
    await drawer.getByRole("button", { name: "Mark as completed" }).click();
    await expect(drawer.getByText(/Describe what was done/)).toBeVisible();
    expect(state.calls.some((call) => call.startsWith("ACTION complete"))).toBe(false);

    await drawer.getByLabel("Note for the person").fill("Your surname now reads Wanjiku.");
    await drawer.getByRole("button", { name: "Mark as completed" }).click();
    await expect(drawer.getByText("Your surname now reads Wanjiku.")).toBeVisible();
    expect(state.calls).toContain("ACTION complete Your surname now reads Wanjiku.");

    // Decline needs a reason too.
    await drawer.getByRole("button", { name: "Close request" }).click();
    await page.getByRole("button", { name: "Open request from Peter Otieno" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Decline" }).click();
    await expect(page.getByRole("dialog").getByText(/Say why you are declining/)).toBeVisible();
  });
});
