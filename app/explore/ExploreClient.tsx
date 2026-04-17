"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import type { Post, DailyMetric } from "@/lib/types";
import { computeKpis, filterPosts, dailyReach, topByReach, groupStats, bdt, reach, engagementRate, daysAgo } from "@/lib/aggregate";
import { Card, ChartCard } from "@/components/Card";
import KpiCard from "@/components/KpiCard";
import TrendChart from "@/components/TrendChart";
import BarChartBase from "@/components/BarChart";

type Props = { posts: Post[]; daily: DailyMetric[] };
type Preset = "7d" | "30d" | "90d" | "ytd" | "all" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  all: "All time",
  custom: "Custom range",
};

const GROUP_BY_OPTIONS: { key: keyof Post; label: string }[] = [
  { key: "content_pillar", label: "Pillar" },
  { key: "format", label: "Format" },
  { key: "primary_audience", label: "Audience" },
  { key: "featured_entity", label: "Entity" },
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

export default function ExploreClient({ posts }: Props) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [groupByDim, setGroupByDim] = useState<keyof Post>("content_pillar");

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
      entities: entities.length ? entities : undefined,
    }),
    [posts, start, end, pillars, formats, audiences, entities]
  );

  const kpis = computeKpis(filtered);
  const trend = dailyReach(filtered).map((d) => ({ date: d.date.slice(5), value: d.reach }));
  const top = topByReach(filtered, 10);
  const grouped = groupStats(filtered, groupByDim);

  const totalFilters = pillars.length + formats.length + audiences.length + entities.length;
  const groupByLabel = GROUP_BY_OPTIONS.find((o) => o.key === groupByDim)?.label || String(groupByDim);

  return (
    <div>
      {/* Header: matches other pages */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Explore</h1>
            <p className="text-sm text-slate-500 mt-1">Filter by any dimension, group by any dimension</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <RangeDropdown
              preset={preset}
              setPreset={setPreset}
              customStart={customStart}
              customEnd={customEnd}
              setCustomStart={setCustomStart}
              setCustomEnd={setCustomEnd}
            />
            <div className="text-xs text-slate-500">{rangeLabel}</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Posts" value={kpis.posts} />
        <KpiCard label="Total Reach" value={kpis.total_reach} />
        <KpiCard label="Avg Reach/Post" value={kpis.avg_reach_per_post} />
        <KpiCard label="Interactions" value={kpis.total_interactions} />
        <KpiCard label="Engagement Rate" value={kpis.avg_engagement_rate.toFixed(2) + "%"} />
      </div>

      {/* Filters + Group by */}
      <Card className="mb-6 !p-0">
        <FilterPanel
          posts={posts}
          pillars={pillars}
          setPillars={setPillars}
          formats={formats}
          setFormats={setFormats}
          audiences={audiences}
          setAudiences={setAudiences}
          entities={entities}
          setEntities={setEntities}
          totalFilters={totalFilters}
        />
        <div className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50/60 border-t border-slate-100 rounded-b-xl">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Group by</span>
            <select
              value={groupByDim as string}
              onChange={(e) => setGroupByDim(e.target.value as keyof Post)}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 font-medium focus:outline-none focus:border-brand-shikho-indigo"
            >
              {GROUP_BY_OPTIONS.map((o) => (
                <option key={o.key as string} value={o.key as string}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{filtered.length.toLocaleString()}</span> posts match
            {totalFilters > 0 && <span className="text-slate-400"> · {totalFilters} filter{totalFilters > 1 ? "s" : ""} active</span>}
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <div className="text-slate-400 mb-2">
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
          <div className="mb-4">
            <ChartCard
              title="Reach Over Time"
              subtitle="Daily unique reach for the current filter set"
              caption="Trend of daily unique reach for the posts matching your filters. Gaps indicate days with no qualifying posts."
            >
              <TrendChart data={trend} metricName="Reach" valueAxisLabel="Unique reach" />
            </ChartCard>
          </div>

          <div className="mb-4">
            <ChartCard
              title={`Performance by ${groupByLabel}`}
              subtitle="Total unique reach by segment"
              caption={`Each bar is the sum of unique reach for posts in that ${groupByLabel.toLowerCase()} segment. Percentage shown is share of total reach across segments shown.`}
            >
              <BarChartBase
                data={grouped.slice(0, 12).map((g) => ({ label: g.key || "Unknown", value: g.total_reach }))}
                horizontal
                height={Math.max(200, Math.min(12, grouped.length) * 34)}
                colorByIndex
                metricName="Reach"
                valueAxisLabel="Unique reach"
                showPercent
              />
            </ChartCard>
          </div>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Top 10 Posts</h3>
                <p className="text-xs text-slate-500 mt-0.5">Ranked by unique reach in the current filter set</p>
              </div>
            </div>
            <div className="space-y-3">
              {top.map((p) => (
                <div key={p.id} className="border-l-2 border-brand-shikho-pink pl-3 py-1">
                  <div className="text-sm font-medium text-slate-900">
                    <span className="text-brand-shikho-indigo font-semibold">{Math.round(reach(p)).toLocaleString()}</span> reach
                    <span className="text-slate-300 mx-1.5">·</span>
                    <span>{engagementRate(p).toFixed(2)}% engagement</span>
                    <span className="text-slate-300 mx-1.5">·</span>
                    <span>{p.shares} shares</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1 line-clamp-2">{p.message.slice(0, 200)}</div>
                  <div className="text-[11px] text-slate-400 mt-1.5 flex flex-wrap items-center gap-x-1.5">
                    <span className="text-brand-shikho-pink font-medium">{p.content_pillar || "—"}</span>
                    <span>·</span>
                    <span className="text-slate-500">{p.format || p.type}</span>
                    <span>·</span>
                    <span>{bdt(p.created_time).toISOString().slice(0, 10)}</span>
                    {p.featured_entity && p.featured_entity !== "None" && (
                      <>
                        <span>·</span>
                        <span className="text-brand-shikho-orange">{p.featured_entity}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
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
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
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
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span className="font-medium">{displayLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
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
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Custom range</div>
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-brand-shikho-indigo" />
              <span className="text-xs text-slate-400">to</span>
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

/* -------- Collapsible filter panel -------- */
function FilterPanel({
  posts, pillars, setPillars, formats, setFormats, audiences, setAudiences, entities, setEntities, totalFilters,
}: {
  posts: Post[];
  pillars: string[]; setPillars: (v: string[]) => void;
  formats: string[]; setFormats: (v: string[]) => void;
  audiences: string[]; setAudiences: (v: string[]) => void;
  entities: string[]; setEntities: (v: string[]) => void;
  totalFilters: number;
}) {
  const [open, setOpen] = useState(true);

  function clearAll() {
    setPillars([]); setFormats([]); setAudiences([]); setEntities([]);
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 border-b border-slate-100"
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          <span className="text-sm font-semibold text-slate-700">Filters</span>
          {totalFilters > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-brand-shikho-indigo text-white text-[10px] font-semibold">
              {totalFilters}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {totalFilters > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); clearAll(); }}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Clear all
            </span>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-5 py-4 space-y-3">
          <FilterChips label="Pillar" options={uniqueValues(posts, "content_pillar")} selected={pillars} onChange={setPillars} />
          <FilterChips label="Format" options={uniqueValues(posts, "format")} selected={formats} onChange={setFormats} />
          <FilterChips label="Audience" options={uniqueValues(posts, "primary_audience")} selected={audiences} onChange={setAudiences} />
          <FilterChips label="Entity" options={uniqueValues(posts, "featured_entity")} selected={entities} onChange={setEntities} collapseAfter={14} />
        </div>
      )}
    </div>
  );
}

function FilterChips({
  label, options, selected, onChange, collapseAfter,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  collapseAfter?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (options.length === 0) return null;
  const visible = collapseAfter && !showAll ? options.slice(0, collapseAfter) : options;
  const hiddenCount = collapseAfter && !showAll ? options.length - collapseAfter : 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1 min-w-[56px]">{label}</span>
      {visible.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => onChange(active ? selected.filter((x) => x !== opt) : [...selected, opt])}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
              active
                ? "bg-brand-shikho-indigo text-white font-semibold"
                : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {opt}
          </button>
        );
      })}
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
        >
          +{hiddenCount} more
        </button>
      )}
      {showAll && collapseAfter && options.length > collapseAfter && (
        <button
          onClick={() => setShowAll(false)}
          className="text-xs text-slate-400 hover:text-slate-700"
        >
          show less
        </button>
      )}
      {selected.length > 0 && (
        <button onClick={() => onChange([])} className="text-xs text-slate-400 hover:text-slate-700 ml-1">
          clear
        </button>
      )}
    </div>
  );
}
