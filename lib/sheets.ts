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
} from "./types";
import { canonicalizeEntity } from "./entities";

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

export async function getPosts(): Promise<Post[]> {
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
    };
  });
}

// ─── Page daily metrics ───

export async function getDailyMetrics(): Promise<DailyMetric[]> {
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
  if (!weekEnding) return null;
  const rows = await readTab("Weekly_Analysis");
  const objects = rowsToObjects(rows);
  const match = objects.find((r) => String(r["Week Ending"] || "").trim() === weekEnding.trim());
  return match ? diagnosisFromRow(match) : null;
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
    last_successful_diagnosis_at: last["Last Successful Diagnosis At"] || "",
    last_successful_calendar_at: last["Last Successful Calendar At"] || "",
    last_successful_priors_at: last["Last Successful Priors At"] || "",
    last_successful_strategy_at: last["Last Successful Strategy At"] || "",
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
  const rows = await readTab("Content_Calendar");
  return calendarFromRows(rowsToObjects(rows));
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
  const now = opts.now ?? new Date();
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
export async function getCostSummary(): Promise<CostSummary> {
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
}

function planNarrativeFromRow(r: Record<string, any>): PlanNarrative {
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
  };
}

export async function getPlanNarrative(
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
