import { test, expect } from "@playwright/test";

/**
 * Rendered-UI smoke checks.
 *
 * These hit the live local dev server and assert specific rendered
 * properties — things that the data-layer smoke tests in
 * `scripts/smoke-tests.ts` can't see. Each test below maps to a real
 * bug that shipped in the 2026-05-04 reactive cycle. Future bug shapes
 * get a test added FIRST per the test-first rule (see
 * organic-social-dashboard/LEARNINGS.md 2026-05-04 retro).
 *
 * Why E2E not just smoke:
 *   - Smoke tests guard the LOGIC. They mock `readTab` and check
 *     return shapes. They can't see what actually renders.
 *   - These tests guard the RENDER. They load the actual page and
 *     assert specific text/elements are or aren't present.
 *   - Together they cover both halves of the bug surface.
 */

test.describe("/plan banner gating", () => {
  test("default this-week view does NOT show 'AI calendar is off this run' banner when calendar has slots", async ({ page }) => {
    // Bug shipped 2026-05-04: same banner-gate shape from /diagnosis
    // not ported to /plan. Banner appeared above 36 slots of legit
    // calendar content. User caught it.
    await page.goto("/plan");
    await page.waitForLoadState("networkidle");

    // Banner text should NOT appear when calendar has content.
    const aiOffBanner = page.getByText("AI calendar is off this run", {
      exact: false,
    });
    await expect(aiOffBanner).toHaveCount(0);

    // Sanity: the page rendered SOMETHING substantive (not a Next.js
    // loading skeleton). Either calendar slots, an empty-state card, or
    // the AIDisabledEmptyState card. Anything but a blank page is fine.
    const main = page.locator("main");
    const text = await main.innerText();
    const hasSubstance =
      /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/.test(text) ||
      /calendar has been generated|next weekly pipeline run|No calendar for this week|AI calendar is not running this week|AI calendar has never succeeded/i.test(text);
    expect(hasSubstance).toBe(true);
  });
});

// 2026-05-05: removed "/diagnosis cross-view consistency" test. The bug
// it guarded (same week showing different rows on /diagnosis vs
// /diagnosis?week=last) was fixed by simplifying getDiagnosisByWeekPreferred
// to always pick the LATEST matching row. As a side effect, /diagnosis
// no longer falls back to liveDiagnosis on this-week view — the two
// URLs are now intentionally OF DIFFERENT WEEKS by design (this-week vs
// last-week). Asserting they match is no longer meaningful. Smoke test
// `getDiagnosisByWeekPreferred + getLatestDiagnosis agree on which row
// when same week is latest` still guards the underlying invariant.

test.describe("/diagnosis week selector present on both branches", () => {
  // Bug shipped 2026-05-05: empty-state render branch (when no AI row
  // exists for this week + AI off) was missing the WeekSelector. User
  // landing on default /diagnosis couldn't navigate to last week's
  // verdict. The regular render path had it; the two branches drifted.
  // This test asserts the selector is present on BOTH variants so the
  // drift can't happen silently again.
  test("WeekSelector renders on default this-week URL (empty-state path included)", async ({ page }) => {
    await page.goto("/diagnosis");
    await page.waitForLoadState("networkidle");
    // The selector renders BOTH choices as visible buttons, regardless
    // of which one is currently active.
    await expect(page.getByRole("link", { name: /This week/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Last week/i })).toBeVisible();
  });

  test("WeekSelector renders on ?week=last URL (regular render path)", async ({ page }) => {
    await page.goto("/diagnosis?week=last");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("link", { name: /This week/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Last week/i })).toBeVisible();
  });
});

test.describe("/diagnosis subtitle reflects view state", () => {
  test("default this-week view subtitle clearly labels what's shown", async ({ page }) => {
    // 2026-05-05: refactor split this-week behavior into 3 explicit states.
    // The subtitle MUST match the state — never show "This week's diagnosis"
    // header above last-week's content (the original bug).
    //
    // States:
    //   - this-week + AI on + mid-week row exists → "This week's diagnosis (mid-week, refreshes Thursday)"
    //   - this-week + no AI prose row             → "This week's numbers — AI verdict pending"
    //   - this-week + AI off + no row             → similar (empty-state branch)
    await page.goto("/diagnosis");
    await page.waitForLoadState("networkidle");

    const main = page.locator("main");
    const text = await main.innerText();
    // ANY of the explicitly-labeled subtitles is fine. Forbidden: the
    // generic "This week's diagnosis" with no qualifier (that was the
    // bug — it implied live this-week content when actually fallback).
    const acceptable =
      /This week's diagnosis \(mid-week, refreshes Thursday\)/i.test(text) ||
      /This week's numbers — AI verdict pending/i.test(text) ||
      /Last week's view — AI prose unavailable/i.test(text);
    expect(acceptable).toBe(true);
  });
});

test.describe("/outcomes calibration KPI", () => {
  test("renders the calibration KPI strip when calibration weeks exist", async ({ page }) => {
    // Shipped 2026-05-04: the central Tier-1 signal from
    // PLAN_ALGORITHM_AUDIT.md §1.1. Test guards against future
    // regressions that would hide the metric.
    await page.goto("/outcomes");
    await page.waitForLoadState("networkidle");

    const kpiHeadline = page.getByText("Did our 80% CI actually contain 80%?", {
      exact: false,
    });
    // Either visible (we have ≥1 calibratable week) or absent (cold-fallback).
    // Don't assert visibility — just assert that IF it appears, the
    // expected metrics are present alongside.
    const isVisible = await kpiHeadline.isVisible().catch(() => false);
    if (isVisible) {
      await expect(page.getByText("Hit rate inside CI")).toBeVisible();
      await expect(page.getByText("Calibration error")).toBeVisible();
      await expect(page.getByText("target 80%")).toBeVisible();
    }
    // If not visible, we accept that — the cold-start coldFallback
    // returns [] and the strip hides itself. Real failure mode would
    // be the KPI showing zero/NaN/template leaks; that's covered by
    // T1.7 render-layer scan.
  });
});
