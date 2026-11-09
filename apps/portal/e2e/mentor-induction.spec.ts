import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("mentor completes induction and activates the placement", async ({ page }) => {
  const email = process.env.E2E_INDUCTION_MENTOR_EMAIL;
  const password = process.env.E2E_INDUCTION_MENTOR_PASSWORD;
  test.skip(!email || !password, "Set the local induction E2E credentials before running this journey.");
  execFileSync("python", ["backend/manage.py", "seed_e2e_induction_workflow", "--password", password!], { cwd: "../..", stdio: "ignore" });

  await page.goto("/");
  await page.getByLabel("Email address").fill(email!);
  await page.locator("input[type=password]").first().fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today's mentorship work" })).toBeVisible();
  await page.getByRole("link", { name: /Open E2E Confirmation Student/ }).click();
  await expect(page.getByText("Induction checklist", { exact: true })).toBeVisible();

  const notes = page.getByLabel("Notes or action needed").first();
  await page.getByRole("button", { name: "Yes" }).first().click();
  await notes.fill("Student knows where to report for the first shift.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.getByRole("button", { name: "Yes" }).nth(1).click();
  await page.getByRole("button", { name: "Yes" }).nth(2).click();
  await page.getByRole("button", { name: "Sign induction" }).click();
  await expect(page.getByText("Completed").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Log a session" }).first()).toBeVisible();
});
