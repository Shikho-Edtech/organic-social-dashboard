// "This Week" home view
import { getPosts, getDailyMetrics, getLatestDiagnosis } from "@/lib/sheets";
import {
  filterPosts,
  computeKpis,
  daysAgo,
  startOfWeekBDT,
  wowDelta,
  topByReach,
  topByEngagement,
  dailyReach,
  detectRedFlags,
  bdt,
  reach,
  engagementRate,
} from "@/lib/aggregate";
import KpiCard from "@/components/KpiCard";
import TrendChart from "@/components/TrendChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function ThisWeekPage() {
  const [posts, daily, diagnosis] = await Promise.all([
    getPosts(),
    getDailyMetrics(),
    getLatestDiagnosis(),
  ]);

  const now = new Date();
  const weekStart = startOfWeekBDT(now);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisWeek = filterPosts(posts, { start: weekStart, end: now });
  const lastWeek = filterPosts(posts, { start: lastWeekStart, end: weekStart });

  const kpiNow = computeKpis(thisWeek);
  const kpiPrev = computeKpis(lastWeek);

  // Follower change from daily metrics
  const sortedDaily = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const last7Daily = sortedDaily.slice(-7);
  const prev7Daily = sortedDaily.slice(-14, -7);
  const netThisWeek = last7Daily.reduce((s, d) => s + (d.new_follows - d.unfollows), 0);
  const netLastWeek = prev7Daily.reduce((s, d) => s + (d.new_follows - d.unfollows), 0);
  const followersNow = sortedDaily.length ? sortedDaily[sortedDaily.length - 1].followers_total : 0;

  const reachDelta = wowDelta(kpiNow.total_reach, kpiPrev.total_reach);
  const engDelta = wowDelta(kpiNow.avg_engagement_rate, kpiPrev.avg_engagement_rate);
  const postsDelta = wowDelta(kpiNow.posts, kpiPrev.posts);
  const followerDelta = wowDelta(netThisWeek, netLastWeek);

  // 30-day reach trend
  const last30 = filterPosts(posts, { start: daysAgo(30), end: now });
  const trendData = dailyReach(last30).map((d) => ({ date: d.date.slice(5), value: d.reach }));

  const top = topByReach(thisWeek, 3);
  const topEng = topByEngagement(thisWeek, 500, 3);
  const flags = detectRedFlags(posts, daily);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">Week of {weekStart.toISOString().slice(0, 10)}</div>
        <h1 className="text-2xl font-bold text-slate-100 mt-1">This Week</h1>
      </div>

      {/* Headline / verdict */}
      {diagnosis?.headline && (
        <div className="bg-gradient-to-br from-ink-800 to-ink-900 border border-ink-700 rounded-lg p-5">
          <div className="text-xs text-accent-cyan uppercase tracking-wider mb-2">Weekly verdict</div>
          <div className="text-lg font-medium text-slate-100">{diagnosis.headline}</div>
          {diagnosis.exam_alert && (
            <div className="mt-3 pt-3 border-t border-ink-700 text-sm text-slate-300">
              <span className="text-accent-purple font-semibold">Calendar alert: </span>
              {diagnosis.exam_alert}
            </div>
          )}
        </div>
      )}

      {/* Red flags (only show if any) */}
      {flags.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-slate-500 uppercase tracking-wider">Attention needed</div>
          {flags.map((f, i) => (
            <div
              key={i}
              className={`rounded-lg p-4 border ${
                f.severity === "high" ? "bg-red-950/30 border-red-900/60" : "bg-orange-950/20 border-orange-900/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${f.severity === "high" ? "text-accent-red" : "text-accent-orange"}`}>
                  {f.severity} · {f.category}
                </span>
              </div>
              <div className="text-slate-100 font-medium mt-1">{f.headline}</div>
              <div className="text-slate-400 text-sm mt-1">{f.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Net followers" value={netThisWeek >= 0 ? "+" + netThisWeek.toLocaleString() : netThisWeek.toLocaleString()} delta={followerDelta.pct} tone="green" />
        <KpiCard label="Total reach" value={kpiNow.total_reach} delta={reachDelta.pct} tone="cyan" />
        <KpiCard label="Avg engagement" value={kpiNow.avg_engagement_rate.toFixed(2) + "%"} delta={engDelta.pct} tone="pink" />
        <KpiCard label="Posts published" value={kpiNow.posts} delta={postsDelta.pct} tone="purple" />
      </div>

      {/* Reach trend (30d) */}
      <div className="bg-ink-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-slate-100 font-semibold">Reach trend</h3>
            <div className="text-xs text-slate-500">Last 30 days · daily unique reach</div>
          </div>
          <div className="text-xs text-slate-500">Total followers: <span className="text-slate-300 font-medium">{followersNow.toLocaleString()}</span></div>
        </div>
        <TrendChart data={trendData} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Top by reach */}
        <div className="bg-ink-800 rounded-lg p-5">
          <div className="text-xs text-accent-green uppercase tracking-wider mb-3">Top 3 by reach (this week)</div>
          <div className="space-y-3">
            {top.length === 0 && <div className="text-slate-500 text-sm">No posts this week yet.</div>}
            {top.map((p) => (
              <div key={p.id} className="border-l-2 border-accent-green pl-3">
                <div className="text-sm text-slate-300 font-medium">
                  {Math.round(reach(p)).toLocaleString()} reach · {p.shares} shares
                </div>
                <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                  {p.message.slice(0, 120)}
                </div>
                <div className="text-xs text-accent-cyan mt-1">
                  {p.content_pillar || "—"} · {p.format || p.type} · {p.featured_entity && p.featured_entity !== "None" ? p.featured_entity : ""}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top by engagement rate */}
        <div className="bg-ink-800 rounded-lg p-5">
          <div className="text-xs text-accent-pink uppercase tracking-wider mb-3">Top 3 by engagement rate</div>
          <div className="space-y-3">
            {topEng.length === 0 && <div className="text-slate-500 text-sm">No qualifying posts yet.</div>}
            {topEng.map((p) => (
              <div key={p.id} className="border-l-2 border-accent-pink pl-3">
                <div className="text-sm text-slate-300 font-medium">
                  {engagementRate(p).toFixed(2)}% engagement · {Math.round(reach(p)).toLocaleString()} reach
                </div>
                <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                  {p.message.slice(0, 120)}
                </div>
                <div className="text-xs text-accent-cyan mt-1">
                  {p.content_pillar || "—"} · {p.format || p.type}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What happened from Claude */}
      {diagnosis && diagnosis.what_happened && diagnosis.what_happened.length > 0 && (
        <div className="bg-ink-800 rounded-lg p-5">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">Observations from last weekly run</div>
          <ul className="space-y-2">
            {diagnosis.what_happened.map((obs: string, i: number) => (
              <li key={i} className="text-sm text-slate-300 flex gap-2">
                <span className="text-accent-cyan">•</span>
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-center text-xs text-slate-600 py-4">
        Data refreshed from Google Sheets every 5 minutes.
        <br />
        Pipeline runs weekly · Dashboard ≠ Claude cost
      </div>
    </div>
  );
}
