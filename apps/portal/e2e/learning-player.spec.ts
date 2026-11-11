import { expect, test, type Page } from "@playwright/test";

const module_ = {
  id: "mod-1", title: "Safe handover", slug: "safe-handover", description: "How to hand over safely.", pass_mark: 100, is_required: true,
  category: "clinical_care", visible_roles: ["student", "coordinator"], certificate_enabled: true, cover_image: "", status: "published",
  updated_at: "2026-11-11T00:00:00Z", completed: false, score: null, version: 1, attempt_count: 0, best_score: null, last_score: null,
  last_passed: null, total_minutes: 10, has_quiz: true, visited_lesson_ids: [],
  lessons: [
    { id: "l1", position: 1, title: "Why handover matters", body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Structured handover protects patients." }] }] }), lesson_type: "reading", duration_minutes: 5, section: "Basics", video: null },
    { id: "l2", position: 2, title: "Watch the demo", body: "Summary of the demo.", lesson_type: "video", duration_minutes: 5, section: "Practice", video: { provider: "youtube", id: "dQw4w9WgXcQ", embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" } },
  ],
  checks: [{ id: "c1", position: 2, lesson_id: "l1", prompt: "Handover protects who?", kind: "single", options: ["Patients", "Nobody"],
    choices: [{ id: "x", text: "Patients" }, { id: "y", text: "Nobody" }] }],
  quiz: [{ id: "q1", position: 1, prompt: "Which belong in a handover?", kind: "multi", scenario: "You finish a night shift.", options: ["Patient status", "Pending tasks", "Weather"],
    choices: [{ id: "a", text: "Patient status" }, { id: "b", text: "Pending tasks" }, { id: "c", text: "Weather" }] }],
};

async function mock(page: Page, role: string, state: { passed: boolean; certificate: number; visits: string[] }) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (path === "/api/v1/auth/session") return json({ authenticated: true, user: { id: "u1", email: "u@example.test", name: "Test User", role, capabilities: {}, scope: {} } });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/training/modules") return json([{ ...module_, completed: state.passed, visited_lesson_ids: state.visits }]);
    if (path === "/api/v1/me/training") return json({ available: true, completed: state.passed ? 1 : 0, total: 1, percentage: state.passed ? 100 : 0, required_completed: state.passed ? 1 : 0, required_total: 1, required_complete: state.passed });
    if (path.endsWith("/visit")) { state.visits.push(path.split("/").at(-2) as string); return json({ visited: true }); }
    if (path === "/api/v1/training/modules/mod-1/attempts") {
      const body = request.postDataJSON() as { answers: Record<string, string[]> };
      const right = JSON.stringify([...body.answers.q1].sort()) === JSON.stringify(["a", "b"]);
      state.passed = right;
      return json({ id: "att", score: right ? 100 : 0, passed: right, pass_mark: 100,
        results: [{ question_id: "q1", correct: right, explanation: "Handover covers status and tasks.", feedback: right ? [] : ["Weather is not clinical."], ...(right ? { correct_option_ids: ["a", "b"] } : {}) }] });
    }
    if (path === "/api/v1/training/modules/mod-1/lessons/l1/check") {
      const body = request.postDataJSON() as { answers: Record<string, string> };
      const right = body.answers.c1 === "x";
      return json({ results: [{ question_id: "c1", correct: right, explanation: "Patients are protected.", feedback: [], correct_option_ids: ["x"] }] });
    }
    if (path === "/api/v1/training/modules/mod-1/certificate") { state.certificate += 1; return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4 test" }); }
    if (path === "/api/v1/student/profile") return json({ course_name: "BSc Nursing", year_of_study: 3, emergency_contact_name: "A", emergency_contact_phone: "0700", emergency_contact_relationship: "Parent" });
    if (path === "/api/v1/consent/current") return json(null);
    if (path === "/api/v1/ai/status") return json({ assistant: false, lesson_explanations: false });
    return route.fulfill({ json: { data: [] } });
  });
}

for (const [role, url, nav] of [["student", "/student?view=learning", "Learning"], ["coordinator", "/coordinator/learning", "Learning"]] as const) {
  test(`${role} can open, read, answer a multiple-select check and get a certificate`, async ({ page }) => {
    const state = { passed: false, certificate: 0, visits: [] as string[] };
    await mock(page, role, state);
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Learning" }).first()).toBeVisible();
    await expect(page.getByRole("navigation").getByText(nav, { exact: true }).first()).toBeVisible();
    await page.getByText("Safe handover").first().click();

    await expect(page.getByText("Structured handover protects patients.")).toBeVisible();
    await expect(page.getByText("Basics", { exact: true })).toBeVisible();
    await page.getByRole("heading", { name: "Check your understanding" }).scrollIntoViewIfNeeded();
    await page.getByLabel("Nobody").check();
    await page.getByRole("button", { name: "Check my answers" }).click();
    await expect(page.getByText("Not quite.").first()).toBeVisible();
    await expect(page.getByText("✓ Correct answer")).toBeVisible();
    await page.getByLabel("Patients").check();
    await page.getByRole("button", { name: "Check my answers" }).click();
    await expect(page.getByText("Correct.", { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: /Next lesson/ }).click();
    await expect(page.getByRole("button", { name: /Play video/ })).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0); // nothing loads from YouTube until tapped
    await page.getByRole("button", { name: /Go to knowledge check/ }).click();

    await expect(page.getByText("You finish a night shift.")).toBeVisible();
    await expect(page.getByText("(select all that apply)")).toBeVisible();
    await page.getByLabel("Patient status").check();
    await page.getByLabel("Weather").check();
    await page.getByRole("button", { name: /Submit answers/ }).click();
    await expect(page.getByText("Weather is not clinical.")).toBeVisible();

    await page.getByLabel("Weather").uncheck();
    await page.getByLabel("Pending tasks").check();
    await page.getByRole("button", { name: /Submit again/ }).click();
    await expect(page.getByText(/Module complete —/)).toBeVisible();
    await page.getByRole("button", { name: "Download certificate" }).click();
    await expect.poll(() => state.certificate).toBe(1);
    expect(state.visits).toEqual(["l1", "l2"]);
  });
}
