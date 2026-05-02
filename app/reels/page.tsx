import { getVideoMetrics, getPosts, getRunStatus } from "@/lib/sheets";
import { bdt } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import { canonicalColor } from "@/lib/colors";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import KpiCard from "@/components/KpiCard";
import BarChartBase from "@/components/BarChart";
import TrendChart from "@/components/TrendChart";
import PostReference from "@/components/PostReference";
import MetricSelector, { parseMetricParam } from "@/components/MetricSelector";
import TopReelSwitcher from "@/components/TopReelSwitcher";
import RecentReelsList from "@/components/RecentReelsList";

/**
 * TopReelList — ranked list replacement for BarChart on top-10 reels.
 *
 * Rendered as: #rank · PostReference (clickable, hover-reveal full caption,
 * permalink-out) · proportional bar · metric value · meta.
 *
 * We had three identical BarChart renders (Plays / Watch Time / Followers)
 * that truncated Bangla captions to ~34 chars with no way to see the rest
 * and no way to open the post. Sprint P6 feedback asked for the Recent
 * Reels table's PostReference behaviour to apply here. Because Recharts
 * YAxis labels render as SVG text, there's no React popover hookable into
 * them — so we render the leaderboard as HTML instead.
 */
type TopReelRow = {
  id: string;
  caption: string;
  permalink: string;
  value: number;
  meta: string;
};
function TopReelList({
  rows,
  max,
  valueLabel,
  barColor,
  formatValue,
}: {
  rows: TopReelRow[];
  max: number;
  valueLabel: string;
  barColor: string;
  formatValue?: (v: number) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink-muted px-1 py-2">No reels matched the threshold in this range.</p>
    );
  }
  const fmt = formatValue || ((v: number) => v.toLocaleString());
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => {
        const pct = max > 0 ? Math.max(4, Math.round((r.value / max) * 100)) : 0;
        return (
          <li key={r.id} className="flex items-center gap-2.5 group">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-md bg-ink-100 text-ink-500 text-[11px] font-semibold flex items-center justify-center tabular-nums"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink-800 leading-tight">
                <PostReference caption={r.caption} permalinkUrl={r.permalink} maxChars={60} className="max-w-full" />
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div
                  className="h-1.5 rounded-full transition-[width]"
                  style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.85 }}
                  aria-hidden="true"
                />
                <span className="text-[11px] text-ink-muted whitespace-nowrap">{r.meta}</span>
              </div>
            </div>
            <span
              className="flex-shrink-0 text-sm font-semibold tabular-nums text-ink-800 whitespace-nowrap"
              title={`${fmt(r.value)} ${valueLabel}`}
            >
              {fmt(r.value)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 300;

// previewMessage() helper was removed in Sprint P6 when the three Top-10
// charts switched from BarChart to TopReelList (below) — the new list
// uses <PostReference maxChars={60}> which does its own truncation while
// still exposing the full caption on hover / tap.

function inRange(iso: string, start: Date, end: Date): boolean {
  if (!iso) return false;
  const t = bdt(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

// Parse Meta's per-second retention curve. Stored in Raw_Video as JSON like:
//   { "0": 0.988, "1": 0.992, "2": 0.989, "3": 0.82, "4": 0.65, ... }
// Each value = fraction of viewers still watching at that second.
// Returns empty object on parse failure or malformed data.
function parseRetentionCurve(raw: string): Record<number, number> {
  if (!raw || raw === "[]") return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const sec = Number(k);
      const frac = Number(v);
      if (!isNaN(sec) && !isNaN(frac)) out[sec] = frac;
    }
    return out;
  } catch {
    return {};
  }
}

// Get retention fraction at second N. Prefers the exact key, falls back to
// the nearest lower key (since Meta sometimes skips seconds for short reels).
function retentionAt(curve: Record<number, number>, sec: number): number {
  if (Object.keys(curve).length === 0) return 0;
  if (curve[sec] !== undefined) return curve[sec];
  // Walk down to nearest available second
  for (let s = sec - 1; s >= 0; s--) {
    if (curve[s] !== undefined) return curve[s];
  }
  return 0;
}

export default async function ReelsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);
  // Sprint P7 Phase 3: page-level metric selector. Reels has reel-domain
  // metrics (plays, watch time, follower-gain) that don't map cleanly
  // to the 4 page-level metrics — selector renders for cross-page URL
  // persistence. Deep wiring (e.g. switching the Top-10 ranking
  // metric) is v3.5.
  const activeMetrics = parseMetricParam(searchParams.metric);
  const [videos, posts, runStatus] = await Promise.all([getVideoMetrics(), getPosts(), getRunStatus()]);

  // Index posts by id so we can surface the caption + pillar/format next to each reel
  const postById = new Map<string, any>();
  for (const p of posts) postById.set(p.id, p);

  // Filter to reels in the selected date range
  const reelsAll = videos.filter((v) => v.is_reel);
  const reels = reelsAll.filter((v) => inRange(v.created_time, range.start, range.end));

  // KPIs
  const totalReels = reels.length;
  const totalPlays = reels.reduce((s, r) => s + (r.reel_plays || 0), 0);
  const totalReplays = reels.reduce((s, r) => s + (r.reel_replays || 0), 0);
  const totalFollowersGained = reels.reduce((s, r) => s + (r.followers_gained || 0), 0);
  const avgWatchTime = reels.length
    ? reels.reduce((s, r) => s + (r.avg_watch_time || 0), 0) / reels.length
    : 0;

  // Meta's bucket fields (Complete Views, 15s Views, 30s Views, Sound On Views)
  // are NOT populated for reels — they're only set for older video posts.
  // So we derive retention from the per-second curve that IS populated for
  // every reel. retention[N] = fraction of viewers still watching at second N.
  const retentionPoints = [2, 3, 6, 15, 30, 60] as const;
  const retentionViews: Record<number, number> = {};
  for (const sec of retentionPoints) retentionViews[sec] = 0;
  let avgWatchFromCurveNumerator = 0;
  let avgWatchFromCurveDenom = 0;
  // Day 2U: track the denominator alongside the numerator. Previously the
  // hook/15s/30s retention % divided by totalViews (ALL reels, including
  // those with empty retention curves). If half the reels predated the
  // retention pipeline, the % shown was ~halved. Now we only count reels
  // whose curves we actually parsed.
  let viewsWithCurve = 0;
  let reelsWithCurve = 0;

  // P3: parse each reel's retention curve ONCE and stash it here.
  // Previously `parseRetentionCurve(r.retention_graph)` was called in this
  // loop AND again 60× per reel in the average-curve loop below. For a page
  // with ~100 reels that's 6,100 JSON.parse calls instead of 100. Numbers
  // are small but the hot path ran on every page render (no React caching
  // because this is a Server Component). Pre-parsed once, the per-second
  // loops are now pure object lookups.
  const parsedCurves: Record<number, number>[] = reels.map((r) =>
    parseRetentionCurve(r.retention_graph)
  );

  for (let idx = 0; idx < reels.length; idx++) {
    const r = reels[idx];
    const curve = parsedCurves[idx];
    const views = r.total_views || 0;
    if (Object.keys(curve).length === 0 || views === 0) continue;
    for (const sec of retentionPoints) {
      const frac = retentionAt(curve, sec);
      retentionViews[sec] += Math.round(views * frac);
    }
    avgWatchFromCurveNumerator += views * (r.avg_watch_time || 0);
    avgWatchFromCurveDenom += views;
    viewsWithCurve += views;
    reelsWithCurve += 1;
  }

  // View-weighted average watch time is more informative than per-reel average
  // because it weights by audience size. Falls back to unweighted only when
  // no reels have curves — flagged in the sublabel below.
  const haveCurveData = avgWatchFromCurveDenom > 0;
  const weightedAvgWatch = haveCurveData
    ? avgWatchFromCurveNumerator / avgWatchFromCurveDenom
    : avgWatchTime;

  // Batch 3d (#19): the 15s/30s bucket-vs-curve reconciliation and its
  // two denominators were only used by the now-dropped secondary metric
  // strip. The Retention Funnel chart uses retentionViews[15] / [30]
  // directly from the curve, so the bucket-prefer logic is dead weight.
  // Left here as a note in case a future view wants per-bucket numbers
  // back — read the Day 2U comments above for the reconciliation rules.

  // Replacement metrics (since Meta doesn't populate Completion Rate or
  // Sound On Rate for reels):
  //   Hook Retention (3s) — viewers still watching at second 3, the critical
  //     hook window. Derived from per-second curve; denominator is viewsWithCurve
  //     so the % isn't biased downward by curve-less reels in the pool.
  //   Replay Rate — replays as a share of total plays. Tells us which reels
  //     are sticky enough to get rewatched.
  const hookRetention3s = viewsWithCurve ? (retentionViews[3] / viewsWithCurve) * 100 : 0;
  const replayRate = totalPlays ? (totalReplays / totalPlays) * 100 : 0;

  // Top-10 ranked reel lists — Sprint P6 feedback: captions on these
  // leaderboards must be clickable with the same hover-full-caption +
  // permalink-out behaviour as the Recent Reels table. Recharts YAxis
  // labels render as SVG text so they can't host a React popover; the
  // practical fix is to stop using BarChartBase for these three and
  // instead render a ranked list of (rank, PostReference, inline bar,
  // value) rows. The bar visualisation is preserved via a CSS flex
  // bar — proportional widths computed from max.
  const topByPlays = [...reels]
    .sort((a, b) => (b.reel_plays || 0) - (a.reel_plays || 0))
    .slice(0, 10)
    .map((r) => {
      const p = postById.get(r.post_id);
      return {
        id: r.post_id,
        caption: (p?.message || "").replace(/\s+/g, " ").trim(),
        permalink: p?.permalink_url || "",
        value: r.reel_plays || 0,
        meta: `${(r.avg_watch_time || 0).toFixed(1)}s avg watch`,
      };
    });
  const topByPlaysMax = topByPlays.reduce((m, r) => Math.max(m, r.value), 0);

  const topByWatchTime = [...reels]
    .filter((r) => (r.total_views || 0) >= 500)
    .sort((a, b) => (b.avg_watch_time || 0) - (a.avg_watch_time || 0))
    .slice(0, 10)
    .map((r) => {
      const p = postById.get(r.post_id);
      return {
        id: r.post_id,
        caption: (p?.message || "").replace(/\s+/g, " ").trim(),
        permalink: p?.permalink_url || "",
        value: Number((r.avg_watch_time || 0).toFixed(1)),
        meta: `${(r.total_views || 0).toLocaleString()} views`,
      };
    });
  const topByWatchTimeMax = topByWatchTime.reduce((m, r) => Math.max(m, r.value), 0);

  const topByFollowers = [...reels]
    .filter((r) => (r.followers_gained || 0) > 0)
    .sort((a, b) => (b.followers_gained || 0) - (a.followers_gained || 0))
    .slice(0, 10)
    .map((r) => {
      const p = postById.get(r.post_id);
      return {
        id: r.post_id,
        caption: (p?.message || "").replace(/\s+/g, " ").trim(),
        permalink: p?.permalink_url || "",
        value: r.followers_gained || 0,
        meta: `${(r.reel_plays || 0).toLocaleString()} plays`,
      };
    });
  const topByFollowersMax = topByFollowers.reduce((m, r) => Math.max(m, r.value), 0);

  // Sprint P7 QA pass (2026-04-28): "Top 10 Reels by {active metric}"
  // surfaces when the active page-level metric is NOT reach. Reach is
  // already covered by the existing "Top by Plays" list (Plays
  // correlates strongly with unique reach), so duplicating that view
  // for metric=reach would be noise. Other metrics produce distinct
  // rankings worth surfacing.
  // Uses post-level metric value (postById.get(reel.post_id)). Reels
  // without a corresponding post entry fall through with 0 and get
  // filtered before display.
  const primaryMetric = activeMetrics[0];
  const showPageLevelMetricList = primaryMetric !== "reach";
  const metricLabel: Record<typeof primaryMetric, string> = {
    reach: "Reach",
    interactions: "Interactions",
    engagement: "Engagement Rate",
    shares: "Shares",
  };
  const topByPageLevelMetric = showPageLevelMetricList
    ? [...reels]
        .map((r) => {
          const p = postById.get(r.post_id);
          if (!p) return null;
          // Compute the active metric value from the underlying post.
          const reachVal = (p.unique_views as number) || (p.media_views as number) || 0;
          const ints = ((p.reactions as number) || 0) + ((p.comments as number) || 0) + ((p.shares as number) || 0);
          const value =
            primaryMetric === "interactions" ? ints
            : primaryMetric === "shares" ? ((p.shares as number) || 0)
            : primaryMetric === "engagement" ? (reachVal > 0 ? (ints / reachVal) * 100 : 0)
            : reachVal;
          return {
            id: r.post_id,
            caption: (p?.message || "").replace(/\s+/g, " ").trim(),
            permalink: p?.permalink_url || "",
            value: primaryMetric === "engagement" ? Number(value.toFixed(2)) : value,
            meta: `${(r.reel_plays || 0).toLocaleString()} plays · ${(r.avg_watch_time || 0).toFixed(1)}s avg watch`,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null && x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    : [];
  const topByPageLevelMetricMax = topByPageLevelMetric.reduce((m, r) => Math.max(m, r.value), 0);

  // Retention funnel (aggregate drop-off across all reels) — derived from the
  // per-second curve so it works for reels (Meta's bucket fields are empty).
  // Each bar shows: viewers still watching at second N, computed as
  // sum(total_views * retention[N]) across all reels in range.
  // Day 2U: first bar uses viewsWithCurve, not totalViews, so the starting
  // denominator matches the numerator pool. Otherwise the 0s bar towers
  // over the rest purely because it includes curve-less reels.
  const funnel = [
    { label: "0s (start)", value: viewsWithCurve },
    { label: "2s", value: retentionViews[2] || 0 },
    { label: "3s", value: retentionViews[3] || 0 },
    { label: "6s", value: retentionViews[6] || 0 },
    { label: "15s", value: retentionViews[15] || 0 },
    { label: "30s", value: retentionViews[30] || 0 },
    { label: "60s", value: retentionViews[60] || 0 },
  ];

  // Average retention curve across all reels, normalized to percent of
  // starting viewers. Good for visualizing drop-off shape independent of
  // volume. Only include seconds present in at least one reel.
  // P3: uses the pre-parsed `parsedCurves` array instead of re-parsing the
  // retention JSON 60× per reel. Same result, ~60× fewer JSON.parse calls.
  const secondsToAverage = Array.from({ length: 60 }, (_, i) => i);
  const avgCurveLine: { date: string; value: number }[] = [];
  for (const sec of secondsToAverage) {
    let weighted = 0;
    let denom = 0;
    for (let idx = 0; idx < reels.length; idx++) {
      const curve = parsedCurves[idx];
      if (Object.keys(curve).length === 0) continue;
      const frac = curve[sec];
      if (frac === undefined) continue;
      const w = reels[idx].total_views || 0;
      weighted += frac * w;
      denom += w;
    }
    if (denom > 0) {
      avgCurveLine.push({ date: `${sec}s`, value: Number(((weighted / denom) * 100).toFixed(1)) });
    }
  }

  // Reels table — newest first.
  // W13 (2026-05-02): cap removed (was 25 rows). All reels in range now
  // pipe through <PaginatedList pageSize={10}> for incremental browsing,
  // so a 60-reel period is fully reachable without scrolling a 60-row
  // table.
  // Per-row metrics prefer derived retention + replay rate over Meta's empty
  // completion / sound-on buckets, matching the KPI strip above.
  const tableRows = [...reels]
    .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
    .map((r) => {
      const p = postById.get(r.post_id);
      const dateStr = r.created_time
        ? bdt(r.created_time).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
        : "—";
      const curve = parseRetentionCurve(r.retention_graph);
      const views = r.total_views || 0;
      const hook3 = views && Object.keys(curve).length
        ? retentionAt(curve, 3) * 100
        : 0;
      const plays = r.reel_plays || 0;
      const replays = r.reel_replays || 0;
      const rowReplayRate = plays ? (replays / plays) * 100 : 0;
      return {
        id: r.post_id,
        date: dateStr,
        captionFull: (p?.message || "").replace(/\s+/g, " ").trim(),
        permalink: p?.permalink_url || "",
        pillar: p?.content_pillar || "—",
        plays,
        replays,
        watch: (r.avg_watch_time || 0).toFixed(1),
        hook3: hook3.toFixed(1),
        replayRate: rowReplayRate.toFixed(1),
        follows: r.followers_gained || 0,
      };
    });

  if (totalReels === 0) {
    return (
      <div>
        <PageHeader title="Reels" subtitle="Video watch time, retention, and follower conversion" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} lastScrapedAt={runStatus.last_run_at} compact />
      {/* Sprint P7 v4.7 (2026-04-30, P1.9): MetricSelector hidden on
          Reels because the page's metrics (Plays / Watch Time /
          Followers Gained) are reel-domain and don't map to the four
          page-level metrics (Total Reach / Interactions / ER / Shares).
          Showing the pills here was decorative — they didn't change
          anything on the page. URL params still respected for
          cross-page nav consistency (e.g. preserved when bouncing
          back to Overview). */}
        <Card>
          <p className="text-sm text-slate-600">
            No reels in this date range. Try expanding the range or check that Raw_Video is populated.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Reels" subtitle="Video watch time, retention, and follower conversion" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} compact />
      {/* Sprint P7 v4.7 (2026-04-30, P1.9): MetricSelector hidden on
          Reels because the page's metrics (Plays / Watch Time /
          Followers Gained) are reel-domain and don't map to the four
          page-level metrics (Total Reach / Interactions / ER / Shares).
          Showing the pills here was decorative — they didn't change
          anything on the page. URL params still respected for
          cross-page nav consistency (e.g. preserved when bouncing
          back to Overview). */}

      {/* Canonical KPI strip (Batch 3d, #19). Previously two stacked
          strips (5 cards then 4) duplicated the hierarchy. The secondary
          strip (Total Views / 15s / 30s / Replay Rate) folded back into
          the primary chart: 15s+30s live inside the Retention Funnel
          bars below, Total Views is the funnel sample-size, Replay Rate
          moved onto the Total Plays sublabel. Net result: one 5-card
          strip, no information lost. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Reels Posted" value={totalReels} sublabel="in range" />
        <KpiCard
          label="Total Plays"
          value={totalPlays}
          sublabel={`${totalReplays.toLocaleString()} replays · ${replayRate.toFixed(1)}% replay rate`}
        />
        <KpiCard
          label="Avg Watch Time"
          value={`${weightedAvgWatch.toFixed(1)}s`}
          sublabel={haveCurveData ? "view-weighted" : "unweighted (no curve data)"}
        />
        <KpiCard
          label="Hook Retention (3s)"
          value={`${hookRetention3s.toFixed(1)}%`}
          sublabel={reelsWithCurve ? `past 3s · ${reelsWithCurve}/${totalReels} reels with curves` : "no curve data in range"}
          labelTooltip="Hook Retention = % of viewers still watching at the 3-second mark. Industry rough benchmark for ed-tech reels: 25-35% (anything above 30% means the opening 3s is doing real work; below 25% suggests the hook isn't earning the swipe). Computed from Meta's per-second retention curve, view-weighted across all reels with curve data this period."
        />
        <KpiCard label="Followers Gained" value={totalFollowersGained} sublabel="from reels" />
      </div>

      {/* Retention funnel — derived from per-second curve */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Retention Funnel"
          kind="derived"
          subtitle="Viewers still watching at key seconds (all reels in range)"
          definition="For each second N, sum(total_views × retention[N]) across all reels with parseable retention curves. Meta's per-second drop-off data IS populated for reels (unlike the 15s/30s bucket fields). 0s = starting viewers of those reels; later bars = how many survived to that second. Reels without retention curves are excluded from both numerator and denominator."
          sampleSize={`${reelsWithCurve} of ${totalReels} reel${totalReels === 1 ? "" : "s"} ${reelsWithCurve === 1 ? "has" : "have"} retention curves`}
          caption="Biggest drop on Shikho reels is typically between 2s and 6s — the hook window. If 6s→15s survival is high, format is sticky. If 15s→30s drop is steep, middle loses people."
        >
          <BarChartBase data={funnel} color="#304090" metricName="Viewers" valueAxisLabel="Viewers" categoryAxisLabel="Seconds watched" />
        </ChartCard>
        <ChartCard
          title="Average Retention Curve"
          kind="derived"
          subtitle="% of starting audience still watching, by second (0-60s)"
          definition="View-weighted average of every reel's retention curve. Each point shows what % of starting viewers were still watching at that second. A healthy curve flattens after 10-15s instead of continuing to drop. Rendered as a line because retention is a continuous process — 60 individual bars made the drop-off shape harder to read than a single sweeping curve."
          sampleSize={`${totalReels} reel${totalReels === 1 ? "" : "s"}`}
          caption="Look for the inflection point. A cliff before 3s = weak hook. A cliff at 6s = mid-hook works but promise isn't paying off. Long tail past 30s = sticky content."
        >
          <TrendChart
            data={avgCurveLine}
            variant="line"
            color="#C02080"
            valueFormat="percent1"
            metricName="% still watching"
            valueAxisLabel="% still watching"
            xAxisLabel="Second"
          />
        </ChartCard>
      </div>

      {/* W12 (2026-05-02): three Top-10 Reels rankings — Plays, Avg Watch Time,
          Followers Gained — merged into a single switcher card. Operators only
          look at one ranking at a time; stacking three peer ChartCards burned
          vertical space and made the comparison ("the same reels, ranked three
          ways") implicit instead of explicit. The switcher exposes that framing
          directly: pick the lens, see the leaders.

          Implementation: each list is server-rendered (TopReelList uses
          PostReference + Bangla-aware truncation) and passed as a pre-rendered
          ReactNode to <TopReelSwitcher>, which is a thin client component that
          toggles which list is visible. Followers Gained tab is conditionally
          included (omitted if no reels gained followers in range, matching the
          previous "show only if rows > 0" behaviour). */}
      <div className="mb-6">
        <ChartCard
          title="Top 10 Reels"
          kind="observed"
          definition="Three rankings of the same reels in this date range — Plays (raw reach leaders, includes replays), Avg Watch Time (engagement-quality, filtered to ≥500 views to avoid tiny-sample outliers), Followers Gained (reels that converted viewers to followers). Each row shows rank, caption (click / tap for full text + a link out to the FB post), a bar for relative scale, and metric-specific context. Use the toggle to flip between rankings — high plays + weak watch time = strong hook, weak middle; long watch time + decent plays = replicable format; high follower gain on modest plays = punches above its weight."
          sampleSize={`${reels.length} reel${reels.length === 1 ? "" : "s"} in range`}
        >
          <TopReelSwitcher
            tabs={[
              {
                label: "Plays",
                subtitle: `Raw reach leaders · top ${topByPlays.length}`,
                caption: "High plays with weak watch time = strong hook, weak middle. Switch to Avg Watch Time to spot reels that held the audience.",
                accentBg: "bg-brand-shikho-indigo",
                content: (
                  <TopReelList rows={topByPlays} max={topByPlaysMax} valueLabel="plays" barColor="#304090" />
                ),
              },
              {
                label: "Avg Watch Time",
                subtitle: `Engagement-quality leaders (≥500 views) · top ${topByWatchTime.length}`,
                caption: "Long watch time with decent plays = replicable format. Short watch time with high plays = good hook, weak middle.",
                accentBg: "bg-brand-shikho-magenta",
                content: (
                  <TopReelList rows={topByWatchTime} max={topByWatchTimeMax} valueLabel="seconds" barColor="#C02080" formatValue={(v) => `${v}s`} />
                ),
              },
              ...(topByFollowers.length > 0
                ? [
                    {
                      label: "Followers Gained",
                      subtitle: `Reels that converted viewers → followers · ${topByFollowers.length} reel${topByFollowers.length === 1 ? "" : "s"}`,
                      caption: "High plays with zero follower gain = viral but not sticky. Low plays with high follower gain = niche but converts.",
                      accentBg: "bg-brand-green",
                      content: (
                        <TopReelList rows={topByFollowers} max={topByFollowersMax} valueLabel="followers" barColor="#1A8E78" formatValue={(v) => `+${v}`} />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </ChartCard>
      </div>

      {/* Sprint P7 QA pass (2026-04-28): "Top 10 Reels by {active metric}"
          when the page-level selector is NOT on reach (reach is already
          covered by Top-by-Plays since plays correlates strongly with
          unique reach). Other metrics produce distinct rankings worth
          surfacing — e.g. metric=shares ranks reels by shares, which
          can flip the ordering vs plays. */}
      {showPageLevelMetricList && topByPageLevelMetric.length > 0 && (
        <div className="mb-6">
          <ChartCard
            title={`Top 10 Reels by ${metricLabel[primaryMetric]}`}
            kind="observed"
            subtitle={`Reels ranked by ${primaryMetric === "engagement" ? "engagement rate" : `total ${primaryMetric}`}`}
            definition={`For each reel: the underlying post's ${primaryMetric === "engagement" ? "engagement rate (interactions ÷ reach × 100)" : `total ${primaryMetric}`}. Surfaced because you've selected ${metricLabel[primaryMetric]} at the page level. Compare against Top by Plays — reels that lead on the active metric but trail on plays are punching above their weight on that dimension.`}
            sampleSize={`top ${topByPageLevelMetric.length}`}
            caption="Reach + watch time is the canonical reels view; this list shows which reels lead on the metric you've picked. The meta shows plays + avg watch time so you can spot a reel that scored high on the active metric without massive distribution."
          >
            <TopReelList
              rows={topByPageLevelMetric}
              max={topByPageLevelMetricMax}
              valueLabel={primaryMetric}
              barColor={primaryMetric === "shares" ? "#E0A010" : primaryMetric === "interactions" ? "#C02080" : "#1A8E78"}
              formatValue={(v) =>
                primaryMetric === "engagement" ? `${v.toFixed(2)}%` : v.toLocaleString()
              }
            />
          </ChartCard>
        </div>
      )}

      {/* Reels table — desktop table / mobile card-list.
          A 9-column table at 360px forces horizontal scroll for primary
          content, which CLAUDE.md flags as an anti-pattern. Below `md:`
          each row is rendered as a stacked card with the same fields
          laid out in a 3-column metric grid. Desktop keeps the dense
          table because it's great at scanning. */}
      {/* W13 (2026-05-02): Recent Reels paginated via reusable PaginatedList
          (10 rows per page). Cap of 25 removed — a 60-reel period is fully
          reachable.
          W13 hotfix (2026-05-02 live check): table+pagination wrapped in a
          dedicated client component (RecentReelsList) because the inline
          render-prop function couldn't cross the server→client boundary
          and was server-erroring the page. */}
      <Card className="!p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50/50">
          <h3 className="text-base font-semibold text-slate-900">Recent Reels</h3>
          <p className="text-xs text-slate-500 mt-0.5">Newest first · 10 per page</p>
        </div>

        <RecentReelsList rows={tableRows} />
      </Card>
    </div>
  );
}

