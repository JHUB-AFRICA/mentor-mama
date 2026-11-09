import { expect, test } from "@playwright/test";
import { signInAsProgramAdmin } from "./helpers/program-admin-auth";

test("Phase 2: pilot coverage review is attributable and directory edits reset it", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD || !process.env.E2E_TOTP_SECRET);
  await signInAsProgramAdmin(page);
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Programme setup", exact: true })).toBeVisible();
  await expect(page.getByText("2/3", { exact: true })).toBeVisible();
  const review = page.locator("#pilot-coverage-review");
  await page.getByRole("button", { name: "Pilot coverage review" }).click();
  await expect(review).toBeVisible();
  await review.locator('input[type="checkbox"]').check();
  await review.getByRole("button", { name: "Confirm pilot coverage" }).click();
  await expect(page.getByText("Reviewed by Phase 2 Acceptance Admin.")).toBeVisible();

  await page.goto("/admin/settings?section=directory");
  await page.getByRole("button", { name: "Wards" }).click();
  await page.getByRole("button", { name: "Edit E2E Mentor Workflow Ward" }).click();
  let dialog = page.getByRole("dialog", { name: "Edit ward" });
  await expect(dialog.locator('input[name="max_students"]')).toHaveValue("4");
  await expect(dialog.getByText("Current occupancy is 1.")).toBeVisible();
  await dialog.locator('input[name="max_students"]').fill("1");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("1/1 occupying placements · 0 capacity remaining")).toBeVisible();

  await page.goto("/admin/settings");
  await expect(page.locator("#pilot-coverage-review input[type=checkbox]")).toBeVisible();
  await expect(page.getByText("Reviewed by Phase 2 Acceptance Admin.")).toHaveCount(0);

  await page.goto("/admin/settings?section=directory");
  await page.getByRole("button", { name: "Wards" }).click();
  await page.getByRole("button", { name: "Edit E2E Mentor Workflow Ward" }).click();
  dialog = page.getByRole("dialog", { name: "Edit ward" });
  await dialog.locator('input[name="max_students"]').fill("4");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("1/4 occupying placements · 3 capacity remaining")).toBeVisible();
});
