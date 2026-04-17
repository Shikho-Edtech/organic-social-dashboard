import { getPosts } from "@/lib/sheets";
import { filterPosts, bdt, reach } from "@/lib/aggregate";
import { summarize, bestByLowerBound, reliabilityLabel, type Summary } from "@/lib/stats";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import BarChartBase from "@/components/BarChart";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Day 2O: rank "Best X" KPIs by 95% CI lower bound of the mean.
// Charts still display raw means so the visual doesn't hide signal —
// the CI is a ranking-time concept, not a display-time one.

type SlotRow = {
  label: string;
  reachSum: Summary;
  erSum: Summary;
  posts: number;
};

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

  // Day of week (BDT)
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const postsByDayOfWeek: Record<string, typeof inRange> = {};
  dayNames.forEach((d) => (postsByDayOfWeek[d] = []));
  for (const p of inRange) {
    if (!p.created_time) continue;
    const d = bdt(p.created_time);
    const day = dayNames[d.getDay()];
    postsByDayOfWeek[day].push(p);
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

  // Time of day slots (BDT)
  const slots = [
    { label: "Early (5-9)", hours: [5, 6, 7, 8] },
    { label: "Morning (9-12)", hours: [9, 10, 11] },
    { label: "Afternoon (12-15)", hours: [12, 13, 14] },
    { label: "Late Aft (15-18)", hours: [15, 16, 17] },
    { label: "Evening (18-21)", hours: [18, 19, 20] },
    { label: "Night (21-24)", hours: [21, 22, 23] },
  ];
  const slotData: SlotRow[] = slots.map((s) => {
    const bucket = inRange.filter((p) => {
      if (!p.created_time) return false;
      const d = bdt(p.created_time);
      return s.hours.includes(d.getHours());
    });
    return {
      label: s.label,
      reachSum: summarize(bucket.map(postReach)),
      erSum: summarize(bucket.map(postEngRate)),
      posts: bucket.length,
    };
  });

  // Chart series — show raw means so bars stay honest. Dim low-n slots.
  const MIN_N = 10;
  const slotReachChart = slotData.map((s) => ({
    label: s.label,
    value: Math.round(s.reachSum.mean),
    meta: s.posts,
    muted: s.posts < MIN_N,
  }));
  const slotEngChart = slotData.map((s) => ({
    label: s.label,
    value: Number(s.erSum.mean.toFixed(2)),
    meta: s.posts,
    muted: s.posts < MIN_N,
  }));
  const dayReachChart = dayData.map((d) => ({
    label: d.label,
    value: Math.round(d.reachSum.mean),
  }));
  const dayEngChart = dayData.map((d) => ({
    label: d.label,
    value: Number(d.erSum.mean.toFixed(2)),
  }));

  // Rank "Best X" by 95% CI lower bound of the mean. n<2 entries auto-drop.
  const bestDayReach = bestByLowerBound(dayData, (d) => d.reachSum);
  const bestDayEng = bestByLowerBound(dayData, (d) => d.erSum);
  const bestSlotReach = bestByLowerBound(slotData, (s) => s.reachSum);
  const bestSlotEng = bestByLowerBound(slotData, (s) => s.erSum);

  // Flag when there isn't enough data anywhere to estimate a CI.
  const anyRankable = slotData.some((s) => isFinite(s.reachSum.lowerBound95));

  return (
    <div>
      <PageHeader title="Timing" subtitle="When to post for max reach and engagement" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} />

      {/* Best slots summary — ranked by 95% CI lower bound */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best for Reach (Day)</div>
          <div className="text-2xl font-bold text-brand-cyan mt-2">{bestDayReach?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {Math.round(bestDayReach?.reachSum.mean || 0).toLocaleString()} avg reach/post
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {reliabilityLabel(bestDayReach?.posts || 0)}
            {bestDayReach && isFinite(bestDayReach.reachSum.lowerBound95) && (
              <> · reliable floor {Math.max(0, Math.round(bestDayReach.reachSum.lowerBound95)).toLocaleString()}</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best for Engagement (Day)</div>
          <div className="text-2xl font-bold text-brand-pink mt-2">{bestDayEng?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestDayEng?.erSum.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {reliabilityLabel(bestDayEng?.posts || 0)}
            {bestDayEng && isFinite(bestDayEng.erSum.lowerBound95) && (
              <> · reliable floor {Math.max(0, bestDayEng.erSum.lowerBound95).toFixed(2)}%</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Best for Reach (Slot)
            {!anyRankable && <span className="ml-1 text-amber-500" title="No slot has n≥2 — ranking falls back to raw mean">*</span>}
          </div>
          <div className="text-2xl font-bold text-brand-green mt-2">{bestSlotReach?.label.split(" ")[0] || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {Math.round(bestSlotReach?.reachSum.mean || 0).toLocaleString()} avg reach/post
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {reliabilityLabel(bestSlotReach?.posts || 0)}
            {bestSlotReach && isFinite(bestSlotReach.reachSum.lowerBound95) && (
              <> · reliable floor {Math.max(0, Math.round(bestSlotReach.reachSum.lowerBound95)).toLocaleString()}</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Best for Engagement (Slot)
            {!anyRankable && <span className="ml-1 text-amber-500" title="No slot has n≥2 — ranking falls back to raw mean">*</span>}
          </div>
          <div className="text-2xl font-bold text-brand-purple mt-2">{bestSlotEng?.label.split(" ")[0] || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestSlotEng?.erSum.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {reliabilityLabel(bestSlotEng?.posts || 0)}
            {bestSlotEng && isFinite(bestSlotEng.erSum.lowerBound95) && (
              <> · reliable floor {Math.max(0, bestSlotEng.erSum.lowerBound95).toFixed(2)}%</>
            )}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Avg Reach by Time of Day"
          kind="observed"
          subtitle="Posts grouped into BDT time slots"
          definition="Posts are bucketed into 6 BDT time slots based on their publish hour. Each bar shows average unique reach per post in that slot. Slots with 0 posts in the period show as 0."
          sampleSize={`${inRange.length} posts in range`}
          caption="Slots with fewer than 10 posts are dimmed. The 'Best for Reach' KPI above ranks by 95% CI lower bound, so single-post slots cannot win."
        >
          <BarChartBase data={slotReachChart} colorByIndex metricName="Avg reach / post" valueAxisLabel="Avg reach / post" categoryAxisLabel="Time slot (BDT)" />
        </ChartCard>
        <ChartCard
          title="Engagement Rate by Time of Day"
          kind="derived"
          subtitle="Interactions ÷ reach by BDT slot"
          definition="For each BDT slot: mean of per-post engagement rates in that slot. Per-post ER = interactions ÷ that post's reach × 100."
          caption="Dimmed slots have fewer than 10 posts. KPI above uses CI lower bound for ranking."
        >
          <BarChartBase data={slotEngChart} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Time slot (BDT)" />
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Avg Reach by Day of Week"
          kind="observed"
          subtitle="BDT days"
          definition="Posts are bucketed by day-of-week (Sunday to Saturday, BDT). Each bar = average unique reach per post on that day."
          caption="Day-level reach patterns. Sunday is often strong for ed-tech in Bangladesh."
        >
          <BarChartBase data={dayReachChart} colorByIndex metricName="Avg reach / post" valueAxisLabel="Avg reach / post" categoryAxisLabel="Day of week" />
        </ChartCard>
        <ChartCard
          title="Engagement Rate by Day of Week"
          kind="derived"
          subtitle="BDT days"
          definition="For each day-of-week: mean of per-post engagement rates across all posts published that day."
          caption="When the audience is most active. Use to time your highest-value content."
        >
          <BarChartBase data={dayEngChart} valueFormat="percent" colorByIndex metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Day of week" />
        </ChartCard>
      </div>
    </div>
  );
}
