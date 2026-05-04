// Google Sheets reader using the existing service account credentials
import { google } from "googleapis";
import type {
  Post,
  DailyMetric,
  VideoMetric,
  Diagnosis,
  CalendarSlot,
  StrategyEntry,
  StrategyPillarWeights,
  StrategyFormatMix,
  StrategyTeacherRotationEntry,
  StrategyRiskEntry,
  StrategyAbandonCriterion,
  AdherenceSummaryCompact,
  StrategyVerdictCounts,
  OutcomeLogEntry,
  OutcomeRollup,
  OutcomeVerdict,
} from "./types";
import { canonicalizeEntity } from "./entities";
import { bdtNow } from "./aggregate";
import { withLastGood, _clearCacheForTests } from "./cache";

// Re-export so smoke-tests.ts can clear the cache via the SAME module
// graph that the readers use. Importing `lib/cache.js` directly from the
// test runner can resolve to a different module instance under tsx ESM
// (CI 2026-05-04 saw `cache.clear()` not affecting subsequent reads —
// because sheets.ts's `./cache` and the test's `../lib/cache.js`
// resolved to separate module records).
export { _clearCacheForTests };

let cachedClient: any = null;

function getSheetsClient() {
  if (cachedClient) return cachedClient;
  const creds = JSON.parse(process.env.GOOGLE_SHEETS_CREDS_JSON || "{}");
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

async function readTab(tabName: string): Promise<any[][]> {
  // Smoke-test hook (scripts/smoke-tests.mjs): if SMOKE_TEST_MODE=1 is set
  // AND globalThis.__SMOKE_TEST_TABS__ has the tab, return that instead of
  // hitting the Sheets API. Lets us enumerate edge-case data states without
  // spinning up real creds. Production paths never set SMOKE_TEST_MODE.
  if (process.env.SMOKE_TEST_MODE === "1") {
    const mock = (globalThis as any).__SMOKE_TEST_TABS__?.[tabName];
    if (mock) return mock;
    return [];
  }
  const sheets = getSheetsClient();
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SPREADSHEET_ID not set");
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${tabName}!A:Z`,
    });
    return res.data.values || [];
  } catch (e) {
    console.error(`Failed to read tab '${tabName}':`, e);
    return [];
  }
}

function rowsToObjects(rows: any[][]): Record<string, any>[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((h: string, i: number) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

function toNumber(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toBool(v: any): boolean {
  return String(v).toLowerCase() === "true";
}

// ─── Posts (raw + classifications merged) ───

// Wrapped exports: see lib/cache.ts. The _*Raw functions hold the
// original logic; the public exports delegate through withLastGood
// so transient sheets read failures fall back to last-known-good
// instead of crashing the page.
export async function getPosts(): Promise<Post[]> {
  // No coldFallback — without posts there's nothing useful to render;
  // error.tsx is the right outcome on cold-start + Sheets failure.
  return withLastGood("getPosts", _getPostsRaw, (d) => d.length === 0);
}
async function _getPostsRaw(): Promise<Post[]> {
  const [rawRows, classRows] = await Promise.all([
    readTab("Raw_Posts"),
    readTab("Classifications"),
  ]);
  const raw = rowsToObjects(rawRows);
  const classifications = rowsToObjects(classRows);

  // Index classifications by post id for merge
  const classById: Record<string, any> = {};
  for (const c of classifications) {
    if (c["Post ID"]) classById[c["Post ID"]] = c;
  }

  return raw.map((r) => {
    const c = classById[r["Post ID"]] || {};
    // Day 2N: prefer the pipeline-shifted BDT timestamp when present (Day 2G
    // widened Raw_Posts to 20 cols with "Created Time (BDT)"). Falls back to
    // the legacy UTC column for pre-Day-2G rows. Downstream `bdt()` in
    // lib/aggregate detects the +06:00 suffix and takes the clean read path.
    const createdTime = (r["Created Time (BDT)"] as string) || (r["Created Time"] as string) || "";
    return {
      id: r["Post ID"],
      created_time: createdTime,
      type: r["Type"],
      message: r["Message (first 200 chars)"] || "",
      reactions: toNumber(r["Reactions"]),
      comments: toNumber(r["Comments"]),
      shares: toNumber(r["Shares"]),
      media_views: toNumber(r["Media Views"]),
      unique_views: toNumber(r["Unique Views"]),
      clicks: toNumber(r["Clicks"]),
      like: toNumber(r["Like"]),
      love: toNumber(r["Love"]),
      wow: toNumber(r["Wow"]),
      haha: toNumber(r["Haha"]),
      sorry: toNumber(r["Sad"]),
      anger: toNumber(r["Angry"]),
      is_reel: toBool(r["Is Reel"]),
      permalink_url: (r["Permalink URL"] as string) || "",
      content_pillar: c["Content Pillar"] || "",
      funnel_stage: c["Funnel Stage"] || "",
      caption_tone: c["Caption Tone"] || "",
      // Day 2E.4: Format column dropped from Classifications. Derive from
      // Raw_Posts so old (classifier-cased "Video") and new (raw "video") rows
      // land in the same aggregation bucket.
      format: (() => {
        if (c["Format"]) return c["Format"] as string;
        if (toBool(r["Is Reel"])) return "Reel";
        const t = (r["Type"] || "") as string;
        return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
      })(),
      language: c["Language"] || "",
      has_cta: toBool(c["Has CTA"]),
      cta_type: c["CTA Type"] || "None",
      exam_relevance: c["Exam Relevance"] || "None",
      featured_entity: c["Featured Entity"] || "None",
      hook_type: c["Hook Type"] || "None",
      visual_style: c["Visual Style"] || "Unknown",
      primary_audience: c["Primary Audience"] || "General",
      // v2 classifier fields (Day 2B schema) — empty string on pre-v2 rows
      spotlight_type: c["Spotlight Type"] || "",
      // Stage-0 item 9: canonicalize spotlight_name at read-time so
      // historical rows written before the pipeline gained its own
      // canonicalization pass still aggregate cleanly on the dashboard.
      // New rows (pipeline-canonicalized) pass through untouched.
      spotlight_name: canonicalizeEntity((c["Spotlight Name"] as string) || ""),
      classifier_confidence: (() => {
        const v = c["Classifier Confidence"];
        if (v === "" || v === null || v === undefined) return undefined;
        const n = Number(v);
        return isNaN(n) ? undefined : n;
      })(),
      prompt_version: c["Prompt Version"] || "",
      manual_override: c["Manual Override"] || "",
      // Bucket C item 22 (Apr 2026): script-weighted primary language verdict
      // from classifier v2.5. Legacy (pre-v2.5) rows read "" here; callers
      // that need a non-empty bucket should coerce to "unknown".
      caption_primary_language:
        (c["Caption Primary Language"] as string) || "",
      // Sprint P6 chunk 7 (2026-04-23, DYN-03): hook-fatigue flag +
      // reason. v5 wiring audit caught these were mutated in memory
      // but never serialized; fix is cross-repo lockstep (sheets.py +
      // here). Pre-fix rows read false / "".
      hook_fatigue_flag: toBool(c["Hook Fatigue Flag"]),
      hook_fatigue_reason: (c["Hook Fatigue Reason"] as string) || "",
    };
  });
}

// ─── Page daily metrics ───

export async function getDailyMetrics(): Promise<DailyMetric[]> {
  return withLastGood(
    "getDailyMetrics",
    _getDailyMetricsRaw,
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getDailyMetricsRaw(): Promise<DailyMetric[]> {
  const rows = await readTab("Page_Daily");
  return rowsToObjects(rows).map((r) => ({
    date: r["Date"],
    followers_total: toNumber(r["Followers Total"]),
    new_follows: toNumber(r["New Follows"]),
    unfollows: toNumber(r["Unfollows"]),
    media_views: toNumber(r["Media Views"]),
    unique_media_views: toNumber(r["Unique Media Views"]),
    post_engagements: toNumber(r["Post Engagements"]),
    video_views: toNumber(r["Video Views"]),
    video_views_organic: toNumber(r["Video Views Organic"]),
    video_views_paid: toNumber(r["Video Views Paid"]),
    reactions_total: r["Reactions Total"] || "{}",
    page_views: toNumber(r["Page Views"]),
    negative_feedback: toNumber(r["Negative Feedback"]),
  }));
}

// ─── Video metrics ───

export async function getVideoMetrics(): Promise<VideoMetric[]> {
  return withLastGood(
    "getVideoMetrics",
    _getVideoMetricsRaw,
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getVideoMetricsRaw(): Promise<VideoMetric[]> {
  const rows = await readTab("Raw_Video");
  return rowsToObjects(rows).map((r) => ({
    post_id: r["Post ID"],
    created_time: r["Created Time"],
    is_reel: toBool(r["Is Reel"]),
    total_views: toNumber(r["Total Views"]),
    unique_views: toNumber(r["Unique Views"]),
    complete_views: toNumber(r["Complete Views"]),
    avg_watch_time: toNumber(r["Avg Watch Time (sec)"]),
    sound_on_views: toNumber(r["Sound On Views"]),
    views_15s: toNumber(r["15s Views"]),
    views_30s: toNumber(r["30s Views"]),
    reel_plays: toNumber(r["Reel Plays"]),
    reel_replays: toNumber(r["Reel Replays"]),
    followers_gained: toNumber(r["Followers Gained"]),
    retention_graph: r["Retention Data (JSON)"] || "[]",
  }));
}

// ─── Weekly diagnosis (latest or by week-ending key) ───

function diagnosisFromRow(row: Record<string, any>): Diagnosis {
  try {
    const full = row["Full Diagnosis (JSON)"]
      ? JSON.parse(row["Full Diagnosis (JSON)"])
      : {};
    return {
      week_ending: row["Week Ending"] || "",
      headline: row["Headline"] || full.headline || "",
      posts_this_week: toNumber(row["Posts This Week"]),
      avg_engagement: toNumber(row["Avg Engagement"]),
      what_happened: full.what_happened || [],
      top_performers: full.top_performers || [],
      underperformers: full.underperformers || [],
      exam_alert: full.exam_calendar_alert || row["Exam Alert"] || "",
      watch_outs: full.watch_outs || [],
      reel_intelligence: full.reel_intelligence || {},
      full_diagnosis: full,
      // Sprint P7 Phase 2: extract engine + generated_at so the dashboard
      // can distinguish mid-week ("ai-midweek") from end-of-week ("ai")
      // rows when both exist for the same week_ending.
      engine: typeof full.engine === "string" ? full.engine : undefined,
      generated_at: typeof full.generated_at === "string" ? full.generated_at : undefined,
    };
  } catch {
    return {
      week_ending: row["Week Ending"] || "",
      headline: row["Headline"] || "",
      posts_this_week: toNumber(row["Posts This Week"]),
      avg_engagement: toNumber(row["Avg Engagement"]),
      what_happened: [],
      top_performers: [],
      underperformers: [],
      exam_alert: "",
      watch_outs: [],
      reel_intelligence: {},
      full_diagnosis: {},
    };
  }
}

export async function getLatestDiagnosis(): Promise<Diagnosis | null> {
  return withLastGood(
    "getLatestDiagnosis",
    _getLatestDiagnosisRaw,
    (d) => d === null,
    { coldFallback: null },
  );
}
async function _getLatestDiagnosisRaw(): Promise<Diagnosis | null> {
  const rows = await readTab("Weekly_Analysis");
  const objects = rowsToObjects(rows);
  if (objects.length === 0) return null;
  return diagnosisFromRow(objects[objects.length - 1]);
}

/**
 * Step 3 archival mode: fetch a specific past diagnosis by its Week Ending
 * value (used as the `?archived=<week-ending>` URL param on `/strategy`).
 * Returns null when no row matches — the page falls back to its current
 * state (usually the empty state) with a small "archive not found" toast.
 */
export async function getDiagnosisByWeek(weekEnding: string): Promise<Diagnosis | null> {
  return withLastGood(
    `getDiagnosisByWeek:${weekEnding}`,
    () => _getDiagnosisByWeekRaw(weekEnding),
    (d) => d === null,
    { coldFallback: null },
  );
}
async function _getDiagnosisByWeekRaw(weekEnding: string): Promise<Diagnosis | null> {
  if (!weekEnding) return null;
  const rows = await readTab("Weekly_Analysis");
  const objects = rowsToObjects(rows);
  const match = objects.find((r) => String(r["Week Ending"] || "").trim() === weekEnding.trim());
  return match ? diagnosisFromRow(match) : null;
}

/**
 * Sprint P7 Phase 2 (2026-04-28): multi-row-per-week_ending aware reader
 * for the new Diagnosis week selector. Weekly_Analysis can carry
 * multiple rows for the same week_ending after Phase 2:
 *   - one with `engine="ai-midweek"` (Thursday cron)
 *   - one with `engine="ai"` (end-of-week Monday cron)
 *
 * `prefer="midweek"` returns the mid-week row when present, else falls
 * back to the end-of-week row. `prefer="full"` does the inverse.
 *
 * The dashboard's Diagnosis page uses:
 *   - This week  → prefer="midweek" (Thursday-fresh partial-week diagnosis)
 *   - Last week  → prefer="full"    (end-of-week verdict for prior week)
 *
 * Returns null when no row matches.
 */
export async function getDiagnosisByWeekPreferred(
  weekEnding: string,
  prefer: "midweek" | "full" = "full",
): Promise<Diagnosis | null> {
  return withLastGood(
    `getDiagnosisByWeekPreferred:${weekEnding}:${prefer}`,
    () => _getDiagnosisByWeekPreferredRaw(weekEnding, prefer),
    (d) => d === null,
    { coldFallback: null },
  );
}
async function _getDiagnosisByWeekPreferredRaw(
  weekEnding: string,
  prefer: "midweek" | "full" = "full",
): Promise<Diagnosis | null> {
  if (!weekEnding) return null;
  const rows = await readTab("Weekly_Analysis");
  const objects = rowsToObjects(rows);
  const matching = objects.filter(
    (r) => String(r["Week Ending"] || "").trim() === weekEnding.trim(),
  );
  if (matching.length === 0) return null;
  if (matching.length === 1) return diagnosisFromRow(matching[0]);
  // Multiple rows for the same week_ending — pick by engine preference.
  // Sprint P7 v4.12 (2026-05-01): when multiple rows of the same engine
  // exist (week_ending normalization in v4.12 collapses pre-existing rows
  // that used run-date strings, so a single Mon-anchor week may now have
  // 3-5 'ai' rows from different historical runs), pick the NEWEST by
  // generated_at. Previously `.find()` returned the earliest match,
  // so the dashboard rendered stale diagnoses indefinitely.
  const parsed = matching.map(diagnosisFromRow);
  const byNewestFirst = [...parsed].sort((a, b) => {
    const ta = a.generated_at ? Date.parse(a.generated_at) : 0;
    const tb = b.generated_at ? Date.parse(b.generated_at) : 0;
    return tb - ta;
  });
  const midweekRow = byNewestFirst.find((d) => d.engine === "ai-midweek");
  const fullRow = byNewestFirst.find((d) => d.engine === "ai" || d.engine === "native-insights");
  if (prefer === "midweek") {
    return midweekRow || fullRow || byNewestFirst[0];
  }
  return fullRow || midweekRow || byNewestFirst[0];
}

/**
 * Step 3 archival mode: list all prior successful diagnoses so the archival
 * picker (future) or deep-linked `?archived=<week-ending>` URLs can validate
 * the target. Sorted newest-first.
 */
export async function listDiagnosisArchive(): Promise<Array<{ week_ending: string; headline: string }>> {
  const rows = await readTab("Weekly_Analysis");
  const objects = rowsToObjects(rows);
  return objects
    .map((r) => ({ week_ending: String(r["Week Ending"] || "").trim(), headline: String(r["Headline"] || "") }))
    .filter((r) => r.week_ending)
    .reverse();
}

// ─── Run status / staleness ───

// Day 2O: Analysis_Log is the pipeline's audit trail. The most recent row
// tells us whether Strategy (diagnosis) and Plan (calendar) data is fresh
// or if recent runs fell back because of API credit / rate-limit issues.
// Strategy and Plan pages render a banner when staleness > warn threshold,
// so users don't silently consume week-old "latest" analysis.

export type ArtifactStatus = "success" | "fallback" | "skipped" | "failed" | "n/a" | "unknown";

export interface RunStatus {
  // When the most recent run finished. ISO string or "" if log is empty.
  last_run_at: string;
  // Status of each stage in that most recent run.
  classify_status: ArtifactStatus;
  diagnosis_status: ArtifactStatus;
  calendar_status: ArtifactStatus;
  // PL-12: priors snapshot stage (Priors_Pillar/Teacher/Format/HookType/
  // SlotTime/WeekdaySeasonality/HourSeasonality/MoMDrift/Changepoints).
  // stdlib-only compute, no AI — status is success|skipped|failed|n/a.
  priors_status: ArtifactStatus;
  // STR-04 / STR-11: strategy stage (Strategy + Strategy_Log tabs). AI call
  // with STR-07 native-rule fallback when the LLM errors or keeps failing
  // STR-08 validation after retries.
  strategy_status: ArtifactStatus;
  // ISO timestamps of the most recent SUCCESSFUL diagnosis / calendar /
  // priors / strategy writes, carried forward across runs by the pipeline.
  // "" when never succeeded.
  last_successful_diagnosis_at: string;
  last_successful_calendar_at: string;
  last_successful_priors_at: string;
  last_successful_strategy_at: string;
}

const EMPTY_RUN_STATUS: RunStatus = {
  last_run_at: "",
  classify_status: "unknown",
  diagnosis_status: "unknown",
  calendar_status: "unknown",
  priors_status: "unknown",
  strategy_status: "unknown",
  last_successful_diagnosis_at: "",
  last_successful_calendar_at: "",
  last_successful_priors_at: "",
  last_successful_strategy_at: "",
};

export async function getRunStatus(): Promise<RunStatus> {
  return withLastGood(
    "getRunStatus",
    _getRunStatusRaw,
    undefined,
    { coldFallback: EMPTY_RUN_STATUS },
  );
}
async function _getRunStatusRaw(): Promise<RunStatus> {
  const rows = await readTab("Analysis_Log");
  const objects = rowsToObjects(rows);
  if (objects.length === 0) return EMPTY_RUN_STATUS;
  const last = objects[objects.length - 1];
  const normalize = (v: any): ArtifactStatus => {
    const s = String(v || "").toLowerCase().trim();
    if (["success", "fallback", "skipped", "failed", "n/a"].includes(s)) {
      return s as ArtifactStatus;
    }
    return "unknown";
  };

  // 2026-05-04 carry-forward chain hardening: pre-fix, side-channel writers
  // (scripts/viral_refresh.py, scripts/check_graph_version.py) appended rows
  // with all four `Last Successful X At` columns blank. The next legit
  // `write_run_log` call read THAT row as the prior row and propagated the
  // blanks. Result: the dashboard's `runStatus.last_successful_diagnosis_at`
  // would be "" even though a successful AI run existed earlier in history.
  //
  // Defense: when the latest row has a blank timestamp for a given
  // artifact, walk backward through history and pick the most recent row
  // that DOES have it populated. The pipeline-side fix
  // (write_audit_log_row carry-forward) prevents new blanks; this read-side
  // hardening recovers from existing blanks AND any future writer bug.
  const findLatest = (col: string): string => {
    for (let i = objects.length - 1; i >= 0; i--) {
      const v = objects[i][col];
      if (v && String(v).trim()) return String(v);
    }
    return "";
  };

  return {
    last_run_at: last["Run Date"] || "",
    classify_status: normalize(last["Classify Status"]),
    diagnosis_status: normalize(last["Diagnosis Status"]),
    calendar_status: normalize(last["Calendar Status"]),
    // PL-12: pre-M3 rows read "" -> "unknown", which the banner shows as
    // "—" in the detail panel — honest about historical blind spot rather
    // than falsely claiming success.
    priors_status: normalize(last["Priors Status"]),
    // STR-04 / STR-11: pre-Sprint-N rows have blank Strategy Status ->
    // "unknown" (same honest-blind-spot pattern as priors).
    strategy_status: normalize(last["Strategy Status"]),
    last_successful_diagnosis_at: findLatest("Last Successful Diagnosis At"),
    last_successful_calendar_at: findLatest("Last Successful Calendar At"),
    last_successful_priors_at: findLatest("Last Successful Priors At"),
    last_successful_strategy_at: findLatest("Last Successful Strategy At"),
  };
}

// Derive staleness from a status + timestamp. Returns a UI-ready summary:
//   severity: "ok"   — fresh within warn threshold, no banner needed
//             "warn" — stale or last refresh fell back; yellow banner
//             "crit" — very stale or never succeeded; red banner
//   days_since: integer days since the last successful update, or -1 if unknown
//   reason: human-readable explanation (short)
export interface StalenessInfo {
  severity: "ok" | "warn" | "crit";
  days_since: number;
  reason: string;
  last_successful_at: string;
  last_run_at: string;
  last_status: ArtifactStatus;
}

function daysBetween(iso: string, now: Date): number {
  if (!iso) return -1;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return -1;
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Pure-function decision: should the page show the alarming "AI off this run"
 * banner, or a quieter "showing prior week" notice?
 *
 * Extracted from app/diagnosis/page.tsx so the rule is unit-testable
 * (see scripts/smoke-tests.ts). Lives here in lib/sheets.ts because it's
 * a tiny static decision tree, not worth a new module.
 *
 * Rule (2026-05-04 incident #4 fix):
 *   - aiDisabled banner ONLY when ALL true: aiDisabled, isThisWeekView,
 *     no content (weekDiagnosis null AND liveDiagnosis null).
 *   - showFallbackNotice when this-week view falls back to liveDiagnosis
 *     (last-week's content). User needs to know they're seeing prior data.
 *   - Past-week / archival views: never aiDisabled banner — the user is
 *     deliberately viewing historical data, current pipeline state is
 *     irrelevant context.
 */
export function computeDiagnosisBannerState(opts: {
  isArchival: boolean;
  isThisWeekView: boolean;
  aiDisabled: boolean;
  weekDiagnosis: unknown;
  liveDiagnosis: unknown;
}): { showAiDisabledBanner: boolean; showFallbackNotice: boolean } {
  if (opts.isArchival || !opts.isThisWeekView) {
    return { showAiDisabledBanner: false, showFallbackNotice: false };
  }
  const hasFreshThisWeek = opts.weekDiagnosis !== null && opts.weekDiagnosis !== undefined;
  const hasFallback = opts.liveDiagnosis !== null && opts.liveDiagnosis !== undefined;
  if (!opts.aiDisabled) {
    // AI is on. Even if this-week view has no row yet (mid-week not run),
    // the empty-state copy is enough — no aiDisabled banner needed.
    return { showAiDisabledBanner: false, showFallbackNotice: false };
  }
  // AI is off. If we have NO content at all, fire the alarming banner.
  if (!hasFreshThisWeek && !hasFallback) {
    return { showAiDisabledBanner: true, showFallbackNotice: false };
  }
  // AI is off but we DO have content (fresh this-week OR fallback last-week).
  // Don't fire the alarming banner — the user has data to read. If we're
  // showing FALLBACK content (no this-week row, only liveDiagnosis), surface
  // a quiet notice so the user knows they're seeing prior week.
  if (!hasFreshThisWeek && hasFallback) {
    return { showAiDisabledBanner: false, showFallbackNotice: true };
  }
  return { showAiDisabledBanner: false, showFallbackNotice: false };
}

export function computeStaleness(
  artifact: "diagnosis" | "calendar" | "strategy",
  run: RunStatus,
  opts: { warnDays?: number; critDays?: number; now?: Date } = {}
): StalenessInfo {
  const warnDays = opts.warnDays ?? 7;
  const critDays = opts.critDays ?? 14;
  const now = opts.now ?? new Date();
  // STR-11: strategy pulls from its own set of carry-forward columns.
  // Diagnosis already powers the "Strategy" page in the pre-Sprint-N UI —
  // keeping both artifact names valid lets the new `/strategy` view move
  // onto the real STR-02 hypothesis without breaking the existing banner.
  const lastSuccessful =
    artifact === "diagnosis"
      ? run.last_successful_diagnosis_at
      : artifact === "calendar"
      ? run.last_successful_calendar_at
      : run.last_successful_strategy_at;
  const status =
    artifact === "diagnosis"
      ? run.diagnosis_status
      : artifact === "calendar"
      ? run.calendar_status
      : run.strategy_status;
  const days = daysBetween(lastSuccessful, now);

  // 2026-05-03 false-positive fix: if the most recent run reports this
  // artifact as successful but the carry-forward "Last Successful X At"
  // cell is blank (pre-Day-2O rows, or the orchestrator missed setting
  // `run_info.last_successful_<artifact>_at` on a force-regenerate path
  // where the pipeline succeeded but didn't restamp the timestamp),
  // fall back to `last_run_at` instead of declaring "never succeeded".
  // We KNOW the run was successful — the missing timestamp is a
  // bookkeeping gap, not an actual failure.
  if ((!lastSuccessful || days < 0) && status === "success" && run.last_run_at) {
    const runDays = daysBetween(run.last_run_at, now);
    if (runDays >= 0) {
      const severity: "ok" | "warn" | "crit" =
        runDays <= warnDays ? "ok" : runDays <= critDays ? "warn" : "crit";
      return {
        severity,
        days_since: runDays,
        reason:
          severity === "ok"
            ? ""
            : `Last successful timestamp missing; using run date as fallback`,
        last_successful_at: run.last_run_at,
        last_run_at: run.last_run_at,
        last_status: status,
      };
    }
  }

  // No successful run ever — blank state. Crit so the page shows the banner
  // and the user understands why the tab looks empty.
  if (!lastSuccessful || days < 0) {
    const never =
      artifact === "diagnosis"
        ? "No successful Strategy refresh has been recorded yet. Run the weekly pipeline to populate this view."
        : artifact === "calendar"
        ? "No successful Plan refresh has been recorded yet. Run the weekly pipeline to populate this view."
        : "No successful Strategy hypothesis has been generated yet. Run the weekly pipeline to populate this view.";
    return {
      severity: "crit",
      days_since: -1,
      reason: never,
      last_successful_at: "",
      last_run_at: run.last_run_at,
      last_status: status,
    };
  }

  // Fresh success — check age.
  if (status === "success" && days <= warnDays) {
    return {
      severity: "ok",
      days_since: days,
      reason: "",
      last_successful_at: lastSuccessful,
      last_run_at: run.last_run_at,
      last_status: status,
    };
  }

  // Last attempt fell back (API error) — warn regardless of age.
  if (status === "fallback") {
    return {
      severity: days > critDays ? "crit" : "warn",
      days_since: days,
      reason:
        `Last refresh attempt hit a Claude API error and reused cached data. ` +
        `Showing data from ${days} day${days === 1 ? "" : "s"} ago. ` +
        `Top up credits or re-run the weekly pipeline.`,
      last_successful_at: lastSuccessful,
      last_run_at: run.last_run_at,
      last_status: status,
    };
  }

  // Stale by age alone (probably no recent weekly run, or stages were skipped).
  if (days > critDays) {
    return {
      severity: "crit",
      days_since: days,
      reason:
        `Data is ${days} days old (threshold: ${critDays}). ` +
        `Trigger a weekly run to refresh.`,
      last_successful_at: lastSuccessful,
      last_run_at: run.last_run_at,
      last_status: status,
    };
  }
  if (days > warnDays) {
    return {
      severity: "warn",
      days_since: days,
      reason:
        `Data is ${days} days old (weekly cadence, threshold: ${warnDays}). ` +
        `Next Monday's run will refresh it.`,
      last_successful_at: lastSuccessful,
      last_run_at: run.last_run_at,
      last_status: status,
    };
  }

  return {
    severity: "ok",
    days_since: days,
    reason: "",
    last_successful_at: lastSuccessful,
    last_run_at: run.last_run_at,
    last_status: status,
  };
}

// ─── Content calendar ───

/**
 * Sprint P4 schema v2 helpers: the pipeline serializes
 * forecast_reach_ci_native + risk_flags as JSON strings into the
 * Content_Calendar tab so dashboard, report.py, and Outcome_Log all
 * read the same evidence payload. Parse defensively — older rows
 * (pre-schema-v2) won't have the columns at all and malformed JSON
 * from a hand-edited sheet should degrade to "no data" rather than
 * crash the /plan page.
 */
function parseCI(raw: unknown): CalendarSlot["forecast_reach_ci_native"] {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object"
        && typeof obj.low === "number"
        && typeof obj.mid === "number"
        && typeof obj.high === "number"
        && typeof obj.source === "string") {
      return { low: obj.low, mid: obj.mid, high: obj.high, source: obj.source };
    }
  } catch {
    // silent: stale/malformed cells fall through to undefined
  }
  return undefined;
}

function parseRiskFlags(raw: unknown): CalendarSlot["risk_flags"] {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return undefined;
    const flags = arr.filter(
      (e) => e && typeof e === "object"
          && typeof e.category === "string"
          && typeof e.detail === "string"
          && typeof e.mitigation === "string",
    ).map((e) => ({
      category: e.category,
      detail: e.detail,
      mitigation: e.mitigation,
    }));
    return flags.length ? flags : undefined;
  } catch {
    return undefined;
  }
}

function calendarFromRows(rows: Record<string, any>[]): CalendarSlot[] {
  return rows.map((r) => ({
    day: r["Day"],
    date: r["Date"],
    time_bdt: r["Time (BDT)"] || r["Time"],
    format: r["Format"],
    pillar: r["Pillar"],
    featured_entity: r["Featured Entity"] || "None",
    spotlight_type: r["Spotlight Type"] || "",
    spotlight_name: r["Spotlight Name"] || "",
    hook_line: r["Hook Line"] || r["Brief"] || "",
    key_message: r["Key Message"] || "",
    visual_direction: r["Visual Direction"] || "",
    cta: r["CTA"],
    funnel_stage: r["Funnel Stage"],
    language: r["Language"],
    audience: r["Audience"] || "General",
    rationale: r["Rationale"],
    expected_reach: r["Expected Reach"] || "",
    success_metric: r["Success Metric"] || "",
    // Schema v2 additions. All optional; undefined when the column is
    // absent (older sheets) or the cell contains malformed JSON.
    hypothesis_id: String(r["Hypothesis ID"] || "").trim() || undefined,
    forecast_reach_ci_native: parseCI(r["Forecast Reach CI"]),
    risk_flags: parseRiskFlags(r["Risk Flags"]),
  }));
}

export async function getCalendar(): Promise<CalendarSlot[]> {
  return withLastGood(
    "getCalendar",
    _getCalendarRaw,
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getCalendarRaw(): Promise<CalendarSlot[]> {
  const rows = await readTab("Content_Calendar");
  return calendarFromRows(rowsToObjects(rows));
}

/**
 * Sprint P7 v3 archive (2026-04-29): Content_Calendar is now append-by-week.
 * `getCalendarByWeekStarting(weekStarting)` filters slots whose Date falls
 * in the week starting on the given Monday (YYYY-MM-DD). Returns rows for
 * exactly that 7-day window.
 *
 * Used by the Plan page's This/Next/Last week selector. Falls back to
 * empty array when no slots exist for the target week (e.g. "Last week"
 * selected on a Page that hasn't accumulated history yet, or "Next week"
 * selected before Monday's cron has fired for the upcoming week).
 */
export async function getCalendarByWeekStarting(weekStarting: string): Promise<CalendarSlot[]> {
  return withLastGood(
    `getCalendarByWeekStarting:${weekStarting}`,
    () => _getCalendarByWeekStartingRaw(weekStarting),
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getCalendarByWeekStartingRaw(weekStarting: string): Promise<CalendarSlot[]> {
  if (!weekStarting) return [];
  const rows = await readTab("Content_Calendar");
  const objects = rowsToObjects(rows);
  // Sprint P7 v4.11 (2026-05-01): canonical filter is now the explicit
  // "Week Ending" column written by the pipeline (= the Monday that starts
  // the 7-day Mon-Sun window). Fall back to inferring from "Date" for any
  // legacy rows written before the schema migration.
  const wkStart = new Date(`${weekStarting}T00:00:00`);
  if (isNaN(wkStart.getTime())) return [];
  const dayKeys = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(wkStart);
    d.setDate(d.getDate() + i);
    dayKeys.add(d.toISOString().slice(0, 10));
  }
  const matching = objects.filter((r) => {
    // Prefer canonical Week Ending column.
    const we = String(r["Week Ending"] || "").trim();
    if (we) return we === weekStarting;
    // Legacy row fallback: derive week from Date.
    const dateRaw = String(r["Date"] || "").trim();
    if (dayKeys.has(dateRaw)) return true;
    const parsed = new Date(dateRaw);
    if (isNaN(parsed.getTime())) return false;
    const iso = parsed.toISOString().slice(0, 10);
    return dayKeys.has(iso);
  });
  return calendarFromRows(matching);
}

/**
 * List unique week_starting Mondays present in Content_Calendar. Useful for
 * the Plan page selector to know which weeks have data (e.g. disable
 * "Last week" pill when no historical rows exist yet). Newest first.
 */
export async function listCalendarWeeks(): Promise<string[]> {
  const rows = await readTab("Content_Calendar");
  if (rows.length === 0) return [];
  const objects = rowsToObjects(rows);
  // Each calendar row has a Date; group dates into weeks (the Monday of
  // their containing Mon-Sun).
  const weekStarts = new Set<string>();
  for (const r of objects) {
    const dateRaw = String(r["Date"] || "").trim();
    if (!dateRaw) continue;
    const d = new Date(`${dateRaw}T12:00:00`);
    if (isNaN(d.getTime())) continue;
    // Walk back to Monday: getDay() returns Sun=0..Sat=6. Mon=1.
    const dow = d.getDay();
    const back = dow === 0 ? 6 : dow - 1;
    const mon = new Date(d);
    mon.setDate(mon.getDate() - back);
    weekStarts.add(mon.toISOString().slice(0, 10));
  }
  return Array.from(weekStarts).sort().reverse();
}

/**
 * Step 3 archival mode: fetch a specific past calendar by a "run key".
 *
 * Content_Calendar is overwritten each week — there's no historical archive
 * in the sheet today. To give `/plan?archived=<run-id>` an answer at all,
 * the pipeline will (Step 3 follow-up) start appending a `Run ID` column and
 * a `Calendar_Archive` tab. For now this reader is wired so the page can
 * call it, but until the archive tab exists it always returns `[]` — the
 * page falls back to its "archive not found" message.
 */
export async function getCalendarByRunId(runId: string): Promise<CalendarSlot[]> {
  return withLastGood(
    `getCalendarByRunId:${runId}`,
    () => _getCalendarByRunIdRaw(runId),
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getCalendarByRunIdRaw(runId: string): Promise<CalendarSlot[]> {
  if (!runId) return [];
  const rows = await readTab("Calendar_Archive");
  if (rows.length === 0) return [];
  const objects = rowsToObjects(rows);
  const match = objects.filter((r) => String(r["Run ID"] || "").trim() === runId.trim());
  return calendarFromRows(match);
}

// ─── AI stage off-switch detection ───
//
// "AI-disabled" is a user-facing product state, not a failure. The pipeline
// writes a `<Stage> Engine` column to Analysis_Log when the operator
// explicitly ran the stage with --engine=native (or skipped it entirely).
// When the most recent run carries `native` or `off` for a stage, the
// dashboard's Strategy/Plan page should render `AIDisabledEmptyState`
// instead of the red crit banner.
//
// Until Step 3's pipeline side ships (classify_native.py + weekly-no-ai.yml),
// this reader falls back to a conservative heuristic: a stage is considered
// "off" only when its status is explicitly "skipped" — the pipeline's
// existing code path for `--no-ai`. Success / fallback / failed all return
// false (page stays on the staleness banner).

// Stage-0 item 11 (Apr 2026): engine values expanded to carry provider name
// ("anthropic" | "gemini") and distinguish live-AI from cache-fallback runs.
// Legacy "ai" remains valid and is treated as equivalent to a live-AI run for
// the AI-disabled-empty-state decision. "cache" is surfaced as a distinct
// degraded signal — the caller can use isLiveAI() / isAiRunning() helpers
// instead of equality checks.
export type StageEngine =
  | "ai"         // legacy, pre-Stage-0
  | "anthropic"  // Stage-0+: live Anthropic call succeeded
  | "gemini"     // Stage-0+: live Gemini call succeeded
  | "native"     // rule-based classifier (classify stage only)
  | "cache"      // AI call failed, fell back to cached data
  | "off"        // stage skipped / disabled / failed without fallback
  | "unknown";   // row missing the column (pre-Day-2O schema)

const KNOWN_ENGINE_VALUES: ReadonlySet<string> = new Set([
  "ai", "anthropic", "gemini", "native", "cache", "off",
]);

/**
 * True if the stage produced output via a live AI call this run.
 * Treat "ai" (legacy) the same as the new provider-specific values.
 */
export function isLiveAI(engine: StageEngine): boolean {
  return engine === "ai" || engine === "anthropic" || engine === "gemini";
}

/**
 * True if the stage's last run produced any output at all (live AI, native,
 * or cache-fallback). Used to decide whether to show the AI-disabled empty
 * state: only stages that returned "off" truly have no output to display.
 */
export function isAiRunning(engine: StageEngine): boolean {
  return engine !== "off" && engine !== "unknown";
}

export async function getStageEngine(
  stage: "diagnosis" | "calendar" | "strategy",
): Promise<StageEngine> {
  // 2026-05-03 incident #2: this read was throwing on cold-start +
  // Sheets transient and taking down /diagnosis + /plan via their
  // Promise.all rejection. Wrapping with withLastGood gives warm-cache
  // resilience; coldFallback="unknown" handles the cold-start case
  // (consumers like isAiRunning gracefully handle "unknown" as "off").
  return withLastGood(
    `getStageEngine:${stage}`,
    () => _getStageEngineRaw(stage),
    (d) => d === "unknown",
    { coldFallback: "unknown" as StageEngine },
  );
}
async function _getStageEngineRaw(
  stage: "diagnosis" | "calendar" | "strategy",
): Promise<StageEngine> {
  const rows = await readTab("Analysis_Log");
  const objects = rowsToObjects(rows);
  if (objects.length === 0) return "unknown";
  const last = objects[objects.length - 1];
  const colCandidates = stage === "diagnosis"
    ? ["Diagnosis Engine", "Diagnose Engine"]
    : stage === "calendar"
    ? ["Calendar Engine"]
    : ["Strategy Engine"];
  for (const col of colCandidates) {
    const raw = String(last[col] || "").toLowerCase().trim();
    if (KNOWN_ENGINE_VALUES.has(raw)) return raw as StageEngine;
  }
  const statusCol =
    stage === "diagnosis"
      ? "Diagnosis Status"
      : stage === "calendar"
      ? "Calendar Status"
      : "Strategy Status";
  if (String(last[statusCol] || "").toLowerCase().trim() === "skipped") return "off";
  return "unknown";
}

// ─── Bucket G item 58: AI cost budget summary ───
//
// Reads Analysis_Log and sums the per-run cost for the current + previous
// ISO weeks. Budget is a weekly ceiling defined in AI_WEEKLY_BUDGET_USD.
// When Analysis_Log carries no "Cost USD" column yet (pipeline hasn't shipped
// per-call cost capture), the helper returns zeros — the banner on Overview
// still renders "budget: $X" so the commitment is visible. As soon as the
// pipeline starts writing cost, the banner lights up automatically.

export const AI_WEEKLY_BUDGET_USD = 5.0;

export interface CostSummary {
  this_week: number;       // USD spent on AI calls since most recent Monday
  last_week: number;       // USD spent in the prior ISO week
  budget: number;          // AI_WEEKLY_BUDGET_USD
  pct_of_budget: number;   // 0..100+ (can exceed 100 when over budget)
  tracked: boolean;        // true iff Analysis_Log carries a Cost USD column
}

function _monday(d: Date): Date {
  // ISO week starts Monday. Returns a new Date at 00:00 local time.
  // IMPORTANT: pass a BDT-shifted Date (`bdtNow()`) — getDay() reads
  // local-time, so a raw UTC Date on Vercel can land on the wrong
  // Monday by up to 6 hours. runCostSummary now passes bdtNow() by
  // default (Bucket P6F 2026-04-28).
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const delta = dow === 0 ? -6 : 1 - dow; // shift to Monday
  out.setDate(out.getDate() + delta);
  return out;
}

function _parseCostCell(raw: any): number {
  if (raw == null) return 0;
  const s = String(raw).trim().replace(/[^0-9.\-]/g, "");
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function runCostSummary(
  logs: Record<string, any>[],
  opts: { now?: Date; budget?: number } = {}
): CostSummary {
  // BDT wall-clock for "now" so the weekly Monday boundary matches
  // BDT's calendar week — was using server-local time which on Vercel
  // (UTC) put runs that fired Sun 18:00–23:59 UTC = Mon 00:00–05:59 BDT
  // into the wrong cost-tracking week. See bdtNow() docstring.
  const now = opts.now ?? bdtNow();
  const budget = opts.budget ?? AI_WEEKLY_BUDGET_USD;
  const thisMonday = _monday(now);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);

  // Detect whether ANY row carries a parseable cost. If no row does, we
  // surface tracked=false so the UI can show "budget: $X (tracking pending)"
  // instead of a misleading $0.00 of $5.00 chart.
  let tracked = false;

  let thisWeek = 0;
  let lastWeek = 0;
  for (const r of logs) {
    // Accept a few sensible column names so the column can be added without
    // breaking this reader: "Cost USD" is the canonical name going forward.
    // STR-12 (Sprint N3): "Strategy Cost USD" is the first per-stage cost
    // column to ship on the pipeline side. Reading it here means the
    // Overview budget banner lights up as soon as Sprint N3 P2 lands;
    // once diagnosis/calendar cost capture follows, this lookup will
    // widen to sum across all per-stage columns.
    const costRaw =
      r["Cost USD"] ??
      r["AI Cost USD"] ??
      r["Cost"] ??
      r["Estimated Cost USD"] ??
      r["Strategy Cost USD"];
    const runDate = r["Run Date"] || r["Date"] || "";
    if (!runDate) continue;
    const ts = new Date(runDate);
    if (isNaN(ts.getTime())) continue;

    const cost = _parseCostCell(costRaw);
    if (costRaw != null && String(costRaw).trim() !== "") tracked = true;

    if (ts >= thisMonday && ts <= now) {
      thisWeek += cost;
    } else if (ts >= lastMonday && ts < thisMonday) {
      lastWeek += cost;
    }
  }

  const pct = budget > 0 ? (thisWeek / budget) * 100 : 0;
  return {
    this_week: Math.round(thisWeek * 100) / 100,
    last_week: Math.round(lastWeek * 100) / 100,
    budget,
    pct_of_budget: Math.round(pct * 10) / 10,
    tracked,
  };
}

/** Async convenience — reads Analysis_Log then delegates to runCostSummary. */
const _EMPTY_COST_SUMMARY: CostSummary = {
  this_week: 0,
  last_week: 0,
  budget: AI_WEEKLY_BUDGET_USD,
  pct_of_budget: 0,
  tracked: false,
};
export async function getCostSummary(): Promise<CostSummary> {
  return withLastGood(
    "getCostSummary",
    _getCostSummaryRaw,
    undefined,
    { coldFallback: _EMPTY_COST_SUMMARY },
  );
}
async function _getCostSummaryRaw(): Promise<CostSummary> {
  const rows = await readTab("Analysis_Log");
  const objects = rowsToObjects(rows);
  return runCostSummary(objects);
}

// ─── Sprint N (Strategy) — STR-11 dashboard reader ───
//
// Pipeline writer: facebook-pipeline/src/sheets.py::_strategy_row (17 cols).
// Snapshot tab `Strategy` is cleared + rewritten each run; append-only tab
// `Strategy_Log` carries history. JSON cells decode back to typed shapes on
// read so pages can render without per-page parsing boilerplate.
//
// The JSON decoders are tolerant on purpose — pre-Sprint-N2 rows lack the
// three trailing provenance cols (Fallback Reason / Validation Attempts /
// Adherence Summary); malformed cells return safe defaults rather than
// throwing. The page stays up even when a legacy row is read.

function _parseJsonCell<T>(raw: any, fallback: T): T {
  if (raw === null || raw === undefined || raw === "") return fallback;
  if (typeof raw === "object") return raw as T;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

const _EMPTY_VERDICT_COUNTS: StrategyVerdictCounts = {
  beat_baseline: 0,
  matched_baseline: 0,
  missed_baseline: 0,
  not_executed: 0,
  insufficient_baseline: 0,
};

function _parseAdherenceSummary(raw: any): AdherenceSummaryCompact | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = _parseJsonCell<any>(raw, null);
  if (!parsed || typeof parsed !== "object") return null;
  const vc = parsed.verdict_counts || {};
  return {
    graded_week: String(parsed.graded_week || ""),
    verdict_counts: {
      beat_baseline: toNumber(vc.beat_baseline),
      matched_baseline: toNumber(vc.matched_baseline),
      missed_baseline: toNumber(vc.missed_baseline),
      not_executed: toNumber(vc.not_executed),
      insufficient_baseline: toNumber(vc.insufficient_baseline),
    },
    source_engine: parsed.source_engine ? String(parsed.source_engine) : undefined,
  };
}

function strategyFromRow(row: Record<string, any>): StrategyEntry {
  return {
    week_ending: String(row["Week Ending"] || ""),
    strategic_hypothesis: String(row["Strategic Hypothesis"] || ""),
    pillar_weights: _parseJsonCell<StrategyPillarWeights>(row["Pillar Weights"], {}),
    teacher_rotation: _parseJsonCell<StrategyTeacherRotationEntry[]>(
      row["Teacher Rotation"], [],
    ),
    format_mix: _parseJsonCell<StrategyFormatMix>(row["Format Mix"], {}),
    risk_register: _parseJsonCell<StrategyRiskEntry[]>(row["Risk Register"], []),
    abandon_criteria: _parseJsonCell<StrategyAbandonCriterion[]>(
      row["Abandon Criteria"], [],
    ),
    time_horizon_weeks: toNumber(row["Time Horizon Weeks"]),
    confidence: String(row["Confidence"] || ""),
    cited_priors: _parseJsonCell<string[]>(row["Cited Priors"], []),
    previous_hypothesis_adherence: String(row["Previous Hypothesis Adherence"] || ""),
    prompt_version: String(row["Prompt Version"] || ""),
    engine: String(row["Engine"] || ""),
    generated_at: String(row["Generated At"] || ""),
    // Sprint N2 provenance — missing on pre-Sprint-N2 rows, defaults are
    // safe (empty string, 0 attempts, null summary).
    fallback_reason: String(row["Fallback Reason"] || ""),
    validation_attempts: toNumber(row["Validation Attempts"]),
    adherence_summary: _parseAdherenceSummary(row["Adherence Summary"]),
  };
}

/**
 * Read the single-row `Strategy` snapshot tab. Returns null when the tab
 * hasn't been populated (pre-Sprint-N runs) or the row is empty.
 */
export async function getLatestStrategy(): Promise<StrategyEntry | null> {
  return withLastGood(
    "getLatestStrategy",
    _getLatestStrategyRaw,
    (d) => d === null,
    { coldFallback: null },
  );
}
async function _getLatestStrategyRaw(): Promise<StrategyEntry | null> {
  const rows = await readTab("Strategy");
  const objects = rowsToObjects(rows);
  if (objects.length === 0) return null;
  // Snapshot tab has exactly one data row after each run; take the last to
  // be safe if historical rows linger from a pre-refactor run.
  const row = objects[objects.length - 1];
  if (!row["Week Ending"] && !row["Strategic Hypothesis"]) return null;
  return strategyFromRow(row);
}

/**
 * Read the append-only `Strategy_Log` history tab. Returned newest-first
 * so pages can render `[0]` as the current run. Empty array when the tab
 * doesn't exist yet or carries only the header row.
 */
export async function getStrategyLog(): Promise<StrategyEntry[]> {
  return withLastGood(
    "getStrategyLog",
    _getStrategyLogRaw,
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getStrategyLogRaw(): Promise<StrategyEntry[]> {
  const rows = await readTab("Strategy_Log");
  const objects = rowsToObjects(rows);
  return objects
    .filter((r) => r["Week Ending"] || r["Strategic Hypothesis"])
    .map(strategyFromRow)
    .reverse();
}

/**
 * Archival lookup by `Week Ending`. Returns null when no row matches — the
 * `/strategy?archived=<week>` page falls back to its current state + toast.
 * Mirrors the shape of `getDiagnosisByWeek` / `getCalendarByRunId`.
 */
export async function getStrategyByWeek(
  weekEnding: string,
): Promise<StrategyEntry | null> {
  return withLastGood(
    `getStrategyByWeek:${weekEnding}`,
    () => _getStrategyByWeekRaw(weekEnding),
    (d) => d === null,
    { coldFallback: null },
  );
}
async function _getStrategyByWeekRaw(
  weekEnding: string,
): Promise<StrategyEntry | null> {
  if (!weekEnding) return null;
  const rows = await readTab("Strategy_Log");
  const objects = rowsToObjects(rows);
  const match = objects.find(
    (r) => String(r["Week Ending"] || "").trim() === weekEnding.trim(),
  );
  return match ? strategyFromRow(match) : null;
}

/**
 * PLN-07: dashboard-side reader for the Plan_Narrative tab.
 *
 * The pipeline (PLN-06) writes a single row per week holding the weekly
 * narrative arc + aggregate forecast + hypothesis list + risk/contingency
 * counts. Dashboard reads that row so the Plan page can show a
 * "This Week's Plan" card without re-aggregating per render.
 *
 * Empty-safe: returns null when the tab doesn't exist yet (e.g. first
 * week before the pipeline has run PLN-06), or when every row is blank.
 * Matches by `Week Ending`; falls back to the newest (last) row when no
 * explicit week is requested.
 */
export interface PlanNarrative {
  week_ending: string;
  storyline: string;
  hypothesis_id: string;
  cited_priors_row: string;
  hypothesis_list: string;
  forecast_summary: string;
  risk_flag_count: number;
  contingency_count: number;
  generated_at: string;
  /** Sprint P7 v4.11 (2026-05-01): hypothesis_id → human-readable text.
   *  Powers the Plan page slot tooltip — previously the H1/H2 chip showed
   *  generic "process" copy explaining what hypothesis_id means; now it
   *  renders the actual hypothesis statement. Empty {} when the row
   *  predates the migration. */
  hypotheses_map: Record<string, string>;
}

function planNarrativeFromRow(r: Record<string, any>): PlanNarrative {
  let hypotheses_map: Record<string, string> = {};
  const rawMap = String(r["Hypotheses Map (JSON)"] || "").trim();
  if (rawMap) {
    try {
      const parsed = JSON.parse(rawMap);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") hypotheses_map[k] = v;
        }
      }
    } catch {
      // Malformed JSON — leave map empty, tooltip falls back to id.
    }
  }
  return {
    week_ending: String(r["Week Ending"] || "").trim(),
    storyline: String(r["Narrative Storyline"] || "").trim(),
    hypothesis_id: String(r["Narrative Hypothesis ID"] || "").trim(),
    cited_priors_row: String(r["Narrative Cited Priors Row"] || "").trim(),
    hypothesis_list: String(r["Hypothesis List"] || "").trim(),
    forecast_summary: String(r["Forecast Summary"] || "").trim(),
    risk_flag_count: toNumber(r["Risk Flag Count"]),
    contingency_count: toNumber(r["Contingency Count"]),
    generated_at: String(r["Generated At"] || "").trim(),
    hypotheses_map,
  };
}

export async function getPlanNarrative(
  weekEnding?: string,
): Promise<PlanNarrative | null> {
  return withLastGood(
    `getPlanNarrative:${weekEnding ?? "latest"}`,
    () => _getPlanNarrativeRaw(weekEnding),
    (d) => d === null,
    { coldFallback: null },
  );
}
async function _getPlanNarrativeRaw(
  weekEnding?: string,
): Promise<PlanNarrative | null> {
  const rows = await readTab("Plan_Narrative");
  const objects = rowsToObjects(rows);
  if (objects.length === 0) return null;
  if (weekEnding) {
    const match = objects.find(
      (r) => String(r["Week Ending"] || "").trim() === weekEnding.trim(),
    );
    return match ? planNarrativeFromRow(match) : null;
  }
  // Default: newest row (append-mostly, upsert-by-week; the last row is
  // the most-recently-written week).
  const row = objects[objects.length - 1];
  const parsed = planNarrativeFromRow(row);
  // Guard against a row that's structurally present but completely blank.
  if (!parsed.week_ending && !parsed.storyline) return null;
  return parsed;
}

/**
 * List all archived strategy runs (week_ending + short headline) for an
 * archive picker. Newest-first. Honest about blank weeks — a row without
 * a `Week Ending` is filtered out.
 */
export async function listStrategyArchive(): Promise<
  Array<{ week_ending: string; hypothesis: string; engine: string }>
> {
  const rows = await readTab("Strategy_Log");
  const objects = rowsToObjects(rows);
  return objects
    .map((r) => ({
      week_ending: String(r["Week Ending"] || "").trim(),
      hypothesis: String(r["Strategic Hypothesis"] || ""),
      engine: String(r["Engine"] || ""),
    }))
    .filter((r) => r.week_ending)
    .reverse();
}

// ─── Sprint P6 chunk 7 (OSL-04) — Outcome_Log reader ───
//
// Pipeline writer: facebook-pipeline/src/sheets.py::write_outcome_log (17 cols).
// The reader is tolerant of missing cells because the sheet upserts by
// composite key "{week}|{day}|{slot}", so forward-looking calendars land as
// verdict="no-data" rows that fill in over subsequent runs.
//
// Deterministic stage (score_slot_outcome is pure), so no StalenessBanner is
// required per CLAUDE.md — staleness is a Claude-powered-artifact concern.
// The page still shows Generated At inline so operators know when it ran.

function _numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function outcomeLogFromRow(row: Record<string, any>): OutcomeLogEntry {
  return {
    outcome_key: String(row["Outcome Key"] || ""),
    week_ending: String(row["Week Ending"] || ""),
    day: String(row["Day"] || ""),
    date: String(row["Date"] || ""),
    slot_index: toNumber(row["Slot Index"]),
    hypothesis_id: String(row["Hypothesis ID"] || ""),
    pillar: String(row["Pillar"] || ""),
    format: String(row["Format"] || ""),
    forecast_low: _numOrNull(row["Forecast Low"]),
    forecast_mid: _numOrNull(row["Forecast Mid"]),
    forecast_high: _numOrNull(row["Forecast High"]),
    actual_reach: _numOrNull(row["Actual Reach"]),
    score: _numOrNull(row["Score"]),
    verdict: String(row["Verdict"] || "") as OutcomeVerdict,
    exam_adjusted_used: toBool(row["Exam Adjusted Used"]),
    exam_adjusted_mid: _numOrNull(row["Exam Adjusted Mid"]),
    generated_at: String(row["Generated At"] || ""),
    preliminary: toBool(row["Preliminary"]),
    matched_post_id: String(row["Matched Post ID"] || "").trim(),
    age_days: _numOrNull(row["Age Days"]),
    slot_target_metric: String(row["Slot Target Metric"] || "").trim(),
    slot_expected_reach_range: String(row["Slot Expected Reach Range"] || "").trim(),
  };
}

// ─── Calibration_Log reader (2026-05-04: surfacing the calibration signal) ───
//
// Per-week summary of "did our 80% CI actually contain 80%?" written by the
// pipeline's write_calibration_log post-process. Currently shows ~42% for
// week 2026-04-20 — the forecast bands are mis-calibrated, not just imprecise.
// Surfacing this on /outcomes is the prerequisite for everything in
// docs/PLAN_ALGORITHM_AUDIT.md Tier 4+; without a visible calibration KPI
// the team can't tell whether prompt/prior changes are improving or hurting.
export interface CalibrationLogEntry {
  week_ending: string;
  total_slots: number;
  final_slots: number;
  hits: number;
  exceeded: number;
  missed: number;
  no_data: number;
  /** Inside-CI rate: hits / (hits + exceeded + missed). null when unscored. */
  hit_rate_inside_ci: number | null;
  /** abs(0.80 - hit_rate). null when unscored. */
  calibration_error: number | null;
  /** Mean band width / mean forecast mid. null when bands are missing. */
  sharpness: number | null;
  generated_at: string;
}

export async function getCalibrationLog(): Promise<CalibrationLogEntry[]> {
  return withLastGood(
    "getCalibrationLog",
    _getCalibrationLogRaw,
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getCalibrationLogRaw(): Promise<CalibrationLogEntry[]> {
  const rows = await readTab("Calibration_Log");
  const objects = rowsToObjects(rows);
  const parsed: CalibrationLogEntry[] = objects
    .filter((r) => String(r["Week Ending"] || "").trim())
    .map((r) => {
      const numOrNull = (v: any): number | null => {
        const s = String(v ?? "").trim();
        if (!s) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      };
      const intOr = (v: any, fallback: number): number => {
        const s = String(v ?? "").trim();
        if (!s) return fallback;
        const n = Number(s);
        return Number.isFinite(n) ? Math.round(n) : fallback;
      };
      return {
        week_ending: String(r["Week Ending"] || "").trim(),
        total_slots: intOr(r["Total Slots"], 0),
        final_slots: intOr(r["Final Slots"], 0),
        hits: intOr(r["Hits"], 0),
        exceeded: intOr(r["Exceeded"], 0),
        missed: intOr(r["Missed"], 0),
        no_data: intOr(r["No Data"], 0),
        hit_rate_inside_ci: numOrNull(r["Hit Rate Inside CI"]),
        calibration_error: numOrNull(r["Calibration Error"]),
        sharpness: numOrNull(r["Sharpness"]),
        generated_at: String(r["Generated At"] || "").trim(),
      };
    });
  // Newest-first by week_ending (lexicographic on YYYY-MM-DD works).
  parsed.sort((a, b) => b.week_ending.localeCompare(a.week_ending));
  return parsed;
}

/**
 * Rolling 4-week calibration summary: average hit rate inside CI, average
 * calibration error, count of weeks with measurable verdicts. Used by the
 * /outcomes header KPI strip. Returns null when no calibratable weeks exist.
 */
export interface CalibrationSummary {
  weeks_measured: number;
  avg_hit_rate_inside_ci: number | null;
  avg_calibration_error: number | null;
  latest_week: string;
  latest_hit_rate_inside_ci: number | null;
  /** "ok" (≥ 0.65), "warn" (0.50–0.64), "crit" (< 0.50). null when no data. */
  status: "ok" | "warn" | "crit" | null;
}

export function summarizeCalibration(
  entries: CalibrationLogEntry[],
  windowWeeks: number = 4,
): CalibrationSummary {
  const measured = entries.filter((e) => e.hit_rate_inside_ci !== null);
  if (measured.length === 0) {
    return {
      weeks_measured: 0,
      avg_hit_rate_inside_ci: null,
      avg_calibration_error: null,
      latest_week: "",
      latest_hit_rate_inside_ci: null,
      status: null,
    };
  }
  const recent = measured.slice(0, windowWeeks);
  const avgHr = recent.reduce((a, e) => a + (e.hit_rate_inside_ci as number), 0) / recent.length;
  const cesWithValue = recent.filter((e) => e.calibration_error !== null);
  const avgCe = cesWithValue.length
    ? cesWithValue.reduce((a, e) => a + (e.calibration_error as number), 0) / cesWithValue.length
    : null;
  const latest = recent[0];
  const status: "ok" | "warn" | "crit" =
    avgHr >= 0.65 ? "ok" : avgHr >= 0.50 ? "warn" : "crit";
  return {
    weeks_measured: recent.length,
    avg_hit_rate_inside_ci: Math.round(avgHr * 10000) / 10000,
    avg_calibration_error: avgCe === null ? null : Math.round(avgCe * 10000) / 10000,
    latest_week: latest.week_ending,
    latest_hit_rate_inside_ci: latest.hit_rate_inside_ci,
    status,
  };
}

/**
 * Read every Outcome_Log row. Newest-week-first ordering so callers can
 * `groupBy(week_ending)` and take the first group as the latest. Returns
 * empty array when the tab doesn't exist yet (OSL-04 pre-shipping) or is
 * header-only.
 */
export async function getOutcomeLog(): Promise<OutcomeLogEntry[]> {
  return withLastGood(
    "getOutcomeLog",
    _getOutcomeLogRaw,
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getOutcomeLogRaw(): Promise<OutcomeLogEntry[]> {
  const rows = await readTab("Outcome_Log");
  const objects = rowsToObjects(rows);
  return objects
    .filter((r) => r["Outcome Key"] || r["Week Ending"])
    .map(outcomeLogFromRow)
    // Newest week first, stable within a week (day + slot_index ascending).
    // String compare on ISO-like "YYYY-MM-DD" works lexicographically.
    .sort((a, b) => {
      if (a.week_ending !== b.week_ending) {
        return b.week_ending.localeCompare(a.week_ending);
      }
      const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const da = dayOrder.indexOf(a.day);
      const db = dayOrder.indexOf(b.day);
      if (da !== db) return da - db;
      return a.slot_index - b.slot_index;
    });
}

/**
 * Outcomes for a single week. Empty array when the week has no rows.
 * Week string matches the pipeline's ISO "YYYY-MM-DD" week_ending.
 */
export async function getOutcomeLogByWeek(weekEnding: string): Promise<OutcomeLogEntry[]> {
  return withLastGood(
    `getOutcomeLogByWeek:${weekEnding}`,
    () => _getOutcomeLogByWeekRaw(weekEnding),
    (d) => d.length === 0,
    { coldFallback: [] },
  );
}
async function _getOutcomeLogByWeekRaw(
  weekEnding: string,
): Promise<OutcomeLogEntry[]> {
  const all = await getOutcomeLog();
  return all.filter((r) => r.week_ending === weekEnding);
}

/**
 * Latest week that has at least one non-no-data row (i.e. a week whose
 * actuals have started landing). Returns null when no such week exists
 * yet — useful to render an honest "waiting for actuals" empty state on
 * the /outcomes page rather than showing a full calendar of no-data rows.
 */
export async function getLatestGradedOutcomeWeek(): Promise<string | null> {
  // Sprint P7 v4.12 (2026-05-01): pick the NEWEST week (by ISO date, since
  // week_ending is a Mon-anchor YYYY-MM-DD) that has at least one graded
  // verdict. Pre-v4.12 this iterated in append order and returned the
  // OLDEST graded week — meaning the Outcomes page landed on stale weeks
  // forever. Now reverses the iteration so the most-recently-graded
  // week wins.
  const all = await getOutcomeLog();
  const weeksWithGrade = new Set<string>();
  for (const row of all) {
    if (
      row.week_ending &&
      row.verdict &&
      row.verdict !== "no-data" &&
      row.verdict !== "unavailable"
    ) {
      weeksWithGrade.add(row.week_ending);
    }
  }
  if (weeksWithGrade.size === 0) return null;
  return Array.from(weeksWithGrade).sort().reverse()[0];
}

/**
 * List every distinct week_ending present in Outcome_Log, NEWEST-first.
 * Empty array when the tab is empty. Useful for a week picker on /outcomes.
 */
export async function listOutcomeWeeks(): Promise<string[]> {
  const all = await getOutcomeLog();
  const seen = new Set<string>();
  for (const r of all) {
    if (r.week_ending) seen.add(r.week_ending);
  }
  // Sprint P7 v4.12 (2026-05-01): sort newest-first by ISO. Pre-v4.12 used
  // encounter order which depended on sheet-write sequence — confusing
  // when the picker is supposed to surface the most recent week first.
  return Array.from(seen).sort().reverse();
}

/**
 * Compute the week rollup client-side. Mirrors the pipeline's
 * `compute_calendar_quality_score` (classify.py) so /outcomes can render
 * honest totals even when Calendar Quality Score hasn't been persisted to
 * Strategy_Log yet (OSL-07 is orphan pending strategy UI return).
 *
 * Grade bands follow the pipeline's convention:
 *   A ≥ 0.75, B ≥ 0.60, C ≥ 0.45, D ≥ 0.30, else F
 * "ungraded" when graded_count == 0 (all slots no-data / unavailable).
 */
export function computeOutcomeRollup(
  rows: OutcomeLogEntry[],
  weekEnding = "",
): OutcomeRollup {
  const shell: OutcomeRollup = {
    week_ending: weekEnding || (rows[0]?.week_ending ?? ""),
    slot_count: 0,
    graded_count: 0,
    hit_count: 0,
    missed_count: 0,
    confounded_count: 0,
    no_data_count: 0,
    hit_rate: null,
    mean_score: null,
    grade: "ungraded",
  };
  if (!rows || rows.length === 0) return shell;

  let slotCount = 0;
  let graded = 0;
  let hits = 0;
  let missed = 0;
  let confounded = 0;
  let noData = 0;
  let scoreSum = 0;
  let scoreN = 0;

  for (const r of rows) {
    slotCount += 1;
    const v = r.verdict;
    if (v === "hit" || v === "exceeded") {
      hits += 1;
      graded += 1;
    } else if (v === "missed") {
      missed += 1;
      graded += 1;
    } else if (v === "inconclusive-exam-confounded") {
      confounded += 1;
    } else {
      // "" | "no-data" | "unavailable" — counted in slot_count only
      noData += 1;
    }
    if (r.score !== null && (v === "hit" || v === "exceeded" || v === "missed")) {
      scoreSum += r.score;
      scoreN += 1;
    }
  }

  const hitRate = graded > 0 ? hits / graded : null;
  const meanScore = scoreN > 0 ? scoreSum / scoreN : null;
  let grade = "ungraded";
  if (hitRate !== null) {
    if (hitRate >= 0.75) grade = "A";
    else if (hitRate >= 0.6) grade = "B";
    else if (hitRate >= 0.45) grade = "C";
    else if (hitRate >= 0.3) grade = "D";
    else grade = "F";
  }

  return {
    week_ending: shell.week_ending,
    slot_count: slotCount,
    graded_count: graded,
    hit_count: hits,
    missed_count: missed,
    confounded_count: confounded,
    no_data_count: noData,
    hit_rate: hitRate,
    mean_score: meanScore,
    grade,
  };
}
