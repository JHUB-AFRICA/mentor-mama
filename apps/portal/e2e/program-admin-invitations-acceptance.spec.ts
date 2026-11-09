import { expect, test } from "@playwright/test";
import { signInAsProgramAdmin } from "./helpers/program-admin-auth";

test("Phase 3: Coordinator and Nurse Manager invitations retain the correct scope", async ({
  page,
}) => {
  test.setTimeout(90_000);
  test.skip(
    !process.env.E2E_EMAIL ||
      !process.env.E2E_PASSWORD ||
      !process.env.E2E_TOTP_SECRET,
  );
  await signInAsProgramAdmin(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/people");
  await expect(
    page.getByRole("heading", { name: "People & access", exact: true }),
  ).toBeVisible();
  const suffix = Date.now().toString();

  const coordinatorEmail = `phase3-coordinator-${suffix}@example.test`;
  const inviteButton = page.getByRole("button", {
    name: "Invite person",
    exact: true,
  });
  await inviteButton.click();
  let dialog = page.getByRole("dialog", { name: "Invite a team member" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  const closeInviteButton = dialog.getByRole("button", {
    name: "Close invitation",
  });
  const sendInviteButton = dialog.getByRole("button", {
    name: "Send invitation",
  });
  await expect(closeInviteButton).toBeFocused();
  await expect(sendInviteButton).toBeEnabled();
  await page.keyboard.press("Shift+Tab");
  await expect(sendInviteButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeInviteButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(inviteButton).toBeFocused();
  await inviteButton.click();
  dialog = page.getByRole("dialog", { name: "Invite a team member" });
  await dialog.getByLabel("First name").fill("Phase 3 QA");
  await dialog.getByLabel("Last name").fill("Coordinator");
  await dialog.getByLabel("Work email").fill(coordinatorEmail);
  await dialog.locator("#invite-role").selectOption("coordinator");
  await expect(dialog.locator("#invite-scope")).toHaveAccessibleName(
    "Institution",
  );
  await dialog
    .locator("#invite-scope")
    .selectOption({ label: "E2E School of Nursing" });
  const coordinatorScopeId = await dialog.locator("#invite-scope").inputValue();
  const coordinatorRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/v1/auth/invitations") &&
      request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  const coordinatorPayload = (await coordinatorRequest).postDataJSON();
  expect(coordinatorPayload).toMatchObject({
    role: "coordinator",
    institution_id: coordinatorScopeId,
  });
  expect(coordinatorPayload.facility_id).toBeUndefined();
  await expect(
    page.getByRole("status").filter({
      hasText:
        "Coordinator invitation for E2E School of Nursing was queued for delivery.",
    }),
  ).toBeVisible();

  await page.getByLabel("Search people").fill(coordinatorEmail);
  await page.getByLabel("Search people").press("Enter");
  const coordinatorDetailsButton = page.getByRole("button", {
    name: "Open details for Phase 3 QA Coordinator",
  });
  await expect(coordinatorDetailsButton).toBeVisible();
  await coordinatorDetailsButton.click();
  let personDialog = page.getByRole("dialog", {
    name: "Phase 3 QA Coordinator",
  });
  await expect(personDialog).toContainText("University Coordinator");
  await expect(
    personDialog.getByText("E2E School of Nursing", { exact: true }),
  ).toBeVisible();
  await expect(personDialog).toContainText("Invitation pending");
  await personDialog.getByRole("button", { name: "Resend invitation" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: `A fresh invitation was queued for ${coordinatorEmail}. Their account remains pending until they accept it.`,
    }),
  ).toBeVisible();
  await personDialog
    .getByRole("button", { name: "Close person details" })
    .click();

  const nurseManagerEmail = `phase3-nurse-manager-${suffix}@example.test`;
  await page
    .getByRole("button", { name: "Invite person", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Invite a team member" });
  await dialog.getByLabel("First name").fill("Phase 3 QA");
  await dialog.getByLabel("Last name").fill("Nurse Manager");
  await dialog.getByLabel("Work email").fill(nurseManagerEmail);
  await dialog.locator("#invite-role").selectOption("nurse_manager");
  await expect(dialog.locator("#invite-scope")).toHaveAccessibleName(
    "Facility",
  );
  await dialog
    .locator("#invite-scope")
    .selectOption({ label: "E2E Teaching Hospital" });
  const nurseManagerScopeId = await dialog
    .locator("#invite-scope")
    .inputValue();
  const nurseManagerRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/v1/auth/invitations") &&
      request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  const nurseManagerPayload = (await nurseManagerRequest).postDataJSON();
  expect(nurseManagerPayload).toMatchObject({
    role: "nurse_manager",
    facility_id: nurseManagerScopeId,
  });
  expect(nurseManagerPayload.institution_id).toBeUndefined();
  await expect(
    page.getByRole("status").filter({
      hasText:
        "Nurse Manager invitation for E2E Teaching Hospital was queued for delivery.",
    }),
  ).toBeVisible();

  await page.getByLabel("Search people").fill(nurseManagerEmail);
  await page.getByLabel("Search people").press("Enter");
  const nurseManagerDetailsButton = page.getByRole("button", {
    name: "Open details for Phase 3 QA Nurse Manager",
  });
  await expect(nurseManagerDetailsButton).toBeVisible();
  await nurseManagerDetailsButton.click();
  personDialog = page.getByRole("dialog", { name: "Phase 3 QA Nurse Manager" });
  await expect(personDialog).toContainText("Nurse Manager");
  await expect(
    personDialog.getByText("E2E Teaching Hospital", { exact: true }),
  ).toBeVisible();
  await expect(personDialog).toContainText("Invitation pending");

  const summaryResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/dashboard/summary"),
  );
  await page.goto("/admin");
  const summary = await (await summaryResponse).json();
  expect(summary.data.readiness.invited_coordinators).toBeGreaterThan(0);
  expect(summary.data.readiness.invited_nurse_managers).toBeGreaterThan(0);
});
