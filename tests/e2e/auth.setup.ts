import { test as setup, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Auth setup: hits /api/auth with the local DASHBOARD_PASSWORD, captures
 * the auth cookie, persists to tests/e2e/.auth/state.json. Subsequent
 * test projects load that storageState and skip the login redirect.
 *
 * Why API not UI: faster (no DOM render), more reliable (no flaky
 * selectors), and the route's contract is what production uses anyway.
 */
const STORAGE_STATE = path.join(__dirname, ".auth", "state.json");

setup("authenticate against local dev server", async ({ request }) => {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    throw new Error(
      "DASHBOARD_PASSWORD env var not set. Tests need it to auth against " +
      "the local dev server. Source from .env.local before running playwright.",
    );
  }

  const res = await request.post("/api/auth", {
    data: { password },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);

  // Capture and persist cookies for subsequent test runs.
  const dir = path.dirname(STORAGE_STATE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await request.storageState({ path: STORAGE_STATE });
});
