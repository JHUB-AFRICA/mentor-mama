import { expect, test, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "")) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function waitForTotpWindow(page: Page) {
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remaining < 8) await page.waitForTimeout((remaining + 1) * 1000);
}

async function waitForNextTotpWindow(page: Page) {
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  await page.waitForTimeout((remaining + 1) * 1000);
}

async function loginAdmin(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(process.env.E2E_EMAIL!);
  await page.locator("input[type=password]").first().fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await waitForTotpWindow(page);
  await page.getByLabel("Authenticator code").fill(totp(process.env.E2E_TOTP_SECRET!));
  const mfaResponse = await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith("/api/v1/auth/mfa/verify"),
      { timeout: 10000 },
    ),
    page.getByRole("button", { name: "Verify and continue" }).click(),
  ]).then(([response]) => response).catch(() => null);
  if (mfaResponse?.status() === 400) {
    await waitForNextTotpWindow(page);
    await page.getByLabel("Authenticator code").fill(totp(process.env.E2E_TOTP_SECRET!));
    await page.getByRole("button", { name: "Verify and continue" }).click();
  }
  await expect(page.getByText("Keep the programme ready.")).toBeVisible();
}

function invitationUrl(email: string): string {
  const code = "from django.utils.encoding import force_bytes\nfrom django.utils.http import urlsafe_base64_encode\nfrom apps.identity.models import User\nfrom apps.identity.authentication import invitation_token\nu = User.objects.get(email='" + email + "')\nprint('/activate?uid=' + urlsafe_base64_encode(force_bytes(u.pk)) + '&token=' + invitation_token(u))";
  const output = execFileSync("python", ["backend/manage.py", "shell", "-c", code], { cwd: "../..", encoding: "utf8", env: process.env });
  return "http://127.0.0.1:5173" + output.trim().split("\n").pop();
}

async function activateRole(page: Page, email: string, password: string) {
  await page.goto(invitationUrl(email));
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.locator("input[type=password]").first().fill(password);
  await page.locator("input[type=password]").nth(1).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Secure your workspace.")).toBeVisible();
  await page.waitForTimeout(250);
  const secret = await page.locator("p.font-mono").innerText();
  await waitForTotpWindow(page);
  await page.getByLabel("Authenticator code").fill(totp(secret));
  await page.getByRole("button", { name: "Enable MFA" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to workspace" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("live role onboarding reaches the operational handoff boundary", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD || !process.env.E2E_TOTP_SECRET, "Local admin credentials required.");
  const suffix = Date.now();
  const coordinatorEmail = `live-coordinator-${suffix}@mentormama.test`;
  const managerEmail = `live-manager-${suffix}@mentormama.test`;
  const rolePassword = "Live-role-password-2026!";

  await loginAdmin(page);
  await page.getByRole("button", { name: "People & access", exact: true }).click();
  await page.getByRole("button", { name: "Invite person" }).click();
  await page.getByLabel("First name").fill("Live");
  await page.getByLabel("Last name").fill("Coordinator");
  await page.getByLabel("Work email").fill(coordinatorEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("coordinator");
  await page.getByLabel("Institution").selectOption({ label: "E2E School of Nursing" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation queued/)).toBeVisible();

  await page.getByRole("button", { name: "Invite person" }).click();
  await page.getByLabel("First name").fill("Live");
  await page.getByLabel("Last name").fill("Manager");
  await page.getByLabel("Work email").fill(managerEmail);
  await page.getByLabel("Role", { exact: true }).selectOption("nurse_manager");
  await page.getByLabel("Facility").selectOption({ label: "E2E Teaching Hospital" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation queued/)).toBeVisible();

  await activateRole(page, coordinatorEmail, rolePassword);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Welcome back.")).toBeVisible();
  await activateRole(page, managerEmail, rolePassword);
  await expect(page.getByText("Facility workspace", { exact: true })).toBeVisible();
});
