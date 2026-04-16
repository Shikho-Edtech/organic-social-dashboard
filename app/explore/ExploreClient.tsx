"use client";
import { useMemo, useState } from "react";
import type { Post, DailyMetric } from "@/lib/types";
import { computeKpis, filterPosts, dailyReach, topByReach, groupStats, bdt, reach, engagementRate, daysAgo } from "@/lib/aggregate";
import { Card, ChartCard } from "@/components/Card";
import KpiCard from "@/components/KpiCard";
import TrendChart from "@/components/TrendChart";
import BarChartBase from "@/components/BarChart";

type Props = { posts: Post[]; daily: DailyMetric[] };
type Preset = "7d" | "30d" | "90d" | "ytd" | "custom";

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

  const { start, end } = useMemo(() => {
    const end = new Date();
    if (preset === "7d") return { start: daysAgo(7), end };
    if (preset === "30d") return { start: daysAgo(30), end };
    if (preset === "90d") return { start: daysAgo(90), end };
    if (preset === "ytd") return { start: new Date(end.getFullYear(), 0, 1), end };
    if (preset === "custom" && customStart && customEnd) return { start: new Date(customStart), end: new Date(customEnd) };
    return { start: daysAgo(30), end };
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

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Explore</h1>
          <p className="text-sm text-slate-500 mt-1">Filter by any dimension, group by any dimension</p>
        </div>
      </div>

      {/* Filter panel */}
      <Card className="mb-6 !p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1">Range</span>
          {(["7d", "30d", "90d", "ytd", "custom"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                preset === p ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p === "ytd" ? "YTD" : p.toUpperCase()}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700" />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700" />
            </>
          )}
        </div>
        <FilterChips label="Pillar" options={uniqueValues(posts, "content_pillar")} selected={pillars} onChange={setPillars} />
        <FilterChips label="Format" options={uniqueValues(posts, "format")} selected={formats} onChange={setFormats} />
        <FilterChips label="Audience" options={uniqueValues(posts, "primary_audience")} selected={audiences} onChange={setAudiences} />
        <FilterChips label="Entity" options={uniqueValues(posts, "featured_entity")} selected={entities} onChange={setEntities} />
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Group by</span>
          <select value={groupByDim as string} onChange={(e) => setGroupByDim(e.target.value as keyof Post)} className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs text-slate-700">
            <option value="content_pillar">Pillar</option>
            <option value="format">Format</option>
            <option value="primary_audience">Audience</option>
            <option value="featured_entity">Entity</option>
            <option value="hook_type">Hook Type</option>
            <option value="visual_style">Visual Style</option>
            <option value="funnel_stage">Funnel Stage</option>
            <option value="language">Language</option>
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Posts" value={kpis.posts} />
        <KpiCard label="Total Reach" value={kpis.total_reach} />
        <KpiCard label="Avg Reach/Post" value={kpis.avg_reach_per_post} />
        <KpiCard label="Interactions" value={kpis.total_interactions} />
        <KpiCard label="Engagement Rate" value={kpis.avg_engagement_rate.toFixed(2) + "%"} />
      </div>

      <div className="mb-4">
        <ChartCard title="Reach Over Time" subtitle="Daily unique reach for current filter set" caption="Trend of daily unique reach for the posts matching your filters.">
          <TrendChart data={trend} />
        </ChartCard>
      </div>

      <div className="mb-4">
        <ChartCard title={`Performance by ${String(groupByDim).replace(/_/g, " ")}`} subtitle="Grouped by your selection" caption="Each bar shows total unique reach for that segment.">
          <BarChartBase data={grouped.slice(0, 12).map((g) => ({ label: g.key, value: g.total_reach }))} horizontal height={Math.max(200, grouped.slice(0, 12).length * 32)} colorByIndex />
        </ChartCard>
      </div>

      <Card>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Top 10 Posts</h3>
        <div className="space-y-3">
          {top.map((p) => (
            <div key={p.id} className="border-l-2 border-brand-cyan pl-3">
              <div className="text-sm font-medium text-slate-900">
                {Math.round(reach(p)).toLocaleString()} reach · {engagementRate(p).toFixed(2)}% engagement · {p.shares} shares
              </div>
              <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.message.slice(0, 160)}</div>
              <div className="text-xs text-slate-400 mt-1">
                <span className="text-brand-cyan">{p.content_pillar || "—"}</span> · {p.format || p.type} · {bdt(p.created_time).toISOString().slice(0, 10)}
                {p.featured_entity && p.featured_entity !== "None" && <span> · {p.featured_entity}</span>}
              </div>
            </div>
          ))}
          {top.length === 0 && <p className="text-sm text-slate-500">No posts match current filters.</p>}
        </div>
      </Card>
    </div>
  );
}

function FilterChips({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1 min-w-[50px]">{label}</span>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => onChange(active ? selected.filter((x) => x !== opt) : [...selected, opt])}
            className={`px-2 py-0.5 rounded-full text-xs ${
              active ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {opt}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button onClick={() => onChange([])} className="text-xs text-slate-400 hover:text-slate-700 ml-1">clear</button>
      )}
    </div>
  );
}
