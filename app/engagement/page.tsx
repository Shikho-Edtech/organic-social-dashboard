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
import EngagementDimensionView, {
  type DimensionConfig,
  type DimensionId,
} from "@/components/EngagementDimensionView";

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

  // R2 implementation (2026-05-02): feature-flagged consolidated layout.
  // ?layout=r2 swaps the 5 stacked per-dimension bar charts for a single
  // chart with a dimension switcher (operator picks Format / Pillar /
  // Hook / Spotlight / Tone — only one renders at a time). Default
  // layout = "default" (the 5-chart stack) until QA + operator A/B
  // approve cutover. Flag is URL-only — no cookie, no setting — so
  // exiting is just removing the param.
  const layoutParam = typeof searchParams?.layout === "string" ? searchParams.layout : "";
  const isR2Layout = layoutParam === "r2";
  const engDimParam = typeof searchParams?.eng_dim === "string" ? searchParams.eng_dim : "";
  const validDims: DimensionId[] = ["format", "pillar", "hook", "spotlight", "tone"];
  const activeEngDim: DimensionId = (validDims as string[]).includes(engDimParam)
    ? (engDimParam as DimensionId)
    : "pillar"; // default to pillar — most common entry-point question
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

      {/* R2 banner removed 2026-05-02: dimension switcher is now default,
          ?layout=r2 retired. */}

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
            {/* Natural-prose form (2026-05-02 user feedback): bracketed
                "(format)" / "(pillar)" labels read like footnotes mid-
                sentence and made the line jittery. Replaced with a flowing
                sentence that names the dimension verbally — "{format} {pillar}
                posts using a {tone} tone, opening with {hook} hooks, and
                spotlighting {spotlight}". Color-coded values still encode
                the dimension via canonical color tokens, so type identity
                is preserved without explicit labels. */}
            <div className="text-base sm:text-lg leading-snug text-ink-primary">
              {bestFormat && (
                <span style={{ color: canonicalColor("format", bestFormat.key) }} className="font-semibold">
                  {bestFormat.key}
                </span>
              )}
              {bestFormat && bestPillar && <span className="text-ink-muted"> </span>}
              {bestPillar && (
                <span style={{ color: canonicalColor("pillar", bestPillar.key) }} className="font-semibold">
                  {bestPillar.key}
                </span>
              )}
              {(bestFormat || bestPillar) && <span className="text-ink-muted"> posts</span>}
              {bestTone && (
                <>
                  <span className="text-ink-muted">{" using a "}</span>
                  <span style={{ color: canonicalColor("tone", bestTone.key) }} className="font-semibold">
                    {bestTone.key}
                  </span>
                  <span className="text-ink-muted"> tone</span>
                </>
              )}
              {bestHook && (
                <>
                  <span className="text-ink-muted">{", opening with "}</span>
                  <span style={{ color: canonicalColor("hook", bestHook.key) }} className="font-semibold">
                    {bestHook.key}
                  </span>
                  <span className="text-ink-muted"> hooks</span>
                </>
              )}
              {bestSpotlight && (
                <>
                  <span className="text-ink-muted">{", spotlighting "}</span>
                  <span style={{ color: canonicalColor("spotlight", bestSpotlight.key) }} className="font-semibold">
                    {bestSpotlight.key.toLowerCase()}
                  </span>
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

      {/* Best-X 5-card strip removed 2026-05-02: the dimension switcher
          below now shows the winner inline above its bar chart, so this
          strip duplicates the same information. */}

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

      {/* Format × Hour heatmap moved to /timing (2026-05-02 user feedback):
          "when to post which format" is a Timing-page question. The
          heatmap now appears as one of the dimension options on the
          Timing page's R3 dynamic heatmap (Day × Hour | Format × Hour). */}

      {/* Recommended-this-period 4-card grid removed (2026-05-02 user feedback):
          redundant with Overview's RecommendedThisPeriod card (the canonical
          synthesis) + the Winning Pattern hero above + the dimension switcher
          below. Three layers saying the same thing. Kept Winning Pattern
          (one-line synthesis sentence) and the dimension switcher (per-axis
          detail); dropped the 4-card middle layer. */}

      {/* R2 promoted to default (2026-05-02 user feedback): the dimension
          switcher IS the per-dimension view. No more legacy 7-chart stack,
          no more `?layout=r2` flag. Funnel + Winning Pattern still render
          above. Best-X strip + "Recommended this period (Engagement
          detail)" 4-card grid removed — the switcher's inline winner KPI
          is the canonical "Best X" surface, and Overview's
          RecommendedThisPeriod is the canonical synthesis. */}
      <EngagementDimensionView
        active={activeEngDim}
        totalPosts={inRange.length}
        searchParams={searchParams}
        colorFor={(axis, key) => canonicalColor(axis, key)}
        dimensions={[
          {
            id: "format",
            label: "Format",
            subtitle: "Avg engagement rate by post format",
            definition: `Engagement rate = total interactions (reactions + comments + shares) ÷ total unique reach for posts in that format — reach-weighted so viral outliers don't dominate. Formats with fewer than ${MIN_N} posts are hidden.`,
            caption: "A format that consistently beats the average is worth doubling down on.",
            noun: "format",
            series: formatER,
            winner: bestFormat ? { key: bestFormat.key, rate: bestFormat.avg_engagement_rate, count: bestFormat.count } : undefined,
            minN: MIN_N,
            horizontal: false,
          },
          {
            id: "pillar",
            label: "Pillar",
            subtitle: "Avg engagement rate by content pillar",
            definition: `Reach-weighted engagement rate per pillar. Only pillars with ${MIN_N}+ posts in the period are shown.`,
            caption: "Identify which content themes resonate most with the audience.",
            noun: "pillar",
            series: pillarER,
            winner: bestPillar ? { key: bestPillar.key, rate: bestPillar.avg_engagement_rate, count: bestPillar.count } : undefined,
            minN: MIN_N,
            horizontal: true,
          },
          {
            id: "hook",
            label: "Hook",
            subtitle: "Avg engagement rate by opening hook",
            definition: `Posts grouped by classified hook type (Question, Stat, Curiosity, etc.). Reach-weighted engagement rate. Only hook types with ${MIN_N}+ posts shown. Hook is assigned by the weekly pipeline from the post's opening line.`,
            caption: "If one hook dominates, test the same content with a different opening.",
            noun: "hook type",
            series: hookER,
            winner: bestHook ? { key: bestHook.key, rate: bestHook.avg_engagement_rate, count: bestHook.count } : undefined,
            minN: MIN_N,
            horizontal: true,
          },
          {
            id: "spotlight",
            label: "Spotlight",
            subtitle: "Avg engagement rate by spotlight type",
            definition: `Posts grouped by what they spotlight: Teacher / Product / Program / Campaign. Reach-weighted ER. Only types with ${MIN_N}+ posts shown.`,
            caption: "If Teacher posts outperform Product posts, lean into the faculty.",
            noun: "spotlight type",
            series: spotlightER,
            winner: bestSpotlight ? { key: bestSpotlight.key, rate: bestSpotlight.avg_engagement_rate, count: bestSpotlight.count } : undefined,
            minN: MIN_N,
            horizontal: true,
          },
          {
            id: "tone",
            label: "Caption Tone",
            subtitle: "Avg engagement rate by caption tone",
            definition: `Posts grouped by classified caption_tone field (Educational / Urgent / Conversational / etc.). Reach-weighted ER. Only tones with ${MIN_N}+ posts shown.`,
            caption: "Tone is the caption's overall register — independent of the hook line.",
            noun: "tone",
            series: toneER,
            winner: bestTone ? { key: bestTone.key, rate: bestTone.avg_engagement_rate, count: bestTone.count } : undefined,
            minN: MIN_N,
            horizontal: true,
          },
        ]}
      />
    </div>
  );
}
