import { getVideoMetrics, getPosts } from "@/lib/sheets";
import { bdt } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import KpiCard from "@/components/KpiCard";
import BarChartBase from "@/components/BarChart";

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
  const totalCompletes = reels.reduce((s, r) => s + (r.complete_views || 0), 0);
  const completionRate = totalViews ? (totalCompletes / totalViews) * 100 : 0;
  const total15s = reels.reduce((s, r) => s + (r.views_15s || 0), 0);
  const total30s = reels.reduce((s, r) => s + (r.views_30s || 0), 0);
  const totalSoundOn = reels.reduce((s, r) => s + (r.sound_on_views || 0), 0);
  const soundOnRate = totalViews ? (totalSoundOn / totalViews) * 100 : 0;

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

  // Retention funnel (aggregate drop-off across all reels)
  const funnel = [
    { label: "Views (start)", value: totalViews },
    { label: "15s Views", value: total15s },
    { label: "30s Views", value: total30s },
    { label: "Complete Views", value: totalCompletes },
  ];

  // Reels table — newest first, cap at 25 rows
  const tableRows = [...reels]
    .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
    .slice(0, 25)
    .map((r) => {
      const p = postById.get(r.post_id);
      const dateStr = r.created_time
        ? bdt(r.created_time).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
        : "—";
      const complRate = (r.total_views || 0) ? ((r.complete_views || 0) / r.total_views) * 100 : 0;
      return {
        id: r.post_id,
        date: dateStr,
        caption: previewMessage(p?.message || "", 60),
        pillar: p?.content_pillar || "—",
        plays: r.reel_plays || 0,
        replays: r.reel_replays || 0,
        watch: (r.avg_watch_time || 0).toFixed(1),
        completion: complRate.toFixed(1),
        soundOn: r.sound_on_views || 0,
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
        <KpiCard label="Avg Watch Time" value={`${avgWatchTime.toFixed(1)}s`} sublabel="per reel" />
        <KpiCard label="Completion Rate" value={`${completionRate.toFixed(1)}%`} sublabel={`${totalCompletes.toLocaleString()} completes`} />
        <KpiCard label="Followers Gained" value={totalFollowersGained} sublabel="from reels" />
      </div>

      {/* Secondary metric row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="!p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total Views</div>
          <div className="text-xl font-bold text-brand-cyan mt-1">{totalViews.toLocaleString()}</div>
        </Card>
        <Card className="!p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">15s Views</div>
          <div className="text-xl font-bold text-brand-green mt-1">{total15s.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{totalViews ? ((total15s / totalViews) * 100).toFixed(1) : "0"}% of views</div>
        </Card>
        <Card className="!p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">30s Views</div>
          <div className="text-xl font-bold text-brand-pink mt-1">{total30s.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{totalViews ? ((total30s / totalViews) * 100).toFixed(1) : "0"}% of views</div>
        </Card>
        <Card className="!p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sound On Rate</div>
          <div className="text-xl font-bold text-brand-purple mt-1">{soundOnRate.toFixed(1)}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{totalSoundOn.toLocaleString()} sound-on views</div>
        </Card>
      </div>

      {/* Retention funnel */}
      <div className="mb-4">
        <ChartCard
          title="Aggregate Retention Funnel"
          kind="observed"
          subtitle="Where viewers drop off across all reels in range"
          definition="For each stage (0s → 15s → 30s → complete), the bar shows the total number of view-events in that bucket across ALL reels in the period. Use to see how much audience survives each retention step."
          sampleSize={`${totalReels} reels`}
          caption="A steep drop from 15s to 30s signals hook works but middle loses interest. Steep drop from 30s to complete signals weak payoff/ending."
        >
          <BarChartBase data={funnel} colorByIndex metricName="Views" valueAxisLabel="Views" categoryAxisLabel="Retention stage" />
        </ChartCard>
      </div>

      {/* Top performers */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Top 10 Reels by Plays"
          kind="observed"
          subtitle="Raw reach leaders"
          definition="Total reel plays (includes replays). Highest-distribution reels in the period. Tooltip shows avg watch time (seconds)."
          sampleSize={`top ${topByPlays.length}`}
        >
          <BarChartBase data={topByPlays} horizontal height={340} colorByIndex metricName="Plays" valueAxisLabel="Plays" categoryAxisLabel="Reel caption (preview)" />
        </ChartCard>
        <ChartCard
          title="Top 10 Reels by Avg Watch Time"
          kind="observed"
          subtitle="Engagement quality leaders (≥500 views)"
          definition="Average watch time in seconds. Filtered to reels with ≥500 total views to avoid tiny-sample outliers. Tooltip shows total views."
          sampleSize={`top ${topByWatchTime.length}`}
          caption="Long watch time with decent plays = replicable format. Short watch time with high plays = good hook, weak middle."
        >
          <BarChartBase data={topByWatchTime} horizontal height={340} colorByIndex valueFormat="number" metricName="Avg watch (s)" valueAxisLabel="Seconds" categoryAxisLabel="Reel caption (preview)" />
        </ChartCard>
      </div>

      {/* Followers gained chart */}
      {topByFollowers.length > 0 && (
        <div className="mb-4">
          <ChartCard
            title="Top Reels by Followers Gained"
            kind="observed"
            subtitle="Reels that converted viewers → followers"
            definition="Net new followers attributed to each reel by Meta. Tooltip shows total plays for context."
            sampleSize={`${topByFollowers.length} reels gained followers`}
            caption="High plays with zero follower gain = viral but not sticky. Low plays with high gain = niche but converts."
          >
            <BarChartBase data={topByFollowers} horizontal height={340} colorByIndex metricName="Followers gained" valueAxisLabel="Followers gained" categoryAxisLabel="Reel caption (preview)" />
          </ChartCard>
        </div>
      )}

      {/* Reels table */}
      <Card className="!p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Recent Reels</h3>
          <p className="text-xs text-slate-500 mt-0.5">Newest first · up to 25 rows</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Date</th>
                <th className="text-left px-4 py-2 font-semibold">Caption</th>
                <th className="text-left px-4 py-2 font-semibold">Pillar</th>
                <th className="text-right px-4 py-2 font-semibold">Plays</th>
                <th className="text-right px-4 py-2 font-semibold">Replays</th>
                <th className="text-right px-4 py-2 font-semibold">Watch (s)</th>
                <th className="text-right px-4 py-2 font-semibold">Compl %</th>
                <th className="text-right px-4 py-2 font-semibold">Sound On</th>
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
                  <td className="px-4 py-2 text-right tabular-nums">{row.completion}%</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{row.soundOn.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-brand-green">{row.follows > 0 ? `+${row.follows}` : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
