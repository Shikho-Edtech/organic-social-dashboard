"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import type { Post, DailyMetric } from "@/lib/types";
import { computeKpis, filterPosts, dailyReach, dailyMetricTrend, groupStats, groupStatValue, groupStatCompositeScore, bdt, reach, engagementRate, daysAgo, sortByComposite, type RankingMetric } from "@/lib/aggregate";
import { Card, ChartCard } from "@/components/Card";
import TrendChart from "@/components/TrendChart";
import MultiLineTrendChart, { type MultiSeries } from "@/components/MultiLineTrendChart";
import BarChartBase from "@/components/BarChart";
import PostReference from "@/components/PostReference";
import { canonicalColor, type ColorField } from "@/lib/colors";

type Props = {
  posts: Post[];
  daily: DailyMetric[];
  /** Sprint P7 Phase 3: active ranking metrics from ?metric=... URL param.
   *  Composite-ranks post lists when 2+; falls back to single-metric sort
   *  when 1. Default ["reach"] preserves prior behavior. */
  activeMetrics?: RankingMetric[];
  /** Sprint P7 v3.5: optional positional weights from ?weights=... param.
   *  When omitted, equal-weight composite. */
  activeWeights?: number[];
  /** Sprint P7 v4.6 (2026-04-30, P0 finding #2): pipeline last_run_at for
   *  the "Data as of" stamp in the Explore header. Matches the rest of
   *  the dashboard so users can reconcile cross-page KPI freshness. */
  lastScrapedAt?: string;
};
type Preset = "7d" | "30d" | "90d" | "ytd" | "all" | "custom";

// Map the group-by dimension onto a canonical colour field so a bar for
// "Reel" on the Format grouping is pink wherever it appears. Dimensions
// with no canonical mapping (audience, visual_style, language) fall
// through to the hash-based palette.
function colorFieldFor(dim: keyof Post): ColorField {
  if (dim === "content_pillar") return "pillar";
  if (dim === "format") return "format";
  if (dim === "hook_type") return "hook";
  if (dim === "spotlight_type") return "spotlight";
  if (dim === "funnel_stage") return "funnel";
  return "pillar"; // fallback → hash-based palette
}

const PRESET_LABELS: Record<Preset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  all: "All time",
  custom: "Custom range",
};

const GROUP_BY_OPTIONS: { key: keyof Post; label: string }[] = [
  { key: "content_pillar", label: "Content Pillar" },
  { key: "format", label: "Format" },
  { key: "primary_audience", label: "Audience" },
  { key: "spotlight_type", label: "Spotlight Type" },
  { key: "spotlight_name", label: "Spotlight" },
  { key: "hook_type", label: "Hook Type" },
  { key: "visual_style", label: "Visual Style" },
  { key: "funnel_stage", label: "Funnel Stage" },
  { key: "language", label: "Language" },
];

function uniqueValues(posts: Post[], key: keyof Post): string[] {
  const set = new Set<string>();
  for (const p of posts) {
    const v = String(p[key] || "").trim();
    if (v && v !== "None") set.add(v);
  }
  return Array.from(set).sort();
}

export default function ExploreClient({ posts, activeMetrics = ["reach"], activeWeights, lastScrapedAt }: Props) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [groupByDim, setGroupByDim] = useState<keyof Post>("content_pillar");

  // Pagination for the promoted Top Posts list. Pg-Ex rebuild (Batch 3b):
  // was hardcoded to top 10, now pageable 25/50/100 so users can actually
  // scan deeper than the obvious winners — the point of a workbench.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);

  const { start, end, rangeLabel } = useMemo(() => {
    const end = new Date();
    if (preset === "7d") return { start: daysAgo(7), end, rangeLabel: "Last 7 days" };
    if (preset === "30d") return { start: daysAgo(30), end, rangeLabel: "Last 30 days" };
    if (preset === "90d") return { start: daysAgo(90), end, rangeLabel: "Last 90 days" };
    if (preset === "ytd") return { start: new Date(end.getFullYear(), 0, 1), end, rangeLabel: "Year to date" };
    if (preset === "all") return { start: new Date(2000, 0, 1), end, rangeLabel: "All time" };
    if (preset === "custom" && customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd), rangeLabel: `${customStart} → ${customEnd}` };
    }
    return { start: daysAgo(30), end, rangeLabel: "Last 30 days" };
  }, [preset, customStart, customEnd]);

  const filtered = useMemo(
    () => filterPosts(posts, {
      start, end,
      pillars: pillars.length ? pillars : undefined,
      formats: formats.length ? formats : undefined,
      audiences: audiences.length ? audiences : undefined,
      spotlightNames: entities.length ? entities : undefined,
    }),
    [posts, start, end, pillars, formats, audiences, entities]
  );

  const kpis = computeKpis(filtered);
  // Sprint P7 QA pass (2026-04-28): trend chart re-keys to active primary
  // metric. Multi-line composite is v3.5; for v1 the chart shows the
  // first active metric.
  const primaryMetric = activeMetrics[0];
  const isComposite = activeMetrics.length > 1;
  const metricLabelFull: Record<RankingMetric, string> = {
    reach: "Reach",
    interactions: "Interactions",
    engagement: "Engagement Rate",
    shares: "Shares",
  };
  const metricLabelLower: Record<RankingMetric, string> = {
    reach: "reach",
    interactions: "interactions",
    engagement: "engagement rate",
    shares: "shares",
  };
  const trend = dailyMetricTrend(filtered, primaryMetric).map((d) => ({
    date: d.date.slice(5),
    value: d.value,
  }));
  // Sprint P7 v4.5 (2026-04-30): multi-line composite trend on Explore.
  // Same pattern as Overview/Trends — each series normalized to % of its
  // own peak so unit-mismatched metrics share one y-axis. formatKind
  // (not formatter — see LEARNINGS 2026-04-30 for why function props
  // can't cross the Server→Client boundary; ExploreClient is a "use
  // client" component but we keep the same pattern for consistency).
  const METRIC_COLORS_EXPLORE: Record<RankingMetric, string> = {
    reach: "#304090",
    interactions: "#C02080",
    engagement: "#1A8E78",
    shares: "#E0A010",
  };
  const compositeTrendSeries: MultiSeries[] = isComposite
    ? activeMetrics.map((m) => ({
        name: metricLabelFull[m],
        color: METRIC_COLORS_EXPLORE[m],
        data: dailyMetricTrend(filtered, m).map((d) => ({
          date: d.date.slice(5),
          value: d.value,
        })),
        formatKind: m === "engagement" ? "percent" : "number",
      }))
    : [];
  // Full sorted list so pagination can walk past the top 10.
  // Sprint P7 Phase 3: composite-rank when 2+ metrics active. The
  // existing variable name `sortedByReach` keeps the diff small —
  // semantically it's now "sortedByActiveMetrics" but rename is risky
  // given how many references exist; the value is the same shape
  // (Post[] descending by score).
  const sortedByReach = useMemo(
    () => sortByComposite(filtered, activeMetrics, activeWeights),
    [filtered, activeMetrics, activeWeights]
  );
  const grouped = groupStats(filtered, groupByDim);

  // Reset to page 1 whenever the filter set changes — otherwise an 8-post
  // filter with page=3 silently renders an empty list.
  useEffect(() => {
    setPage(1);
  }, [filtered.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedByReach.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pagePosts = sortedByReach.slice(pageStart, pageStart + pageSize);

  const totalFilters = pillars.length + formats.length + audiences.length + entities.length;
  const groupByLabel = GROUP_BY_OPTIONS.find((o) => o.key === groupByDim)?.label || String(groupByDim);

  const pillarOptions = useMemo(() => uniqueValues(posts, "content_pillar"), [posts]);
  const formatOptions = useMemo(() => uniqueValues(posts, "format"), [posts]);
  const audienceOptions = useMemo(() => uniqueValues(posts, "primary_audience"), [posts]);
  const entityOptions = useMemo(() => uniqueValues(posts, "spotlight_name"), [posts]);

  function clearAll() {
    setPillars([]); setFormats([]); setAudiences([]); setEntities([]);
  }

  return (
    <div>
      {/* Header — mirrors PageHeader: mobile stacks title above picker,
          picker self-aligns right. sm+: side by side at far edges. */}
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Explore</h1>
            <p className="text-sm text-slate-500 mt-1">Filter by any dimension, group by any dimension</p>
          </div>
          <div className="flex flex-col items-end gap-2 self-end sm:self-auto">
            <RangeDropdown
              preset={preset}
              setPreset={setPreset}
              customStart={customStart}
              customEnd={customEnd}
              setCustomStart={setCustomStart}
              setCustomEnd={setCustomEnd}
            />
            <div className="text-xs text-slate-500">{rangeLabel}</div>
            {/* Sprint P7 v4.6 (2026-04-30, P0 finding #2): "Data as of"
                stamp matching the rest of the dashboard. Reconciles
                cross-page KPI freshness when Overview/Explore caches are
                hit at different times. */}
            {lastScrapedAt && (
              <div className="text-[11px] text-slate-500">
                Data as of: <span className="font-medium">{new Date(lastScrapedAt).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} BDT</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter toolbar — filter-first workbench.
          Desktop (sm+): sticky at top-[104px]→top-24 under the nav so the
          workbench controls stay reachable while scrolling the result list.
          Z-30 keeps it above chart content without fighting nav (z-50).
          Mobile (< sm): NOT sticky. A stacked filter bar + an opened dropdown
          previously ate ~550px of chrome under a 104px nav on 780px phones —
          the filter bar was taller than the remaining content. Mobile users
          scroll-to-top to refine filters; the tradeoff is worth the page not
          being swallowed. Chips wrap horizontally (flex-wrap) so the bar is
          ~2-3 rows on mobile instead of 10 stacked rows. */}
      <div className="sm:sticky sm:top-[104px] md:top-24 z-30 -mx-6 px-6 py-3 mb-6 bg-slate-50/95 sm:backdrop-blur border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:mr-1">Filter</span>
          <MultiSelect label="Content Pillar" options={pillarOptions} selected={pillars} onChange={setPillars} />
          <MultiSelect label="Format" options={formatOptions} selected={formats} onChange={setFormats} />
          <MultiSelect label="Audience" options={audienceOptions} selected={audiences} onChange={setAudiences} />
          <MultiSelect label="Spotlight" options={entityOptions} selected={entities} onChange={setEntities} searchable />
          <div className="hidden sm:block h-6 w-px bg-slate-200 mx-1" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Group by</span>
          <GroupBySelect value={groupByDim} onChange={setGroupByDim} />
          <div className="sm:ml-auto flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500 w-full sm:w-auto">
            <span>
              <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span> posts match
            </span>
            {totalFilters > 0 && (
              <button
                onClick={clearAll}
                className="text-slate-500 hover:text-slate-800 underline underline-offset-2 py-2"
              >
                Clear {totalFilters} filter{totalFilters > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compact KPI strip — demoted from 5 full cards to a single
          divided row. Explore is filter-first; the numbers are a summary
          of the result set, not the headline. Big numbers stole attention
          from the workbench work (filter → find post). */}
      <Card className="mb-6 !p-0">
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-slate-100">
          <StatCell label="Posts" value={kpis.posts.toLocaleString()} />
          <StatCell label="Total Reach" value={kpis.total_reach.toLocaleString()} />
          <StatCell label="Avg Reach/Post" value={Math.round(kpis.avg_reach_per_post).toLocaleString()} />
          <StatCell label="Interactions" value={kpis.total_interactions.toLocaleString()} />
          <StatCell label="Engagement Rate" value={kpis.avg_engagement_rate.toFixed(2) + "%"} />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <div className="text-slate-500 mb-2">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <div className="text-sm font-medium text-slate-700">No posts match your filters</div>
            <p className="text-xs text-slate-500 mt-1">Try removing a filter or widening the date range.</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Sprint P6 chunk 5 (2026-04-23): reverted Batch 3b's Top-Posts-first
              reorder. User feedback is that Performance-by-X and Reach-Over-Time
              give the instant "does this filter make sense?" read, and the
              post list is the deep-dive after. Chart cards sit under the
              filter controls; Top Posts drops to the bottom of the scroll. */}
          {/* Sprint P7 QA pass (2026-04-28): both charts re-key to the
              active page-level metric. Single-metric: bar values are the
              metric's total/mean per segment. Multi-metric: bars show
              composite percentile rank (0–100). Trend chart shows the
              first active metric's daily series. */}
          <div className="mb-6">
            <ChartCard
              title={
                isComposite
                  ? `Performance by ${groupByLabel} · Composite of ${activeMetrics.map((m) => metricLabelFull[m]).join(", ")}`
                  : `Performance by ${groupByLabel}`
              }
              kind="ai"
              subtitle={
                isComposite
                  ? `Ranked by composite of ${activeMetrics.length} metrics: ${activeMetrics.map((m) => metricLabelLower[m]).join(" · ")}`
                  : `${primaryMetric === "engagement" ? "Mean" : "Total"} ${metricLabelLower[primaryMetric]} by segment`
              }
              caption={
                isComposite
                  ? `Bars show each segment's average percentile rank across the selected metrics. Higher = stronger on more dimensions.`
                  : `Each bar is the ${primaryMetric === "engagement" ? "mean" : "sum"} ${metricLabelLower[primaryMetric]} for posts in that ${groupByLabel.toLowerCase()} segment. Percentage shown is share of total ${metricLabelLower[primaryMetric]} across segments shown.`
              }
            >
              <BarChartBase
                data={(() => {
                  // Sort by active metric (single) or composite (multi),
                  // take top 12, build chart data with metric-specific
                  // values + percent semantics.
                  const ranked = isComposite
                    ? [...grouped].sort(
                        (a, b) =>
                          groupStatCompositeScore(b, activeMetrics, grouped, activeWeights) -
                          groupStatCompositeScore(a, activeMetrics, grouped, activeWeights),
                      )
                    : [...grouped].sort(
                        (a, b) =>
                          groupStatValue(b, primaryMetric) - groupStatValue(a, primaryMetric),
                      );
                  return ranked.slice(0, 12).map((g) => ({
                    label: g.key || "Unknown",
                    value: isComposite
                      ? Math.round(groupStatCompositeScore(g, activeMetrics, grouped, activeWeights) * 100)
                      : groupStatValue(g, primaryMetric),
                    color: canonicalColor(colorFieldFor(groupByDim), g.key),
                  }));
                })()}
                horizontal
                height={Math.max(200, Math.min(12, grouped.length) * 34)}
                metricName={isComposite ? `Composite (${activeMetrics.map((m) => metricLabelFull[m]).join(" + ")})` : metricLabelFull[primaryMetric]}
                valueAxisLabel={isComposite ? `Composite score · ${activeMetrics.map((m) => metricLabelFull[m]).join(" / ")}` : metricLabelFull[primaryMetric]}
                showPercent={!isComposite}
                compositeBreakdown={isComposite ? (() => {
                  // Sprint P7 v4 (2026-04-29): per-bar percentile breakdown for
                  // the composite-mode tooltip. Computed once per render across
                  // the full grouped population (not the top-12 slice) so the
                  // percentile rank is honest.
                  const sortedByMetric: Record<string, number[]> = {};
                  for (const m of activeMetrics) {
                    sortedByMetric[m] = grouped.map((g) => groupStatValue(g, m)).sort((a, b) => a - b);
                  }
                  const rawWeights = activeWeights && activeWeights.length === activeMetrics.length
                    ? activeWeights
                    : activeMetrics.map(() => 1);
                  const totalW = rawWeights.reduce((s, x) => s + Math.max(0, x), 0) || 1;
                  const normalized = rawWeights.map((w) => (Math.max(0, w) / totalW) * 100);
                  const out: Record<string, Array<{ name: string; percentile: number; weight: number; raw?: string }>> = {};
                  for (const g of grouped) {
                    const label = g.key || "Unknown";
                    out[label] = activeMetrics.map((m, i) => {
                      const value = groupStatValue(g, m);
                      const sorted = sortedByMetric[m];
                      let lo = 0, hi = sorted.length;
                      while (lo < hi) {
                        const mid = (lo + hi) >>> 1;
                        if (sorted[mid] < value) lo = mid + 1; else hi = mid;
                      }
                      const percentile = sorted.length > 0 ? (lo / sorted.length) * 100 : 0;
                      return {
                        name: metricLabelFull[m],
                        percentile,
                        weight: normalized[i],
                        raw: m === "engagement" ? `${value.toFixed(2)}%` : Math.round(value).toLocaleString(),
                      };
                    });
                  }
                  return out;
                })() : undefined}
              />
            </ChartCard>
          </div>

          <div className="mb-6">
            <ChartCard
              title={
                isComposite
                  ? `Composite Trend (${activeMetrics.length} metrics, normalized)`
                  : `${metricLabelFull[primaryMetric]} Over Time`
              }
              kind="observed"
              subtitle={
                isComposite
                  ? "Each line normalized to % of its own peak — shapes are comparable, raw values shown in tooltip"
                  : `Daily ${metricLabelLower[primaryMetric]} for the current filter set`
              }
              caption={
                isComposite
                  ? "Shapes diverge → metrics tell different stories that day. Shapes track → metrics correlate. Gaps indicate days with no qualifying posts."
                  : `Trend of daily ${metricLabelLower[primaryMetric]} for the posts matching your filters. Gaps indicate days with no qualifying posts.`
              }
            >
              {isComposite ? (
                <MultiLineTrendChart series={compositeTrendSeries} />
              ) : (
                <TrendChart
                  data={trend}
                  metricName={metricLabelFull[primaryMetric]}
                  valueAxisLabel={metricLabelFull[primaryMetric]}
                />
              )}
            </ChartCard>
          </div>

          <Card className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Top Posts</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeMetrics.length === 1
                    ? `Ranked by ${{ reach: "unique reach", interactions: "total interactions", engagement: "engagement rate", shares: "shares" }[activeMetrics[0]]}`
                    : `Ranked by composite (${activeMetrics.length} metrics, equal weight)`}
                  {" · "}{sortedByReach.length.toLocaleString()} matching
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Show</span>
                {([25, 50, 100] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setPageSize(size)}
                    className={`px-2.5 py-1 rounded-md border transition-colors ${
                      pageSize === size
                        ? "bg-brand-shikho-indigo/5 border-brand-shikho-indigo/30 text-brand-shikho-indigo font-semibold"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {pagePosts.map((p, idx) => (
                <div key={p.id} className="border-l-2 border-brand-shikho-pink pl-3 py-1">
                  <div className="text-sm font-medium text-slate-900">
                    <span className="text-slate-400 font-semibold mr-2 tabular-nums">#{pageStart + idx + 1}</span>
                    <span className="text-brand-shikho-indigo font-semibold">{Math.round(reach(p)).toLocaleString()}</span> reach
                    <span className="text-slate-300 mx-1.5">·</span>
                    <span>{engagementRate(p).toFixed(2)}% engagement</span>
                    <span className="text-slate-300 mx-1.5">·</span>
                    <span>{(p.shares || 0).toLocaleString()} share{p.shares === 1 ? "" : "s"}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    <PostReference caption={p.message} permalinkUrl={p.permalink_url} maxChars={160} className="w-full" />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1.5 flex flex-wrap items-center gap-x-1.5">
                    <span className="text-brand-shikho-pink font-medium">{p.content_pillar || "—"}</span>
                    <span>·</span>
                    <span className="text-slate-500">{p.format || p.type}</span>
                    <span>·</span>
                    <span>{bdt(p.created_time).toISOString().slice(0, 10)}</span>
                    {p.spotlight_name && (
                      <>
                        <span>·</span>
                        <span className="text-brand-shikho-orange">
                          {p.spotlight_name}
                          {p.spotlight_type && p.spotlight_type !== "None" && (
                            <span className="text-slate-500 font-normal"> ({p.spotlight_type})</span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Page nav. Only shows when there's more than one page — a
                single-page filter shouldn't carry the UI overhead. */}
            {totalPages > 1 && (
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                <button
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <div className="text-slate-500 tabular-nums">
                  Page <span className="font-semibold text-slate-700">{currentPage}</span> of {totalPages}
                  <span className="hidden sm:inline">
                    {" · "}showing {pageStart + 1}–{Math.min(pageStart + pageSize, sortedByReach.length)}
                  </span>
                </div>
                <button
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------- Compact stat cell (KPI strip) -------- */
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 break-words leading-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

/* -------- Range dropdown (local, syncs to state) -------- */
function RangeDropdown({
  preset, setPreset, customStart, customEnd, setCustomStart, setCustomEnd,
}: {
  preset: Preset;
  setPreset: (p: Preset) => void;
  customStart: string;
  customEnd: string;
  setCustomStart: (s: string) => void;
  setCustomEnd: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const displayLabel = preset === "custom" && customStart && customEnd
    ? `${customStart} → ${customEnd}`
    : PRESET_LABELS[preset];

  const presetOrder: Preset[] = ["7d", "30d", "90d", "ytd", "all"];

  function applyCustom() {
    if (customStart && customEnd) {
      setPreset("custom");
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Date range: ${displayLabel}. Click to change.`}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span className="font-medium">{displayLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="py-1">
            {presetOrder.map((k) => (
              <button
                key={k}
                onClick={() => { setPreset(k); setOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  preset === k
                    ? "bg-brand-shikho-indigo/5 text-brand-shikho-indigo font-semibold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {preset === k && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  <span className={preset === k ? "" : "ml-[18px]"}>{PRESET_LABELS[k]}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Custom range</div>
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-brand-shikho-indigo" />
              <span className="text-xs text-slate-500">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-brand-shikho-indigo" />
            </div>
            <button
              onClick={applyCustom}
              disabled={!customStart || !customEnd}
              className="mt-2 w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-brand-shikho-indigo text-white hover:bg-brand-shikho-blue disabled:bg-slate-300 disabled:text-slate-500 transition-colors"
            >
              Apply custom range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------- Multi-select dropdown -------- */
function MultiSelect({
  label, options, selected, onChange, searchable,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = searchable && query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt]);
  }

  const count = selected.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={count > 0 ? `${label}: ${count} selected. Click to change.` : `Filter by ${label}`}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
          count > 0
            ? "bg-brand-shikho-indigo/5 border-brand-shikho-indigo/30 text-brand-shikho-indigo font-semibold"
            : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <span>{label}</span>
        {count > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-brand-shikho-indigo text-white text-[11px] font-semibold leading-none">
            {count}
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
            {count > 0 && (
              <button onClick={() => onChange([])} className="text-[11px] text-slate-500 hover:text-slate-800 underline underline-offset-2">
                Clear
              </button>
            )}
          </div>
          {searchable && (
            <div className="px-3 py-2 border-b border-slate-100">
              <input
                type="text"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-brand-shikho-indigo"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-slate-500 text-center">No matches</div>
            )}
            {filtered.map((opt) => {
              const active = selected.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggle(opt)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                    active ? "bg-brand-shikho-indigo/5 text-brand-shikho-indigo font-medium" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    active ? "bg-brand-shikho-indigo border-brand-shikho-indigo" : "bg-white border-slate-300"
                  }`}>
                    {active && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </span>
                  <span className="break-words text-left">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------- Group By single-select dropdown -------- */
function GroupBySelect({
  value, onChange,
}: {
  value: keyof Post;
  onChange: (v: keyof Post) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = GROUP_BY_OPTIONS.find((o) => o.key === value)?.label || String(value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Group by: ${current}. Click to change.`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors font-medium"
      >
        <span>{current}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden py-1">
          {GROUP_BY_OPTIONS.map((o) => (
            <button
              key={o.key as string}
              onClick={() => { onChange(o.key); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                value === o.key
                  ? "bg-brand-shikho-indigo/5 text-brand-shikho-indigo font-semibold"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
