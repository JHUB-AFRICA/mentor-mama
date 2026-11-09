import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // The local authenticated journeys intentionally share one deterministic
  // MFA account. Keep tests in this file serial to avoid session-state races.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["junit", { outputFile: "test-results/e2e-junit.xml" }],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "python manage.py runserver 127.0.0.1:8000",
      cwd: "../../backend",
      url: "http://127.0.0.1:8000/api/v1/auth/session",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm dev --host 127.0.0.1 --port 5173",
      cwd: ".",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
