import { expect, test } from "@playwright/test";
import { signInAsProgramAdmin } from "./helpers/program-admin-auth";

test("Phase 2: directory details and edit dialog work at narrow width with keyboard", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD || !process.env.E2E_TOTP_SECRET);
  await signInAsProgramAdmin(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/settings?section=directory");
  await expect(page.getByRole("heading", { name: "Directory", exact: true })).toBeVisible();
  const documentWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  await expect.poll(documentWidth).toBeLessThanOrEqual(375);

  await page.getByRole("button", { name: "View details" }).first().click();
  await expect(page.getByRole("heading", { name: "E2E Mentor Workflow School", exact: true })).toBeVisible();
  await expect.poll(documentWidth).toBeLessThanOrEqual(375);

  const back = page.getByRole("button", { name: "Back to directory" });
  const edit = page.getByRole("button", { name: "Edit details" });
  await back.focus();
  await page.keyboard.press("Tab");
  await expect(edit).toBeFocused();
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit institution" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="contact_email"]')).toBeVisible();
  await expect.poll(documentWidth).toBeLessThanOrEqual(375);
  await dialog.getByRole("button", { name: "Close" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Save changes" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(edit).toBeFocused();
});
