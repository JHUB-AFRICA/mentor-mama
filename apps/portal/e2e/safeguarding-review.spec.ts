import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

function totp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "")) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function waitForTotpWindow(page: import("@playwright/test").Page) {
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remaining < 8) await page.waitForTimeout((remaining + 1) * 1000);
}

async function signIn(page: import("@playwright/test").Page, email: string, password: string, setupMfa = false) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.locator("input[type=password]").first().fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const requiresMfa = setupMfa || email.includes("manager");
  if (!requiresMfa) return;
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  const secret = setupMfa ? (await page.locator("p.font-mono").first().textContent())?.trim() : process.env.E2E_TOTP_SECRET;
  expect(secret).toBeTruthy();
  await waitForTotpWindow(page);
  await page.getByLabel("Authenticator code").fill(totp(secret!));
  await page.getByRole("button", { name: setupMfa ? "Enable MFA" : "Verify and continue" }).click();
  if (setupMfa) {
    await expect(page.getByRole("heading", { name: "Save your recovery codes." })).toBeVisible();
    await page.getByText("I have stored these recovery codes somewhere safe.").click();
    await page.getByRole("button", { name: "Continue to workspace" }).click();
  }
}

test("student concern reaches an authorised reviewer and is closed", async ({ page }) => {
  const password = process.env.E2E_WORKFLOW_PASSWORD;
  test.skip(!password, "Set E2E_WORKFLOW_PASSWORD for the safeguarding workflow journey.");
  execFileSync("python", ["backend/manage.py", "seed_e2e_student_workflow", "--password", password!, "--reset"], { cwd: "../..", stdio: "ignore" });

  await signIn(page, "e2e-student-workflow-student@mentormama.test", password!);
  await expect(page.getByRole("heading", { name: "Stay clear on what comes next." })).toBeVisible();
  await page.getByRole("button", { name: "Confirm your placement" }).click();
  await page.getByRole("button", { name: "Review assignment" }).click();
  await page.locator(".placement-document-viewer").evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll")); });
  await page.getByText("I have read and reviewed the placement assignment.", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Acknowledge placement" }).click();
  await expect(page.getByRole("heading", { name: "Complete your orientation", exact: true })).toBeVisible();
  await page.getByText(/Your placement details/).click();
  await page.getByText(/The emergency process/).click();
  await page.getByText(/Safeguarding, professional/).click();
  await page.getByRole("button", { name: "Complete orientation acknowledgement" }).click();
  await expect(page.getByRole("heading", { name: "Raise a private concern" })).toBeVisible();
  await page.getByLabel("What happened?").fill("A private safeguarding concern needs an authorised review.");
  await page.getByRole("button", { name: "Submit private concern" }).click();
  await expect(page.getByRole("status")).toContainText("submitted");
  await page.getByRole("button", { name: "Sign out" }).click();

  process.env.E2E_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
  await signIn(page, "e2e-student-workflow-manager@mentormama.test", password!);
  await expect(page.getByRole("heading", { name: "Concerns requiring attention" })).toBeVisible();
  await page.getByRole("button", { name: "Assign to me" }).click();
  await page.getByRole("button", { name: "Review →" }).click();
  await page.getByLabel("Finding").fill("The concern was reviewed through the safeguarding process.");
  await page.getByRole("button", { name: "Record finding" }).click();
  await page.getByRole("button", { name: "Review →" }).click();
  await page.getByLabel("Action taken").fill("Follow-up action was agreed and documented.");
  await page.getByRole("button", { name: "Mark resolved" }).click();
  await page.getByRole("button", { name: "Review →" }).click();
  await page.getByRole("button", { name: "Close concern" }).click();
  await expect(page.getByText("0 open")).toBeVisible();
});
