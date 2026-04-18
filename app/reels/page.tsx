import { getVideoMetrics, getPosts } from "@/lib/sheets";
import { bdt } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import KpiCard from "@/components/KpiCard";
import BarChartBase from "@/components/BarChart";
import TrendChart from "@/components/TrendChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Short preview of the post message for row labels on the top-N chart.
function previewMessage(msg: string, maxLen = 40): string {
  if (!msg) return "(no caption)";
  const clean = msg.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
}

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
  const [videos, posts] = await Promise.all([getVideoMetrics(), getPosts()]);

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
  const totalViews = reels.reduce((s, r) => s + (r.total_views || 0), 0);

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

  // Bucket fields — populated for regular videos only. Kept so we can prefer
  // Meta's own numbers when available and fall back to the per-second
  // retention curve (which IS populated for reels) otherwise.
  const total15sBucket = reels.reduce((s, r) => s + (r.views_15s || 0), 0);
  const total30sBucket = reels.reduce((s, r) => s + (r.views_30s || 0), 0);
  const total15s = total15sBucket > 0 ? total15sBucket : retentionViews[15];
  const total30s = total30sBucket > 0 ? total30sBucket : retentionViews[30];

  // Denominator for retention percentages. When we use Meta's bucket fields,
  // divide by the full totalViews (all reels). When we derive from the curve,
  // divide by viewsWithCurve so numerator and denominator come from the same
  // pool of reels.
  const denom15s = total15sBucket > 0 ? totalViews : viewsWithCurve;
  const denom30s = total30sBucket > 0 ? totalViews : viewsWithCurve;

  // Replacement metrics (since Meta doesn't populate Completion Rate or
  // Sound On Rate for reels):
  //   Hook Retention (3s) — viewers still watching at second 3, the critical
  //     hook window. Derived from per-second curve; denominator is viewsWithCurve
  //     so the % isn't biased downward by curve-less reels in the pool.
  //   Replay Rate — replays as a share of total plays. Tells us which reels
  //     are sticky enough to get rewatched.
  const hookRetention3s = viewsWithCurve ? (retentionViews[3] / viewsWithCurve) * 100 : 0;
  const replayRate = totalPlays ? (totalReplays / totalPlays) * 100 : 0;

  // Top 10 reels by plays
  const topByPlays = [...reels]
    .sort((a, b) => (b.reel_plays || 0) - (a.reel_plays || 0))
    .slice(0, 10)
    .map((r) => {
      const p = postById.get(r.post_id);
      return {
        label: previewMessage(p?.message || "", 34),
        value: r.reel_plays || 0,
        meta: r.avg_watch_time || 0,
      };
    });

  // Top 10 reels by avg watch time (min 500 views to filter noise)
  const topByWatchTime = [...reels]
    .filter((r) => (r.total_views || 0) >= 500)
    .sort((a, b) => (b.avg_watch_time || 0) - (a.avg_watch_time || 0))
    .slice(0, 10)
    .map((r) => {
      const p = postById.get(r.post_id);
      return {
        label: previewMessage(p?.message || "", 34),
        value: Number((r.avg_watch_time || 0).toFixed(1)),
        meta: r.total_views || 0,
      };
    });

  // Top 10 reels by followers gained
  const topByFollowers = [...reels]
    .filter((r) => (r.followers_gained || 0) > 0)
    .sort((a, b) => (b.followers_gained || 0) - (a.followers_gained || 0))
    .slice(0, 10)
    .map((r) => {
      const p = postById.get(r.post_id);
      return {
        label: previewMessage(p?.message || "", 34),
        value: r.followers_gained || 0,
        meta: r.reel_plays || 0,
      };
    });

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

  // Reels table — newest first, cap at 25 rows.
  // Per-row metrics prefer derived retention + replay rate over Meta's empty
  // completion / sound-on buckets, matching the KPI strip above.
  const tableRows = [...reels]
    .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
    .slice(0, 25)
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
        caption: previewMessage(p?.message || "", 60),
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
        <PageHeader title="Reels" subtitle="Video watch time, retention, and follower conversion" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} />
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
      <PageHeader title="Reels" subtitle="Video watch time, retention, and follower conversion" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Reels Posted" value={totalReels} sublabel="in range" />
        <KpiCard label="Total Plays" value={totalPlays} sublabel={`${totalReplays.toLocaleString()} replays`} />
        <KpiCard label="Avg Watch Time" value={`${weightedAvgWatch.toFixed(1)}s`} sublabel={haveCurveData ? "view-weighted" : "unweighted (no curve data)"} />
        <KpiCard
          label="Hook Retention (3s)"
          value={`${hookRetention3s.toFixed(1)}%`}
          sublabel={reelsWithCurve ? `past 3s · ${reelsWithCurve}/${totalReels} reels with curves` : "no curve data in range"}
        />
        <KpiCard label="Followers Gained" value={totalFollowersGained} sublabel="from reels" />
      </div>

      {/* Secondary metric row — derived retention from per-second curve */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Views</div>
          <div className="text-xl font-bold text-brand-cyan mt-1">{totalViews.toLocaleString()}</div>
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">15s Retention</div>
          <div className="text-xl font-bold text-brand-green mt-1">{total15s.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {denom15s ? ((total15s / denom15s) * 100).toFixed(1) : "0"}% · {total15sBucket > 0 ? "Meta bucket" : "derived from curve"}
          </div>
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">30s Retention</div>
          <div className="text-xl font-bold text-brand-pink mt-1">{total30s.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {denom30s ? ((total30s / denom30s) * 100).toFixed(1) : "0"}% · {total30sBucket > 0 ? "Meta bucket" : "derived from curve"}
          </div>
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Replay Rate</div>
          <div className="text-xl font-bold text-brand-purple mt-1">{replayRate.toFixed(1)}%</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {totalReplays.toLocaleString()} replays / {totalPlays.toLocaleString()} plays
          </div>
        </Card>
      </div>

      {/* Retention funnel — derived from per-second curve */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Retention Funnel"
          kind="derived"
          subtitle="Viewers still watching at key seconds (all reels in range)"
          definition="For each second N, sum(total_views × retention[N]) across all reels with parseable retention curves. Meta's per-second drop-off data IS populated for reels (unlike the 15s/30s bucket fields). 0s = starting viewers of those reels; later bars = how many survived to that second. Reels without retention curves are excluded from both numerator and denominator."
          sampleSize={`${reelsWithCurve} of ${totalReels} reels have retention curves`}
          caption="Biggest drop on Shikho reels is typically between 2s and 6s — the hook window. If 6s→15s survival is high, format is sticky. If 15s→30s drop is steep, middle loses people."
        >
          <BarChartBase data={funnel} color="#4f46e5" metricName="Viewers" valueAxisLabel="Viewers" categoryAxisLabel="Seconds watched" />
        </ChartCard>
        <ChartCard
          title="Average Retention Curve"
          kind="derived"
          subtitle="% of starting audience still watching, by second (0-60s)"
          definition="View-weighted average of every reel's retention curve. Each point shows what % of starting viewers were still watching at that second. A healthy curve flattens after 10-15s instead of continuing to drop. Rendered as a line because retention is a continuous process — 60 individual bars made the drop-off shape harder to read than a single sweeping curve."
          sampleSize={`${totalReels} reels`}
          caption="Look for the inflection point. A cliff before 3s = weak hook. A cliff at 6s = mid-hook works but promise isn't paying off. Long tail past 30s = sticky content."
        >
          <TrendChart
            data={avgCurveLine}
            variant="line"
            color="#ec4899"
            valueFormat="percent1"
            metricName="% still watching"
            valueAxisLabel="% still watching"
            xAxisLabel="Second"
          />
        </ChartCard>
      </div>

      {/* Top performers */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Top 10 Reels by Plays"
          kind="observed"
          subtitle="Raw reach leaders"
          definition="Total reel plays (includes replays). Highest-distribution reels in the period. Tooltip shows avg watch time (seconds)."
          sampleSize={`top ${topByPlays.length}`}
        >
          <BarChartBase data={topByPlays} horizontal height={340} color="#4f46e5" metricName="Plays" valueAxisLabel="Plays" categoryAxisLabel="Reel caption (preview)" />
        </ChartCard>
        <ChartCard
          title="Top 10 Reels by Avg Watch Time"
          kind="observed"
          subtitle="Engagement quality leaders (≥500 views)"
          definition="Average watch time in seconds. Filtered to reels with ≥500 total views to avoid tiny-sample outliers. Tooltip shows total views."
          sampleSize={`top ${topByWatchTime.length}`}
          caption="Long watch time with decent plays = replicable format. Short watch time with high plays = good hook, weak middle."
        >
          <BarChartBase data={topByWatchTime} horizontal height={340} color="#ec4899" valueFormat="number" metricName="Avg watch (s)" valueAxisLabel="Seconds" categoryAxisLabel="Reel caption (preview)" />
        </ChartCard>
      </div>

      {/* Followers gained chart */}
      {topByFollowers.length > 0 && (
        <div className="mb-6">
          <ChartCard
            title="Top Reels by Followers Gained"
            kind="observed"
            subtitle="Reels that converted viewers → followers"
            definition="Net new followers attributed to each reel by Meta. Tooltip shows total plays for context."
            sampleSize={`${topByFollowers.length} reels gained followers`}
            caption="High plays with zero follower gain = viral but not sticky. Low plays with high gain = niche but converts."
          >
            <BarChartBase data={topByFollowers} horizontal height={340} color="#10b981" metricName="Followers gained" valueAxisLabel="Followers gained" categoryAxisLabel="Reel caption (preview)" />
          </ChartCard>
        </div>
      )}

      {/* Reels table — desktop table / mobile card-list.
          A 9-column table at 360px forces horizontal scroll for primary
          content, which CLAUDE.md flags as an anti-pattern. Below `md:`
          each row is rendered as a stacked card with the same fields
          laid out in a 3-column metric grid. Desktop keeps the dense
          table because it's great at scanning. */}
      <Card className="!p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Recent Reels</h3>
          <p className="text-xs text-slate-500 mt-0.5">Newest first · up to 25 rows</p>
        </div>

        {/* Desktop / tablet table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Date</th>
                <th className="text-left px-4 py-2 font-semibold">Caption</th>
                <th className="text-left px-4 py-2 font-semibold">Pillar</th>
                <th className="text-right px-4 py-2 font-semibold">Plays</th>
                <th className="text-right px-4 py-2 font-semibold">Replays</th>
                <th className="text-right px-4 py-2 font-semibold">Watch (s)</th>
                <th className="text-right px-4 py-2 font-semibold">Hook 3s %</th>
                <th className="text-right px-4 py-2 font-semibold">Replay %</th>
                <th className="text-right px-4 py-2 font-semibold">Follows</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => (
                <tr key={row.id + i} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{row.date}</td>
                  <td className="px-4 py-2 text-slate-800 max-w-[360px] truncate" title={row.caption}>{row.caption}</td>
                  <td className="px-4 py-2 text-slate-500">{row.pillar}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.plays.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{row.replays.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.watch}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.hook3}%</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{row.replayRate}%</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-brand-green">{row.follows > 0 ? `+${row.follows}` : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list (below md) */}
        <ul className="md:hidden divide-y divide-slate-100">
          {tableRows.map((row, i) => (
            <li key={row.id + i} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                  {row.date}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{row.pillar}</div>
              </div>
              <div className="text-sm text-slate-800 line-clamp-2 mb-2" title={row.caption}>
                {row.caption}
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-2 text-xs">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Plays</div>
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{row.plays.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Watch</div>
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{row.watch}s</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Follows</div>
                  <div className="text-sm font-semibold text-brand-green tabular-nums">
                    {row.follows > 0 ? `+${row.follows}` : "0"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hook 3s</div>
                  <div className="text-sm text-slate-700 tabular-nums">{row.hook3}%</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Replay %</div>
                  <div className="text-sm text-slate-700 tabular-nums">{row.replayRate}%</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Replays</div>
                  <div className="text-sm text-slate-700 tabular-nums">{row.replays.toLocaleString()}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
