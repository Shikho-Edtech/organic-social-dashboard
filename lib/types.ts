// Shared type definitions for the dashboard

export type Post = {
  id: string;
  created_time: string;
  type: string;
  message: string;
  reactions: number;
  comments: number;
  shares: number;
  media_views: number;
  unique_views: number;
  clicks: number;
  like: number;
  love: number;
  wow: number;
  haha: number;
  sorry: number;
  anger: number;
  is_reel: boolean;
  // Stage-0 item 12 (Apr 2026): direct link to the post on Facebook. Empty
  // string for pre-item-12 historical rows (column was added late).
  permalink_url?: string;
  // From classifications
  content_pillar?: string;
  funnel_stage?: string;
  caption_tone?: string;
  format?: string;
  language?: string;
  has_cta?: boolean;
  cta_type?: string;
  exam_relevance?: string;
  featured_entity?: string;
  hook_type?: string;
  visual_style?: string;
  primary_audience?: string;
  // v2 classifier (Day 2B schema)
  spotlight_type?: string;
  spotlight_name?: string;
  classifier_confidence?: number;
  prompt_version?: string;
  manual_override?: string;
  // Bucket C item 22 (Apr 2026): classifier v2.5 script-weighted primary
  // language verdict. Enum: "bangla" | "english" | "mixed" | "unknown".
  // Empty string on pre-v2.5 rows.
  caption_primary_language?: string;
  // Sprint P6 chunk 7 (2026-04-23, DYN-03): hook-fatigue flag + reason,
  // computed deterministically by the pipeline against Priors_HookType.
  // False / "" on pre-DYN-03 rows (annotator ran in-memory since Sprint
  // P4 but the fields were only persisted to the sheet starting now).
  hook_fatigue_flag?: boolean;
  hook_fatigue_reason?: string;
};

export type DailyMetric = {
  date: string;
  followers_total: number;
  new_follows: number;
  unfollows: number;
  media_views: number;
  unique_media_views: number;
  post_engagements: number;
  video_views: number;
  video_views_organic: number;
  video_views_paid: number;
  reactions_total: string; // JSON blob
  page_views: number;
  negative_feedback: number;
};

export type VideoMetric = {
  post_id: string;
  created_time: string;
  is_reel: boolean;
  total_views: number;
  unique_views: number;
  complete_views: number;
  avg_watch_time: number;
  sound_on_views: number;
  views_15s: number;
  views_30s: number;
  reel_plays: number;
  reel_replays: number;
  followers_gained: number;
  retention_graph: string;
};

export type Diagnosis = {
  week_ending: string;
  headline: string;
  posts_this_week: number;
  avg_engagement: number;
  what_happened: any[];
  top_performers: any[];
  underperformers: any[];
  exam_alert: string;
  watch_outs: any[];
  reel_intelligence: any;
  full_diagnosis: any;
  // Sprint P7 Phase 2 (2026-04-28): pipeline stamps an engine field on
  // every diagnosis row inside Full Diagnosis (JSON). Possible values:
  //   - "ai"               — end-of-week Monday cron, full week of data
  //   - "ai-midweek"       — Thursday mid-week cron, partial week
  //   - "native-insights"  — STR-07 fallback (AI failed validation)
  // Dashboard uses this to pick the right row when Weekly_Analysis
  // carries multiple rows for the same week_ending (e.g. mid-week +
  // end-of-week diagnoses for the same week).
  engine?: string;
  // Generated-at timestamp from the diagnosis dict, surfaces in the
  // "Preliminary, mid-week (Thu)" pill on the Diagnosis page for
  // mid-week views.
  generated_at?: string;
};

// Sprint P4 wiring (2026-04-23): per-slot native forecast stamped by
// enrich_calendar_with_forecasts. source="unavailable" is a legitimate
// cold-start outcome; low/mid/high are all 0 in that case.
export type ForecastReachCI = {
  low: number;
  mid: number;
  high: number;
  source: string;
};

// Sprint P4 wiring (2026-04-23): per-slot risk flag. Always has all
// three fields non-empty (validator rejects otherwise).
export type SlotRiskFlag = {
  category: string;
  detail: string;
  mitigation: string;
};

export type CalendarSlot = {
  day: string;
  date: string;
  time_bdt: string;
  format: string;
  pillar: string;
  featured_entity: string;      // legacy — still populated by 2E.2 back-fill
  spotlight_type?: string;      // v2 — Teacher | Product | Program | Campaign | None
  spotlight_name?: string;      // v2 — canonical entity name
  hook_line: string;
  key_message: string;
  visual_direction: string;
  cta: string;
  funnel_stage: string;
  language: string;
  audience: string;
  rationale: string;
  expected_reach: string;
  success_metric: string;
  // Sprint P4 schema v2 — the three evidence columns. All optional so
  // rows written before schema v2 (or slots where the stamping step
  // was skipped) still parse cleanly.
  hypothesis_id?: string;               // "h0" | "h1" | "h2" | ...
  forecast_reach_ci_native?: ForecastReachCI;
  risk_flags?: SlotRiskFlag[];
};

export type DateRange = { start: Date; end: Date };

// ─── Sprint N (Strategy) — STR-11 dashboard reader ───
//
// Shape of the `Strategy` + `Strategy_Log` tabs. Source-of-truth writer is
// `facebook-pipeline/src/sheets.py::_strategy_row` (17 cols after Sprint N2).
// JSON cells are parsed out at read time; see `strategyFromRow` in sheets.ts.

export type StrategyPillarWeights = Record<string, number>;
export type StrategyFormatMix = Record<string, number>; // keys: Reel | Photo | Video | Story

export interface StrategyTeacherRotationEntry {
  teacher: string;
  rationale?: string;
  cited_priors_row?: string;
}

export interface StrategyRiskEntry {
  risk: string;
  mitigation?: string;
}

export interface StrategyAbandonCriterion {
  metric?: string;
  operator?: string;
  threshold?: number | string;
  by_day?: number | string;
  action?: string;
}

export type StrategyVerdictLabel =
  | "beat_baseline"
  | "matched_baseline"
  | "missed_baseline"
  | "not_executed"
  | "insufficient_baseline";

export interface StrategyVerdictCounts {
  beat_baseline: number;
  matched_baseline: number;
  missed_baseline: number;
  not_executed: number;
  insufficient_baseline: number;
}

// STR-09 compact form persisted to the Strategy_Log sheet (the full block
// with per-pillar / per-format deltas is passed to the LLM prompt but only
// the summary lands in the cell budget).
export interface AdherenceSummaryCompact {
  graded_week: string;
  verdict_counts: StrategyVerdictCounts;
  source_engine?: string;
}

export interface StrategyEntry {
  week_ending: string;
  strategic_hypothesis: string;
  pillar_weights: StrategyPillarWeights;
  teacher_rotation: StrategyTeacherRotationEntry[];
  format_mix: StrategyFormatMix;
  risk_register: StrategyRiskEntry[];
  abandon_criteria: StrategyAbandonCriterion[];
  time_horizon_weeks: number;
  confidence: string;
  cited_priors: string[];
  previous_hypothesis_adherence: string;
  prompt_version: string;
  engine: string;            // "ai" | "native" | provider-specific
  generated_at: string;
  // Sprint N2 provenance (STR-07 / STR-08 / STR-09)
  fallback_reason: string;   // STR-07 — empty for AI-authored rows
  validation_attempts: number; // STR-08 — 1 = clean first try, >1 = recovered via feedback retry
  adherence_summary: AdherenceSummaryCompact | null; // STR-09 — null when no prior strategy to grade
}

// ─── Sprint P6 chunk 7 (OSL-04) — Outcome_Log reader ───
//
// Pipeline writer: facebook-pipeline/src/sheets.py::write_outcome_log (17 cols).
// Emitted during the weekly run for every slot in the current calendar, so a
// forward-looking calendar produces mostly `verdict="no-data"` rows until
// actuals arrive on subsequent runs. Upsert key on the pipeline side is
// "{week_ending}|{day}|{slot_index}" so re-runs update in place rather than
// duplicating.
//
// Verdict enum (from score_slot_outcome):
//   hit | exceeded | missed | no-data | unavailable | inconclusive-exam-confounded
// The first three are "graded", no-data/unavailable are pre-actuals or
// missing-forecast, exam-confounded is zero-weighted (excluded from hit rate).

export type OutcomeVerdict =
  | "hit"
  | "exceeded"
  | "missed"
  | "no-data"
  | "unavailable"
  | "inconclusive-exam-confounded"
  | "";

export interface OutcomeLogEntry {
  outcome_key: string;         // "{week}|{day}|{slot_index}" — composite
  week_ending: string;
  day: string;                 // "Monday" | "Tuesday" | ...
  date: string;                // ISO "YYYY-MM-DD" (may be empty on pre-Day-2G rows)
  slot_index: number;
  hypothesis_id: string;       // "h0" | "h1" | "h2" | ...
  pillar: string;
  format: string;
  forecast_low: number | null;
  forecast_mid: number | null;
  forecast_high: number | null;
  actual_reach: number | null;
  score: number | null;        // normalized score from score_slot_outcome
  verdict: OutcomeVerdict;
  // AMEND (exam-adjusted forecast): when the scorer applied a season prior
  // tilt to the forecast mid because the slot date was within 14 days of an
  // exam. False + null when not applied.
  exam_adjusted_used: boolean;
  exam_adjusted_mid: number | null;
  generated_at: string;
  // Sprint P7 v4.14 Tier 1 (2026-05-01): decay + drill-down fields.
  // preliminary = post < 7 days old (reach hasn't decayed; verdict shown
  // but Calibration_Log excludes it). matched_post_id enables hover-
  // preview + Facebook permalink drill-down on the Outcomes table.
  preliminary: boolean;
  matched_post_id: string;
  age_days: number | null;
  // Sprint P7 v4.14b (2026-05-02): the slot's stated target metric +
  // expected_reach_range. Lets the Outcomes table show what the slot was
  // BETTING on (e.g. "Follows > 150") alongside the deterministic
  // reach-CI scoring. Empty string for slots predating the migration.
  slot_target_metric: string;
  slot_expected_reach_range: string;
}

// Aggregated rollup across a set of outcome rows (typically one week).
// Shape mirrors compute_calendar_quality_score on the pipeline side but is
// computed client-side on the dashboard to stay usable when the pipeline
// hasn't ingested new outcomes yet.
export interface OutcomeRollup {
  week_ending: string;
  slot_count: number;
  graded_count: number;        // hit + exceeded + missed
  hit_count: number;           // hit + exceeded
  missed_count: number;
  confounded_count: number;
  no_data_count: number;
  hit_rate: number | null;     // hit_count / graded_count, null when graded=0
  mean_score: number | null;
  grade: string;               // "A" | "B" | "C" | "D" | "F" | "ungraded"
}
