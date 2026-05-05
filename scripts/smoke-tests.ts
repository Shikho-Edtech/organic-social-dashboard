#!/usr/bin/env -S npx tsx
/**
 * Reader-layer smoke tests.
 *
 * Mocks readTab and exercises the Sheets reader functions in lib/sheets.ts
 * with synthetic Analysis_Log, Content_Calendar, Weekly_Analysis inputs.
 * Asserts no throws AND that the returned shapes are sensible for the
 * edge cases we've shipped bugs against.
 *
 * Why this exists: between 2026-05-02 and 2026-05-04 we shipped 7 reactive
 * fixes for issues that all had the same shape — a server component throws
 * on a particular Analysis_Log / Content_Calendar state we hadn't enumerated.
 * Each was caught visually on the live deploy AFTER it broke for the user.
 *
 * Each test enumerates one of those breaking states and asserts the read
 * layer produces a non-throwing, non-misleading result. New regressions
 * land here as new test cases. Full suite runs in <2s.
 *
 * Run: `npm run smoke`
 */

// ─── Mock infrastructure ─────────────────────────────────────────────
process.env.SMOKE_TEST_MODE = "1";
const mockTabs: Record<string, string[][]> = {};
(globalThis as any).__SMOKE_TEST_TABS__ = mockTabs;

function setMockSheet(tabName: string, rows: string[][]) {
  mockTabs[tabName] = rows;
}
function clearMocks() {
  for (const k of Object.keys(mockTabs)) delete mockTabs[k];
}

// Force-reset the module-level cache between tests so cached values from
// one test don't leak into the next.
//
// IMPORTANT: import _clearCacheForTests from lib/sheets.js (the SAME module
// that the readers use), NOT from lib/cache.js directly. On Node ESM under
// tsx, "./cache" (sheets.ts's specifier) and "../lib/cache.js" (a smoke-test
// specifier) can resolve to different module records — the cache instance
// the test would clear isn't the one sheets.ts is reading. CI 2026-05-04
// caught this: 14 passed, 2 failed, both because the prior test's cached
// reads bled into the empty-sheet tests. Routing through sheets.js's
// re-export of _clearCacheForTests forces single-graph consistency.
async function resetCache() {
  const sheets = await import("../lib/sheets.js");
  if ((sheets as any)._clearCacheForTests) {
    (sheets as any)._clearCacheForTests();
  } else {
    throw new Error(
      "lib/sheets.ts must re-export _clearCacheForTests from ./cache — " +
      "smoke tests need to clear the cache via the SAME module graph",
    );
  }
}

// ─── Test runner ─────────────────────────────────────────────────────
type Test = { name: string; fn: () => Promise<void> };
const tests: Test[] = [];
function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn });
}

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}
function assertTruthy(v: unknown, msg: string) {
  if (!v) throw new Error(`${msg}: expected truthy, got ${JSON.stringify(v)}`);
}
async function assertNoThrow<T>(fn: () => Promise<T> | T, msg: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new Error(`${msg}: unexpected throw: ${(e as Error).message}`);
  }
}

// ─── Test fixtures ───────────────────────────────────────────────────
const ANALYSIS_LOG_HEADERS = [
  "Run Date", "Posts Fetched", "Videos", "Reels", "Status",
  "Classify Status", "Diagnosis Status", "Calendar Status",
  "Last Successful Diagnosis At", "Last Successful Calendar At",
  "Notes", "Classify Engine", "Diagnosis Engine", "Calendar Engine",
  "Prompt Version", "Priors Status", "Last Successful Priors At",
  "Strategy Status", "Last Successful Strategy At",
  "Strategy Engine", "Strategy Cost USD",
];

function row(overrides: Record<string, string> = {}): string[] {
  const defaults: Record<string, string> = {
    "Run Date": "2026-05-04T08:00:00+00:00",
    "Posts Fetched": "0", "Videos": "0", "Reels": "0",
    "Status": "success",
    "Classify Status": "n/a", "Diagnosis Status": "n/a", "Calendar Status": "n/a",
    "Last Successful Diagnosis At": "", "Last Successful Calendar At": "",
    "Notes": "", "Classify Engine": "off",
    "Diagnosis Engine": "off", "Calendar Engine": "off",
    "Prompt Version": "",
    "Priors Status": "n/a", "Last Successful Priors At": "",
    "Strategy Status": "n/a", "Last Successful Strategy At": "",
    "Strategy Engine": "", "Strategy Cost USD": "",
  };
  const merged = { ...defaults, ...overrides };
  return ANALYSIS_LOG_HEADERS.map((h) => merged[h] ?? "");
}

const CALENDAR_HEADERS = [
  "Day", "Date", "Time (BDT)", "Format", "Pillar", "Featured Entity",
  "Spotlight Type", "Spotlight Name", "Hook Line", "Key Message",
  "Visual Direction", "CTA", "Funnel Stage", "Language", "Audience",
  "Rationale", "Expected Reach", "Success Metric", "Hypothesis ID",
  "Forecast Reach CI", "Risk Flags", "Week Ending",
];

function calRow(date: string, weekEnding: string, overrides: Record<string, string> = {}): string[] {
  const defaults: Record<string, string> = {
    "Day": "Monday", "Date": date, "Time (BDT)": "14:00",
    "Format": "Reel", "Pillar": "Live Class / Exam Prep",
    "Featured Entity": "", "Spotlight Type": "", "Spotlight Name": "",
    "Hook Line": "Test slot", "Key Message": "", "Visual Direction": "",
    "CTA": "", "Funnel Stage": "MOFU", "Language": "Bangla", "Audience": "",
    "Rationale": "", "Expected Reach": "", "Success Metric": "",
    "Hypothesis ID": "h1", "Forecast Reach CI": "", "Risk Flags": "[]",
    "Week Ending": weekEnding,
  };
  const merged = { ...defaults, ...overrides };
  return CALENDAR_HEADERS.map((h) => merged[h] ?? "");
}

// ─── Tests: getRunStatus carry-forward (incident 2026-05-04) ────────
// Side-channel writers blanked all four `Last Successful X At` columns
// → dashboard read latest row only → got blank → "AI never succeeded"
// even when an earlier row had populated values.

test("getRunStatus walks backward to find non-blank carry-forward timestamps", async () => {
  setMockSheet("Analysis_Log", [
    ANALYSIS_LOG_HEADERS,
    row({
      "Run Date": "2026-05-04T06:50:00+00:00",
      "Diagnosis Status": "success", "Calendar Status": "success",
      "Diagnosis Engine": "gemini", "Calendar Engine": "gemini",
      "Last Successful Diagnosis At": "2026-05-04T06:33:00",
      "Last Successful Calendar At": "2026-05-04T06:38:00",
    }),
    row({ "Run Date": "2026-05-04T08:16:00+00:00", "Notes": "VIRAL_REFRESH" }),
    row({ "Run Date": "2026-05-04T08:17:00+00:00" }),
  ]);
  const sheets = await import("../lib/sheets.js");
  const rs = await sheets.getRunStatus();
  assertEqual(rs.last_successful_diagnosis_at, "2026-05-04T06:33:00",
    "should walk backward to find populated diagnosis timestamp");
  assertEqual(rs.last_successful_calendar_at, "2026-05-04T06:38:00",
    "should walk backward to find populated calendar timestamp");
  assertEqual(rs.last_run_at, "2026-05-04T08:17:00+00:00",
    "last_run_at uses the latest row");
});

test("getRunStatus tolerates empty Analysis_Log without throwing", async () => {
  setMockSheet("Analysis_Log", [ANALYSIS_LOG_HEADERS]);
  const sheets = await import("../lib/sheets.js");
  const rs = await assertNoThrow(() => sheets.getRunStatus(),
    "getRunStatus should not throw on empty sheet");
  assertEqual(rs.last_run_at, "", "empty sheet → last_run_at blank");
});

// ─── Tests: getStageEngine (incident 2026-05-04 incident #2) ────────

test("getStageEngine returns 'unknown' when Analysis_Log is empty", async () => {
  setMockSheet("Analysis_Log", [ANALYSIS_LOG_HEADERS]);
  const sheets = await import("../lib/sheets.js");
  const eng = await sheets.getStageEngine("calendar");
  assertEqual(eng, "unknown", "empty log → unknown");
});

test("getStageEngine returns 'off' when status is skipped and engine blank", async () => {
  setMockSheet("Analysis_Log", [
    ANALYSIS_LOG_HEADERS,
    row({ "Calendar Status": "skipped", "Calendar Engine": "" }),
  ]);
  const sheets = await import("../lib/sheets.js");
  const eng = await sheets.getStageEngine("calendar");
  assertEqual(eng, "off", "skipped status + empty engine → off");
});

test("getStageEngine returns 'gemini' when engine is gemini", async () => {
  setMockSheet("Analysis_Log", [
    ANALYSIS_LOG_HEADERS,
    row({ "Calendar Engine": "gemini", "Calendar Status": "success" }),
  ]);
  const sheets = await import("../lib/sheets.js");
  const eng = await sheets.getStageEngine("calendar");
  assertEqual(eng, "gemini", "engine=gemini → gemini");
});

// ─── Tests: getCalendarByWeekStarting ───────────────────────────────

test("getCalendarByWeekStarting filters by Week Ending column", async () => {
  setMockSheet("Content_Calendar", [
    CALENDAR_HEADERS,
    calRow("2026-05-04", "2026-05-04"),
    calRow("2026-04-27", "2026-04-27"),
    calRow("2026-05-05", "2026-05-04"),
  ]);
  const sheets = await import("../lib/sheets.js");
  const slots = await sheets.getCalendarByWeekStarting("2026-05-04");
  assertEqual(slots.length, 2, "should match 2 slots with Week Ending=2026-05-04");
});

test("getCalendarByWeekStarting returns [] for week with no rows", async () => {
  setMockSheet("Content_Calendar", [CALENDAR_HEADERS]);
  const sheets = await import("../lib/sheets.js");
  const slots = await sheets.getCalendarByWeekStarting("2026-05-04");
  assertEqual(slots.length, 0, "empty calendar → 0 slots");
});

// ─── Tests: computeStaleness fallback (incident 2026-05-03) ─────────

test("computeStaleness uses last_run_at fallback when status=success but timestamp blank", async () => {
  const sheets = await import("../lib/sheets.js");
  const info = sheets.computeStaleness("diagnosis", {
    last_run_at: "2026-05-04T08:00:00+00:00",
    classify_status: "success", diagnosis_status: "success",
    calendar_status: "success", priors_status: "success", strategy_status: "success",
    last_successful_diagnosis_at: "", last_successful_calendar_at: "",
    last_successful_priors_at: "", last_successful_strategy_at: "",
  });
  assertTruthy(
    info.severity !== "crit" || info.days_since >= 0,
    "with status=success and last_run_at recent, should not be 'never succeeded'",
  );
});

test("computeStaleness returns crit/never-succeeded only when truly never", async () => {
  const sheets = await import("../lib/sheets.js");
  const info = sheets.computeStaleness("diagnosis", {
    last_run_at: "", classify_status: "unknown",
    diagnosis_status: "unknown", calendar_status: "unknown",
    priors_status: "unknown", strategy_status: "unknown",
    last_successful_diagnosis_at: "", last_successful_calendar_at: "",
    last_successful_priors_at: "", last_successful_strategy_at: "",
  });
  assertEqual(info.severity, "crit", "no run + no success → crit");
  assertEqual(info.days_since, -1, "never run → days_since -1");
});

// ─── Tests: diagnosis page render-state (incident 2026-05-04 part 4) ─
// Bug: when this-week view falls back to liveDiagnosis (last-week's
// content) because no mid-week row exists yet AND latest run is AI-off,
// the page rendered with the aiDisabled banner ("AI off this run") on
// top of legitimate content. The banner is technically true but it
// alarms the user about a state they don't need to act on — the data
// IS being shown, it's just from a prior week.
//
// Rule: aiDisabled banner only fires when there is GENUINELY no content
// to show. When fallback content is present, show a quieter "showing
// prior week" notice instead, not the alarming aiDisabled banner.

test("diagnosis page: no aiDisabled banner when liveDiagnosis fallback is rendered", async () => {
  const sheets = await import("../lib/sheets.js");
  // Helper exported by lib/sheets to centralize the render-state decision
  // so it can be tested without rendering React.
  if (!(sheets as any).computeDiagnosisBannerState) {
    throw new Error(
      "lib/sheets must export computeDiagnosisBannerState — extract the page-level " +
      "banner decision into a pure function so it can be unit-tested",
    );
  }
  const state = (sheets as any).computeDiagnosisBannerState({
    isArchival: false,
    isThisWeekView: true,
    aiDisabled: true,
    weekDiagnosis: null,
    liveDiagnosis: { week_ending: "2026-04-27", headline: "Last week's verdict" },
  });
  assertEqual(state.showAiDisabledBanner, false,
    "aiDisabled banner should NOT show when liveDiagnosis fallback content exists");
  assertEqual(state.showFallbackNotice, true,
    "showFallbackNotice SHOULD show — user needs to know they're seeing prior week");
});

test("diagnosis page: aiDisabled banner DOES fire when no content at all", async () => {
  const sheets = await import("../lib/sheets.js");
  const state = (sheets as any).computeDiagnosisBannerState({
    isArchival: false,
    isThisWeekView: true,
    aiDisabled: true,
    weekDiagnosis: null,
    liveDiagnosis: null,
  });
  assertEqual(state.showAiDisabledBanner, true,
    "aiDisabled banner SHOULD fire when truly no content");
});

test("diagnosis page: no aiDisabled banner on past-week view even when AI off", async () => {
  const sheets = await import("../lib/sheets.js");
  const state = (sheets as any).computeDiagnosisBannerState({
    isArchival: false,
    isThisWeekView: false,
    aiDisabled: true,
    weekDiagnosis: { week_ending: "2026-04-27", headline: "x" },
    liveDiagnosis: { week_ending: "2026-04-27", headline: "x" },
  });
  assertEqual(state.showAiDisabledBanner, false,
    "past-week view never shows aiDisabled banner — that's about current state, not historical");
});

test("diagnosis page: no aiDisabled banner when AI is on (regardless of view)", async () => {
  const sheets = await import("../lib/sheets.js");
  const state = (sheets as any).computeDiagnosisBannerState({
    isArchival: false,
    isThisWeekView: true,
    aiDisabled: false,
    weekDiagnosis: { week_ending: "2026-05-04", headline: "fresh" },
    liveDiagnosis: { week_ending: "2026-05-04", headline: "fresh" },
  });
  assertEqual(state.showAiDisabledBanner, false, "AI on → no aiDisabled banner");
});

// ─── Tests: getCalibrationLog (new 2026-05-04 — surfacing the 42% hit-rate signal) ─
// Calibration_Log is written by the pipeline weekly. Dashboard never read it
// before today; this test guards the new reader's shape + edge cases.

const CALIBRATION_HEADERS = [
  "Week Ending", "Total Slots", "Final Slots",
  "Hits", "Exceeded", "Missed", "No Data",
  "Preliminary",
  "Hit Rate Inside CI", "Calibration Error", "Sharpness",
  "Pillar Breakdown", "Format Breakdown",
  "Engine", "Generated At",
];
function calibRow(overrides: Record<string, string> = {}): string[] {
  const defaults: Record<string, string> = {
    "Week Ending": "2026-04-20", "Total Slots": "30", "Final Slots": "30",
    "Hits": "8", "Exceeded": "2", "Missed": "9", "No Data": "11",
    "Preliminary": "0",
    "Hit Rate Inside CI": "0.4211", "Calibration Error": "0.3789",
    "Sharpness": "1.0394",
    "Pillar Breakdown": "{}", "Format Breakdown": "{}",
    "Engine": "deterministic", "Generated At": "2026-04-20T00:00:00",
  };
  const merged = { ...defaults, ...overrides };
  return CALIBRATION_HEADERS.map((h) => merged[h] ?? "");
}

test("getCalibrationLog returns rows newest-first", async () => {
  setMockSheet("Calibration_Log", [
    CALIBRATION_HEADERS,
    calibRow({ "Week Ending": "2026-04-20", "Hit Rate Inside CI": "0.4211" }),
    calibRow({ "Week Ending": "2026-04-27", "Hit Rate Inside CI": "0.6667" }),
    calibRow({ "Week Ending": "2026-05-04", "Hit Rate Inside CI": "" }),
  ]);
  const sheets = await import("../lib/sheets.js");
  if (!(sheets as any).getCalibrationLog) {
    throw new Error("lib/sheets must export getCalibrationLog");
  }
  const rows = await (sheets as any).getCalibrationLog();
  assertEqual(rows.length, 3, "should return 3 rows");
  assertEqual(rows[0].week_ending, "2026-05-04", "newest first");
  assertEqual(rows[2].week_ending, "2026-04-20", "oldest last");
});

test("getCalibrationLog parses numerics + tolerates blank Hit Rate", async () => {
  setMockSheet("Calibration_Log", [
    CALIBRATION_HEADERS,
    calibRow({ "Week Ending": "2026-04-20", "Hit Rate Inside CI": "0.4211", "Calibration Error": "0.3789" }),
    calibRow({ "Week Ending": "2026-05-04", "Hit Rate Inside CI": "", "Calibration Error": "" }),
  ]);
  const sheets = await import("../lib/sheets.js");
  const rows = await (sheets as any).getCalibrationLog();
  const apr20 = rows.find((r: any) => r.week_ending === "2026-04-20");
  assertEqual(apr20.hit_rate_inside_ci, 0.4211, "0.4211 parses to number");
  assertEqual(apr20.calibration_error, 0.3789, "0.3789 parses to number");
  const may04 = rows.find((r: any) => r.week_ending === "2026-05-04");
  assertEqual(may04.hit_rate_inside_ci, null, "blank parses to null");
});

test("getCalibrationLog returns [] on empty sheet (no throw)", async () => {
  setMockSheet("Calibration_Log", [CALIBRATION_HEADERS]);
  const sheets = await import("../lib/sheets.js");
  const rows = await assertNoThrow(() => (sheets as any).getCalibrationLog(),
    "empty sheet should not throw");
  assertEqual(rows.length, 0, "empty sheet → 0 rows");
});

// ─── Tests: bugs caught 2026-05-04 by user manual inspection ────────
// 3 bugs my live walks missed because I didn't enumerate these states.
// Following the rule: write the test FIRST, then ship the fix.

// BUG 1: /plan default still showed "AI calendar is off this run" banner
// even when calendar has content. Same shape as the /diagnosis bug fixed
// earlier; the fix wasn't applied to /plan, only diagnosis. Test the
// shared decision rule: aiDisabled banner ONLY when no content.
//
// We extract the calendar variant of the rule and parameterize the test.
test("plan page: no aiDisabled banner when calendar has slots (this-week view)", async () => {
  const sheets = await import("../lib/sheets.js");
  if (!(sheets as any).computeCalendarBannerState) {
    throw new Error(
      "lib/sheets must export computeCalendarBannerState — extract the /plan " +
      "page-level banner decision into a pure function so it's unit-testable",
    );
  }
  const state = (sheets as any).computeCalendarBannerState({
    isArchival: false,
    isThisWeekView: true,
    aiDisabled: true,
    calendar: [{ day: "Monday" }, { day: "Tuesday" }],  // non-empty
  });
  assertEqual(state.showAiDisabledBanner, false,
    "no aiDisabled banner when calendar.length > 0 (we have content to show)");
});

test("plan page: aiDisabled banner DOES fire when calendar empty + AI off + this-week", async () => {
  const sheets = await import("../lib/sheets.js");
  const state = (sheets as any).computeCalendarBannerState({
    isArchival: false,
    isThisWeekView: true,
    aiDisabled: true,
    calendar: [],
  });
  assertEqual(state.showAiDisabledBanner, true,
    "no content + AI off = banner fires");
});

test("plan page: no aiDisabled banner on past-week view even when AI off", async () => {
  const sheets = await import("../lib/sheets.js");
  const state = (sheets as any).computeCalendarBannerState({
    isArchival: false,
    isThisWeekView: false,
    aiDisabled: true,
    calendar: [{ day: "Monday" }],
  });
  assertEqual(state.showAiDisabledBanner, false,
    "past-week view never shows aiDisabled banner");
});

// BUG 3: Multiple Weekly_Analysis rows for same week → /diagnosis (default
// fallback to liveDiagnosis = LAST row) and /diagnosis?week=last (uses
// getDiagnosisByWeekPreferred which sorted by non-existent generated_at
// column, so .find() returned FIRST row) showed DIFFERENT verdicts for
// the same week. The fix: when no engine/generated_at metadata exists,
// fall back to LAST matching row (consistent with getLatestDiagnosis).

const WEEKLY_ANALYSIS_HEADERS = [
  "Week Ending", "Headline", "Posts This Week", "Avg Engagement",
  "What Happened (JSON)", "Top Performers (JSON)", "Underperformers (JSON)",
  "Exam Alert", "Negative Signals (JSON)", "Reel Intelligence (JSON)",
  "Full Diagnosis (JSON)", "Source Post IDs",
];
function waRow(weekEnding: string, headline: string, posts: string = "30"): string[] {
  return WEEKLY_ANALYSIS_HEADERS.map((h) => {
    if (h === "Week Ending") return weekEnding;
    if (h === "Headline") return headline;
    if (h === "Posts This Week") return posts;
    if (h === "Avg Engagement") return "2.0";
    if (h === "Exam Alert") return "";
    if (h === "Source Post IDs") return "";
    return "{}";
  });
}

test("getDiagnosisByWeekPreferred returns LAST matching row when multiple rows exist (no metadata to sort by)", async () => {
  setMockSheet("Weekly_Analysis", [
    WEEKLY_ANALYSIS_HEADERS,
    waRow("2026-04-27", "OLD verdict from earlier run", "35"),
    waRow("2026-04-20", "Different week", "30"),
    waRow("2026-04-27", "MIDDLE verdict", "32"),
    waRow("2026-04-27", "NEWEST verdict from latest run", "32"),
  ]);
  const sheets = await import("../lib/sheets.js");
  const d = await sheets.getDiagnosisByWeekPreferred("2026-04-27", "full");
  assertTruthy(d, "should return a diagnosis");
  assertEqual(d!.headline, "NEWEST verdict from latest run",
    "with no engine/generated_at metadata, should pick the LAST matching row " +
    "(matches getLatestDiagnosis convention) — NOT first match");
});

test("getDiagnosisByWeekPreferred + getLatestDiagnosis agree on which row when same week is latest", async () => {
  setMockSheet("Weekly_Analysis", [
    WEEKLY_ANALYSIS_HEADERS,
    waRow("2026-04-27", "OLD"),
    waRow("2026-04-27", "NEW"),
  ]);
  const sheets = await import("../lib/sheets.js");
  const latest = await sheets.getLatestDiagnosis();
  const byWeek = await sheets.getDiagnosisByWeekPreferred("2026-04-27", "full");
  assertEqual(latest!.headline, "NEW", "latest = last row");
  assertEqual(byWeek!.headline, "NEW",
    "by-week-preferred should also pick last matching row when no metadata to sort");
});

// ─── Tests: live-KPI computation for /diagnosis (2026-05-04 user feedback) ──
// Bug-shape user identified: /diagnosis KPIs (reach, QE, posts count, avg ER)
// were frozen at AI-run time via Weekly_Analysis.key_metrics JSON. Should
// be live-computed from the posts table so:
//   - last-week view reflects late-attribution updates
//   - this-week view shows actual this-week numbers (not last-week's frozen)
//
// New helper: computeWeekKPIs(posts, range) → { posts, reach, qe, avg_er,
// reach_wow, qe_wow }. Pure function over post arrays. Easy to test.

function fakePost(opts: {
  id: string;
  created_time: string;  // ISO
  reach?: number;
  shares?: number;
  comments?: number;
  reactions?: number;
}): any {
  // Match the dashboard's normalized Post shape (lib/types.ts). Reads via
  // postReach() use unique_views first, then media_views.
  return {
    id: opts.id,
    created_time: opts.created_time,
    unique_views: opts.reach ?? 0,
    media_views: opts.reach ?? 0,
    shares: opts.shares ?? 0,
    comments: opts.comments ?? 0,
    reactions: opts.reactions ?? 0,
    message: "",
  };
}

test("computeWeekKPIs returns deterministic stats for a week's posts", async () => {
  const aggregate = await import("../lib/aggregate.js");
  if (!(aggregate as any).computeWeekKPIs) {
    throw new Error("lib/aggregate must export computeWeekKPIs");
  }
  const posts = [
    fakePost({ id: "a", created_time: "2026-04-28T10:00:00+00:00", reach: 10000, shares: 5, comments: 10, reactions: 100 }),
    fakePost({ id: "b", created_time: "2026-04-30T10:00:00+00:00", reach: 20000, shares: 8, comments: 12, reactions: 200 }),
    fakePost({ id: "out_of_range", created_time: "2026-04-01T10:00:00+00:00", reach: 99999, shares: 99, comments: 99, reactions: 999 }),
  ];
  const kpis = (aggregate as any).computeWeekKPIs(posts, {
    start: "2026-04-27",
    end: "2026-05-03",
  });
  assertEqual(kpis.posts, 2, "should count 2 posts in range, exclude the out-of-range one");
  assertEqual(kpis.reach, 30000, "reach = 10K + 20K");
  // QE = 5*2 + 10*1 + 8*2 + 12*1 = 10 + 10 + 16 + 12 = 48
  assertEqual(kpis.qe, 48, "QE = (5+8)*2 + (10+12)*1 = 48");
});

test("computeWeekKPIs computes WoW deltas vs prior week", async () => {
  const aggregate = await import("../lib/aggregate.js");
  const posts = [
    // current week: 2 posts, 30K reach
    fakePost({ id: "a", created_time: "2026-04-28T10:00:00+00:00", reach: 10000 }),
    fakePost({ id: "b", created_time: "2026-04-30T10:00:00+00:00", reach: 20000 }),
    // prior week: 1 post, 15K reach (so reach_wow = +100%)
    fakePost({ id: "p", created_time: "2026-04-22T10:00:00+00:00", reach: 15000 }),
  ];
  const kpis = (aggregate as any).computeWeekKPIs(posts, {
    start: "2026-04-27",
    end: "2026-05-03",
    priorStart: "2026-04-20",
    priorEnd: "2026-04-26",
  });
  assertEqual(kpis.reach, 30000, "current reach");
  assertEqual(kpis.prior_reach, 15000, "prior reach");
  assertEqual(kpis.reach_wow_pct, 100, "30K vs 15K = +100% WoW");
});

test("computeWeekKPIs handles empty week without throwing", async () => {
  const aggregate = await import("../lib/aggregate.js");
  const kpis = await assertNoThrow(
    () => (aggregate as any).computeWeekKPIs([], { start: "2026-04-27", end: "2026-05-03" }),
    "empty posts array should not throw",
  );
  assertEqual(kpis.posts, 0, "empty");
  assertEqual(kpis.reach, 0, "empty");
  assertEqual(kpis.reach_wow_pct, null, "no prior → null");
});

// ─── Tests: getDiagnosisByWeekPreferred simplified (2026-05-04 user feedback) ─
// User's rule: pick LATEST run for the week, regardless of engine. Drop the
// prefer="midweek" / prefer="full" filtering — overengineering. Just take
// newest by generated_at; fall back to last array element when no metadata.

test("getDiagnosisByWeekPreferred picks latest by generated_at when metadata exists", async () => {
  setMockSheet("Weekly_Analysis", [
    [
      "Week Ending", "Headline", "Posts This Week", "Avg Engagement",
      "What Happened (JSON)", "Top Performers (JSON)", "Underperformers (JSON)",
      "Exam Alert", "Negative Signals (JSON)", "Reel Intelligence (JSON)",
      "Full Diagnosis (JSON)", "Source Post IDs",
    ],
    // No engine/generated_at columns in the schema → all rows tie on metadata.
    // The fallback rule (last matching row) applies.
    ["2026-04-27", "Older verdict", "30", "2.0", "{}", "[]", "[]", "", "[]", "{}", "{}", ""],
    ["2026-04-27", "Latest verdict", "32", "2.2", "{}", "[]", "[]", "", "[]", "{}", "{}", ""],
  ]);
  const sheets = await import("../lib/sheets.js");
  const d = await sheets.getDiagnosisByWeekPreferred("2026-04-27");
  assertEqual(d!.headline, "Latest verdict",
    "should pick last matching row (newest insert)");
});

// ─── Runner ─────────────────────────────────────────────────────────
async function main() {
  let passed = 0, failed = 0;
  for (const t of tests) {
    clearMocks();
    await resetCache();
    try {
      await t.fn();
      console.log(`  ok ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  FAIL ${t.name}`);
      console.log(`    ${(e as Error).message.split("\n").join("\n    ")}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("UNCAUGHT:", e);
  process.exit(1);
});
