import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("mentor retains and reconciles a session when the first submit loses signal", async ({ page }) => {
  const email = process.env.E2E_OFFLINE_MENTOR_EMAIL;
  const password = process.env.E2E_OFFLINE_MENTOR_PASSWORD;
  test.skip(!email || !password, "Set the local offline E2E credentials before running this journey.");
  execFileSync("python", ["backend/manage.py", "seed_e2e_mentor_workflow", "--password", password!], { cwd: "../..", stdio: "ignore" });

  await page.goto("/");
  await page.getByLabel("Email address").fill(email!);
  await page.locator("input[type=password]").first().fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today's mentorship work" })).toBeVisible();

  await page.getByRole("link", { name: /Open E2E Mentor Student/ }).click();
  await expect(page.getByRole("heading", { name: "Record mentorship session" })).toBeVisible();
  await page.getByText("communication", { exact: true }).click();
  await page.getByLabel("Duration (optional)").selectOption("15");
  await page.getByLabel("What was covered (optional)").fill("Structured handover practice");
  await page.getByLabel("Feedback given (optional)").fill("Use the escalation format consistently");
  await page.getByLabel("Follow-up (optional)").selectOption("review_next_shift");

  let submittedPayload: Record<string, unknown> | undefined;
  await page.route("**/api/v1/placements/*/sessions", async (route) => {
    submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.abort("internetdisconnected");
  }, {
    times: 1,
  });
  await page.getByRole("button", { name: "Save session" }).click();
  expect(submittedPayload).toMatchObject({
    duration_minutes: 15,
    what_was_covered: "Structured handover practice",
    feedback_given: "Use the escalation format consistently",
    follow_up_action: "review_next_shift",
  });
  await expect(page.getByText("Session saved offline", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: /1 session waiting to sync/ })).toBeVisible();
  await expect(page.getByText("Waiting for signal")).toBeVisible();

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("heading", { name: /session waiting to sync/ })).toHaveCount(0);
});
