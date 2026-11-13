import { expect, test, type Page } from "@playwright/test";

const MESSAGES: Record<string, string> = {
  AccountSuspended: "Your account is paused. A password reset will not restore access. Contact your Programme Administrator for help.",
  AccountDeactivated: "This account is no longer active. A password reset will not restore access. Contact your Programme Administrator for help.",
};

async function mock(page: Page, code: string) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return route.fulfill({ json: { data: { authenticated: false, user: null } } });
    if (path === "/api/v1/auth/demo") return route.fulfill({ json: { data: { enabled: false, accounts: [] } } });
    if (path === "/api/v1/auth/login") return route.fulfill({ status: 403, json: { error: { code, message: MESSAGES[code] } } });
    return route.fulfill({ json: { data: [] } });
  });
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email address").fill("faith.achieng@example.org");
  await page.getByPlaceholder("Enter your password").fill("a-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("account status after sign-in", () => {
  test("a paused account gets clear next steps, the account name and a ready-to-send message", async ({ page }) => {
    await mock(page, "AccountSuspended");
    await signIn(page);
    await expect(page).toHaveURL(/\/account-status\?status=suspended$/);
    await expect(page.getByRole("heading", { name: "Your access is paused for now.", level: 1 })).toBeVisible();
    await expect(page.getByText("Account:")).toContainText("faith.achieng@example.org");
    await expect(page.getByText("What to do next")).toBeVisible();
    await expect(page.getByText(/Contact your Programme Administrator, the person who runs your programme/)).toBeVisible();
    await expect(page.getByText(/we’ll email you, and you can sign in with your usual password/)).toBeVisible();

    // The main action is to get help, with the message already written. Signing in again is secondary.
    const support = page.getByRole("link", { name: /Email MentorMAMA support/ });
    const href = (await support.getAttribute("href")) ?? "";
    expect(href).toMatch(/^mailto:/);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("My MentorMAMA account is paused");
    expect(decoded).toContain("Account: faith.achieng@example.org");
    await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/");
  });

  test("a deactivated account is told plainly and is not promised a restore", async ({ page }) => {
    await mock(page, "AccountDeactivated");
    await signIn(page);
    await expect(page).toHaveURL(/status=deactivated$/);
    await expect(page.getByRole("heading", { name: "This account is no longer active.", level: 1 })).toBeVisible();
    await expect(page.getByText("If the account is reactivated, we’ll email you.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Email MentorMAMA support/ })).toBeVisible();
  });

  test("opening the status page directly still works without an account name, and fits a phone", async ({ page }) => {
    await mock(page, "AccountSuspended");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/account-status?status=suspended");
    await expect(page.getByRole("heading", { name: "Your access is paused for now.", level: 1 })).toBeVisible();
    await expect(page.getByText("Account:")).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("link", { name: /Email MentorMAMA support/ })).toBeInViewport({ ratio: 0.5 });
  });

  test("a signed-out notice still leads with signing in again", async ({ page }) => {
    await mock(page, "AccountSuspended");
    await page.goto("/account-status?status=revoked");
    await expect(page.getByRole("link", { name: /Sign in again/ })).toHaveAttribute("href", "/");
  });
});
