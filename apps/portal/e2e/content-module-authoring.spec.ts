import { expect, test } from "@playwright/test";

test("programme admin can save a structured learning module draft", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  let submittedForm = "";
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/auth/session") {
      await route.fulfill({
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
      return;
    }
    if (url.pathname === "/api/v1/auth/csrf") {
      await route.fulfill({
        json: { data: { csrfToken: "e2e-token" } },
        headers: { "Set-Cookie": "csrftoken=e2e-token; Path=/; SameSite=Lax" },
      });
      return;
    }
    if (url.pathname === "/api/v1/dashboard/summary") {
      await route.fulfill({ json: { data: { readiness: {} } } });
      return;
    }
    if (url.pathname === "/api/v1/activity") {
      await route.fulfill({ json: { data: { results: [], pagination: {} } } });
      return;
    }
    if (url.pathname === "/api/v1/dashboard") {
      await route.fulfill({ json: { data: { indicators: {} } } });
      return;
    }
    if (url.pathname === "/api/v1/programme/settings") {
      await route.fulfill({
        json: {
          data: {
            require_mentor_training_before_placement: false,
            directory_reviewed_at: null,
          },
        },
      });
      return;
    }
    if (url.pathname === "/api/v1/library") {
      await route.fulfill({
        json: {
          data: [],
          meta: {
            total: 0,
            counts: { all: 0, guide: 0, module: 0, document: 0, external: 0 },
          },
        },
      });
      return;
    }
    if (
      url.pathname === "/api/v1/training/modules/admin" &&
      request.method() === "POST"
    ) {
      submittedForm = request.postData() ?? "";
      await route.fulfill({
        status: 201,
        json: {
          data: {
            id: "module-e2e-1",
            title: "Safe handover",
            slug: "safe-handover",
            description: "A short handover guide.",
            pass_mark: 70,
            is_required: false,
            category: "clinical_care",
            visible_roles: ["mentor"],
            cover_image: "",
            status: "draft",
            updated_at: "2026-11-09T00:00:00Z",
            completed: false,
            score: null,
            lessons: [
              {
                id: "lesson-e2e-1",
                position: 1,
                title: "SBAR handover",
                body: "Use a structured handover.",
                lesson_type: "reading",
                duration_minutes: 5,
              },
            ],
            quiz: [],
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { data: [] } });
  });

  await page.goto("/admin/content/new/module");
  await expect(page.getByRole("heading", { name: "Create learning module" })).toBeVisible();
  await page.getByLabel(/Lesson title/).fill("SBAR handover");
  await page.locator(".tiptap[contenteditable='true']").fill("Use a structured handover.");
  await page.getByPlaceholder("Mentor orientation").fill("Safe handover");
  await page
    .getByPlaceholder("Describe what learners will gain from this module.")
    .fill("A short handover guide.");
  await page.getByRole("button", { name: "Save draft" }).first().click();

  await expect(page.getByText("Your changes have been saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Content library" })).toBeVisible();
  expect(submittedForm).toContain('name="lessons"');
  expect(submittedForm).toContain('"title":"SBAR handover"');
  expect(submittedForm).toContain('"body":"Use a structured handover."');
  expect(page.locator("button button")).toHaveCount(0);
  expect(consoleErrors.join("\n")).not.toContain("<button> cannot be a descendant of <button>");
});
