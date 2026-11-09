import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("student confirms a placement and reaches orientation", async ({ page }) => {
  const email = process.env.E2E_CONFIRMATION_STUDENT_EMAIL;
  const password = process.env.E2E_CONFIRMATION_STUDENT_PASSWORD;
  test.skip(!email || !password, "Set the local confirmation E2E credentials before running this journey.");
  execFileSync("python", ["backend/manage.py", "seed_e2e_student_workflow", "--password", password!, "--reset"], { cwd: "../..", stdio: "ignore" });

  await page.goto("/");
  await page.getByLabel("Email address").fill(email!);
  await page.locator("input[type=password]").first().fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Stay clear on what comes next." })).toBeVisible();
  await page.getByRole("button", { name: "Confirm your placement" }).click();
  await page.getByRole("button", { name: "Review assignment" }).click();
  await expect(page.getByRole("heading", { name: "Placement assignment", exact: true })).toBeVisible();
  await page.locator(".placement-document-viewer").evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
  await page.getByText("I have read and reviewed the placement assignment.", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Acknowledge placement" }).click();
  await expect(page.getByRole("heading", { name: "Complete your orientation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Student Workflow Hospital", exact: true })).toBeVisible();
});
