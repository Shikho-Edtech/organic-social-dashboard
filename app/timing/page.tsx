import { getPosts } from "@/lib/sheets";
import { filterPosts, bdt, reach, totalInteractions } from "@/lib/aggregate";
import { summarize, bestByLowerBound, reliabilityLabel, minPostsForRange, type Summary } from "@/lib/stats";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import Heatmap, { type HeatmapCell } from "@/components/Heatmap";
import EmptyChart from "@/components/EmptyChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Day 2O: rank "Best X" KPIs by 95% CI lower bound of the mean. Day×Hour
// heatmap replaces the old 2×2 bar-chart grid (slot reach / slot ER /
// day reach / day ER) — one canonical "when to post" viz instead of
// four charts the reader had to cross-reference. Time-slot bucketing
// (the old "Morning 9-12" etc.) is gone; hours are the native unit.

type DayRow = {
  label: string;
  reachSum: Summary;
  erSum: Summary;
  posts: number;
};

export default async function TimingPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);
  const posts = await getPosts();
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Helpers for per-post metrics
  const postReach = (p: (typeof inRange)[number]) => reach(p);
  const postEngRate = (p: (typeof inRange)[number]) => {
    const r = reach(p);
    if (!r) return 0;
    return ((p.reactions || 0) + (p.comments || 0) + (p.shares || 0)) / r * 100;
  };

  // Day of week (BDT) — still computed for the Best-Day KPIs above the heatmap.
  // Guard against unparseable created_time: filterPosts lets posts with NaN
  // dates through (d < f.start and d > f.end both return false for NaN), so
  // bdt() here can return Invalid Date → getDay() returns NaN → dayNames[NaN]
  // is undefined → postsByDayOfWeek[undefined].push crashes the server render.
  // One production row with a malformed timestamp and this page 500s.
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const postsByDayOfWeek: Record<string, typeof inRange> = {};
  dayNames.forEach((d) => (postsByDayOfWeek[d] = []));
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    if (isNaN(d.getTime())) continue;
    const dayIdx = d.getDay();
    if (!Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) continue;
    postsByDayOfWeek[dayNames[dayIdx]].push(p);
  }
  const dayData: DayRow[] = dayNames.map((d) => {
    const bucket = postsByDayOfWeek[d];
    return {
      label: d,
      reachSum: summarize(bucket.map(postReach)),
      erSum: summarize(bucket.map(postEngRate)),
      posts: bucket.length,
    };
  });

  // Day×Hour aggregation for the heatmap. Bucket posts by (day-of-week,
  // publish-hour-in-BDT); compute reach-weighted ER per bucket (so a
  // single monster post doesn't hijack the cell).
  type CellBucket = { posts: number; reach: number; interactions: number; n: number };
  const grid: CellBucket[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ posts: 0, reach: 0, interactions: 0, n: 0 }))
  );
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    if (isNaN(d.getTime())) continue;
    const day = d.getDay();
    const hour = d.getHours();
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const r = reach(p);
    grid[day][hour].posts += 1;
    grid[day][hour].reach += r;
    grid[day][hour].interactions += totalInteractions(p);
    grid[day][hour].n += 1;
  }
  const erCells: HeatmapCell[] = [];
  const reachCells: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const b = grid[d][h];
      const er = b.reach > 0 ? (b.interactions / b.reach) * 100 : 0;
      const avgReach = b.posts > 0 ? b.reach / b.posts : 0;
      erCells.push({ day: d, hour: h, value: er, n: b.n, totalReach: b.reach });
      reachCells.push({ day: d, hour: h, value: avgReach, n: b.n, totalReach: b.reach });
    }
  }

  // Day 2S: adaptive min-N per range. Heatmap cells below MIN_N render
  // dimmed (not hidden — a blank cell is still information), so a
  // single-post cell can't visually dominate the grid.
  const rangeDays = Math.max(
    1,
    Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000)
  );
  const MIN_N = minPostsForRange(rangeDays);

  // Use per-hour minimum (scaled down from the per-day/slot minimum): a
  // day×hour cell sees far fewer posts than a whole day bucket, so the
  // bar for "reliable" has to be lower or every cell would be muted. Cap
  // at 2 so we at least demand two posts before saying a cell is real.
  const CELL_MIN_N = Math.max(2, Math.floor(MIN_N / 2));

  const eligibleDays = dayData.filter((d) => d.posts >= MIN_N);
  const bestDayReach = bestByLowerBound(eligibleDays, (d) => d.reachSum);
  const bestDayEng = bestByLowerBound(eligibleDays, (d) => d.erSum);

  // "Best hour" from the heatmap: CI-ranked by engagement-rate. We
  // synthesize a Summary per cell ad-hoc because hours aren't in dayData.
  type HourRow = { label: string; erSum: Summary; reachSum: Summary; posts: number };
  const hourRows: HourRow[] = [];
  for (let h = 0; h < 24; h++) {
    // All posts that published in hour h across all days in range.
    const bucket = inRange.filter((p) => {
      if (!p.created_time) return false;
      return bdt(p.created_time).getHours() === h;
    });
    if (bucket.length < MIN_N) continue;
    hourRows.push({
      label: `${h.toString().padStart(2, "0")}:00`,
      erSum: summarize(bucket.map(postEngRate)),
      reachSum: summarize(bucket.map(postReach)),
      posts: bucket.length,
    });
  }
  const bestHourEng = bestByLowerBound(hourRows, (h) => h.erSum);
  const bestHourReach = bestByLowerBound(hourRows, (h) => h.reachSum);

  const totalCellsWithPosts = erCells.filter((c) => c.n > 0).length;
  const totalCellsReliable = erCells.filter((c) => c.n >= CELL_MIN_N).length;

  // Accessible "View data" tables for both heatmaps. Rows are only the
  // non-empty cells (a 7×24 grid with mostly zeros is noise for a
  // screen reader). Formatted with localeString / fixed precision so
  // the table renders as human-readable text rather than raw floats.
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const formatHour12 = (h: number) => {
    const suffix = h >= 12 ? "pm" : "am";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}${suffix}`;
  };
  const nonEmptyCells = erCells
    .map((c, i) => ({ er: c, reach: reachCells[i] }))
    .filter((pair) => pair.er.n > 0)
    .sort((a, b) => b.er.value - a.er.value);
  const erViewData = {
    columns: ["Day", "Hour", "Posts", "Eng Rate", "Total Reach"],
    rows: nonEmptyCells.map(({ er }) => [
      DAY_LABELS[er.day],
      formatHour12(er.hour),
      er.n,
      `${er.value.toFixed(2)}%`,
      Math.round(er.totalReach),
    ]),
  };
  const reachViewData = {
    columns: ["Day", "Hour", "Posts", "Avg Reach", "Total Reach"],
    rows: [...nonEmptyCells]
      .sort((a, b) => b.reach.value - a.reach.value)
      .map(({ reach }) => [
        DAY_LABELS[reach.day],
        formatHour12(reach.hour),
        reach.n,
        Math.round(reach.value),
        Math.round(reach.totalReach),
      ]),
  };

  return (
    <div>
      <PageHeader title="Timing" subtitle="When to post for max reach and engagement" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} />

      {/* Best slots summary — ranked by 95% CI lower bound */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="!p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best for Reach (Day)</div>
          <div className="text-xl sm:text-2xl font-bold text-brand-cyan mt-2 break-words leading-tight">{bestDayReach?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {Math.round(bestDayReach?.reachSum.mean || 0).toLocaleString()} avg reach/post
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {reliabilityLabel(bestDayReach?.posts || 0)}
            {/* Only show the floor when it's positive — a clamp-to-zero floor
                on a negative CI lower bound ("reliable floor 0") is actively
                misleading: it looks like "we expect at least 0", which is
                trivially true. If CI goes negative, variance is too high to
                call a floor; the reliability label alone tells that story. */}
            {bestDayReach && isFinite(bestDayReach.reachSum.lowerBound95) && bestDayReach.reachSum.lowerBound95 > 0 && (
              <> · reliable floor {Math.round(bestDayReach.reachSum.lowerBound95).toLocaleString()}</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best for Engagement (Day)</div>
          <div className="text-xl sm:text-2xl font-bold text-brand-pink mt-2 break-words leading-tight">{bestDayEng?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestDayEng?.erSum.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {reliabilityLabel(bestDayEng?.posts || 0)}
            {bestDayEng && isFinite(bestDayEng.erSum.lowerBound95) && bestDayEng.erSum.lowerBound95 > 0 && (
              <> · reliable floor {bestDayEng.erSum.lowerBound95.toFixed(2)}%</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best for Reach (Hour)</div>
          <div className="text-xl sm:text-2xl font-bold text-brand-green mt-2 break-words leading-tight">{bestHourReach?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {Math.round(bestHourReach?.reachSum.mean || 0).toLocaleString()} avg reach/post
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {reliabilityLabel(bestHourReach?.posts || 0)}
            {bestHourReach && isFinite(bestHourReach.reachSum.lowerBound95) && bestHourReach.reachSum.lowerBound95 > 0 && (
              <> · reliable floor {Math.round(bestHourReach.reachSum.lowerBound95).toLocaleString()}</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Best for Engagement (Hour)</div>
          <div className="text-xl sm:text-2xl font-bold text-brand-purple mt-2 break-words leading-tight">{bestHourEng?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestHourEng?.erSum.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {reliabilityLabel(bestHourEng?.posts || 0)}
            {bestHourEng && isFinite(bestHourEng.erSum.lowerBound95) && bestHourEng.erSum.lowerBound95 > 0 && (
              <> · reliable floor {bestHourEng.erSum.lowerBound95.toFixed(2)}%</>
            )}
          </div>
        </Card>
      </div>

      {/* Primary heatmap: engagement rate by day×hour */}
      <div className="mb-6">
        <ChartCard
          title="Engagement Rate · Day × Hour"
          kind="derived"
          subtitle="Reach-weighted ER for each (day-of-week, publish hour) cell"
          definition={`For each (day, hour) cell: (Σ interactions ÷ Σ reach) × 100 across all posts that cell. Color saturation encodes the rate — darker = stronger engagement. Cells with fewer than ${CELL_MIN_N} posts are dimmed (still visible so zero-post slots are distinguishable from low-confidence ones). Reach-weighted so a single viral post can't hijack a cell's color.`}
          sampleSize={`${totalCellsReliable} / ${totalCellsWithPosts} cells reliable (n≥${CELL_MIN_N}), ${inRange.length} posts total`}
          caption={`Read left-to-right for daily patterns, top-to-bottom for weekday patterns. Dark diagonal bands suggest consistent "best time" windows. Bangladesh Time (UTC+6).`}
          viewData={erViewData}
        >
          {totalCellsWithPosts === 0 ? (
            <EmptyChart
              message="No posts in this date range"
              hint="Widen the range or check that posts exist for this window."
            />
          ) : (
            <Heatmap
              cells={erCells}
              minN={CELL_MIN_N}
              metricLabel="engagement rate"
              valueFormat="percent"
              minColor="#fdf2f8" // pink-50
              maxColor="#ec4899" // pink-500 — matches the "ER" family color
            />
          )}
        </ChartCard>
      </div>

      {/* Secondary heatmap: avg reach by day×hour */}
      <div className="mb-6">
        <ChartCard
          title="Avg Reach · Day × Hour"
          kind="observed"
          subtitle="Per-post unique reach averaged for each (day, hour) cell"
          definition={`For each (day, hour) cell: Σ reach ÷ N posts that cell. Color encodes average reach per post; cells with fewer than ${CELL_MIN_N} posts are dimmed. Pair with the engagement rate heatmap above — reach and ER can diverge (a cell can deliver high reach with low ER, or vice versa).`}
          sampleSize={`${totalCellsReliable} / ${totalCellsWithPosts} cells reliable (n≥${CELL_MIN_N})`}
          caption={`Dark cells here + dark cells above = that day/hour is your best publish window on both axes.`}
          viewData={reachViewData}
        >
          {totalCellsWithPosts === 0 ? (
            <EmptyChart
              message="No posts in this date range"
              hint="Widen the range or check that posts exist for this window."
            />
          ) : (
            <Heatmap
              cells={reachCells}
              minN={CELL_MIN_N}
              metricLabel="avg reach"
              valueFormat="number"
              minColor="#eef2ff" // indigo-50
              maxColor="#4f46e5" // indigo-600
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
