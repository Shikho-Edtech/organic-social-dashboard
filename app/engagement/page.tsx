import { getPosts, getRunStatus, getVideoMetrics } from "@/lib/sheets";
import {
  filterPosts,
  groupStats,
  isLowConfidence,
  discussionQuality,
  sentimentPolarity,
  virality,
  saveRate,
  formatHourMatrix,
  reach as postReach,
} from "@/lib/aggregate";
import type { FormatHourMetric } from "@/lib/aggregate";
import Link from "next/link";
import { minPostsForRange, reliabilityLabel } from "@/lib/stats";
import { resolveRange, rangeDays as computeRangeDays } from "@/lib/daterange";
import { canonicalColor } from "@/lib/colors";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import BarChartBase from "@/components/BarChart";
import type { GroupStatRow } from "@/lib/aggregate";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Day 2U: unify everything on reach-weighted engagement rate.
//
// Before this change the bar charts showed `avg_engagement_rate`
// (Σinteractions / Σreach) but the "Best X" KPI strip ranked by
// `er_summary` (mean of per-post rates, CI-lower-bounded). Two different
// statistics on the same page meant the crowned "Best Format" could
// disagree with the tallest bar. Now both use reach-weighted, and the
// min-n floor is adaptive (3/5/10/… via minPostsForRange) instead of a
// blanket n>=2 that let tiny buckets win.
function rankByReachWeighted(items: GroupStatRow[]): GroupStatRow | undefined {
  if (!items.length) return undefined;
  return [...items].sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate)[0];
}

// ─── Format × Hour box-level metric selector (Sprint P7 Phase 1.4) ──────
// Shared helpers + the pill component that switches the heatmap metric.
// Server-rendered: pills are <Link>s that change ?fhMetric=... and the page
// re-renders with the new metric. URL-persistent so deep links / refresh
// preserve selection. Preview of the page-level multi-metric selector
// landing in Phase 3.

const FH_METRIC_OPTIONS: { id: FormatHourMetric; label: string }[] = [
  { id: "reach",        label: "Total reach" },
  { id: "interactions", label: "Interactions" },
  { id: "engagement",   label: "Engagement rate" },
  { id: "shares",       label: "Shares" },
];

const FH_METRIC_TITLES: Record<FormatHourMetric, string> = {
  reach: "Reach",
  interactions: "Interactions",
  engagement: "Engagement rate",
  shares: "Shares",
};

const FH_METRIC_SUBTITLES: Record<FormatHourMetric, string> = {
  reach: "Mean unique reach per post",
  interactions: "Mean total interactions per post (reactions + comments + shares)",
  engagement: "Mean engagement rate per post (interactions ÷ reach × 100)",
  shares: "Mean shares per post",
};

const FH_METRIC_DEFINITIONS: Record<FormatHourMetric, string> = {
  reach: "mean unique reach per post published in that cell",
  interactions: "mean (reactions + comments + shares) per post in that cell",
  engagement: "mean engagement rate per post in that cell, where engagement rate = interactions ÷ reach × 100",
  shares: "mean shares per post in that cell",
};

const FH_METRIC_NOUNS: Record<FormatHourMetric, string> = {
  reach: "reach",
  interactions: "interactions",
  engagement: "engagement rate",
  shares: "shares",
};

function formatFhValue(value: number, metric: FormatHourMetric): string {
  if (metric === "engagement") return `${value.toFixed(2)}%`;
  return Math.round(value).toLocaleString();
}

// Build the URL for a metric pill by overlaying the new fhMetric on the
// current searchParams. Preserves all other params (range, etc).
function buildFhMetricUrl(
  searchParams: Record<string, string | string[] | undefined>,
  metric: FormatHourMetric,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "fhMetric") continue;
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length) params.set(k, v[0]);
  }
  if (metric !== "reach") params.set("fhMetric", metric);
  const qs = params.toString();
  return qs ? `/engagement?${qs}` : "/engagement";
}

function FormatHourMetricPills({
  active,
  searchParams,
}: {
  active: FormatHourMetric;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        Rank by:
      </span>
      {FH_METRIC_OPTIONS.map((opt) => {
        const isActive = opt.id === active;
        return (
          <Link
            key={opt.id}
            href={buildFhMetricUrl(searchParams, opt.id)}
            scroll={false}
            aria-pressed={isActive}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
              isActive
                ? "bg-brand-shikho-indigo text-white border-brand-shikho-indigo"
                : "bg-ink-paper text-ink-secondary border-ink-100 hover:border-brand-shikho-indigo hover:text-brand-shikho-indigo"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function EngagementPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);

  // Sprint P7 Phase 1.4 (2026-04-28): box-level metric selector for the
  // Format × Hour heatmap. URL param `?fhMetric=reach|interactions|
  // engagement|shares` rewires the matrix's underlying value. This is a
  // preview of the Phase 3 page-level multi-metric selector; the
  // Format × Hour box was singled out per spec because the other charts
  // on /engagement are AI-classifier-driven and don't slice cleanly by
  // alternate metrics. Default = reach (today's behavior).
  const fhMetricParam = typeof searchParams?.fhMetric === "string"
    ? searchParams.fhMetric
    : "";
  const fhMetric: FormatHourMetric =
    fhMetricParam === "interactions" || fhMetricParam === "engagement" || fhMetricParam === "shares"
      ? fhMetricParam
      : "reach";
  const [posts, runStatus, videos] = await Promise.all([
    getPosts(),
    getRunStatus(),
    getVideoMetrics(),
  ]);
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Centralized via lib/daterange — prior inline `daysBetween(...) + 1` pushed
  // the 30-day selection into the 60-day threshold (15 posts instead of 10),
  // so pillar/hook/spotlight charts looked empty on a perfectly reasonable
  // window. The single helper keeps Engagement, Strategy, Timing on the same
  // interpretation of "Last 30 days".
  const MIN_N = minPostsForRange(computeRangeDays(range));

  // Stage 2 / item 18 (Apr 2026): hard-filter low-confidence classifications
  // out of classifier-derived rankings (pillar / tone / hook / spotlight).
  // `isLowConfidence(p)` returns true when classifier_confidence < 0.5 (the
  // `_low_confidence` flag the pipeline writes). Format is NOT classifier-
  // derived — it comes from Raw_Posts.Type — so we leave the full `inRange`
  // set for that ranking.
  const inRangeConfident = inRange.filter((p) => !isLowConfidence(p));

  // Funnel stage distribution + engagement (moved from /strategy in Sprint P6
  // per user feedback — volume/rate bars belong with the other Engagement
  // breakdowns, not above the AI weekly verdict). Same canonical colours as
  // Plan's funnel pills: TOFU cyan, MOFU indigo, BOFU coral.
  const rangeDaysForFunnel = computeRangeDays(range);
  const MIN_N_FUNNEL = minPostsForRange(rangeDaysForFunnel);
  const funnelStats = groupStats(inRange, "funnel_stage");
  const funnelOrder = ["TOFU", "MOFU", "BOFU"];
  const funnelDist = funnelOrder.map((stage) => {
    const s = funnelStats.find((x) => x.key === stage);
    return { label: stage, value: s?.count || 0, color: canonicalColor("funnel", stage) };
  });
  const funnelEng = funnelOrder.map((stage) => {
    const s = funnelStats.find((x) => x.key === stage);
    const eligible = s && s.count >= MIN_N_FUNNEL;
    return {
      label: stage,
      value: eligible ? Number(s.avg_engagement_rate.toFixed(2)) : 0,
      color: canonicalColor("funnel", stage),
    };
  });

  // Format × engagement rate. Each bar carries its canonical category
  // colour so "Reel" on this chart matches "Reel" on Plan's calendar pill
  // and the "Best Format" card above.
  const formatStats = groupStats(inRange, "format").filter((s) => s.count >= MIN_N);
  const formatER = formatStats.map((s) => ({
    label: s.key,
    value: Number(s.avg_engagement_rate.toFixed(2)),
    color: canonicalColor("format", s.key),
  }));
  // Sprint P7 v4.7 (2026-04-30, P2.25): Shares per Post is more
  // outlier-sensitive than Engagement Rate (one viral carousel can
  // produce "Carousel = 40 shares/post" with n=2). Bump the min-n to
  // 5 specifically for this chart so a single viral post in a low-n
  // format doesn't crown that format. Other charts keep MIN_N=2.
  const SHARES_MIN_N = 5;
  const formatShares = formatStats
    .filter((s) => s.count >= SHARES_MIN_N)
    .map((s) => ({
      label: s.key,
      value: Math.round(inRange.filter((p) => p.format === s.key).reduce((sum, p) => sum + (p.shares || 0), 0) / s.count),
      color: canonicalColor("format", s.key),
    }));

  // Pillar × engagement rate (top 12 for readability). Per-row colour from
  // canonicalColor("pillar", ...) means the same pillar keeps the same
  // colour across Overview → Engagement → Strategy.
  const pillarStats = groupStats(inRangeConfident, "content_pillar").filter((s) => s.count >= MIN_N).slice(0, 12);
  const pillarER = pillarStats.map((s) => ({
    label: s.key,
    value: Number(s.avg_engagement_rate.toFixed(2)),
    color: canonicalColor("pillar", s.key),
  }));

  // Hook type effectiveness
  // Sprint P7 v4.6 (2026-04-30, P0 finding #1): exclude classifier "None"
  // and "Unknown" buckets from Best Hook + Recommendation cards. The
  // taxonomy uses "None" to mean "no clear hook detected"; surfacing it
  // as the recommended hook is anti-actionable ("use no hook"). Same
  // pattern as spotlightStats above.
  const hookStats = groupStats(inRangeConfident, "hook_type")
    .filter((s) => s.count >= MIN_N && s.key && s.key !== "None" && s.key !== "Unknown")
    .slice(0, 10);
  const hookER = hookStats.map((s) => ({
    label: s.key,
    value: Number(s.avg_engagement_rate.toFixed(2)),
    color: canonicalColor("hook", s.key),
  }));

  // Stage-0 item 10 (Apr 2026): caption_tone bucket. Mirrors the classifier's
  // 7-tone vocabulary (Educational / Motivational / Promotional / Entertaining
  // / Informational / Celebratory / Urgent-FOMO). Same MIN_N gate + canonical
  // palette as the other dimensions — so "Educational" renders in the same
  // indigo wherever it appears across pages.
  // Sprint P7 v4.6: same defensive None-exclusion as hookStats.
  const toneStats = groupStats(inRangeConfident, "caption_tone")
    .filter((s) => s.count >= MIN_N && s.key && s.key !== "None" && s.key !== "Unknown");
  const toneER = toneStats.map((s) => ({
    label: s.key,
    value: Number(s.avg_engagement_rate.toFixed(2)),
    color: canonicalColor("tone", s.key),
  }));

  // Spotlight type effectiveness (v2 classifier)
  const spotlightStats = groupStats(inRangeConfident, "spotlight_type")
    .filter((s) => s.count >= MIN_N && s.key && s.key !== "None" && s.key !== "Unknown");
  const spotlightER = spotlightStats.map((s) => ({
    label: s.key,
    value: Number(s.avg_engagement_rate.toFixed(2)),
    color: canonicalColor("spotlight", s.key),
  }));
  const spotlightReach = spotlightStats.map((s) => ({
    label: s.key,
    value: s.avg_reach_per_post,
    color: canonicalColor("spotlight", s.key),
  }));

  // Day 2U: "Best X" now ranks by the SAME reach-weighted rate the chart
  // shows. Protection against single-post outliers comes from the
  // adaptive min-n gate (MIN_N) applied above, which also hides those
  // buckets from the chart — so the KPI winner is always a visible bar.
  const bestFormat = rankByReachWeighted(formatStats);
  const bestPillar = rankByReachWeighted(pillarStats);
  const bestHook = rankByReachWeighted(hookStats);
  const bestSpotlight = rankByReachWeighted(spotlightStats);
  const bestTone = rankByReachWeighted(toneStats);

  // Engagement breakdown (overall). Sorted descending so the biggest
  // interaction type lands at the top of the horizontal bar chart —
  // Cleveland & McGill: position on a common scale outranks angle (pie/
  // donut) for magnitude comparison, especially with 6 categories where
  // slice sizes at the tail become hard to rank by eye.
  const totals = inRange.reduce(
    (acc, p) => {
      acc.like += p.like || 0;
      acc.love += p.love || 0;
      acc.wow += p.wow || 0;
      acc.haha += p.haha || 0;
      acc.comments += p.comments || 0;
      acc.shares += p.shares || 0;
      return acc;
    },
    { like: 0, love: 0, wow: 0, haha: 0, comments: 0, shares: 0 }
  );
  // "Like" here is the Facebook Like reaction only. A prior pass labeled this
  // "Like + Care" but the ingestion layer never reads a Care column from
  // Raw_Posts (lib/sheets.ts getPosts, and the Post type has no `care` field),
  // so the sum was still just Like while the label implied Like ∪ Care was
  // being aggregated. Either the pipeline needs to start emitting a Care
  // column and the sum needs to include it, or the label stays as "Like".
  // Keeping the label honest for now; if Care volume becomes non-trivial,
  // add it upstream.
  const reactionBreakdown = [
    { label: "Like", value: totals.like },
    { label: "Love", value: totals.love },
    { label: "Wow", value: totals.wow },
    { label: "Haha", value: totals.haha },
    { label: "Comments", value: totals.comments },
    { label: "Shares", value: totals.shares },
  ].sort((a, b) => b.value - a.value);

  // ─── Bucket E derived-metrics roll-up ───────────────────────────
  //
  // Each of these is a ratio that's been computed per-post in lib/aggregate,
  // then rolled up to the period level via Σ numerator ÷ Σ denominator
  // (NOT mean-of-ratios — that's the "simpson's paradox on small-reach
  // posts" trap the codebase already guards against in computeKpis).

  // Sprint P7 Phase 1 (2026-04-28): the four secondary tiles (Virality,
  // Discussion Quality, Sentiment Polarity, Save Rate) were dropped per
  // brand-team review — they cluttered the strip without driving decisions
  // and Save Rate was permanently "pending" since the pipeline never
  // ingested Saves. The numerator/denominator sums + ratio computations
  // they used were removed alongside the JSX. If Saves ever ships from
  // Meta, the pattern lives in git history (commit before this one) and
  // can be revived as a single new tile next to the Best-X strip rather
  // than its own row.

  // Item 38 — format × hour-of-day reach matrix. Flatten into cells the
  // small Heatmap grid component can render; apply a minimum-n filter to
  // dim cells that are a single post so a 1-post outlier doesn't paint
  // the grid.
  const fhMatrix = formatHourMatrix(inRange, fhMetric);
  const matrixFormats = Object.keys(fhMatrix)
    .filter((f) => f && f !== "Unknown")
    // Cap to the 6 most-posted formats so the grid stays legible at 360px.
    .sort((a, b) => {
      const na = Object.values(fhMatrix[a]).reduce((s, c) => s + c.n, 0);
      const nb = Object.values(fhMatrix[b]).reduce((s, c) => s + c.n, 0);
      return nb - na;
    })
    .slice(0, 6);
  const MATRIX_MIN_N = 2;
  // Compute the max mean across reliable cells so the heat intensity
  // normalizes on only the cells we'd actually recommend acting on.
  let matrixMax = 0;
  for (const f of matrixFormats) {
    for (const h of Object.keys(fhMatrix[f])) {
      const c = fhMatrix[f][Number(h)];
      if (c.n >= MATRIX_MIN_N && c.mean > matrixMax) matrixMax = c.mean;
    }
  }

  return (
    <div>
      <PageHeader title="Engagement" subtitle="What drives interaction" dateLabel={range.label} lastScrapedAt={runStatus.last_run_at} compact />

      {/* "Best X" strip — reach-weighted, with category-semantic colour on
          the winning value. A Reel winner reads pink (same as Plan's reel
          pill); a Teacher spotlight winner reads violet; a pillar winner
          hashes to a stable colour that persists across renders. The
          colour is inline `style` because Tailwind can't compile a
          dynamic `text-[#hex]`. */}
      {/* Best X strip. Prior pass rendered "0.00% engagement rate" under a "—"
          label when nothing cleared the MIN_N gate — a fake rate on a fake
          winner. Now: if no bucket qualifies, show a single "Not enough
          posts" line instead of a false precision number. The reliability
          label still gets a read so the user knows WHY nothing qualified
          (reads "no data" when count is zero). */}
      {/* Sprint P7 v4.7 (2026-04-30, P1.3): hero-synthesis card above the
          atomic Best-X cards. Pass 2 audit caught that 5 same-weight
          cards laid out side-by-side fail the cold-read test — a new
          user can't tell which dimension matters most or how the
          winners combine. Hero card answers "what's the winning pattern
          this period?" in one sentence; the Best-X strip below is the
          supporting evidence. */}
      {(bestFormat || bestPillar || bestHook || bestSpotlight || bestTone) && (
        <Card className="mb-4 border-l-4 border-l-brand-shikho-indigo">
          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Winning pattern this period
            </div>
            {/* Sprint P7 v4.18 (2026-05-02): explicit dimension labels.
                Pre-v4.18 the sentence read 'Video × Product/Program Promo
                × Educational tone, hooked with Announcement, spotlighting
                product.' Readers had to infer what each token represented
                — the first 'Video' is a format, the second is a pillar,
                etc. Now each value carries an inline muted label so the
                sentence answers 'what is this' without requiring schema
                memory. */}
            <div className="text-base sm:text-lg leading-snug text-ink-primary">
              {bestFormat && (
                <span>
                  <span style={{ color: canonicalColor("format", bestFormat.key) }} className="font-semibold">{bestFormat.key}</span>
                  <span className="text-[11px] text-ink-muted font-normal ml-1">(format)</span>
                </span>
              )}
              {bestPillar && (
                <>
                  <span className="text-ink-muted">{" × "}</span>
                  <span style={{ color: canonicalColor("pillar", bestPillar.key) }} className="font-semibold">{bestPillar.key}</span>
                  <span className="text-[11px] text-ink-muted font-normal ml-1">(pillar)</span>
                </>
              )}
              {bestTone && (
                <>
                  <span className="text-ink-muted">{" × "}</span>
                  <span style={{ color: canonicalColor("tone", bestTone.key) }} className="font-semibold">{bestTone.key}</span>
                  <span className="text-[11px] text-ink-muted font-normal ml-1">(caption tone)</span>
                </>
              )}
              {bestHook && (
                <>
                  <span className="text-ink-muted">{", hooked with "}</span>
                  <span style={{ color: canonicalColor("hook", bestHook.key) }} className="font-semibold">{bestHook.key}</span>
                  <span className="text-[11px] text-ink-muted font-normal ml-1">(hook)</span>
                </>
              )}
              {bestSpotlight && (
                <>
                  <span className="text-ink-muted">{", spotlighting "}</span>
                  <span style={{ color: canonicalColor("spotlight", bestSpotlight.key) }} className="font-semibold">{bestSpotlight.key.toLowerCase()}</span>
                  <span className="text-[11px] text-ink-muted font-normal ml-1">(spotlight type)</span>
                </>
              )}
              <span className="text-ink-muted">.</span>
            </div>
            <div className="text-xs text-ink-muted">
              Each dimension ranked independently by reach-weighted engagement, n≥{MIN_N}. The intersection of all five is untested — treat the synthesis as a hypothesis, not a guarantee. Per-dimension breakdowns below.
            </div>
          </div>
        </Card>
      )}

      {/* Best-X strip — compact variant. Prior pass used text-xl/2xl with
          `break-words` which let long winners ("Study Tips & Exam Prep",
          "Teacher Spotlight") wrap to 3+ lines, pushing each card to ~160px
          tall and squeezing the charts below the fold on mobile. Now:
          text-base/lg, line-clamp-2 + title attribute so the value never
          occupies more than two lines but the full label is still
          discoverable on hover/long-press. Cards now cap around ~100px. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best Format</div>
          <div
            className="text-base sm:text-lg font-bold mt-1.5 break-words leading-snug line-clamp-2"
            style={{ color: canonicalColor("format", bestFormat?.key) }}
            title={bestFormat?.key || undefined}
          >
            {bestFormat?.key || "—"}
          </div>
          {bestFormat ? (
            <>
              <div className="text-xs text-slate-500 mt-1">
                {bestFormat.avg_engagement_rate.toFixed(2)}% engagement rate
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {reliabilityLabel(bestFormat.count)}
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 mt-1">Not enough posts in range to rank ({MIN_N}+ needed per format).</div>
          )}
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best Pillar</div>
          <div
            className="text-base sm:text-lg font-bold mt-1.5 break-words leading-snug line-clamp-2"
            style={{ color: canonicalColor("pillar", bestPillar?.key) }}
            title={bestPillar?.key || undefined}
          >
            {bestPillar?.key || "—"}
          </div>
          {bestPillar ? (
            <>
              <div className="text-xs text-slate-500 mt-1">
                {bestPillar.avg_engagement_rate.toFixed(2)}% engagement rate
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {reliabilityLabel(bestPillar.count)}
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 mt-1">Not enough posts in range to rank ({MIN_N}+ needed per pillar).</div>
          )}
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best Hook</div>
          <div
            className="text-base sm:text-lg font-bold mt-1.5 break-words leading-snug line-clamp-2"
            style={{ color: canonicalColor("hook", bestHook?.key) }}
            title={bestHook?.key || undefined}
          >
            {bestHook?.key || "—"}
          </div>
          {bestHook ? (
            <>
              <div className="text-xs text-slate-500 mt-1">
                {bestHook.avg_engagement_rate.toFixed(2)}% engagement rate
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {reliabilityLabel(bestHook.count)}
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 mt-1">Not enough posts in range to rank ({MIN_N}+ needed per hook type).</div>
          )}
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best Spotlight Type</div>
          <div
            className="text-base sm:text-lg font-bold mt-1.5 break-words leading-snug line-clamp-2"
            style={{ color: canonicalColor("spotlight", bestSpotlight?.key) }}
            title={bestSpotlight?.key || undefined}
          >
            {bestSpotlight?.key || "—"}
          </div>
          {bestSpotlight ? (
            <>
              <div className="text-xs text-slate-500 mt-1">
                {bestSpotlight.avg_engagement_rate.toFixed(2)}% engagement rate
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {reliabilityLabel(bestSpotlight.count)}
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 mt-1">Not enough posts in range to rank ({MIN_N}+ needed per spotlight type).</div>
          )}
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Best Tone</div>
          <div
            className="text-base sm:text-lg font-bold mt-1.5 break-words leading-snug line-clamp-2"
            style={{ color: canonicalColor("tone", bestTone?.key) }}
            title={bestTone?.key || undefined}
          >
            {bestTone?.key || "—"}
          </div>
          {bestTone ? (
            <>
              <div className="text-xs text-ink-400 mt-1">
                {bestTone.avg_engagement_rate.toFixed(2)}% engagement rate
              </div>
              <div className="text-[11px] text-ink-400 mt-0.5">
                {reliabilityLabel(bestTone.count)}
              </div>
            </>
          ) : (
            <div className="text-xs text-ink-400 mt-1">Not enough posts in range to rank ({MIN_N}+ needed per tone).</div>
          )}
        </Card>
      </div>

      {/* Sprint P7 Phase 1 (2026-04-28): the second derived-metrics row
          (Virality / Discussion Quality / Sentiment Polarity / Save Rate)
          was removed per brand-team review. Save Rate was permanently
          "pending" since the pipeline never ingested Saves; the other three
          duplicated signal already visible in the Funnel Engagement chart
          + the Best X strip above. Keeps the page focused on decisions,
          not vanity metrics. Pattern preserved in git history (commit
          before Phase 1) for revival if Saves data ever ships from Meta. */}

      {/* Funnel distribution + engagement (moved from /strategy in Sprint P6).
          TOFU cyan = awareness, MOFU indigo = consideration, BOFU coral =
          conversion. The inline explainer below removes the need to open
          the definition tooltip to learn what the acronyms mean. */}
      <div className="grid lg:grid-cols-2 gap-4 mb-2">
        <ChartCard
          title="Funnel Distribution"
          kind="ai"
          subtitle="How posts are split across marketing stages"
          definition="TOFU (top-of-funnel): awareness / education. MOFU (middle): consideration / demo. BOFU (bottom): direct conversion asks. Funnel stage is assigned by the weekly AI classifier on each post's hook and body."
          sampleSize={`n = ${inRange.length} post${inRange.length === 1 ? "" : "s"}`}
          caption="A healthy organic mix sits around ~50% TOFU · ~30% MOFU · ~20% BOFU. Heavy BOFU tilts the feed toward selling and can stall new-audience growth."
        >
          <BarChartBase data={funnelDist} metricName="Posts" valueAxisLabel="Posts" categoryAxisLabel="Funnel stage" showPercent />
        </ChartCard>
        <ChartCard
          title="Funnel Engagement"
          kind="ai"
          subtitle="Avg engagement rate by stage"
          definition={`For each funnel stage: total interactions ÷ total reach across all posts in that stage. Reach-weighted. Stages with fewer than ${MIN_N_FUNNEL} posts in the period render as a zeroed bar so a single post can't produce a misleading spike.`}
          sampleSize={`min ${MIN_N_FUNNEL} posts per stage · ${rangeDaysForFunnel}d window`}
          caption="Which stage the audience actually engages with. If BOFU engages higher than TOFU at organic scale, the audience is already close to buying — lean harder into conversion."
        >
          <BarChartBase data={funnelEng} valueFormat="percent" metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Funnel stage" showValueLabel />
        </ChartCard>
      </div>
      <div className="mb-6 text-[12px] text-ink-muted leading-relaxed px-1">
        <span className="font-semibold text-ink-700">How funnel stages are assigned:</span>{" "}
        <span className="text-brand-cyan font-semibold">TOFU</span> (top) covers awareness and education — explainers, free lessons, thought leadership.{" "}
        <span className="text-brand-shikho-indigo font-semibold">MOFU</span> (middle) covers consideration and social proof — demos, student stories, course highlights.{" "}
        <span className="text-brand-shikho-coral font-semibold">BOFU</span> (bottom) covers direct conversion — price, discount, enrollment deadline, last-call posts.
      </div>

      {/* Item 38: format × hour-of-day reach heatmap. Small inline grid
          (not the full Heatmap component — that's 7 rows × 24 cols and
          this is 3-6 formats × 24 hours, different shape). Mean reach
          per cell; cells with fewer than MATRIX_MIN_N posts render at
          reduced opacity so a single-post bucket can't hijack the
          color scale. Uses Shikho indigo (same scale as Timing heatmap)
          for visual consistency across "when" views. */}
      {matrixFormats.length > 0 && matrixMax > 0 && (
        <div className="mb-6">
          {/* Sprint P7 Phase 1.4 box-level metric selector. Pills are
              <Link>s that change the URL query param so server-rendering
              picks up the new metric on the next request. Preview of
              the page-level multi-metric pills landing in Phase 3. */}
          <FormatHourMetricPills active={fhMetric} searchParams={searchParams} />
          <ChartCard
            title={`Format × Hour · ${FH_METRIC_TITLES[fhMetric]}`}
            kind="derived"
            subtitle={`${FH_METRIC_SUBTITLES[fhMetric]} for each (format, publish hour) cell`}
            definition={`For each (format, hour) cell: ${FH_METRIC_DEFINITIONS[fhMetric]}. Color intensity encodes the value relative to the strongest cell on the grid. Cells with fewer than ${MATRIX_MIN_N} posts are dimmed — still visible so you can see where coverage is thin, but the color isn't trustworthy. Top ${matrixFormats.length} formats shown.`}
            sampleSize={`${matrixFormats.length} format${matrixFormats.length === 1 ? "" : "s"} × 24 hours, n = ${inRange.length} post${inRange.length === 1 ? "" : "s"}`}
            caption="Reels at 8pm behave nothing like Carousels at 8pm. Find the dark cells per format, not just overall."
          >
            {/* Sprint P6: hour axis narrowed to 10..23 (BDT) per user
                feedback — Shikho's posting window is daytime/evening,
                so compressing 24→14 columns roughly doubles cell width
                at 360px without losing any realistically-populated
                cell. Labels in 24hr every 2h ("10 12 14 16 18 20 22").
                Bumped alpha floor 0.08 → 0.22 and low-n reducer 0.35 →
                0.55 so the table reads noticeably darker end-to-end —
                prior pass was so faint that the format-vs-format shape
                comparison required squinting. Cell height 20px → 22px
                for the same reason (more ink per row). */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left font-semibold text-ink-500 px-2 py-1.5 whitespace-nowrap">Format</th>
                    {Array.from({ length: 14 }, (_, i) => {
                      const h = 10 + i;
                      const showLabel = h % 2 === 0;
                      return (
                        <th
                          key={h}
                          className="text-center font-semibold text-ink-500 px-0.5 py-1.5 tabular-nums"
                          title={`${h.toString().padStart(2, "0")}:00 BDT`}
                        >
                          {showLabel ? h.toString().padStart(2, "0") : ""}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {matrixFormats.map((f) => (
                    <tr key={f}>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                          style={{ backgroundColor: canonicalColor("format", f) }}
                        >
                          {f}
                        </span>
                      </td>
                      {Array.from({ length: 14 }, (_, i) => {
                        const h = 10 + i;
                        const cell = fhMatrix[f][h];
                        const n = cell?.n ?? 0;
                        const mean = cell?.mean ?? 0;
                        const intensity = matrixMax > 0 ? Math.min(1, mean / matrixMax) : 0;
                        const isReliable = n >= MATRIX_MIN_N;
                        // Darker by default (floor 0.22) + less-aggressive dimming
                        // for low-n cells (0.55 vs 0.35) so the format-vs-format
                        // pattern reads at a glance.
                        const alpha = n === 0 ? 0 : isReliable ? intensity : intensity * 0.55;
                        const bg = n === 0
                          ? "transparent"
                          : `rgba(48, 64, 144, ${Math.max(0.22, alpha)})`;
                        return (
                          <td
                            key={h}
                            className="px-0 py-0.5 text-center"
                            title={n === 0 ? `${f} @ ${h.toString().padStart(2, "0")}:00 — no posts` : `${f} @ ${h.toString().padStart(2, "0")}:00 — mean ${FH_METRIC_NOUNS[fhMetric]} ${formatFhValue(mean, fhMetric)} over ${n} post${n === 1 ? "" : "s"}${isReliable ? "" : " (low-n, dimmed)"}`}
                          >
                            <div
                              className="mx-0.5 h-[22px] rounded-xs"
                              style={{ backgroundColor: bg, border: n === 0 ? "1px dashed #E6E8F0" : "none" }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-500">
                <span>Darker = more reach</span>
                <span>·</span>
                <span>Dashed outline = no posts in that cell</span>
                <span>·</span>
                {/* Sprint P7 v4.6 (2026-04-30): MIN_N=2 means faded = exactly
                    n=1, not "fewer than 2." Wording was off. */}
                <span>Faded fill = {MATRIX_MIN_N === 2 ? "1 post" : `fewer than ${MATRIX_MIN_N} posts`} (low confidence)</span>
                <span>·</span>
                <span>BDT 10:00–24:00</span>
              </div>
            </div>
          </ChartCard>
        </div>
      )}

      {/* Recommendations — synthesizes the 4 Best X signals above into
          2-3 sentences a human can act on. Prior layout assumed the
          reader would eyeball the four cards and mentally compose the
          recommendation; in practice the cards were treated as
          standalone trivia. Putting the synthesis directly under them
          closes the loop from "here are the winners" to "so do this". */}
      {/* Recommended this period — redesigned as a grid of distinct
          playbook cards (one per axis: lead, open, spotlight, tone).
          Each card uses the axis's canonical colour for its rail + icon
          so the eye lands on the recommendation type first, then the
          winning value. Prior pass rendered these as a bulleted <ul>
          where every bullet looked identical — users skimmed past the
          section treating it as generic body copy. */}
      {(bestFormat || bestPillar || bestHook || bestSpotlight || bestTone) && (
        <section className="mb-6">
          <div className="flex items-baseline gap-2 mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-shikho-indigo">
              Recommended this period
            </div>
            <div className="text-[11px] text-ink-muted">
              Synthesised from the winning buckets above · treat as a test, not a guarantee
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bestFormat && bestPillar && (
              <div
                className="relative rounded-xl bg-ink-paper border border-ink-100 p-4 overflow-hidden"
                style={{ borderLeftWidth: 4, borderLeftColor: canonicalColor("format", bestFormat.key) }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md text-white"
                    style={{ backgroundColor: canonicalColor("format", bestFormat.key) }}
                    aria-hidden="true"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                  </span>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Lead format × pillar</div>
                </div>
                <div className="text-[15px] font-semibold text-ink-900 leading-snug">
                  <span style={{ color: canonicalColor("format", bestFormat.key) }}>{bestFormat.key}</span>
                  <span className="text-ink-400 mx-1.5">·</span>
                  <span style={{ color: canonicalColor("pillar", bestPillar.key) }}>{bestPillar.key}</span>
                </div>
                <div className="text-[12px] text-ink-muted mt-1.5 leading-relaxed">
                  {bestFormat.key} averages <span className="font-semibold text-ink-700">{bestFormat.avg_engagement_rate.toFixed(2)}%</span> engagement rate
                  ({bestFormat.count} post{bestFormat.count === 1 ? "" : "s"}) · {bestPillar.key} averages <span className="font-semibold text-ink-700">{bestPillar.avg_engagement_rate.toFixed(2)}%</span>
                  ({bestPillar.count} post{bestPillar.count === 1 ? "" : "s"}). The intersection is untested — treat it as a hypothesis.
                </div>
              </div>
            )}
            {bestHook && (
              <div
                className="relative rounded-xl bg-ink-paper border border-ink-100 p-4 overflow-hidden"
                style={{ borderLeftWidth: 4, borderLeftColor: canonicalColor("hook", bestHook.key) }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md text-white"
                    style={{ backgroundColor: canonicalColor("hook", bestHook.key) }}
                    aria-hidden="true"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </span>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Opening hook</div>
                </div>
                <div className="text-[15px] font-semibold leading-snug" style={{ color: canonicalColor("hook", bestHook.key) }}>
                  {bestHook.key}
                </div>
                <div className="text-[12px] text-ink-muted mt-1.5 leading-relaxed">
                  <span className="font-semibold text-ink-700">{bestHook.avg_engagement_rate.toFixed(2)}%</span> engagement rate across {bestHook.count} post{bestHook.count === 1 ? "" : "s"}. Try this hook on the other pillars to see whether the opening or the topic is doing the work.
                </div>
              </div>
            )}
            {bestSpotlight && (
              <div
                className="relative rounded-xl bg-ink-paper border border-ink-100 p-4 overflow-hidden"
                style={{ borderLeftWidth: 4, borderLeftColor: canonicalColor("spotlight", bestSpotlight.key) }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md text-white"
                    style={{ backgroundColor: canonicalColor("spotlight", bestSpotlight.key) }}
                    aria-hidden="true"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4"></circle>
                      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
                    </svg>
                  </span>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Feature spotlight</div>
                </div>
                <div className="text-[15px] font-semibold leading-snug" style={{ color: canonicalColor("spotlight", bestSpotlight.key) }}>
                  {bestSpotlight.key}
                </div>
                <div className="text-[12px] text-ink-muted mt-1.5 leading-relaxed">
                  Highest reach-weighted engagement among spotlight categories — <span className="font-semibold text-ink-700">{bestSpotlight.avg_engagement_rate.toFixed(2)}%</span> across {bestSpotlight.count} post{bestSpotlight.count === 1 ? "" : "s"}.
                </div>
              </div>
            )}
            {bestTone && (
              <div
                className="relative rounded-xl bg-ink-paper border border-ink-100 p-4 overflow-hidden"
                style={{ borderLeftWidth: 4, borderLeftColor: canonicalColor("tone", bestTone.key) }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-md text-white"
                    style={{ backgroundColor: canonicalColor("tone", bestTone.key) }}
                    aria-hidden="true"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </span>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Caption tone</div>
                </div>
                <div className="text-[15px] font-semibold leading-snug" style={{ color: canonicalColor("tone", bestTone.key) }}>
                  {bestTone.key}
                </div>
                <div className="text-[12px] text-ink-muted mt-1.5 leading-relaxed">
                  <span className="font-semibold text-ink-700">{bestTone.avg_engagement_rate.toFixed(2)}%</span> engagement rate across {bestTone.count} post{bestTone.count === 1 ? "" : "s"}. Tone is the caption's overall register (Educational vs Urgent / FOMO) — independent of the hook.
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Format Performance"
          kind="ai"
          subtitle="Avg engagement rate by format"
          definition={`Engagement rate = total interactions (reactions + comments + shares) ÷ total unique reach across posts in that format — reach-weighted so viral outliers don't dominate. Formats with fewer than ${MIN_N} posts are hidden.`}
          sampleSize={`n = ${inRange.length} post${inRange.length === 1 ? "" : "s"}`}
          caption="Higher is better. A format that consistently beats the average is worth doubling down on."
        >
          <BarChartBase data={formatER} valueFormat="percent" metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Format" />
        </ChartCard>
        <ChartCard
          title="Shares per Post"
          kind="ai"
          subtitle="Avg shares by format"
          definition="Total shares in period ÷ number of posts in that format. Shares expand reach beyond the existing follower base — the strongest virality signal."
          caption="A format averaging high shares is pulling in new audience, not just engaging the existing one."
        >
          <BarChartBase data={formatShares} metricName="Avg shares" valueAxisLabel="Avg shares / post" categoryAxisLabel="Format" />
        </ChartCard>
      </div>

      <div className="mb-6">
        <ChartCard
          title="Pillar Performance"
          kind="ai"
          subtitle="Avg engagement rate by content pillar"
          definition={`Reach-weighted engagement rate per pillar (Σ interactions ÷ Σ reach). Only pillars with ${MIN_N}+ posts in the period are shown, so a single outlier can't win.`}
          sampleSize={`${pillarStats.length} pillar${pillarStats.length === 1 ? "" : "s"} shown (${MIN_N}+ posts)`}
          caption="Identify which content themes resonate most with the audience. Use alongside the Strategy tab's top-performer list."
        >
          <BarChartBase data={pillarER} horizontal height={Math.max(240, pillarER.length * 32)} valueFormat="percent" metricName="Engagement rate" valueAxisLabel="Engagement rate" />
        </ChartCard>
      </div>

      {spotlightStats.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <ChartCard
            title="Spotlight Performance — Engagement"
            kind="ai"
            subtitle="Avg engagement rate by spotlight type"
            definition={`Posts grouped by what they spotlight: Teacher, Product, Program, or Campaign. Reach-weighted engagement rate. Only types with ${MIN_N}+ posts shown. Assigned by the v2.2 classifier.`}
            sampleSize={(() => {
              const nTypes = spotlightStats.length;
              const nPosts = spotlightStats.reduce((s, x) => s + x.count, 0);
              return `${nTypes} spotlight type${nTypes === 1 ? "" : "s"}, n = ${nPosts} post${nPosts === 1 ? "" : "s"}`;
            })()}
            caption="Which spotlight category the audience engages with most. If Teacher posts outperform Product posts, lean into the faculty."
          >
            <BarChartBase data={spotlightER} horizontal height={Math.max(180, spotlightER.length * 36)} valueFormat="percent" metricName="Engagement rate" valueAxisLabel="Engagement rate" />
          </ChartCard>
          <ChartCard
            title="Spotlight Performance — Reach"
            kind="ai"
            subtitle="Avg reach per post by spotlight type"
            definition="Average unique reach per post for each spotlight type. Pairs with the engagement-rate view to surface the full picture: a type can have high engagement on small reach, or vice versa."
            caption="High reach + high engagement means the spotlight type is working on both axes."
          >
            <BarChartBase data={spotlightReach} horizontal height={Math.max(180, spotlightReach.length * 36)} metricName="Avg reach" valueAxisLabel="Avg reach / post" />
          </ChartCard>
        </div>
      )}

      {toneStats.length > 0 && (
        <div className="mb-6">
          <ChartCard
            title="Caption Tone Effectiveness"
            kind="ai"
            subtitle="Avg engagement rate by caption tone"
            definition={`Posts grouped by classified caption tone (Educational, Motivational, Promotional, Entertaining, Informational, Celebratory, Urgent / FOMO). Reach-weighted engagement rate. Only tones with ${MIN_N}+ posts are shown. Tone is assigned by the weekly pipeline from the full caption text — not just the hook.`}
            sampleSize={`${toneStats.length} tone${toneStats.length === 1 ? "" : "s"} shown (${MIN_N}+ posts)`}
            caption="Tone and hook answer different questions: tone is the caption's overall register, hook is only the opening line. A winning tone on a losing hook (or vice versa) is worth A/B testing — keep the tone, vary the hook."
          >
            <BarChartBase data={toneER} horizontal height={Math.max(200, toneER.length * 36)} valueFormat="percent" metricName="Engagement rate" valueAxisLabel="Engagement rate" />
          </ChartCard>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Hook Type Effectiveness"
          kind="ai"
          subtitle="Avg engagement rate by opening hook"
          definition={`Posts grouped by classified hook type (Question, Stat, Celebration, etc.). Reach-weighted engagement rate. Only hook types with ${MIN_N}+ posts are shown. Hook type is assigned by the weekly pipeline from the post's opening line.`}
          sampleSize={`${hookStats.length} hook type${hookStats.length === 1 ? "" : "s"} shown`}
          caption="If one hook dominates, try testing the same content with a different opening to see if it's the hook or the topic."
        >
          <BarChartBase data={hookER} horizontal height={Math.max(220, hookER.length * 32)} valueFormat="percent" metricName="Engagement rate" valueAxisLabel="Engagement rate" />
        </ChartCard>
        <ChartCard
          title="Engagement Breakdown"
          kind="observed"
          subtitle="Volume by interaction type"
          definition="Total count of each reaction / comment / share across all posts in the period. Bars are sorted by volume so the dominant interaction type is always on top — with 6 categories, ranking is easier on a common-axis bar chart than a pie/donut where slice-size discrimination breaks down past 4 categories."
          sampleSize={`n = ${inRange.length} post${inRange.length === 1 ? "" : "s"}`}
          caption="High comment share suggests active community dialogue; high share ratio suggests virality potential."
        >
          <BarChartBase
            data={reactionBreakdown}
            horizontal
            height={Math.max(220, reactionBreakdown.length * 36)}
            colorByIndex
            metricName="Interactions"
            valueAxisLabel="Count"
            showPercent
          />
        </ChartCard>
      </div>
    </div>
  );
}
