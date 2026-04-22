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
