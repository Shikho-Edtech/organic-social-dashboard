# Playwright E2E Tests

Live-UI smoke checks. These complement `scripts/smoke-tests.ts` (data layer) by guarding the **rendered** state — banner presence/absence, cross-URL data consistency, URL-param handling.

## Why this exists

Manual live walks on the deployed Vercel dashboard have a known weakness: they don't enumerate URL-param × data-shape combinations rigorously and don't cross-compare sibling pages. The 2026-05-04 reactive cycle shipped 3 bugs that the user caught visually; smoke tests guarded the data layer but couldn't see the rendered UI. This suite closes that gap mechanically.

## Run

```bash
# Source .env.local first so DASHBOARD_PASSWORD + Sheets creds are present.
# (.env.local is loaded by Next.js when the dev server boots.)
npm run test:e2e
```

The first run installs the Chromium browser (~150MB). Subsequent runs are fast.

The Playwright config boots `npm run dev` automatically (or reuses a running one). Auth setup hits `/api/auth` with `DASHBOARD_PASSWORD` and persists the cookie to `tests/e2e/.auth/state.json`. Subsequent tests inherit that state.

## What's covered

| File | What it asserts |
|---|---|
| `auth.setup.ts` | Captures auth cookie via `/api/auth`. Runs before all other tests. |
| `rendered-ui.spec.ts` | The 3 bug shapes from 2026-05-04 + calibration KPI presence. Each test maps to a real bug we shipped a fix for. |

## Adding a test for a new bug

The rule is: when a UI bug surfaces, write the test FIRST (RED), then ship the fix (GREEN). For E2E tests:

1. Reproduce the bug on a local dev server. Note the specific URL and the visible (or missing) text/element that proves the bug.
2. Add a `test()` block to `rendered-ui.spec.ts` (or a new `*.spec.ts` file) that loads the URL and asserts the buggy state. Run it to confirm RED.
3. Fix the bug. Re-run to confirm GREEN.
4. Commit both the test and the fix in one PR.

## Why not run on every push?

Right now `npm run predeploy` chains `smoke + rsc:audit + brand:audit + build` — each <10s. Adding Playwright (~30-60s with cold install, ~15s warm) would slow every push noticeably.

The pragmatic split:
- **`predeploy`** runs on every push — fast, mechanical, must always pass
- **`test:e2e`** runs manually before risky UI changes, and as a separate CI job that's allowed to be slow

If E2E catches bugs that `predeploy` misses repeatedly, promote E2E into the predeploy chain.

## Auth bypass safety

The auth setup runs against the LOCAL dev server using the local `DASHBOARD_PASSWORD`. There is no production exposure. The persisted cookie in `.auth/state.json` is gitignored. Production middleware never sees any test-only env var or cookie.
