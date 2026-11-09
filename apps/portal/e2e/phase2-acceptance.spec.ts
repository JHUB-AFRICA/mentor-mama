import { expect, test } from "@playwright/test";
import { signInAsProgramAdmin } from "./helpers/program-admin-auth";

test("Phase 2: Programme Admin can review setup and open a directory record detail", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD || !process.env.E2E_TOTP_SECRET);
  await signInAsProgramAdmin(page);

  await page.goto("/admin/settings?section=identity");
  await expect(page.getByRole("heading", { name: "Programme setup" }).first()).toBeVisible();
  await expect(page.locator(".programme-setup-form input").first()).toHaveValue("E2E Programme");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.reload();
  await expect(page.locator(".programme-setup-form input").first()).toHaveValue("E2E Programme");

  await page.goto("/admin/settings?section=directory");
  await expect(page.getByRole("heading", { name: "Directory" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Institutions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View details" }).first()).toBeVisible();
  await page.getByRole("button", { name: "View details" }).first().click();
  await expect(page.getByRole("heading", { name: "E2E Mentor Workflow School", exact: true })).toBeVisible();
  await expect(page.getByText("Programme directory · institution", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to directory" })).toBeVisible();
  await expect(page).toHaveURL(/record_id=.+/);

  await page.getByRole("button", { name: "Back to directory" }).click();
  await expect(page.getByRole("heading", { name: "Directory", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Facilities" }).click();
  await page.getByRole("button", { name: "View details" }).first().click();
  await expect(page.getByText("Programme directory · facility", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to directory" })).toBeVisible();

  await page.getByRole("button", { name: "Back to directory" }).click();
  await expect(page.getByRole("heading", { name: "Directory", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Wards" }).click();
  await page.getByRole("button", { name: "View details" }).first().click();
  await expect(page.getByText("Programme directory · ward", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Capacity and availability" })).toBeVisible();
});
