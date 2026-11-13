import { expect, test, type Page } from "@playwright/test";

const coordinator = {
  id: "co1", email: "coordinator@example.test", name: "Amina Mwangi", role: "coordinator",
  capabilities: { request_facility: true, release_placement: true, create_placement: true },
  scope: { institution_id: "i1", institution_name: "Rosami College of Health Sciences" }, must_change_password: false,
};

function placement(extra: Record<string, unknown>) {
  return { id: "p1", state: "draft", planned_start: "2027-01-11", planned_end: "2027-03-12", student: { id: "s1", name: "Achieng Otieno", email: "a@example.test" }, cohort_name: "Cohort A", facility_id: null, facility_name: null, ward: null, mentor: null, ...extra };
}

async function mock(page: Page, item: Record<string, unknown>, calls: string[]) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${path}`);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ data: { authenticated: true, user: coordinator } });
    if (path === "/api/v1/ai/status") return json({ data: { assistant: false, lesson_explanations: false } });
    if (path === "/api/v1/placements/p1") return json({ data: item });
    if (path === "/api/v1/placements/p1/transitions") {
      return json({ data: { state: item.state, available: [], blocked: [{ command: "complete", reasons: [{ code: "FinalAssessmentMissing", message: "Student final assessment is required before completion." }] }] } });
    }
    if (path === "/api/v1/placements/p1/progress") {
      return json({ data: { placement_id: "p1", state: item.state, training: { available: false, percentage: null }, induction: { available: false, completed: 0, total: 0, percentage: null }, mentorship: { sessions_logged: 0, last_session_date: null }, assessment: { baseline_submitted: false, final_submitted: false }, safeguarding: { open_concerns: 0 }, overall_percentage: null } });
    }
    if (path === "/api/v1/placements/options") return json({ data: { cohorts: [], students: [], mentors: [], wards: [{ id: "w1", name: "Labour Ward", facility_id: "f1", facility_name: "Greenville Referral Hospital" }] } });
    if (path === "/api/v1/placements/withdraw-requests") return json({ data: { withdrawn: 1 } });
    return json({ data: [] });
  });
}

test.describe("coordinator placement detail", () => {
  test("a draft not yet sent to a facility says it is waiting on the coordinator and offers to send it", async ({ page }) => {
    await mock(page, placement({}), []);
    await page.goto("/coordinator/placements/p1");
    await expect(page.getByText("Waiting on you:")).toBeVisible();
    await expect(page.getByText("[object Object]")).toHaveCount(0);
    await expect(page.getByText("Student final assessment is required")).toHaveCount(0);
    await page.getByRole("button", { name: "Send to a partner facility" }).click();
    await expect(page.getByRole("dialog").getByText("Greenville Referral Hospital")).toBeVisible();
  });

  test("a requested draft names the facility and can be withdrawn", async ({ page }) => {
    const calls: string[] = [];
    await mock(page, placement({ requested_facility_id: "f1", requested_facility_name: "Greenville Referral Hospital" }), calls);
    await page.goto("/coordinator/placements/p1");
    await expect(page.getByText("Waiting on Greenville Referral Hospital:")).toBeVisible();
    await page.getByRole("button", { name: "Withdraw request" }).click();
    await expect.poll(() => calls.some((c) => c.includes("withdraw"))).toBe(true);
  });

  test("an active placement shows readable completion blockers, never [object Object]", async ({ page }) => {
    await mock(page, placement({ state: "active", facility_id: "f1", facility_name: "Greenville Referral Hospital" }), []);
    await page.goto("/coordinator/placements/p1");
    await expect(page.getByText("Student final assessment is required before completion.")).toBeVisible();
    await expect(page.getByText("[object Object]")).toHaveCount(0);
  });
});
