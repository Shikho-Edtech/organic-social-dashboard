import { getPosts, getRunStatus } from "@/lib/sheets";
import { filterPosts, groupStats } from "@/lib/aggregate";
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

export default async function EngagementPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);
  const [posts, runStatus] = await Promise.all([getPosts(), getRunStatus()]);
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Centralized via lib/daterange — prior inline `daysBetween(...) + 1` pushed
  // the 30-day selection into the 60-day threshold (15 posts instead of 10),
  // so pillar/hook/spotlight charts looked empty on a perfectly reasonable
  // window. The single helper keeps Engagement, Strategy, Timing on the same
  // interpretation of "Last 30 days".
  const MIN_N = minPostsForRange(computeRangeDays(range));

  // Format × engagement rate. Each bar carries its canonical category
  // colour so "Reel" on this chart matches "Reel" on Plan's calendar pill
  // and the "Best Format" card above.
  const formatStats = groupStats(inRange, "format").filter((s) => s.count >= MIN_N);
  const formatER = formatStats.map((s) => ({
    label: s.key,
    value: Number(s.avg_engagement_rate.toFixed(2)),
    color: canonicalColor("format", s.key),
  }));
  const formatShares = formatStats.map((s) => ({
    label: s.key,
    value: Math.round(inRange.filter((p) => p.format === s.key).reduce((sum, p) => sum + (p.shares || 0), 0) / s.count),
    color: canonicalColor("format", s.key),
  }));

  // Pillar × engagement rate (top 12 for readability). Per-row colour from
  // canonicalColor("pillar", ...) means the same pillar keeps the same
  // colour across Overview → Engagement → Strategy.
  const pillarStats = groupStats(inRange, "content_pillar").filter((s) => s.count >= MIN_N).slice(0, 12);
  const pillarER = pillarStats.map((s) => ({
    label: s.key,
    value: Number(s.avg_engagement_rate.toFixed(2)),
    color: canonicalColor("pillar", s.key),
  }));

  // Hook type effectiveness
  const hookStats = groupStats(inRange, "hook_type").filter((s) => s.count >= MIN_N).slice(0, 10);
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
  const toneStats = groupStats(inRange, "caption_tone")
    .filter((s) => s.count >= MIN_N && s.key && s.key !== "Unknown");
  const toneER = toneStats.map((s) => ({
    label: s.key,
    value: Number(s.avg_engagement_rate.toFixed(2)),
    color: canonicalColor("tone", s.key),
  }));

  // Spotlight type effectiveness (v2 classifier)
  const spotlightStats = groupStats(inRange, "spotlight_type")
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

  return (
    <div>
      <PageHeader title="Engagement" subtitle="What drives interaction" dateLabel={range.label} lastScrapedAt={runStatus.last_run_at} />

      {/* "Best X" strip — reach-weighted, with category-semantic colour on
          the winning value. A Reel winner reads pink (same as Plan's reel
          pill); a Teacher spotlight winner reads violet; a pillar winner
          hashes to a stable colour that persists across renders. The
          colour is inline `style` because Tailwind can't compile a
          dynamic `text-[#hex]`. */}
      {/* Best X strip. Prior pass rendered "0.00% eng rate" under a "—"
          label when nothing cleared the MIN_N gate — a fake rate on a fake
          winner. Now: if no bucket qualifies, show a single "Not enough
          posts" line instead of a false precision number. The reliability
          label still gets a read so the user knows WHY nothing qualified
          (reads "no data" when count is zero). */}
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
                {bestFormat.avg_engagement_rate.toFixed(2)}% eng rate
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
                {bestPillar.avg_engagement_rate.toFixed(2)}% eng rate
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
                {bestHook.avg_engagement_rate.toFixed(2)}% eng rate
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
                {bestSpotlight.avg_engagement_rate.toFixed(2)}% eng rate
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
                {bestTone.avg_engagement_rate.toFixed(2)}% eng rate
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

      {/* Recommendations — synthesizes the 4 Best X signals above into
          2-3 sentences a human can act on. Prior layout assumed the
          reader would eyeball the four cards and mentally compose the
          recommendation; in practice the cards were treated as
          standalone trivia. Putting the synthesis directly under them
          closes the loop from "here are the winners" to "so do this". */}
      {(bestFormat || bestPillar || bestHook || bestSpotlight || bestTone) && (
        <Card className="!p-5 mb-6 border-l-4 border-l-brand-shikho-indigo bg-gradient-to-br from-white to-indigo-50/30">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-shikho-indigo mb-2">
            Recommended this period
          </div>
          <ul className="space-y-2 text-sm text-slate-800 leading-relaxed">
            {bestFormat && bestPillar && (
              <li>
                <span className="font-semibold">Lead with </span>
                <span className="font-semibold" style={{ color: canonicalColor("format", bestFormat.key) }}>{bestFormat.key}</span>
                <span className="font-semibold"> on </span>
                <span className="font-semibold" style={{ color: canonicalColor("pillar", bestPillar.key) }}>{bestPillar.key}</span>
                <span>
                  {" "}— {bestFormat.key} averages {bestFormat.avg_engagement_rate.toFixed(2)}% ER across {bestFormat.count} post{bestFormat.count === 1 ? "" : "s"},
                  and {bestPillar.key} averages {bestPillar.avg_engagement_rate.toFixed(2)}% across {bestPillar.count} post{bestPillar.count === 1 ? "" : "s"}.
                  The two are measured on different cuts, so the intersection is an unknown — treat it as a test, not a guarantee.
                </span>
              </li>
            )}
            {bestHook && (
              <li>
                <span>Open with a </span>
                <span className="font-semibold" style={{ color: canonicalColor("hook", bestHook.key) }}>{bestHook.key}</span>
                <span> hook — {bestHook.avg_engagement_rate.toFixed(2)}% engagement across {bestHook.count} post{bestHook.count === 1 ? "" : "s"}. Test it on the other pillars to see if the hook or the topic is carrying.</span>
              </li>
            )}
            {bestSpotlight && (
              <li>
                <span>Feature </span>
                <span className="font-semibold" style={{ color: canonicalColor("spotlight", bestSpotlight.key) }}>{bestSpotlight.key}</span>
                <span> — the spotlight category driving the highest reach-weighted engagement ({bestSpotlight.avg_engagement_rate.toFixed(2)}%).</span>
              </li>
            )}
            {bestTone && (
              <li>
                <span>Write in a </span>
                <span className="font-semibold" style={{ color: canonicalColor("tone", bestTone.key) }}>{bestTone.key}</span>
                <span> tone — {bestTone.avg_engagement_rate.toFixed(2)}% ER across {bestTone.count} post{bestTone.count === 1 ? "" : "s"}. Tone is the caption's register (Educational vs Urgent / FOMO, etc.), independent of the hook line.</span>
              </li>
            )}
          </ul>
        </Card>
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
