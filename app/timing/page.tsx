import { getPosts } from "@/lib/sheets";
import { filterPosts, bdt, reach } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import BarChartBase from "@/components/BarChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function TimingPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);
  const posts = await getPosts();
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Day of week (BDT)
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDay: Record<string, { reach: number; eng: number; posts: number }> = {};
  dayNames.forEach((d) => (byDay[d] = { reach: 0, eng: 0, posts: 0 }));
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    const day = dayNames[d.getDay()];
    byDay[day].reach += reach(p);
    byDay[day].eng += (p.reactions || 0) + (p.comments || 0) + (p.shares || 0);
    byDay[day].posts += 1;
  }
  const dayReach = dayNames.map((d) => ({ label: d, value: byDay[d].posts ? Math.round(byDay[d].reach / byDay[d].posts) : 0 }));
  const dayEng = dayNames.map((d) => ({
    label: d,
    value: byDay[d].reach ? Number(((byDay[d].eng / byDay[d].reach) * 100).toFixed(2)) : 0,
  }));

  // Time of day slots (BDT)
  const slots = [
    { label: "Early (5-9)", hours: [5, 6, 7, 8] },
    { label: "Morning (9-12)", hours: [9, 10, 11] },
    { label: "Afternoon (12-15)", hours: [12, 13, 14] },
    { label: "Late Aft (15-18)", hours: [15, 16, 17] },
    { label: "Evening (18-21)", hours: [18, 19, 20] },
    { label: "Night (21-24)", hours: [21, 22, 23] },
  ];
  const slotData = slots.map((s) => {
    const filtered = inRange.filter((p) => {
      if (!p.created_time) return false;
      const d = bdt(p.created_time);
      return s.hours.includes(d.getHours());
    });
    const totalReach = filtered.reduce((sum, p) => sum + reach(p), 0);
    const totalEng = filtered.reduce((sum, p) => sum + (p.reactions || 0) + (p.comments || 0) + (p.shares || 0), 0);
    return {
      label: s.label,
      reachAvg: filtered.length ? Math.round(totalReach / filtered.length) : 0,
      er: totalReach ? (totalEng / totalReach) * 100 : 0,
      posts: filtered.length,
    };
  });

  const slotReach = slotData.map((s) => ({ label: s.label, value: s.reachAvg }));
  const slotEng = slotData.map((s) => ({ label: s.label, value: Number(s.er.toFixed(2)) }));

  // Best slots summary
  const bestDayReach = dayReach.reduce((a, b) => (b.value > a.value ? b : a), dayReach[0]);
  const bestDayEng = dayEng.reduce((a, b) => (b.value > a.value ? b : a), dayEng[0]);
  const bestSlotReach = slotData.reduce((a, b) => (b.reachAvg > a.reachAvg ? b : a), slotData[0]);
  const bestSlotEng = slotData.reduce((a, b) => (b.er > a.er ? b : a), slotData[0]);

  return (
    <div>
      <PageHeader title="Timing" subtitle="When to post for max reach and engagement" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} />

      {/* Best slots summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best for Reach (Day)</div>
          <div className="text-2xl font-bold text-brand-cyan mt-2">{bestDayReach?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">{bestDayReach?.value.toLocaleString()} avg reach/post</div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best for Engagement (Day)</div>
          <div className="text-2xl font-bold text-brand-pink mt-2">{bestDayEng?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">{bestDayEng?.value.toFixed(2)}% eng rate</div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best for Reach (Slot)</div>
          <div className="text-2xl font-bold text-brand-green mt-2">{bestSlotReach?.label.split(" ")[0] || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">{bestSlotReach?.reachAvg.toLocaleString()} avg reach/post</div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best for Engagement (Slot)</div>
          <div className="text-2xl font-bold text-brand-purple mt-2">{bestSlotEng?.label.split(" ")[0] || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">{bestSlotEng?.er.toFixed(2)}% eng rate</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Avg Reach by Time of Day"
          subtitle="Posts grouped into BDT time slots"
          definition="Posts are bucketed into 6 BDT time slots based on their publish hour. Each bar shows average unique reach per post in that slot. Slots with 0 posts in the period show as 0."
          sampleSize={`${inRange.length} posts in range`}
          caption="Which time windows drive the most audience reach in Bangladesh time."
        >
          <BarChartBase data={slotReach} colorByIndex metricName="Avg reach / post" valueAxisLabel="Avg reach / post" categoryAxisLabel="Time slot (BDT)" />
        </ChartCard>
        <ChartCard
          title="Engagement Rate by Time of Day"
          subtitle="Interactions ÷ reach by BDT slot"
          definition="For each BDT slot: total interactions in that slot ÷ total reach in that slot. Reach-weighted, so a single viral post in a slot will dominate."
          caption="When the audience is most actively interacting — not just seeing — content."
        >
          <BarChartBase data={slotEng} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Time slot (BDT)" />
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Avg Reach by Day of Week"
          subtitle="BDT days"
          definition="Posts are bucketed by day-of-week (Sunday to Saturday, BDT). Each bar = average unique reach per post on that day."
          caption="Day-level reach patterns. Sunday is often strong for ed-tech in Bangladesh."
        >
          <BarChartBase data={dayReach} colorByIndex metricName="Avg reach / post" valueAxisLabel="Avg reach / post" categoryAxisLabel="Day of week" />
        </ChartCard>
        <ChartCard
          title="Engagement Rate by Day of Week"
          subtitle="BDT days"
          definition="For each day-of-week: total interactions ÷ total reach across all posts published that day. Reach-weighted."
          caption="When the audience is most active. Use to time your highest-value content."
        >
          <BarChartBase data={dayEng} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Day of week" />
        </ChartCard>
      </div>
    </div>
  );
}
