import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against a locally running Plane API.
 *
 *   docker compose -f docker-compose-local.yml -f docker-compose.override.yml up -d
 *   npx playwright test
 *
 * Serial by design: each spec creates its own workspace, and Plane's sign-up
 * is rate-limited, so parallel workers trip the throttle rather than the code.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLANE_API_URL ?? "http://localhost:8010",
    trace: "retain-on-failure",
  },
});
