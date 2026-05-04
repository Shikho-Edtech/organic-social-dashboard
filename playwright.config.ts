import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config.
 *
 * Why this exists (2026-05-04 follow-up): the manual live-walks I run as
 * verification have a known weakness — they don't enumerate URL-param ×
 * data-shape combinations rigorously, and they don't cross-compare
 * sibling pages. The 2026-05-04 reactive cycle shipped 3 bugs that the
 * user caught visually: same banner-gate fix not ported to /plan, two
 * /diagnosis views showing different rows for the same week, and a
 * cold-start transient. Smoke tests now guard the data layer; RSC
 * audit guards the boundary; this E2E suite guards the rendered UI.
 *
 * Strategy:
 *   - Tests run against a LOCAL `npm run dev` server (no Vercel involvement).
 *     `webServer` block boots/tears down the dev server per test run.
 *   - Auth bypass: a global setup file (`tests/e2e/auth.setup.ts`) hits
 *     /api/auth with the local DASHBOARD_PASSWORD, captures the auth
 *     cookie, and persists it as `storageState`. Every test loads that
 *     state so they skip the login redirect.
 *   - Test scope: assertions on the bug shapes we've shipped fixes for
 *     (banner presence/absence, cross-URL data consistency, URL-param
 *     matrix). Each future bug gets a test added BEFORE the fix ships.
 *
 * Run: `npm run test:e2e` (boots dev server, auths, runs all tests).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,  // tests share dev server + auth state; serial is safer
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // NOTE: storageState is NOT set globally. The setup project runs
    // unauthenticated to CREATE the file; only the chromium project loads it.
  },

  projects: [
    // Setup project runs first, captures auth cookie via API.
    // Runs unauthed (no storageState) — that's the point: it auths.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Main test project depends on setup completing.
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Auth state seeded by setup project; tests inherit it.
        storageState: "tests/e2e/.auth/state.json",
      },
      dependencies: ["setup"],
    },
  ],

  // Boots `npm run dev` automatically; reuses if already running on :3000.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
