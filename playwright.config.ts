import { defineConfig } from "@playwright/test";

// Browser tests: they drive a production build of Agora (next build + next start) against a throwaway
// database and a mail catcher. Run them with `npm run test:e2e`; see e2e/README.md for what they need.
const port = Number(process.env.E2E_PORT ?? 3100);
const databaseUrl = process.env.E2E_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "e2e",
  // The files build on each other (the first creates the site), so they run one after another, in name order.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    // Locally the system Chrome can be used (E2E_CHANNEL=chrome); in CI Playwright's own Chromium is.
    channel: process.env.E2E_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next start --port ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_URL: databaseUrl,
      NEXT_PUBLIC_BASE_URL: `http://localhost:${port}`,
      // Storage is never used by these tests, but the app expects the settings.
      MINIO_ENDPOINT: "http://localhost:9000",
      MINIO_PUBLIC_ENDPOINT: "http://localhost:9000",
      MINIO_BUCKET: "agora-e2e",
      MINIO_ROOT_USER: "e2e",
      MINIO_ROOT_PASSWORD: "e2e-password-not-used",
      SETUP_TOKEN: "e2e-setup-token",
      APP_SECRET: "e2e-application-secret-0123456789",
      MAIL_HOST: process.env.E2E_MAIL_HOST ?? "localhost",
      MAIL_PORT: process.env.E2E_MAIL_PORT ?? "1025",
      MAIL_FROM: "site@example.test",
      // So the timer that sends scheduled posts and new-post emails does not make the tests wait a minute.
      PUBLISHER_INTERVAL_SECONDS: "2",
      ALLOW_FREE_SUBSCRIPTIONS: "false",
    },
  },
});
