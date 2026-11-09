import { expect, test } from "@playwright/test";
import { signInAsProgramAdmin } from "./helpers/program-admin-auth";

test("Phase 4: Programme Admin can inspect training policy and content readiness", async ({
  page,
}) => {
  test.setTimeout(90_000);
  test.skip(
    !process.env.E2E_EMAIL ||
      !process.env.E2E_PASSWORD ||
      !process.env.E2E_TOTP_SECRET,
  );
  await signInAsProgramAdmin(page);

  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { name: "Programme setup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Require mentor training before placement release", {
      exact: true,
    }),
  ).toBeVisible();
  const trainingPolicy = page.getByRole("checkbox", {
    name: /Require mentor training before placement release/,
  });
  await expect(trainingPolicy).toBeVisible();
  const policyInitiallyEnabled = await trainingPolicy.isChecked();

  await page.goto("/admin/content");
  await expect(
    page.getByRole("heading", { name: "Content library" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Learning modules" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Guides" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add content" })).toBeVisible();

  const initialRows = page.getByRole("row").filter({ has: page.locator("td") });
  const initialRowCount = await initialRows.count();
  if (initialRowCount > 0) {
    await expect(
      initialRows.first().locator("td").first().getByRole("button"),
    ).toBeVisible();
    await expect(initialRows.first()).toContainText(/Draft|Published|Archived/);
  } else {
    await expect(
      page.getByRole("heading", { name: "Your content library is empty" }),
    ).toBeVisible();
  }

  await page.getByRole("tab", { name: "Learning modules" }).click();
  await expect(
    page.getByRole("tab", { name: "Learning modules" }),
  ).toHaveAttribute("aria-selected", "true");
  const moduleRows = page.getByRole("row").filter({ has: page.locator("td") });
  const moduleRowCount = await moduleRows.count();
  if (moduleRowCount > 0) {
    for (const row of await moduleRows.all())
      await expect(row).toContainText("Learning module");
  }

  await page.goto("/admin/settings");
  await expect(
    page.getByRole("checkbox", {
      name: /Require mentor training before placement release/,
    }),
  ).toHaveJSProperty("checked", policyInitiallyEnabled);
});
