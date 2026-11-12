import { expect, test } from "@playwright/test";

const accounts = [
  { role: "program_admin", role_label: "Programme Administrator", name: "Jane Wairimu", email: "jane.wairimu@demo.sinapstechnology.tech" },
  { role: "coordinator", role_label: "University Coordinator", name: "Peter Njoroge", email: "peter.njoroge@demo.sinapstechnology.tech" },
  { role: "nurse_manager", role_label: "Nurse Manager", name: "Grace Muthoni", email: "grace.muthoni@demo.sinapstechnology.tech" },
  { role: "mentor", role_label: "Clinical Mentor", name: "Esther Wanjiru", email: "esther.wanjiru@demo.sinapstechnology.tech" },
  { role: "student", role_label: "Student", name: "Faith Achieng", email: "faith.achieng@demo.sinapstechnology.tech" },
];

test("demo access: pick a role, see the account, use it, and the form fills in before signing in", async ({ page }) => {
  let signedInAs = "";
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return json({ authenticated: false, user: null });
    if (path === "/api/v1/auth/demo") return json({ enabled: true, accounts });
    if (path === "/api/v1/auth/demo/login") {
      signedInAs = (request.postDataJSON() as { role: string }).role;
      return json({ id: "u1", email: "faith.achieng@demo.sinapstechnology.tech", name: "Faith Achieng", role: "student", capabilities: {}, scope: {} });
    }
    return json([]);
  });
  await page.goto("/");

  // Five roles, the first is selected, and its account card is shown.
  await expect(page.getByRole("tab")).toHaveCount(5);
  await expect(page.getByRole("tab", { name: /Admin/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Programme Administrator demo")).toBeVisible();

  // Choosing another role swaps the card.
  await page.getByRole("tab", { name: /Student/ }).click();
  const card = page.getByRole("tabpanel");
  await expect(card.getByText("Student demo")).toBeVisible();
  await expect(card.getByText("faith.achieng@demo.sinapstechnology.tech")).toBeVisible();
  await expect(card.getByText("Filled for you")).toBeVisible();
  // Nothing has been typed or sent yet.
  await expect(page.getByLabel("Email address")).toHaveValue("");
  expect(signedInAs).toBe("");

  // "Use this account" fills the form with that account, then signs in as that role.
  await card.getByRole("button", { name: "Use this account" }).click();
  await expect(page.getByLabel("Email address")).toHaveValue("faith.achieng@demo.sinapstechnology.tech");
  await expect(page.locator("input[type=password]")).not.toHaveValue("");
  await expect.poll(() => signedInAs).toBe("student");
});

test("no demo card appears when demo mode is off", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { csrfToken: "t" } }, headers: { "Set-Cookie": "csrftoken=t; Path=/" } });
    if (path === "/api/v1/auth/session") return route.fulfill({ json: { data: { authenticated: false, user: null } } });
    if (path === "/api/v1/auth/demo") return route.fulfill({ json: { data: { enabled: false, accounts: [] } } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByText("Explore demo accounts")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
});
