// Google Sheets reader using the existing service account credentials
import { google } from "googleapis";
import type { Post, DailyMetric, VideoMetric, Diagnosis, CalendarSlot } from "./types";

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
    return {
      id: r["Post ID"],
      created_time: r["Created Time"],
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
      content_pillar: c["Content Pillar"] || "",
      funnel_stage: c["Funnel Stage"] || "",
      caption_tone: c["Caption Tone"] || "",
      format: c["Format"] || r["Type"] || "",
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
      spotlight_name: c["Spotlight Name"] || "",
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

// ─── Weekly diagnosis (latest) ───

export async function getLatestDiagnosis(): Promise<Diagnosis | null> {
  const rows = await readTab("Weekly_Analysis");
  const objects = rowsToObjects(rows);
  if (objects.length === 0) return null;
  const last = objects[objects.length - 1];
  try {
    const full = last["Full Diagnosis (JSON)"]
      ? JSON.parse(last["Full Diagnosis (JSON)"])
      : {};
    return {
      week_ending: last["Week Ending"] || "",
      headline: last["Headline"] || full.headline || "",
      posts_this_week: toNumber(last["Posts This Week"]),
      avg_engagement: toNumber(last["Avg Engagement"]),
      what_happened: full.what_happened || [],
      top_performers: full.top_performers || [],
      underperformers: full.underperformers || [],
      exam_alert: full.exam_calendar_alert || last["Exam Alert"] || "",
      watch_outs: full.watch_outs || [],
      reel_intelligence: full.reel_intelligence || {},
      full_diagnosis: full,
    };
  } catch {
    return {
      week_ending: last["Week Ending"] || "",
      headline: last["Headline"] || "",
      posts_this_week: toNumber(last["Posts This Week"]),
      avg_engagement: toNumber(last["Avg Engagement"]),
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

// ─── Content calendar ───

export async function getCalendar(): Promise<CalendarSlot[]> {
  const rows = await readTab("Content_Calendar");
  return rowsToObjects(rows).map((r) => ({
    day: r["Day"],
    date: r["Date"],
    time_bdt: r["Time (BDT)"] || r["Time"],
    format: r["Format"],
    pillar: r["Pillar"],
    featured_entity: r["Featured Entity"] || "None",
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
