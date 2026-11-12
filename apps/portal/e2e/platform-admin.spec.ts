import { expect, test, type Page } from "@playwright/test";

const admin = {
  id: "p1",
  email: "admin@mentamama.com",
  name: "Platform Administrator",
  role: "platform_admin",
  capabilities: {},
  scope: {},
};

const overview = {
  programmes: 2,
  accounts: {
    active: 14,
    invited: 3,
    invitations_expired: 1,
    suspended: 1,
    deactivated: 0,
    by_role: [
      { role: "program_admin", label: "Programme Administrator", active: 2 },
      { role: "mentor", label: "Clinical Mentor", active: 8 },
    ],
  },
  support_pending: 1,
  programmes_without_admin: 0,
  signins_last_7_days: 9,
  system: {
    overall: "warning",
    release: "abc1234",
    environment: "production",
    checked_at: "2026-11-12T10:00:00Z",
    checks: [
      { name: "Database", state: "ok", detail: "postgresql", ms: 3 },
      { name: "Background jobs", state: "ok", detail: "Last run 4s ago · 0 waiting", ms: 2 },
      { name: "Email", state: "warning", detail: "Resend · delivery tracking not connected", ms: 1 },
    ],
  },
};

const account = {
  id: "u2",
  name: "Pat Admin",
  email: "pat@jkuat.example",
  phone: "",
  role: "program_admin",
  role_label: "Programme Administrator",
  status: "active",
  programme_id: "prog1",
  programme: "JKUAT Pilot",
  invitation: null,
  invitation_sent_at: null,
  last_login: "2026-11-11T08:00:00Z",
  created_at: "2026-11-01T08:00:00Z",
  must_change_password: false,
};

async function mock(page: Page, state: { signedIn: boolean; mustChange: boolean; calls: string[] }) {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    state.calls.push(`${request.method()} ${path}`);
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session")
      return json({ authenticated: state.signedIn, user: state.signedIn ? { ...admin, must_change_password: state.mustChange } : null });
    if (path === "/api/v1/auth/login") {
      const body = request.postDataJSON() as { portal?: string };
      if (body.portal !== "platform") return route.fulfill({ status: 403, json: { error: { code: "UsePlatformSignIn", message: "Platform administrators sign in at the platform administration page." } } });
      state.signedIn = true;
      return json({ ...admin, must_change_password: state.mustChange });
    }
    if (path === "/api/v1/auth/password-change") {
      const body = request.postDataJSON() as { new_password: string };
      if (body.new_password.startsWith("Password"))
        return route.fulfill({ status: 400, json: { new_password: ["This password is too common."], error: { code: "ValidationError", message: "New password: This password is too common." } } });
      state.mustChange = false;
      return json({ accepted: true, user: { ...admin, must_change_password: false } });
    }
    if (path === "/api/v1/platform/overview") {
      await new Promise((resolve) => setTimeout(resolve, 600)); // long enough to see the loading skeleton
      return json(overview);
    }
    if (path === "/api/v1/platform/programmes") return json([]);
    if (path === "/api/v1/platform/accounts") return json({ results: [account], pagination: { page: 1, pages: 1, total: 1 } });
    if (path === "/api/v1/platform/accounts/u2/status") return json({ id: "u2", status: "suspended" });
    if (path === "/api/v1/ai/status") return json({ assistant: false, lesson_explanations: false });
    return json([]);
  });
}

test("platform admin signs in at /platform, replaces the initial password and manages accounts", async ({ page }) => {
  const state = { signedIn: false, mustChange: true, calls: [] as string[] };
  await mock(page, state);

  // Start deep inside the workspace: after the password step the person must still land on the Overview.
  await page.goto("/platform/accounts");
  await expect(page.getByRole("heading", { name: "Platform sign-in." })).toBeVisible();
  await page.getByLabel("Email address").fill(admin.email);
  await page.getByLabel("Password", { exact: true }).fill("Initial-Password-2026!");
  await page.getByRole("button", { name: "Sign in" }).click();

  // First sign-in: nothing but the password change is reachable.
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toBeVisible();
  expect(state.calls.some((call) => call.includes("/platform/accounts"))).toBe(false);
  await page.getByLabel(/^Initial password/).fill("Initial-Password-2026!");
  // A rejected password shows the server's reason inline, and the person stays on this step.
  await page.getByLabel(/^New password/).fill("Password123456");
  await page.getByLabel(/^Confirm new password/).fill("Password123456");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("alert")).toHaveText("New password: This password is too common.");
  await page.getByLabel(/^New password/).fill("My-Own-Strong-Pass-77");
  await page.getByLabel(/^Confirm new password/).fill("My-Own-Strong-Pass-77");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Straight to the Overview: skeleton first, then the status board.
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole("status", { name: "Loading platform overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toHaveCount(0);
  await expect(page.getByText("Resend · delivery tracking not connected")).toBeVisible();
  await expect(page.getByText("Release abc1234")).toBeVisible();

  // Accounts: suspend with a recorded reason.
  await page.getByRole("button", { name: "Accounts & invitations" }).first().click();
  await expect(page.getByText("pat@jkuat.example")).toBeVisible();
  await page.getByRole("button", { name: "Suspend" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Suspend" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Left the programme");
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect.poll(() => state.calls.includes("POST /api/v1/platform/accounts/u2/status")).toBe(true);
});

test("the workspace sign-in sends platform admins to their own page", async ({ page }) => {
  const state = { signedIn: false, mustChange: false, calls: [] as string[] };
  await mock(page, state);
  await page.goto("/");
  await page.getByLabel("Email address").fill(admin.email);
  await page.getByLabel("Password", { exact: true }).fill("Whatever-Password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Platform administrators sign in at the platform administration page.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to platform sign-in" })).toHaveAttribute("href", "/platform");
});
