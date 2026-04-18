import { getPosts } from "@/lib/sheets";
import { filterPosts, bdt, reach } from "@/lib/aggregate";
import { summarize, bestByLowerBound, reliabilityLabel, minPostsForRange, type Summary } from "@/lib/stats";
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

  // Day 2S: adaptive min-N per range. A slot/day with fewer than `minN`
  // posts is HIDDEN from the chart entirely — not just dimmed — so a
  // single-post bucket can't visually dominate the bar chart. Day-of-week
  // uses the same threshold (7 buckets vs 6 — close enough in practice).
  const rangeDays = Math.max(
    1,
    Math.round((range.end.getTime() - range.start.getTime()) / 86_400_000)
  );
  const MIN_N = minPostsForRange(rangeDays);

  const slotReachChart = slotData
    .filter((s) => s.posts >= MIN_N)
    .map((s) => ({
      label: s.label,
      value: Math.round(s.reachSum.mean),
      meta: s.posts,
    }));
  const slotEngChart = slotData
    .filter((s) => s.posts >= MIN_N)
    .map((s) => ({
      label: s.label,
      value: Number(s.erSum.mean.toFixed(2)),
      meta: s.posts,
    }));
  const dayReachChart = dayData
    .filter((d) => d.posts >= MIN_N)
    .map((d) => ({
      label: d.label,
      value: Math.round(d.reachSum.mean),
      meta: d.posts,
    }));
  const dayEngChart = dayData
    .filter((d) => d.posts >= MIN_N)
    .map((d) => ({
      label: d.label,
      value: Number(d.erSum.mean.toFixed(2)),
      meta: d.posts,
    }));

  const slotsShown = slotReachChart.length;
  const daysShown = dayReachChart.length;

  // Rank "Best X" by 95% CI lower bound of the mean among slots/days that
  // also clear the MIN_N bar — so the "Best" KPI always names a bucket that
  // actually appears in the chart below.
  const eligibleSlots = slotData.filter((s) => s.posts >= MIN_N);
  const eligibleDays = dayData.filter((d) => d.posts >= MIN_N);
  const bestDayReach = bestByLowerBound(eligibleDays, (d) => d.reachSum);
  const bestDayEng = bestByLowerBound(eligibleDays, (d) => d.erSum);
  const bestSlotReach = bestByLowerBound(eligibleSlots, (s) => s.reachSum);
  const bestSlotEng = bestByLowerBound(eligibleSlots, (s) => s.erSum);

  // Flag when no slot clears the gate so we can show a dash + hint.
  const anyRankable = eligibleSlots.length > 0;

  return (
    <div>
      <PageHeader title="Timing" subtitle="When to post for max reach and engagement" dateLabel={`${range.label} · Bangladesh Time (UTC+6)`} />

      {/* Best slots summary — ranked by 95% CI lower bound */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best for Reach (Day)</div>
          <div className="text-xl sm:text-2xl font-bold text-brand-cyan mt-2 break-words leading-tight">{bestDayReach?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {Math.round(bestDayReach?.reachSum.mean || 0).toLocaleString()} avg reach/post
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {reliabilityLabel(bestDayReach?.posts || 0)}
            {bestDayReach && isFinite(bestDayReach.reachSum.lowerBound95) && (
              <> · reliable floor {Math.max(0, Math.round(bestDayReach.reachSum.lowerBound95)).toLocaleString()}</>
            )}
          </div>
        </Card>
        <Card className="!p-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Best for Engagement (Day)</div>
          <div className="text-xl sm:text-2xl font-bold text-brand-pink mt-2 break-words leading-tight">{bestDayEng?.label || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestDayEng?.erSum.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
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
          <div className="text-xl sm:text-2xl font-bold text-brand-green mt-2 break-words leading-tight">{bestSlotReach?.label.split(" ")[0] || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {Math.round(bestSlotReach?.reachSum.mean || 0).toLocaleString()} avg reach/post
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
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
          <div className="text-xl sm:text-2xl font-bold text-brand-purple mt-2 break-words leading-tight">{bestSlotEng?.label.split(" ")[0] || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">
            {(bestSlotEng?.erSum.mean || 0).toFixed(2)}% avg eng rate
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
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
          definition={`Posts are bucketed into 6 BDT time slots based on their publish hour. Each bar shows average unique reach per post in that slot. Slots with fewer than ${MIN_N} posts are HIDDEN (adaptive threshold: 7d→3, 14d→5, 30d→10, larger ranges scale up).`}
          sampleSize={`${inRange.length} posts · ${slotsShown}/6 slots ≥ ${MIN_N}`}
          caption={`Only slots with at least ${MIN_N} posts in a ${rangeDays}-day window are shown — a single viral post can't promote a time slot on its own.`}
        >
          {slotsShown > 0 ? (
            <BarChartBase data={slotReachChart} color="#4f46e5" metricName="Avg reach / post" valueAxisLabel="Avg reach / post" categoryAxisLabel="Time slot (BDT)" />
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-slate-500">
              No slot has ≥ {MIN_N} posts in this {rangeDays}-day window. Widen the range.
            </div>
          )}
        </ChartCard>
        <ChartCard
          title="Engagement Rate by Time of Day"
          kind="derived"
          subtitle="Interactions ÷ reach by BDT slot"
          definition={`For each BDT slot: mean of per-post engagement rates in that slot. Per-post ER = interactions ÷ that post's reach × 100. Slots with fewer than ${MIN_N} posts are hidden.`}
          sampleSize={`${slotsShown}/6 slots ≥ ${MIN_N}`}
          caption={`Same threshold as the reach chart: a slot needs ≥ ${MIN_N} posts to appear.`}
        >
          {slotsShown > 0 ? (
            <BarChartBase data={slotEngChart} valueFormat="percent" color="#ec4899" metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Time slot (BDT)" />
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-slate-500">
              No slot has ≥ {MIN_N} posts in this {rangeDays}-day window.
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard
          title="Avg Reach by Day of Week"
          kind="observed"
          subtitle="BDT days"
          definition={`Posts are bucketed by day-of-week (Sunday to Saturday, BDT). Each bar = average unique reach per post on that day. Days with fewer than ${MIN_N} posts in the window are hidden.`}
          sampleSize={`${daysShown}/7 days ≥ ${MIN_N}`}
          caption={`Day-level reach patterns. Days need ≥ ${MIN_N} posts in a ${rangeDays}-day window to appear.`}
        >
          {daysShown > 0 ? (
            <BarChartBase data={dayReachChart} color="#4f46e5" metricName="Avg reach / post" valueAxisLabel="Avg reach / post" categoryAxisLabel="Day of week" />
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-slate-500">
              No day-of-week has ≥ {MIN_N} posts in this {rangeDays}-day window.
            </div>
          )}
        </ChartCard>
        <ChartCard
          title="Engagement Rate by Day of Week"
          kind="derived"
          subtitle="BDT days"
          definition={`For each day-of-week: mean of per-post engagement rates across all posts published that day. Days with fewer than ${MIN_N} posts are hidden.`}
          sampleSize={`${daysShown}/7 days ≥ ${MIN_N}`}
          caption={`When the audience is most active. Same ≥ ${MIN_N} threshold as the reach chart.`}
        >
          {daysShown > 0 ? (
            <BarChartBase data={dayEngChart} valueFormat="percent" color="#ec4899" metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Day of week" />
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-slate-500">
              No day-of-week has ≥ {MIN_N} posts in this {rangeDays}-day window.
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
