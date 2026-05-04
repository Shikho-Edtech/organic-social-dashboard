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

test.describe("/diagnosis cross-view consistency", () => {
  test("same week's verdict matches across default-fallback view and ?week=last", async ({ page }) => {
    // Bug shipped 2026-05-04: when Weekly_Analysis has multiple rows for
    // the same week_ending, /diagnosis (default → liveDiagnosis = LAST
    // row) and /diagnosis?week=last (getDiagnosisByWeekPreferred → was
    // FIRST match) returned different rows → different verdicts on
    // screen for the same conceptual data.

    // Helper: scrape the visible "X posts" line from the verdict block.
    async function getVerdictPostCount(): Promise<string | null> {
      // The verdict card has a "<N> posts" stat. Match the integer
      // immediately followed by " posts" / "POSTS" (case-insensitive).
      const txt = await page.locator("main").innerText();
      const m = txt.match(/(\d+)\s+POSTS/i);
      return m ? m[1] : null;
    }

    await page.goto("/diagnosis");
    await page.waitForLoadState("networkidle");
    const defaultPosts = await getVerdictPostCount();

    await page.goto("/diagnosis?week=last");
    await page.waitForLoadState("networkidle");
    const explicitLastPosts = await getVerdictPostCount();

    // Both views render the same week's verdict. They MUST agree.
    expect(defaultPosts).toBeTruthy();
    expect(explicitLastPosts).toBeTruthy();
    expect(defaultPosts).toBe(explicitLastPosts);
  });
});

test.describe("/diagnosis fallback subtitle", () => {
  test("default this-week view shows 'Showing last week's verdict' subtitle when mid-week row absent", async ({ page }) => {
    // Bug shipped 2026-05-04: when AI is off and mid-week diagnosis
    // hasn't run, page falls back to liveDiagnosis (last week's). The
    // subtitle must clearly state this so the user doesn't think they're
    // looking at this-week data.
    await page.goto("/diagnosis");
    await page.waitForLoadState("networkidle");

    // Either we're showing fresh this-week's mid-week diagnosis (subtitle
    // mentions "mid-week") or we're showing prior-week fallback (subtitle
    // mentions "Showing last week"). Both are correct states; we just
    // assert one of the two clear-context subtitles is present (NOT a
    // misleading generic "This week's diagnosis" with last-week content).
    const main = page.locator("main");
    const text = await main.innerText();
    const hasFreshSubtitle = /This week's diagnosis \(mid-week, refreshes Thursday\)/i.test(text);
    const hasFallbackSubtitle = /Showing last week's verdict/i.test(text);
    expect(hasFreshSubtitle || hasFallbackSubtitle).toBe(true);
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
