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
    if (url.pathname === "/api/v1/training/media" && request.method() === "POST") {
      await route.fulfill({
        status: 201,
        json: { data: { id: "11111111-1111-1111-1111-111111111111", url: "/api/v1/training/media/11111111-1111-1111-1111-111111111111", alt: "A ward corridor", width: 1, height: 1 } },
      });
      return;
    }
    if (url.pathname.startsWith("/api/v1/training/media/")) {
      await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
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
  await page.getByLabel(/Section \(optional\)/).fill("Before the shift");
  await page.getByRole("button", { name: "Safety box" }).click();
  page.once("dialog", (dialog) => void dialog.accept("A ward corridor"));
  await page.getByRole("toolbar", { name: "Lesson formatting" }).locator('input[type="file"]').setInputFiles({
    name: "ward.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(page.locator(".content-module-editor img[alt='A ward corridor']")).toBeVisible();
  await page.getByPlaceholder("Mentor orientation").fill("Safe handover");
  await page
    .getByPlaceholder("Describe what learners will gain from this module.")
    .fill("A short handover guide.");
  await page.getByText("Include a knowledge check").click();
  // A practice question under the lesson (first "Add question"), then the final check (last).
  await page.getByRole("button", { name: "Add question" }).first().click();
  const practice = page.getByRole("dialog");
  await practice.getByRole("textbox", { name: "Question", exact: true }).fill("Why structure a handover?");
  await practice.getByLabel("Answer 1", { exact: true }).fill("Safety");
  await practice.getByLabel("Answer 2", { exact: true }).fill("Speed only");
  await practice.getByLabel("Answer 1 is correct").check();
  await practice.getByRole("button", { name: "Save question" }).click();
  await page.getByRole("button", { name: "Add question" }).last().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Question type").selectOption("multi");
  await dialog.getByLabel("Case description (optional)").fill("A mentor hands over at 7am.");
  await dialog.getByRole("textbox", { name: "Question", exact: true }).fill("Which items belong in handover?");
  await dialog.getByLabel("Answer 1", { exact: true }).fill("Patient status");
  await dialog.getByLabel("Answer 2", { exact: true }).fill("Pending tasks");
  await dialog.getByLabel("Answer 3", { exact: true }).fill("Weather");
  await dialog.getByLabel("Answer 1 is correct").check();
  await dialog.getByLabel("Answer 2 is correct").check();
  await dialog.getByLabel("Feedback for answer 3").fill("Not clinically relevant.");
  await dialog.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByText("Multiple select · case-based · 3 answers")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).first().click();

  await expect(page.getByText("Your changes have been saved.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/content\/item\/module\//);
  expect(submittedForm).toContain('name="lessons"');
  expect(submittedForm).toContain('"title":"SBAR handover"');
  // The lesson keeps its formatting: the body is the editor document, not plain text.
  expect(submittedForm).toContain('\\"type\\":\\"doc\\"');
  expect(submittedForm).toContain("Use a structured handover.");
  expect(submittedForm).toContain('\\"type\\":\\"callout\\"');
  expect(submittedForm).toContain("/api/v1/training/media/11111111-1111-1111-1111-111111111111");
  expect(submittedForm).toContain("Before the shift");
  expect(submittedForm).toContain('"kind":"multi"');
  expect(submittedForm).toContain("Patient status");
  expect(submittedForm).toContain("Why structure a handover?");
  expect(submittedForm).toMatch(/"lesson_id":"[0-9a-f-]{36}"/);
  expect(submittedForm).toContain("Not clinically relevant.");
  expect(page.locator("button button")).toHaveCount(0);
  expect(consoleErrors.join("\n")).not.toContain("<button> cannot be a descendant of <button>");
});
