import { expect, test, type Page } from "@playwright/test";

const admin = { id: "p1", email: "admin@mentamama.com", name: "Platform Administrator", role: "platform_admin", capabilities: {}, scope: {}, must_change_password: false };

type Entry = Record<string, unknown>;

function makeState() {
  const base = {
    id: "e1", reference: "PIL-2026-0001", kind: "pilot", topic: "pilot", status: "new", priority: "normal", name: "Brian Mwangi",
    email: "brian@nakuru.example", organisation: "Nakuru Level 5 Hospital", subject: "", preview: "We run a maternity unit with 12 mentors",
    unread: true, overdue: false, assigned_to: null as null | { id: string; name: string }, created_at: "2026-11-12T08:00:00Z", last_activity_at: "2026-11-12T08:00:00Z",
    phone: "+254700000000", message: "We run a maternity unit with 12 mentors and want to pilot MentorMAMA in January.\n\nCan we talk this week?",
    details: { role_title: "Nurse in charge", organisation_type: "health_facility", county: "Nakuru", mentors: 12, students: 30, start_term: "January 2027" },
    source_page: "/contact?type=pilot", consent_at: "2026-11-12T08:00:00Z", first_response_at: null as null | string, closed_at: null, converted_programme: null as null | { id: string; name: string }, team_alert: "sent",
    assignees: [{ id: "p1", name: "Platform Administrator" }],
    timeline: [
      { id: "t1", type: "received", actor: null, body: "", text: "", meta: {}, created_at: "2026-11-12T08:00:00Z", email: null },
      { id: "t2", type: "email", actor: null, body: "", text: "", meta: {}, created_at: "2026-11-12T08:00:00Z",
        email: { template: "acknowledgement", status: "sent", to: "brian@nakuru.example", subject: "We received", attempts: 1, error: "", sent_at: "2026-11-12T08:00:05Z" } },
    ] as Entry[],
  };
  return { item: base, calls: [] as string[], failEmail: false };
}

async function mock(page: Page, state: ReturnType<typeof makeState>) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    state.calls.push(`${request.method()} ${path}`);
    const item = state.item;
    const detail = () => json(item);
    const push = (entry: Entry) => item.timeline.push({ id: `t${item.timeline.length + 1}`, actor: { id: "p1", name: "Platform Administrator" }, body: "", text: "", meta: {}, created_at: "2026-11-12T09:00:00Z", email: null, ...entry });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ authenticated: true, user: admin });
    if (path === "/api/v1/ai/status") return json({ assistant: false, lesson_explanations: false });
    if (path === "/api/v1/platform/enquiries") {
      const row = { ...item };
      const open = ["new", "in_progress", "waiting"].includes(item.status);
      const view = url.searchParams.get("view") ?? "open";
      const shown = view === "open" ? open : view === "done" ? ["resolved", "closed"].includes(item.status) : item.status === "spam";
      return json({
        results: shown ? [row] : [],
        counts: { open: open ? 1 : 0, new: item.status === "new" ? 1 : 0, done: ["resolved", "closed"].includes(item.status) ? 1 : 0, spam: 0, unread: item.unread ? 1 : 0, overdue: 0 },
        pagination: { page: 1, pages: 1, total: shown ? 1 : 0 },
      });
    }
    if (path === "/api/v1/platform/enquiries/e1" && request.method() === "GET") {
      item.unread = false;
      return detail();
    }
    if (path === "/api/v1/platform/saved-replies" && request.method() === "GET")
      return json([{ id: "r1", title: "Pilot next steps", body: "Hi {{name}}, thanks for your interest. Could you share your cohort size?" }]);
    if (path === "/api/v1/platform/saved-replies" && request.method() === "POST") {
      state.calls.push("SAVED_REPLY_CREATED");
      return json({ id: "r2", ...(request.postDataJSON() as object) }, 201);
    }
    if (path === "/api/v1/platform/enquiries/export")
      return route.fulfill({ status: 200, contentType: "text/csv", body: "Reference\nPIL-2026-0001\n" });
    if (path === "/api/v1/platform/enquiries/e1/reply") {
      const body = (request.postDataJSON() as { body: string }).body;
      item.status = "waiting";
      item.first_response_at = "2026-11-12T09:00:00Z";
      item.assigned_to = { id: "p1", name: "Platform Administrator" };
      push({ type: "reply", body, email: { template: "reply", status: state.failEmail ? "failed" : "queued", to: item.email, subject: "Re", attempts: state.failEmail ? 6 : 0, error: "boom", sent_at: null } });
      return detail();
    }
    if (path === "/api/v1/platform/enquiries/e1/email/resend") {
      const failed = item.timeline.find((entry) => (entry.email as { status?: string } | null)?.status === "failed");
      if (failed) (failed.email as { status: string }).status = "queued";
      return detail();
    }
    if (path === "/api/v1/platform/enquiries/e1/status") {
      const body = request.postDataJSON() as { status: string; note: string; notify: boolean };
      item.status = body.status;
      push({ type: "status", body: body.note, text: `Status changed to ${body.status}`, meta: { sender_notified: body.notify } });
      return detail();
    }
    if (path === "/api/v1/platform/enquiries/e1/notes") {
      push({ type: "note", body: (request.postDataJSON() as { body: string }).body });
      return detail();
    }
    if (path === "/api/v1/platform/enquiries/e1/convert") {
      const body = request.postDataJSON() as { name: string };
      item.status = "resolved";
      item.converted_programme = { id: "prog9", name: body.name };
      push({ type: "converted", meta: { programme: body.name } });
      return detail();
    }
    return json([]);
  });
}

test.describe("platform messages", () => {
  test("inbox → detail → reply, note, status, retry and convert", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/platform/messages");

    // Inbox: unread sender, badge in the sidebar.
    await expect(page.getByRole("heading", { name: "Messages", level: 2 })).toBeVisible();
    const row = page.getByRole("row", { name: /Brian Mwangi/ });
    await expect(row).toBeVisible();
    await expect(page.getByLabel("Unread")).toBeVisible();
    await expect(page.getByRole("button", { name: /Messages/ }).first()).toContainText("1");
    await page.screenshot({ path: "test-results/messages-inbox.png" });

    // Dedicated detail page.
    await row.getByRole("link", { name: /Brian Mwangi/ }).click();
    await expect(page).toHaveURL(/\/platform\/messages\/e1$/);
    await expect(page.getByRole("heading", { name: "Pilot access from Brian Mwangi" })).toBeVisible();
    await expect(page.getByText("Can we talk this week?")).toBeVisible();
    await expect(page.getByText("Nurse in charge")).toBeVisible();
    await expect(page.getByText("Confirmation emailed to brian@nakuru.example")).toBeVisible();
    await page.screenshot({ path: "test-results/messages-detail.png", fullPage: true });

    // Reply: the button is disabled until there is text; the sender is told by email; a failed delivery can be retried.
    const send = page.getByRole("button", { name: "Send reply" });
    await expect(send).toBeDisabled();
    state.failEmail = true;
    await page.getByLabel("Your reply").fill("Thanks Brian, Thursday 10:00 works. I'll send a calendar invite.");
    await send.click();
    await expect(page.getByText("Waiting for sender").first()).toBeVisible();
    await expect(page.getByText(/Reply email to brian@nakuru.example could not be delivered/)).toBeVisible();
    await page.getByRole("button", { name: "Send again" }).click();
    await expect(page.getByText(/Reply email to brian@nakuru.example is being sent/)).toBeVisible();

    // Internal note.
    await page.getByRole("tab", { name: "Internal note" }).click();
    await page.getByLabel("Note").fill("Called the hospital; confirmed 12 mentors.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("added an internal note")).toBeVisible();

    // Status: resolve with an emailed note.
    await page.getByRole("button", { name: "Mark resolved" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/Tell them it is resolved by email to Brian Mwangi/)).toBeChecked();
    await dialog.getByLabel("Add a note to the email").fill("Programme set up next week.");
    await dialog.getByRole("button", { name: "Mark resolved" }).click();
    await expect.poll(() => state.calls.includes("POST /api/v1/platform/enquiries/e1/status")).toBe(true);
    await expect(page.getByText("Resolved").first()).toBeVisible();
    await page.screenshot({ path: "test-results/messages-detail-resolved.png", fullPage: true });
  });

  test("saved replies fill the reply with the sender's first name, new ones can be saved, and the inbox exports", async ({ page }) => {
    const state = makeState();
    state.item.timeline.push({ id: "tin", type: "inbound", actor: null, body: "We have 30 students per cohort.", text: "", meta: {}, created_at: "2026-11-12T09:30:00Z", email: null });
    await mock(page, state);
    await page.goto("/platform/messages/e1");
    await expect(page.getByText("Brian Mwangi replied by email")).toBeVisible();
    await expect(page.getByText("We have 30 students per cohort.")).toBeVisible();
    await page.getByLabel("Saved replies").selectOption({ label: "Pilot next steps" });
    await expect(page.getByLabel("Your reply")).toHaveValue("Hi Brian, thanks for your interest. Could you share your cohort size?");
    await page.getByRole("button", { name: "Save as template" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Title/).fill("Cohort question");
    await dialog.getByRole("button", { name: "Save template" }).click();
    await expect.poll(() => state.calls.includes("SAVED_REPLY_CREATED")).toBe(true);

    await page.goto("/platform/messages");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    expect((await download).suggestedFilename()).toMatch(/^mentormama-messages-open-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test("a pilot request becomes a programme", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.goto("/platform/messages/e1");
    await page.getByRole("button", { name: "Create the programme" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/Programme name/)).toHaveValue("Nakuru Level 5 Hospital");
    await expect(dialog.getByLabel(/Administrator email/)).toHaveValue("brian@nakuru.example");
    await expect(dialog.getByLabel(/Administrator first name/)).toHaveValue("Brian");
    // The requester gave only one name: a last name is optional.
    await dialog.getByLabel(/Administrator last name/).fill("");
    await expect(dialog.getByRole("button", { name: "Create and invite" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Create and invite" }).click();
    await expect(page.getByText(/was created from this request/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Create the programme" })).toHaveCount(0);
  });

  test("a message that no longer exists says so", async ({ page }) => {
    const state = makeState();
    await mock(page, state);
    await page.route("**/api/v1/platform/enquiries/gone", (route) => route.fulfill({ status: 404, json: { error: { code: "NotFound", message: "This message no longer exists." } } }));
    await page.goto("/platform/messages/gone");
    await expect(page.getByText("This message no longer exists", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to messages" })).toBeVisible();
  });
});
