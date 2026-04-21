// Google Sheets reader using the existing service account credentials
import { google } from "googleapis";
import type { Post, DailyMetric, VideoMetric, Diagnosis, CalendarSlot } from "./types";
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
  // ISO timestamps of the most recent SUCCESSFUL diagnosis / calendar writes,
  // carried forward across runs by the pipeline. "" when never succeeded.
  last_successful_diagnosis_at: string;
  last_successful_calendar_at: string;
}

const EMPTY_RUN_STATUS: RunStatus = {
  last_run_at: "",
  classify_status: "unknown",
  diagnosis_status: "unknown",
  calendar_status: "unknown",
  last_successful_diagnosis_at: "",
  last_successful_calendar_at: "",
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
    last_successful_diagnosis_at: last["Last Successful Diagnosis At"] || "",
    last_successful_calendar_at: last["Last Successful Calendar At"] || "",
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
  artifact: "diagnosis" | "calendar",
  run: RunStatus,
  opts: { warnDays?: number; critDays?: number; now?: Date } = {}
): StalenessInfo {
  const warnDays = opts.warnDays ?? 7;
  const critDays = opts.critDays ?? 14;
  const now = opts.now ?? new Date();
  const lastSuccessful =
    artifact === "diagnosis"
      ? run.last_successful_diagnosis_at
      : run.last_successful_calendar_at;
  const status =
    artifact === "diagnosis" ? run.diagnosis_status : run.calendar_status;
  const days = daysBetween(lastSuccessful, now);

  // No successful run ever — blank state. Crit so the page shows the banner
  // and the user understands why the tab looks empty.
  if (!lastSuccessful || days < 0) {
    return {
      severity: "crit",
      days_since: -1,
      reason:
        artifact === "diagnosis"
          ? "No successful Strategy refresh has been recorded yet. Run the weekly pipeline to populate this view."
          : "No successful Plan refresh has been recorded yet. Run the weekly pipeline to populate this view.",
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

export async function getStageEngine(stage: "diagnosis" | "calendar"): Promise<StageEngine> {
  const rows = await readTab("Analysis_Log");
  const objects = rowsToObjects(rows);
  if (objects.length === 0) return "unknown";
  const last = objects[objects.length - 1];
  const colCandidates = stage === "diagnosis"
    ? ["Diagnosis Engine", "Diagnose Engine"]
    : ["Calendar Engine"];
  for (const col of colCandidates) {
    const raw = String(last[col] || "").toLowerCase().trim();
    if (KNOWN_ENGINE_VALUES.has(raw)) return raw as StageEngine;
  }
  const status = stage === "diagnosis" ? last["Diagnosis Status"] : last["Calendar Status"];
  if (String(status || "").toLowerCase().trim() === "skipped") return "off";
  return "unknown";
}
