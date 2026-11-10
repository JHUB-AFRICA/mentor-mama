import { expect, test, type Page } from "@playwright/test";

// Uses the system Chrome when Playwright's bundled Chromium is not installed.
const ROUTE = "/admin/content/new/module";

test.use(process.env.CI ? {} : { channel: "chrome", video: "off" });

interface Captured {
  chatBodies: { message: string; history: unknown[]; page: string }[];
}

async function mockApi(page: Page, options: { assistant: boolean }): Promise<Captured> {
  const captured: Captured = { chatBodies: [] };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    switch (url.pathname) {
      case "/api/v1/auth/session":
        return route.fulfill({
          json: {
            data: {
              authenticated: true,
              user: {
                id: "e2e-programme-admin",
                email: "admin@example.test",
                name: "E2E Admin",
                role: "program_admin",
                capabilities: { manage_content: true },
              },
            },
          },
        });
      case "/api/v1/auth/csrf":
        return route.fulfill({
          json: { data: { csrfToken: "e2e-token" } },
          headers: { "Set-Cookie": "csrftoken=e2e-token; Path=/; SameSite=Lax" },
        });
      case "/api/v1/ai/status":
        return route.fulfill({
          json: { data: { lesson_explanations: options.assistant, assistant: options.assistant } },
        });
      case "/api/v1/library":
        return route.fulfill({
          json: { data: [], meta: { total: 0, counts: { all: 0, guide: 0, module: 0, document: 0, external: 0 } } },
        });
      case "/api/v1/assistant/navigation":
        return route.fulfill({
          json: {
            data: [
              { id: "overview", label: "Overview", href: "/admin", description: "Programme readiness.", asks: ["What needs my attention?"] },
              { id: "people", label: "People & access", href: "/admin/people", description: "Invite people and manage access.", asks: [] },
              { id: "content", label: "Content library", href: "/admin/content", description: "Training modules and guides.", asks: ["Who can see a library item?"] },
              { id: "new_module", label: "Create learning module", href: "/admin/content/new/module", description: "Author a training module.", asks: [] },
            ],
          },
        });
      case "/api/v1/assistant/chat": {
        const body = request.postDataJSON() as Captured["chatBodies"][number];
        captured.chatBodies.push(body);
        if (body.message.includes("fail")) {
          return route.fulfill({ status: 503, json: { error: { code: "ai_unavailable", message: "x" } } });
        }
        return route.fulfill({
          json: {
            data: {
              reply: "Publish it from the Content library.",
              sources: [{ title: "Content guide", kind: "Library" }],
              actions: [{ id: "content", label: "Content library", href: "/admin/content" }],
            },
          },
        });
      }
      case "/api/v1/dashboard/summary":
        return route.fulfill({ json: { data: { readiness: {} } } });
      case "/api/v1/activity":
        return route.fulfill({ json: { data: { results: [], pagination: {} } } });
      case "/api/v1/dashboard":
        return route.fulfill({ json: { data: { indicators: {} } } });
      case "/api/v1/programme/settings":
        return route.fulfill({
          json: { data: { name: "E2E Programme", require_mentor_training_before_placement: false, directory_reviewed_at: null } },
        });
      default:
        return route.fulfill({ json: { data: [] } });
    }
  });
  return captured;
}

async function box(page: Page) {
  const bounds = await page.getByRole("button", { name: "Menta, your AI buddy" }).boundingBox();
  if (!bounds) throw new Error("Menta button not found");
  return bounds;
}

test("Menta is hidden when the assistant is not configured", async ({ page }) => {
  await mockApi(page, { assistant: false });
  await page.goto(ROUTE);
  await page.waitForResponse("**/api/v1/ai/status");
  await expect(page.getByRole("button", { name: "Menta, your AI buddy" })).toHaveCount(0);
});

test("Menta greets the user once per session and can be dismissed", async ({ page }) => {
  await mockApi(page, { assistant: true });
  await page.goto(ROUTE);
  const greeting = page.getByRole("status").filter({ hasText: /Good (morning|afternoon|evening), E2E!/ });
  await expect(greeting).toBeVisible({ timeout: 6000 });
  await expect(greeting.getByText("Ask me about publishing modules or managing access.")).toBeVisible();
  await greeting.getByRole("button", { name: "Dismiss greeting" }).click();
  await expect(greeting).toHaveCount(0);
  // Same session: reloading must not greet again.
  await page.reload();
  await expect(page.getByRole("button", { name: "Menta, your AI buddy" })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByText(/Good (morning|afternoon|evening), E2E!/)).toHaveCount(0);
});

test("Menta can be dragged, remembers its place, and answers questions", async ({ page }) => {
  const captured = await mockApi(page, { assistant: true });
  await page.goto(ROUTE);
  const button = page.getByRole("button", { name: "Menta, your AI buddy" });
  await expect(button).toBeVisible();

  const viewport = page.viewportSize()!;
  const start = await box(page);
  expect(start.x + start.width).toBeLessThanOrEqual(viewport.width);
  expect(start.y + start.height).toBeLessThanOrEqual(viewport.height);
  expect(start.x).toBeGreaterThan(viewport.width / 2);

  // Dragging moves it without opening the panel (hold still before release to avoid momentum).
  await page.mouse.move(start.x + 34, start.y + 34);
  await page.mouse.down();
  await page.mouse.move(start.x + 34 - 300, start.y + 34 - 200, { steps: 8 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const moved = await box(page);
  expect(Math.abs(moved.x - (start.x - 300))).toBeLessThan(6);
  expect(Math.abs(moved.y - (start.y - 200))).toBeLessThan(6);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Throwing it far off-screen is contained within the viewport.
  await page.mouse.move(moved.x + 34, moved.y + 34);
  await page.mouse.down();
  await page.mouse.move(-500, -500, { steps: 4 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const clamped = await box(page);
  expect(clamped.x).toBeGreaterThanOrEqual(0);
  expect(clamped.y).toBeGreaterThanOrEqual(0);

  // Position survives a reload.
  await page.reload();
  await expect(button).toBeVisible();
  const restored = await box(page);
  expect(Math.abs(restored.x - clamped.x)).toBeLessThan(4);
  expect(Math.abs(restored.y - clamped.y)).toBeLessThan(4);

  // Shift+Arrow nudges for keyboard users.
  await button.focus();
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(600);
  const nudged = await box(page);
  expect(nudged.x - restored.x).toBeGreaterThanOrEqual(12);

  // Enter opens the panel (keyboard), Escape closes it and returns focus.
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Menta, your AI buddy" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Don’t enter patient or personal details", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();

  // Click opens; suggestions work; replies show sources.
  await button.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: /Good (morning|afternoon|evening), E2E/ })).toBeVisible();
  await dialog.getByRole("button", { name: "How do I publish a training module?" }).click();
  await expect(dialog.getByText("Publish it from the Content library.")).toBeVisible();
  await expect(dialog.getByLabel("Sources").getByText("Content guide")).toBeVisible();
  expect(captured.chatBodies[0]).toMatchObject({
    message: "How do I publish a training module?",
    history: [],
    page: ROUTE,
  });

  // Follow-up carries history; failures show a calm message and are not replayed.
  await dialog.getByLabel("Message Menta").fill("fail please");
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("I couldn’t answer just now.")).toBeVisible();
  await dialog.getByLabel("Message Menta").fill("and then?");
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("Publish it from the Content library.")).toHaveCount(2);
  expect(captured.chatBodies.at(-1)!.history).toEqual([
    { role: "user", content: "How do I publish a training module?" },
    { role: "assistant", content: "Publish it from the Content library." },
    { role: "user", content: "fail please" },
  ]);

  // The panel stays inside the viewport wherever Menta sits.
  const panel = (await dialog.boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
  expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);

  // New conversation clears the thread.
  await dialog.getByRole("button", { name: "Start a new conversation" }).click();
  await expect(dialog.getByText("I’m Menta.", { exact: false })).toBeVisible();
});

test("Menta wanders on its own when idle, and stays put when switched off", async ({ page }) => {
  test.setTimeout(90_000);
  await mockApi(page, { assistant: true });
  await page.goto(ROUTE);
  const button = page.getByRole("button", { name: "Menta, your AI buddy" });
  await expect(button).toBeVisible();

  // Turn wandering off in the panel; the choice persists.
  await button.click();
  const toggle = page.getByRole("switch", { name: "Let Menta wander around the screen" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Close Menta" }).click();
  const still = await box(page);
  await page.waitForTimeout(30_000);
  const afterOff = await box(page);
  expect(Math.abs(afterOff.x - still.x) + Math.abs(afterOff.y - still.y)).toBeLessThan(3);

  // Switch it back on: Menta strolls to somewhere new without being touched.
  await button.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Close Menta" }).click();
  const before = await box(page);
  await expect
    .poll(async () => {
      const now = await box(page);
      return Math.hypot(now.x - before.x, now.y - before.y);
    }, { timeout: 45_000, intervals: [1000] })
    .toBeGreaterThan(100);
  const viewport = page.viewportSize()!;
  const after = await box(page);
  expect(after.x).toBeGreaterThanOrEqual(0);
  expect(after.y).toBeGreaterThanOrEqual(0);
  expect(after.x + after.width).toBeLessThanOrEqual(viewport.width + 2);
  expect(after.y + after.height).toBeLessThanOrEqual(viewport.height + 2);
});

test("Menta respects reduced motion: no wandering control, still fully usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page, { assistant: true });
  await page.goto(ROUTE);
  const button = page.getByRole("button", { name: "Menta, your AI buddy" });
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("switch", { name: "Let Menta wander around the screen" })).toHaveCount(0);
  await dialog.getByLabel("Message Menta").fill("hello");
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("Publish it from the Content library.")).toBeVisible();
});

test("Menta panel fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockApi(page, { assistant: true });
  await page.goto(ROUTE);
  const button = page.getByRole("button", { name: "Menta, your AI buddy" });
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  const panel = (await dialog.boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(375);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(667);
  // Menta perches above the sheet instead of hiding behind it.
  const perched = await box(page);
  expect(perched.y + perched.height).toBeLessThanOrEqual(panel.y + 2);
  // The wander switch is not offered on phones.
  await expect(page.getByRole("switch", { name: "Let Menta wander around the screen" })).toHaveCount(0);
});

test("Menta navigates the portal: jump suggestions, reply buttons, shortcut, sidebar card", async ({ page }) => {
  await mockApi(page, { assistant: true });
  await page.goto("/admin");
  const button = page.getByRole("button", { name: "Menta, your AI buddy" });
  await expect(button).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "Menta, your AI buddy" });

  // Ctrl/Cmd+K toggles Menta from anywhere.
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("You’re on")).toContainText("Overview");
  // Screen-aware suggestion comes first.
  await expect(dialog.getByRole("button", { name: "What needs my attention?" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(dialog).toHaveCount(0);

  // Typing a screen name offers an instant jump, without asking the AI.
  await button.click();
  await dialog.getByLabel("Message Menta").fill("content");
  const jump = dialog.getByRole("button", { name: "Content library" });
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(page).toHaveURL(/\/admin\/content$/);
  await expect(dialog).toBeVisible(); // stays open on desktop while moving between screens

  // A reply carries server-validated navigation buttons.
  await dialog.getByLabel("Message Menta").fill("how do I publish?");
  await page.keyboard.press("Enter");
  await expect(dialog.getByText("Publish it from the Content library.")).toBeVisible();
  await page.goto("/admin");
  // The conversation survives navigation and reload in this tab.
  await button.click();
  await expect(dialog.getByText("Publish it from the Content library.")).toBeVisible();
  await dialog.getByLabel("Open a screen").getByRole("button", { name: "Content library" }).click();
  await expect(page).toHaveURL(/\/admin\/content$/);

  // Clicking outside the panel closes it.
  await page.mouse.click(700, 140);
  await expect(dialog).toHaveCount(0);

  // The sidebar card opens Menta too.
  await page.getByRole("button", { name: /Ask Menta/ }).click();
  await expect(dialog).toBeVisible();
});
