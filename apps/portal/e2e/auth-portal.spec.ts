import { expect, test } from "@playwright/test";
import crypto from "node:crypto";

function currentTotp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "")) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[19] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

async function waitForStableTotpWindow(page: import("@playwright/test").Page) {
  const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (secondsRemaining < 8) await page.waitForTimeout((secondsRemaining + 1) * 1000);
}

test("signed-out portal loads without protected-request errors", async ({ page }) => {
  const failedResponses: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/");
  await expect(page.getByText("Welcome back.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect.poll(() => failedResponses).toEqual([]);
});

test("password recovery gives a neutral confirmation for an unknown account", async ({ page }) => {
  const failedResponses: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/reset-password");
  await page.getByLabel("Email address").fill("unknown-local-account@example.test");
  await page.getByRole("button", { name: "Send reset instructions" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  await expect.poll(() => failedResponses).toEqual([]);
});

test("invalid sign-in shows an inline error without leaving the page", async ({ page }) => {
  const failedResponses: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/");
  await page.getByLabel("Email address").fill("e2e-admin@mentormama.test");
  await page.locator("input[type=password]").first().fill("incorrect-local-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Welcome back.")).toBeVisible();
  expect(failedResponses.filter((item) => item.startsWith("400 "))).toHaveLength(1);
});

test("programme admin can sign in with MFA and reach the workspace", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const totpSecret = process.env.E2E_TOTP_SECRET;
  test.skip(!email || !password || !totpSecret, "Set E2E_EMAIL, E2E_PASSWORD, and E2E_TOTP_SECRET for the authenticated journey.");

  const failedResponses: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/");
  await page.getByLabel("Email address").fill(email!);
  await page.locator("input[type=password]").first().fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  await waitForStableTotpWindow(page);
  await page.getByLabel("Authenticator code").fill(currentTotp(totpSecret!));
  await page.getByRole("button", { name: "Verify and continue" }).click();

  await expect(page.getByText("Keep the programme ready.")).toBeVisible();
  await expect(page.getByText("PROGRAMME ADMINISTRATION")).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Account settings", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Programme setup" }).click();
  await expect(page.getByRole("heading", { name: "Programme setup", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Access policy" }).click();
  await expect(page.getByText("Review the server-owned role boundaries before inviting or changing access.")).toBeVisible();
  await page.getByRole("button", { name: /E2E Admin/ }).click();
  await page.getByText("Notifications", { exact: true }).last().click();
  await expect(page.getByText("Choose what reaches your inbox")).toBeVisible();
  await expect(page.getByText("Security alerts are always on")).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Security" }).click();
  await expect(page.getByRole("heading", { name: "Active sessions" })).toBeVisible();
  await page.goto("/placements");
  await expect(page.getByRole("heading", { name: "Placements" })).toBeVisible();
  await expect(page.getByText("No placements yet.")).toBeVisible();
  await page.getByRole("button", { name: "New placement" }).click();
  await page.getByLabel("Cohort").selectOption({ label: "E2E 2026 Placement Cohort" });
  await page.getByRole("combobox", { name: "Student" }).selectOption({ label: "E2E Placement Student" });
  await page.getByLabel("Planned start").fill("2026-09-01");
  await page.getByLabel("Planned end").fill("2026-11-30");
  await page.getByRole("button", { name: "Create placement" }).click();
  await expect(page.getByRole("heading", { name: "E2E Placement Student" })).toBeVisible();
  await page.locator("label").filter({ hasText: /^Ward/ }).locator("select").selectOption({ label: "E2E Teaching Hospital · E2E Labour Ward (4)" });
  await page.getByRole("button", { name: "Save ward" }).click();
  await page.locator("label").filter({ hasText: /^Mentor/ }).locator("select").selectOption({ label: "E2E Clinical Mentor · e2e-placement-mentor@mentormama.test" });
  await page.getByRole("button", { name: "Save mentor" }).click();
  await page.getByRole("button", { name: "Send placement invitation" }).click();
  await expect(page.getByText("awaiting student", { exact: true })).toBeVisible();
  await expect(page.getByText("History")).toBeVisible();
  await expect(page.getByText(/event/)).toBeVisible();
  expect(failedResponses).toEqual([]);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Welcome back.")).toBeVisible();
});
