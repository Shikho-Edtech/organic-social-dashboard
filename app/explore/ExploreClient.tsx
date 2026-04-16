"use client";
import { useMemo, useState } from "react";
import type { Post, DailyMetric } from "@/lib/types";
import { computeKpis, filterPosts, dailyReach, topByReach, groupStats, bdt, reach, engagementRate, daysAgo } from "@/lib/aggregate";
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
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);
  const [groupByDim, setGroupByDim] = useState<keyof Post>("content_pillar");

  // Date range based on preset
  const { start, end } = useMemo(() => {
    const end = new Date();
    if (preset === "7d") return { start: daysAgo(7), end };
    if (preset === "30d") return { start: daysAgo(30), end };
    if (preset === "90d") return { start: daysAgo(90), end };
    if (preset === "ytd") return { start: new Date(end.getFullYear(), 0, 1), end };
    if (preset === "custom" && customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd) };
    }
    return { start: daysAgo(30), end };
  }, [preset, customStart, customEnd]);

  const filtered = useMemo(
    () =>
      filterPosts(posts, {
        start,
        end,
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

  const pillarOptions = uniqueValues(posts, "content_pillar");
  const formatOptions = uniqueValues(posts, "format");
  const audienceOptions = uniqueValues(posts, "primary_audience");
  const entityOptions = uniqueValues(posts, "featured_entity");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Explore</h1>
        <div className="text-sm text-slate-500">Filter anything, group anything.</div>
      </div>

      {/* Filter bar */}
      <div className="bg-ink-800 rounded-lg p-4 space-y-3">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 uppercase tracking-wider mr-2">Date range</span>
          {(["7d", "30d", "90d", "ytd", "custom"] as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                preset === p ? "bg-accent-cyan text-white" : "bg-ink-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              {p === "ytd" ? "YTD" : p.toUpperCase()}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2 py-1 bg-ink-900 text-slate-300 rounded text-xs border border-ink-700" />
              <span className="text-slate-500">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2 py-1 bg-ink-900 text-slate-300 rounded text-xs border border-ink-700" />
            </>
          )}
        </div>

        {/* Multi-select chips */}
        <FilterChips label="Pillar" options={pillarOptions} selected={pillars} onChange={setPillars} />
        <FilterChips label="Format" options={formatOptions} selected={formats} onChange={setFormats} />
        <FilterChips label="Audience" options={audienceOptions} selected={audiences} onChange={setAudiences} />
        <FilterChips label="Entity" options={entityOptions} selected={entities} onChange={setEntities} />

        <div className="flex items-center gap-2 pt-2 border-t border-ink-700">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Group by</span>
          <select value={groupByDim as string} onChange={(e) => setGroupByDim(e.target.value as keyof Post)} className="px-2 py-1 bg-ink-900 text-slate-300 rounded text-xs border border-ink-700">
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Posts" value={kpis.posts} tone="purple" />
        <KpiCard label="Total reach" value={kpis.total_reach} tone="cyan" />
        <KpiCard label="Avg reach/post" value={kpis.avg_reach_per_post} tone="blue" />
        <KpiCard label="Interactions" value={kpis.total_interactions} tone="orange" />
        <KpiCard label="Engagement rate" value={kpis.avg_engagement_rate.toFixed(2) + "%"} tone="pink" />
      </div>

      {/* Trend */}
      <div className="bg-ink-800 rounded-lg p-5">
        <div className="text-slate-100 font-semibold mb-3">Reach over time</div>
        <TrendChart data={trend} />
      </div>

      {/* Group by chart */}
      <div className="bg-ink-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-slate-100 font-semibold">Performance by {String(groupByDim).replace(/_/g, " ")}</div>
          <div className="text-xs text-slate-500">Sorted by total reach</div>
        </div>
        <BarChartBase
          data={grouped.slice(0, 12).map((g) => ({ label: g.key, value: g.total_reach }))}
          horizontal
          height={Math.max(180, grouped.slice(0, 12).length * 28)}
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider">
                <th className="text-left py-2 font-medium">Segment</th>
                <th className="text-right font-medium">Posts</th>
                <th className="text-right font-medium">Total reach</th>
                <th className="text-right font-medium">Avg reach/post</th>
                <th className="text-right font-medium">Engagement rate</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {grouped.map((g) => (
                <tr key={g.key} className="border-t border-ink-700">
                  <td className="py-2">{g.key}</td>
                  <td className="text-right">{g.count}</td>
                  <td className="text-right">{g.total_reach.toLocaleString()}</td>
                  <td className="text-right">{g.avg_reach_per_post.toLocaleString()}</td>
                  <td className="text-right">{g.avg_engagement_rate.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top posts */}
      <div className="bg-ink-800 rounded-lg p-5">
        <div className="text-slate-100 font-semibold mb-3">Top 10 posts</div>
        <div className="space-y-3">
          {top.map((p) => (
            <div key={p.id} className="border-l-2 border-accent-cyan pl-3">
              <div className="text-sm font-medium text-slate-300">
                {Math.round(reach(p)).toLocaleString()} reach · {engagementRate(p).toFixed(2)}% engagement · {p.shares} shares
              </div>
              <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.message.slice(0, 160)}</div>
              <div className="text-xs text-slate-500 mt-1">
                <span className="text-accent-cyan">{p.content_pillar || "—"}</span> · {p.format || p.type} · {bdt(p.created_time).toISOString().slice(0, 10)}
                {p.featured_entity && p.featured_entity !== "None" && <span> · {p.featured_entity}</span>}
              </div>
            </div>
          ))}
          {top.length === 0 && <div className="text-slate-500 text-sm">No posts match the current filters.</div>}
        </div>
      </div>
    </div>
  );
}

function FilterChips({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500 uppercase tracking-wider mr-2 min-w-[60px]">{label}</span>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => onChange(active ? selected.filter((x) => x !== opt) : [...selected, opt])}
            className={`px-2.5 py-0.5 rounded-full text-xs ${
              active ? "bg-accent-cyan text-white" : "bg-ink-900 text-slate-400 hover:text-slate-200 border border-ink-700"
            }`}
          >
            {opt}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button onClick={() => onChange([])} className="text-xs text-slate-500 hover:text-slate-300 ml-1">
          clear
        </button>
      )}
    </div>
  );
}
