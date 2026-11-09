import { expect, test } from "@playwright/test";
import { signInAsProgramAdmin } from "./helpers/program-admin-auth";

test("Phase 2: institution contact and logo updates persist and can be removed", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD || !process.env.E2E_TOTP_SECRET);
  await signInAsProgramAdmin(page);
  await page.goto("/admin/settings?section=directory");
  await expect(page.getByRole("heading", { name: "Directory" })).toBeVisible();
  await page.getByRole("button", { name: "View details" }).first().click();
  await expect(page.getByRole("heading", { name: "E2E Mentor Workflow School", exact: true })).toBeVisible();
  const detailUrl = page.url();

  const editButton = page.getByRole("button", { name: "Edit details" });
  await editButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('input[name="contact_email"]')).toHaveValue("");
  await expect(dialog.locator('input[name="contact_phone"]')).toHaveValue("");
  await expect(dialog.locator('input[name="clear_logo"]')).toHaveCount(0);

  await dialog.locator('input[name="contact_person"]').fill("Phase 2 Acceptance Contact");
  await dialog.locator('input[name="contact_email"]').fill("phase2-contact@example.test");
  await dialog.locator('input[name="contact_phone"]').fill("+254700123456");
  const pngDataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#178f90";
    context.fillRect(0, 0, 2, 2);
    return canvas.toDataURL("image/png");
  });
  await dialog.locator('input[name="logo"]').setInputFiles({
    name: "acceptance-logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngDataUrl.split(",")[1], "base64"),
  });
  await dialog.getByRole("button", { name: "Save changes" }).click();

  try {
    await expect(page.getByRole("link", { name: "phase2-contact@example.test" })).toHaveAttribute("href", "mailto:phase2-contact@example.test");
    await expect(page.getByRole("link", { name: "+254700123456" })).toHaveAttribute("href", "tel:+254700123456");
    await expect(page.getByRole("img", { name: "E2E Mentor Workflow School logo" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: "phase2-contact@example.test" })).toBeVisible();
    await expect(page.getByRole("img", { name: "E2E Mentor Workflow School logo" })).toBeVisible();
  } finally {
    await page.goto(detailUrl);
    await expect(page.getByRole("heading", { name: "E2E Mentor Workflow School", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit details" }).click();
    const cleanup = page.getByRole("dialog");
    await cleanup.locator('input[name="contact_person"]').fill("");
    await cleanup.locator('input[name="contact_email"]').fill("");
    await cleanup.locator('input[name="contact_phone"]').fill("");
    const removeLogo = cleanup.locator('input[name="clear_logo"]');
    if (await removeLogo.count()) await removeLogo.check();
    await cleanup.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("No contact details have been added for this record.")).toBeVisible();
    await expect(page.getByRole("img", { name: "E2E Mentor Workflow School logo" })).toHaveCount(0);
  }
});
