import { expect, type Page } from "@playwright/test";
import crypto from "node:crypto";

let lastUsedTotpStep = 0;

function currentTotp(secret: string, step = Math.floor(Date.now() / 30_000)): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replace(/=+$/, "")) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function waitForNextTotpStep(page: Page): Promise<number> {
  const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
  await page.waitForTimeout((remaining + 1) * 1000);
  return Math.floor(Date.now() / 30_000);
}

export async function signInAsProgramAdmin(page: Page) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const secret = process.env.E2E_TOTP_SECRET;
  if (!email || !password || !secret) throw new Error("Set E2E_EMAIL, E2E_PASSWORD, and E2E_TOTP_SECRET for authenticated acceptance.");

  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.locator("input[type=password]").first().fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Authenticator code")).toBeVisible();

  let step = Math.floor(Date.now() / 30_000);
  if (step <= lastUsedTotpStep) step = await waitForNextTotpStep(page);
  else if (30 - (Math.floor(Date.now() / 1000) % 30) < 3) step = await waitForNextTotpStep(page);

  await page.getByLabel("Authenticator code").fill(currentTotp(secret, step));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  lastUsedTotpStep = step;

  const overview = page.getByRole("heading", { name: "Programme overview" });
  const invalidCode = page.getByText("The authenticator code is invalid.");
  await expect(overview.or(invalidCode)).toBeVisible({ timeout: 5_000 });
  if (await invalidCode.isVisible()) {
    step = await waitForNextTotpStep(page);
    await page.getByLabel("Authenticator code").fill(currentTotp(secret, step));
    await page.getByRole("button", { name: "Verify and continue" }).click();
    lastUsedTotpStep = step;
  }
  await expect(overview).toBeVisible();
}
