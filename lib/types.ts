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
