import { getPosts, getRunStatus } from "@/lib/sheets";
import { filterPosts, bdt, reach, totalInteractions, formatHourMatrix } from "@/lib/aggregate";
import { summarize, bestByLowerBound, reliabilityLabel, minPostsForRange, type Summary } from "@/lib/stats";
import { resolveRange, rangeDays as computeRangeDays } from "@/lib/daterange";
import { canonicalColor } from "@/lib/colors";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import Heatmap, { type HeatmapCell } from "@/components/Heatmap";
import EmptyChart from "@/components/EmptyChart";
import MetricSelector, { parseMetricParam } from "@/components/MetricSelector";
import Link from "next/link";

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
  // Sprint P7 Phase 3 + QA pass (2026-04-28): page-level metric
  // selector. Timing's canonical pair is reach + engagement-rate
  // heatmaps (the two primary signals for "when to post"); when the
  // active metric is shares or interactions, a third heatmap surfaces
  // below the canonical pair so the user can compare the new metric
  // against reach.
  const activeMetrics = parseMetricParam(searchParams.metric);
  const primaryMetric = activeMetrics[0];

  // R3 promoted to default (2026-05-02 user feedback): the dynamic heatmap
  // IS the canonical "when to post" view. No more `?layout=r3` flag — the
  // page always renders ONE heatmap with two switchers above it:
  //   - dimension: Day × Hour | Format × Hour  (?heat_dim=day|format)
  //   - metric:    Engagement Rate | Avg Reach | Avg Shares | Avg Interactions
  //               (?heat_view=engagement|reach|shares|interactions)
  // Format × Hour was lifted from /engagement (R2 cleanup) and now lives
  // here because "when to post which format" is fundamentally a Timing-page
  // question.
  const heatViewParam = typeof searchParams?.heat_view === "string" ? searchParams.heat_view : "";
  const validHeatViews = ["engagement", "reach", "shares", "interactions"] as const;
  type HeatView = (typeof validHeatViews)[number];
  const activeHeatView: HeatView = (validHeatViews as readonly string[]).includes(heatViewParam)
    ? (heatViewParam as HeatView)
    : "engagement"; // default: engagement (the canonical "when" signal)
  const heatDimParam = typeof searchParams?.heat_dim === "string" ? searchParams.heat_dim : "";
  const validHeatDims = ["day", "format"] as const;
  type HeatDim = (typeof validHeatDims)[number];
  const activeHeatDim: HeatDim = (validHeatDims as readonly string[]).includes(heatDimParam)
    ? (heatDimParam as HeatDim)
    : "day";

  const [posts, runStatus] = await Promise.all([getPosts(), getRunStatus()]);
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
  type CellBucket = { posts: number; reach: number; interactions: number; shares?: number; n: number };
  const grid: CellBucket[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ posts: 0, reach: 0, interactions: 0, n: 0 }))
  );
  // Sprint P7 QA pass (2026-04-28): add per-cell shares + share aggregates so
  // the optional third heatmap (when active metric is shares or
  // interactions) renders against the same grid we already built for
  // reach + ER. Almost-zero cost — one more accumulator field.
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
    grid[day][hour].shares = (grid[day][hour].shares || 0) + (p.shares || 0);
    grid[day][hour].n += 1;
  }
  const erCells: HeatmapCell[] = [];
  const reachCells: HeatmapCell[] = [];
  // Third heatmap cells: avg of active metric per cell. Only built + rendered
  // when active metric is "shares" or "interactions"; reach + engagement
  // are already covered by the canonical pair above.
  const metricCells: HeatmapCell[] = [];
  // R3 (2026-05-02): always-built shares + interactions cells so the
  // dynamic-heatmap switcher (?layout=r3) can flip between any of the 4
  // views via URL param without re-running the cell loop. ~168 cells per
  // metric, cost is negligible. Default-layout pages don't render these.
  const sharesCells: HeatmapCell[] = [];
  const interactionsCells: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const b = grid[d][h];
      const er = b.reach > 0 ? (b.interactions / b.reach) * 100 : 0;
      const avgReach = b.posts > 0 ? b.reach / b.posts : 0;
      const avgShares = b.posts > 0 ? (b.shares || 0) / b.posts : 0;
      const avgInteractions = b.posts > 0 ? b.interactions / b.posts : 0;
      erCells.push({ day: d, hour: h, value: er, n: b.n, totalReach: b.reach });
      reachCells.push({ day: d, hour: h, value: avgReach, n: b.n, totalReach: b.reach });
      sharesCells.push({ day: d, hour: h, value: avgShares, n: b.n, totalReach: b.reach });
      interactionsCells.push({ day: d, hour: h, value: avgInteractions, n: b.n, totalReach: b.reach });
      // Per-cell value of the active metric (legacy default layout uses this for the
      // optional 3rd heatmap when ?metric=shares|interactions is active).
      const metricValue =
        primaryMetric === "shares"
          ? avgShares
          : primaryMetric === "interactions"
            ? avgInteractions
            : 0;
      metricCells.push({ day: d, hour: h, value: metricValue, n: b.n, totalReach: b.reach });
    }
  }

  // Day 2S: adaptive min-N per range. Heatmap cells below MIN_N render
  // dimmed (not hidden — a blank cell is still information), so a
  // single-post cell can't visually dominate the grid.
  const rangeDays = computeRangeDays(range);
  const MIN_N = minPostsForRange(rangeDays);

  // Per-cell threshold for a 7×24 = 168-cell grid. The whole-day bucket
  // (Timing KPIs above) sees all posts for a weekday, so MIN_N makes sense.
  // A (day,hour) cell sees ~1/24 of that, so using MIN_N/2 still leaves most
  // cells greyed out on any realistic posting volume (30-day, 50 posts, ER
  // threshold of 5+ per cell hides 95% of the grid). Drop the floor to 2 and
  // rely on opacity-weighted color inside Heatmap to communicate confidence
  // continuously — "more posts in this cell = more saturated color" — instead
  // of a hard reliable/not-reliable cutoff that hides the signal entirely on
  // sparse windows.
  const CELL_MIN_N = 2;

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
  // Sprint P6: 24hr across the dashboard. Previously rendered "3pm"/"9am"
  // in the accessible "View data" tables; now "15:00"/"09:00" to match
  // the heatmap axis and Shikho BDT convention.
  const formatHour24 = (h: number) => `${h.toString().padStart(2, "0")}:00`;
  const nonEmptyCells = erCells
    .map((c, i) => ({ er: c, reach: reachCells[i] }))
    .filter((pair) => pair.er.n > 0)
    .sort((a, b) => b.er.value - a.er.value);
  const erViewData = {
    columns: ["Day", "Hour", "Posts", "Eng Rate", "Total Reach"],
    rows: nonEmptyCells.map(({ er }) => [
      DAY_LABELS[er.day],
      formatHour24(er.hour),
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
        formatHour24(reach.hour),
        reach.n,
        Math.round(reach.value),
        Math.round(reach.totalReach),
      ]),
  };

  // R3 v2 (2026-05-02): Format × Hour matrix, computed for the ACTIVE
  // heat view metric. Format × Hour was lifted from /engagement so the
  // operator picks "when to post which format" on the same page they
  // pick "when to post in general". The matrix builder lives in
  // lib/aggregate; we map the page-level HeatView to its expected
  // FormatHourMetric type.
  const fhMetricMap: Record<HeatView, "reach" | "interactions" | "engagement" | "shares"> = {
    engagement: "engagement",
    reach: "reach",
    shares: "shares",
    interactions: "interactions",
  };
  const fhMatrix = formatHourMatrix(inRange, fhMetricMap[activeHeatView]);
  const fhFormats = Object.keys(fhMatrix)
    .filter((f) => Object.values(fhMatrix[f]).some((c) => c.n > 0))
    .sort((a, b) => {
      const na = Object.values(fhMatrix[a]).reduce((s, c) => s + c.n, 0);
      const nb = Object.values(fhMatrix[b]).reduce((s, c) => s + c.n, 0);
      return nb - na;
    });
  let fhMatrixMax = 0;
  for (const f of fhFormats) {
    for (const h of Object.keys(fhMatrix[f])) {
      const c = fhMatrix[f][Number(h)];
      if (c.n >= CELL_MIN_N && c.mean > fhMatrixMax) fhMatrixMax = c.mean;
    }
  }
  const FH_MATRIX_MIN_N = 2;
  const fhFormatValue = (mean: number, view: HeatView): string => {
    if (view === "engagement") return `${mean.toFixed(2)}%`;
    if (view === "shares") return `${mean.toFixed(1)} shares/post`;
    if (view === "interactions") return `${mean.toFixed(1)} interactions/post`;
    return `${Math.round(mean).toLocaleString()} reach/post`;
  };

  return (
    <div>
      <PageHeader title="Timing" subtitle="When to post for max reach and engagement" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} lastScrapedAt={runStatus.last_run_at} compact />
      <MetricSelector basePath="/timing" active={activeMetrics} preserve={searchParams} />

      {/* Sprint P7 v4.7 (2026-04-30, P2.21): synthesis hero above the 4
          best-day/hour cards. Same pattern as Engagement P1.3: leads
          with "what's the winning posting window" so the cold-read
          test passes without scanning four cards. The cards below
          stay as supporting per-metric evidence. */}
      {(bestDayReach || bestDayEng || bestHourReach || bestHourEng) && (
        <Card className="mb-4 border-l-4 border-l-brand-shikho-indigo">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Best posting window (Timing detail)
              </div>
              <a href="/" className="text-[10px] text-ink-muted hover:text-brand-shikho-indigo underline">
                See merged playbook on Overview →
              </a>
            </div>
            <div className="text-base sm:text-lg leading-snug text-ink-primary">
              {bestDayReach && bestDayEng && bestDayReach.label === bestDayEng.label ? (
                <span className="font-semibold text-brand-shikho-indigo">{bestDayReach.label}s</span>
              ) : (
                <>
                  {bestDayReach && (<><span className="font-semibold text-brand-cyan">{bestDayReach.label}s</span> for reach</>)}
                  {bestDayReach && bestDayEng && bestDayReach.label !== bestDayEng.label && ", "}
                  {bestDayEng && bestDayReach && bestDayReach.label !== bestDayEng.label && (<><span className="font-semibold text-brand-pink">{bestDayEng.label}s</span> for engagement</>)}
                </>
              )}
              {(bestHourReach || bestHourEng) && " around "}
              {bestHourReach && bestHourEng && bestHourReach.label === bestHourEng.label ? (
                <span className="font-semibold text-brand-shikho-indigo">{bestHourReach.label} BDT</span>
              ) : (
                <>
                  {bestHourReach && (<><span className="font-semibold text-brand-cyan">{bestHourReach.label} BDT</span> for reach</>)}
                  {bestHourReach && bestHourEng && bestHourReach.label !== bestHourEng.label && ", "}
                  {bestHourEng && bestHourReach && bestHourReach.label !== bestHourEng.label && (<><span className="font-semibold text-brand-pink">{bestHourEng.label} BDT</span> for engagement</>)}
                </>
              )}
              .
            </div>
            <div className="text-xs text-ink-muted">
              Each card below ranks by 95% CI lower bound — robust to single-post outliers. Heatmaps below break it out by day × hour cell.
            </div>
          </div>
        </Card>
      )}

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
            {(bestDayEng?.erSum.mean || 0).toFixed(2)}% avg engagement rate
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
            {(bestHourEng?.erSum.mean || 0).toFixed(2)}% avg engagement rate
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {reliabilityLabel(bestHourEng?.posts || 0)}
            {bestHourEng && isFinite(bestHourEng.erSum.lowerBound95) && bestHourEng.erSum.lowerBound95 > 0 && (
              <> · reliable floor {bestHourEng.erSum.lowerBound95.toFixed(2)}%</>
            )}
          </div>
        </Card>
      </div>

      {/* R3 promoted to default + Format×Hour added (2026-05-02 user feedback):
          ONE dynamic heatmap with TWO switchers above:
            - Dimension: Day × Hour | Format × Hour
            - Metric:    Engagement Rate | Avg Reach | Avg Shares | Avg Interactions
          URL params ?heat_dim and ?heat_view drive selection. Operator can
          deep-link any combination. Replaces the legacy 2-3 stacked
          heatmaps and the now-removed Format×Hour from /engagement. */}
      {(() => {
        const buildHref = (k: "heat_view" | "heat_dim", v: string): string => {
          const p = new URLSearchParams();
          for (const [pk, pv] of Object.entries(searchParams)) {
            if (pk === k) continue;
            if (typeof pv === "string") p.set(pk, pv);
            else if (Array.isArray(pv) && pv.length) p.set(pk, pv[0]);
          }
          p.set(k, v);
          return `/timing?${p.toString()}`;
        };
        type ViewMeta = {
          label: string;
          sublabel: string;
          minColor: string;
          maxColor: string;
          valueFormat: "percent" | "number";
          metricLabel: string;
          cells: HeatmapCell[];
          tagline: string;
        };
        const viewMeta: Record<HeatView, ViewMeta> = {
          engagement: {
            label: "Engagement Rate",
            sublabel: "Reach-weighted engagement rate per cell",
            minColor: "#FCEAF3",
            maxColor: "#C02080",
            valueFormat: "percent",
            metricLabel: "engagement rate",
            cells: erCells,
            tagline: "(Σ interactions ÷ Σ reach) × 100 per cell. Reach-weighted so a single viral post can't hijack a cell's color.",
          },
          reach: {
            label: "Avg Reach",
            sublabel: "Mean unique reach per post",
            minColor: "#EEF0FA",
            maxColor: "#304090",
            valueFormat: "number",
            metricLabel: "avg reach",
            cells: reachCells,
            tagline: "Σ reach ÷ N posts per cell. Pair with the engagement-rate view — a high-reach cell can still have low ER.",
          },
          shares: {
            label: "Avg Shares",
            sublabel: "Mean shares per post",
            minColor: "#FEF3D9",
            maxColor: "#E0A010",
            valueFormat: "number",
            metricLabel: "avg shares",
            cells: sharesCells,
            tagline: "Σ shares ÷ N posts per cell. Surfaces unpaid-distribution windows.",
          },
          interactions: {
            label: "Avg Interactions",
            sublabel: "Mean (reactions + comments + shares) per post",
            minColor: "#FCEAF3",
            maxColor: "#C02080",
            valueFormat: "number",
            metricLabel: "avg interactions",
            cells: interactionsCells,
            tagline: "Σ (reactions + comments + shares) ÷ N posts per cell. Combines all interaction types.",
          },
        };
        const current = viewMeta[activeHeatView];
        const dimLabel = activeHeatDim === "day" ? "Day × Hour" : "Format × Hour";
        return (
          <div className="mb-6">
            {/* TWO switchers stacked: dimension on top, metric below.
                Both are URL-driven so deep-link / refresh preserves selection. */}
            <nav
              aria-label="Heatmap dimension"
              className="mb-2 flex flex-wrap items-center gap-1.5"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mr-1">
                Dimension:
              </span>
              {(["day", "format"] as HeatDim[]).map((d) => {
                const isActive = d === activeHeatDim;
                const label = d === "day" ? "Day × Hour" : "Format × Hour";
                return (
                  <Link
                    key={d}
                    href={buildHref("heat_dim", d)}
                    scroll={false}
                    aria-pressed={isActive}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors duration-base ${
                      isActive
                        ? "bg-brand-shikho-indigo text-white border-brand-shikho-indigo shadow-sm"
                        : "bg-ink-paper text-ink-secondary border-ink-100 hover:border-brand-shikho-indigo hover:text-brand-shikho-indigo"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
            <nav
              aria-label="Heatmap metric"
              className="mb-3 flex flex-wrap items-center gap-1.5"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mr-1">
                Metric:
              </span>
              {(Object.keys(viewMeta) as HeatView[]).map((v) => {
                const isActive = v === activeHeatView;
                return (
                  <Link
                    key={v}
                    href={buildHref("heat_view", v)}
                    scroll={false}
                    aria-pressed={isActive}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors duration-base ${
                      isActive
                        ? "bg-brand-shikho-indigo text-white border-brand-shikho-indigo shadow-sm"
                        : "bg-ink-paper text-ink-secondary border-ink-100 hover:border-brand-shikho-indigo hover:text-brand-shikho-indigo"
                    }`}
                  >
                    {viewMeta[v].label}
                  </Link>
                );
              })}
            </nav>

            <ChartCard
              title={`${current.label} · ${dimLabel}`}
              kind={activeHeatView === "engagement" ? "derived" : "observed"}
              subtitle={current.sublabel + (activeHeatDim === "format" ? ` for each (format, publish hour) cell` : ` for each (day-of-week, publish hour) cell`)}
              definition={`${current.tagline} Color saturation encodes the value relative to the strongest cell. Cells with fewer than ${CELL_MIN_N} posts are dimmed (still visible so zero-post slots are distinguishable from low-confidence ones).`}
              sampleSize={
                activeHeatDim === "day"
                  ? `${totalCellsReliable} / ${totalCellsWithPosts} cells reliable (n≥${CELL_MIN_N}), ${inRange.length} posts total`
                  : `${fhFormats.length} format${fhFormats.length === 1 ? "" : "s"} × 24 hours, n = ${inRange.length} post${inRange.length === 1 ? "" : "s"}`
              }
              caption={
                activeHeatDim === "day"
                  ? "Read left-to-right for daily patterns, top-to-bottom for weekday patterns. Dark diagonal bands suggest consistent best-time windows. Bangladesh Time (UTC+6)."
                  : "Reels at 8pm behave nothing like Carousels at 8pm. Find the dark cells per format, not just overall."
              }
            >
              {totalCellsWithPosts === 0 ? (
                <EmptyChart
                  message="No posts in this date range"
                  hint="Widen the range or check that posts exist for this window."
                />
              ) : activeHeatDim === "day" ? (
                <Heatmap
                  cells={current.cells}
                  minN={CELL_MIN_N}
                  metricLabel={current.metricLabel}
                  valueFormat={current.valueFormat}
                  minColor={current.minColor}
                  maxColor={current.maxColor}
                />
              ) : (
                /* Format × Hour grid — inline render (matches Heatmap visual
                   language but rows are formats, not weekdays). Hours
                   compressed to 10–23 BDT (Shikho's posting window). */
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
                      {fhFormats.map((f) => (
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
                            const intensity = fhMatrixMax > 0 ? Math.min(1, mean / fhMatrixMax) : 0;
                            const isReliable = n >= FH_MATRIX_MIN_N;
                            const alpha = n === 0 ? 0 : isReliable ? intensity : intensity * 0.55;
                            const rgbStr =
                              activeHeatView === "engagement"
                                ? "192, 32, 128" // shikho-magenta-500
                                : activeHeatView === "shares"
                                  ? "224, 160, 16" // sunrise
                                  : activeHeatView === "interactions"
                                    ? "192, 32, 128" // magenta
                                    : "48, 64, 144"; // indigo
                            const bg = n === 0
                              ? "transparent"
                              : `rgba(${rgbStr}, ${Math.max(0.22, alpha)})`;
                            return (
                              <td
                                key={h}
                                className="px-0 py-0.5 text-center"
                                title={
                                  n === 0
                                    ? `${f} @ ${h.toString().padStart(2, "0")}:00 — no posts`
                                    : `${f} @ ${h.toString().padStart(2, "0")}:00 — ${fhFormatValue(mean, activeHeatView)} over ${n} post${n === 1 ? "" : "s"}${isReliable ? "" : " (low-n, dimmed)"}`
                                }
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
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-500 flex-wrap">
                    <span>Darker = higher {current.metricLabel}</span>
                    <span>·</span>
                    <span>Dashed outline = no posts in that cell</span>
                    <span>·</span>
                    <span>Faded fill = 1 post (low confidence)</span>
                    <span>·</span>
                    <span>BDT 10:00–24:00</span>
                  </div>
                </div>
              )}
            </ChartCard>
          </div>
        );
      })()}
    </div>
  );
}
