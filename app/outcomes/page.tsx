// Outcomes view — last week's plan, graded
//
// Sprint P6 chunk 7 (2026-04-23, OSL-04 follow-up): surfaces the pipeline's
// Outcome_Log tab. Every slot in last week's calendar gets a row: what the
// forecast was (mid + CI), what actually happened (reach), a verdict pill
// (hit / exceeded / missed / no-data / exam-confounded), and the score.
//
// Default week: latest week that has at least one graded row (hit / exceeded
// / missed). Falls back to the latest week with any rows, then to an empty
// state. Query param `?week=YYYY-MM-DD` picks a specific week.
//
// Deterministic stage on the pipeline side (score_slot_outcome is pure), so
// no StalenessBanner — staleness is a Claude-powered-artifact concern per
// CLAUDE.md. Generated At is still shown inline so operators can see when
// the grading last ran.

import {
  getOutcomeLog,
  getOutcomeLogByWeek,
  getLatestGradedOutcomeWeek,
  listOutcomeWeeks,
  computeOutcomeRollup,
  getPlanNarrative,
  getPosts,
  getCalibrationLog,
  summarizeCalibration,
} from "@/lib/sheets";
import WeekSelector, { weekRange, computeWeekEndings, resolveWeekParam } from "@/components/WeekSelector";
import type { OutcomeLogEntry, OutcomeVerdict } from "@/lib/types";
import { Card } from "@/components/Card";
import PageHeader from "@/components/PageHeader";
import PostReference from "@/components/PostReference";
import Link from "next/link";
import { bdt, bdtNow, dateStr, startOfWeekBDT } from "@/lib/aggregate";
import { postReach as postReachFn, qualityEngagementForPost } from "@/lib/qualityEngagement";
import StaleDataBanner from "@/components/StaleDataBanner";
import { isStaleNow, getStaleReasons } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 300;

type SearchParams = { week?: string | string[] };

function firstString(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

// Verdict pill colour + label. Uses Shikho v1.0 tokens — no slate/gray
// legacy classes. Confounded verdict gets a muted amber band so it reads
// as "zero-weighted observation" rather than failure or success.
const verdictStyle: Record<
  OutcomeVerdict,
  { label: string; bg: string; text: string; ring: string }
> = {
  hit: {
    label: "Hit",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  exceeded: {
    label: "Exceeded",
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    ring: "ring-emerald-300",
  },
  missed: {
    label: "Missed",
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
  },
  "no-data": {
    label: "Pending",
    bg: "bg-ink-50",
    text: "text-ink-muted",
    ring: "ring-ink-100",
  },
  unavailable: {
    label: "Unavailable",
    bg: "bg-ink-50",
    text: "text-ink-muted",
    ring: "ring-ink-100",
  },
  "inconclusive-exam-confounded": {
    label: "Exam confounded",
    bg: "bg-amber-50",
    text: "text-amber-800",
    ring: "ring-amber-200",
  },
  "": {
    label: "—",
    bg: "bg-ink-50",
    text: "text-ink-muted",
    ring: "ring-ink-100",
  },
};

// Letter grade -> panel accent. Matches diagnosis verdict colour families
// already in use on /strategy so the visual vocabulary is consistent.
const gradeAccent: Record<string, string> = {
  A: "text-emerald-700",
  B: "text-emerald-600",
  C: "text-amber-600",
  D: "text-rose-600",
  F: "text-rose-700",
  ungraded: "text-ink-muted",
};

function fmtNum(n: number | null, digits = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n: number | null, digits = 0): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtBDT(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default async function OutcomesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const requestedRaw = firstString(searchParams.week).trim();

  // Sprint P7 v4.18 (2026-05-02): unified week-resolution. The Outcomes
  // page used to ship a custom date-range picker that resolved by exact
  // YYYY-MM-DD match against the week list. This produced two issues:
  //   1. Pills showed raw dates instead of "This week / Last week / Next
  //      week" relative labels (jarring next to Plan + Diagnosis which
  //      use shared WeekSelector).
  //   2. Click-from-picker had a transient empty-state flash (the
  //      "buttons disappear" bug from the live audit).
  // Both go away by routing through resolveWeekParam — the same helper
  // Plan + Diagnosis use. ?week=this|last|next|YYYY-MM-DD all map to a
  // canonical Mon-anchor.
  const resolvedWeek = resolveWeekParam(requestedRaw);

  const [allWeeks, latestGraded, calibrationRows] = await Promise.all([
    listOutcomeWeeks(),
    getLatestGradedOutcomeWeek(),
    getCalibrationLog(),
  ]);
  // Rolling 4-week summary of "did our 80% CI actually contain 80%?"
  // Surfaces the central Tier-1 signal from PLAN_ALGORITHM_AUDIT — without
  // a visible calibration KPI, prompt/prior changes can't be evaluated.
  const calibration = summarizeCalibration(calibrationRows, 4);
  // Prefer the URL-resolved week if it has data; else fall back to
  // latest-graded; else the most recent week with any rows. Final
  // fallback to empty when nothing exists yet.
  const activeWeek =
    (resolvedWeek && allWeeks.includes(resolvedWeek) && resolvedWeek) ||
    (requestedRaw && allWeeks.includes(requestedRaw) && requestedRaw) ||
    latestGraded ||
    allWeeks[0] ||
    "";

  const rows = activeWeek ? await getOutcomeLogByWeek(activeWeek) : [];
  const rollup = computeOutcomeRollup(rows, activeWeek);
  const generatedAt = rows[0]?.generated_at || "";

  // Sprint P7 v4.14b (2026-05-02): only show the Target Metric column when
  // the active week has at least one row with a populated value. If every
  // row's Slot Target Metric + Slot Expected Reach Range are empty,
  // showing an all-empty column adds noise without information — per
  // user feedback "what's the point of having this column if it is not
  // useful." Column re-appears automatically once the next pipeline run
  // populates the values.
  const hasTargetMetric = rows.some(
    (r) => (r.slot_target_metric || "").trim() !== "" ||
           (r.slot_expected_reach_range || "").trim() !== ""
  );

  // Sprint P7 v4.14 Tier 1.5 (2026-05-01): post-drill-down enabler.
  // Build a lookup of {post_id → {message, permalink_url}} so the table
  // can render a PostReference next to each row whose Matched Post ID
  // is set. Mirrors the pattern from Reels / Explore / Diagnosis.
  const allPosts = await getPosts();
  const postById = new Map<string, { message?: string; permalink_url?: string }>();
  for (const p of allPosts) {
    if (p.id) {
      postById.set(p.id, {
        message: (p as any).message || "",
        permalink_url: (p as any).permalink_url || "",
      });
    }
  }

  // Sprint P7 v4.13 (2026-05-01): pull the active week's hypotheses_map so
  // each slot row's H1/H2 chip can render the actual hypothesis statement
  // on hover/tap. Plan_Narrative is keyed by Mon-anchor (same key as
  // Outcome_Log.week_ending in v4.12). Empty {} when this week predates
  // the v4.11 schema migration.
  const planNarrative = activeWeek ? await getPlanNarrative(activeWeek) : null;
  const hypothesesMap = planNarrative?.hypotheses_map || {};
  const hypothesisTip = (id: string): string => {
    const text = hypothesesMap[id];
    return text
      ? `${id.toUpperCase()}: ${text}`
      : `${id.toUpperCase()} — hypothesis statement not yet resolved (older week or status-quo). Run the next weekly pipeline to populate.`;
  };

  // Group by day for stacked presentation (mirrors /plan's per-day cards)
  const byDay: Record<string, OutcomeLogEntry[]> = {};
  for (const r of rows) {
    const key = r.day || "Unknown";
    (byDay[key] ||= []).push(r);
  }
  const orderedDays = DAY_ORDER.filter((d) => byDay[d]);
  if (byDay["Unknown"]) orderedDays.push("Unknown");

  // Sprint P7 v4.18 W2 R5 (2026-05-02): Yesterday-focused inline card.
  //
  // Context: operators land on /outcomes on a Tuesday morning to check
  // Monday's results. The per-day stacked view forces them to scan all
  // 7 day cells before locating yesterday — high friction for the most
  // common entry point. R5 surfaces yesterday's slots as a hero card
  // ABOVE the rollup when the active week IS the current Mon-anchor
  // week AND yesterday falls inside it. Pure presentation: the same
  // rows are still rendered in the per-day breakdown below; this is
  // a focus pin, not a duplication of state.
  //
  // Conditions: only renders when (a) active week is the current week,
  // (b) yesterday's date string ≠ today's (so on Monday morning we
  // don't pin Sunday from the previous week), and (c) at least one
  // row matches yesterday.
  const now = bdtNow();
  const todayBdt = dateStr(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayIso = dateStr(yesterdayDate);
  const yesterdayDayName = yesterdayDate.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "Asia/Dhaka",
  });
  const currentWeekStart = dateStr(startOfWeekBDT(now));
  const isCurrentWeek = activeWeek === currentWeekStart;
  const yesterdayInActiveWeek = isCurrentWeek && yesterdayIso !== todayBdt;
  const yesterdayRows = yesterdayInActiveWeek
    ? rows.filter((r) => r.date === yesterdayIso)
    : [];
  const yesterdayRollup = yesterdayRows.length
    ? {
        hits: yesterdayRows.filter((r) => r.verdict === "hit" || r.verdict === "exceeded").length,
        missed: yesterdayRows.filter((r) => r.verdict === "missed").length,
        pending: yesterdayRows.filter((r) => r.verdict === "no-data" || r.verdict === "unavailable").length,
      }
    : null;

  // Read-side resilience: catch any cache fallback during the data
  // fetches above. Soft "data refreshing" banner if reads were stale.
  const staleData = isStaleNow();
  const staleReasons = staleData ? getStaleReasons() : undefined;

  return (
    <div>
      <StaleDataBanner stale={staleData} reasons={staleReasons} />
      <PageHeader
        title="Outcomes"
        // Sprint P7 v4.6 (2026-04-30, P0 finding #3): subtitle adapts to
        // grading state. Hardcoded "Last week's plan, graded slot by slot"
        // misled users when ALL slots are still pending (the case for a
        // forecast run before the week has fully elapsed). Now the page
        // self-describes whether actuals exist yet.
        subtitle={
          rollup.graded_count > 0
            ? "Plan graded slot by slot"
            : rows.length > 0
              ? "Forecasts logged, awaiting actuals"
              : "Outcome log empty"
        }
        dateLabel={
          generatedAt
            ? `Last graded ${fmtBDT(generatedAt)}`
            : "Awaiting first weekly grading run"
        }
        showPicker={false}
        compact
      />

      {allWeeks.length === 0 && (
        <Card className="text-center py-12">
          <p className="text-ink-primary font-medium">
            No outcomes recorded yet
          </p>
          <p className="text-ink-muted text-sm mt-2">
            The next weekly pipeline run will score each slot in last week&apos;s
            calendar and populate this page.
          </p>
        </Card>
      )}

      {activeWeek && rows.length > 0 && (
        <>
          {/* Sprint P7 v4.18 (2026-05-02): unified week-switching across
              all 3 Weekly-bucket pages. Outcomes now uses the shared
              WeekSelector — pills read "This week (Apr 27 – May 3) /
              Last week / Next week" instead of bare dates. Eliminates
              the pre-v4.18 custom picker bug + matches Plan + Diagnosis. */}
          <WeekSelector
            basePath="/outcomes"
            current={requestedRaw || undefined}
            choices={["this", "last", "next"]}
            preserve={searchParams as Record<string, string | string[] | undefined>}
          />

          {/* Rollup card — the "so what" answer up top */}
          <Card className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-ink-muted font-semibold">
                  Mon–Sun BDT · {weekRange(activeWeek)}
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-ink-primary mt-1 break-words leading-tight">
                  {/* Sprint P7 v4.6 (2026-04-30, P0 finding #3):
                      headline adapts to grading state. "0 of 0 slots
                      beat their forecast" was technically accurate when
                      everything is pending, but it made the page look
                      broken. Now: forecast-state shows the slot count;
                      graded-state shows the hit ratio. */}
                  {rollup.graded_count > 0
                    ? <>{rollup.hit_count} of {rollup.graded_count} slots beat their <span className="text-ink-secondary">unique-reach</span> forecast</>
                    : <>{rows.length} slots planned, awaiting <span className="text-ink-secondary">unique-reach</span> actuals</>}
                </h2>
                <p className="text-sm text-ink-secondary mt-1">
                  {rollup.no_data_count > 0
                    ? `${rollup.no_data_count} slot${
                        rollup.no_data_count === 1 ? "" : "s"
                      } still awaiting actuals`
                    : "All scheduled slots have landed"}
                  {rollup.confounded_count > 0 &&
                    `, ${rollup.confounded_count} excluded for exam confound`}
                  .
                </p>
              </div>
              <div className="flex items-center gap-5 sm:gap-6">
                <div className="text-center">
                  <div
                    className={`text-4xl sm:text-5xl font-black leading-none ${
                      gradeAccent[rollup.grade] ?? "text-ink-muted"
                    }`}
                  >
                    {rollup.grade === "ungraded" ? "—" : rollup.grade}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold mt-1">
                    Grade
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-ink-primary tabular-nums leading-none">
                    {fmtPct(rollup.hit_rate)}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold mt-1">
                    Hit rate
                  </div>
                </div>
                <div className="text-center hidden sm:block">
                  <div className="text-2xl sm:text-3xl font-bold text-ink-primary tabular-nums leading-none">
                    {fmtNum(rollup.mean_score, 2)}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold mt-1">
                    Mean score
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown strip — compact counts across all verdicts */}
            <div className="mt-4 pt-4 border-t border-ink-100 grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Breakdown label="Hits" value={rollup.hit_count} tone="emerald" />
              <Breakdown label="Missed" value={rollup.missed_count} tone="rose" />
              <Breakdown
                label="Pending"
                value={rollup.no_data_count}
                tone="ink"
              />
              <Breakdown
                label="Exam-confound"
                value={rollup.confounded_count}
                tone="amber"
              />
              <Breakdown label="Total" value={rollup.slot_count} tone="indigo" />
            </div>
          </Card>

          {/* Calibration KPI strip (2026-05-04): rolling 4-week "did our 80% CI
              actually contain 80%?" measurement. The central Tier-1 signal
              from docs/PLAN_ALGORITHM_AUDIT.md — without this visible, prompt
              and prior changes can't be evaluated. Hidden when no week has
              been graded yet (typical for a fresh page or a running week
              with all slots pending). */}
          {calibration.weeks_measured > 0 && (
            <Card className="mb-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-ink-muted font-semibold">
                    Forecast calibration · rolling {calibration.weeks_measured}-week
                  </p>
                  <h3 className="text-base font-semibold text-ink-primary mt-1">
                    Did our 80% CI actually contain 80%?
                  </h3>
                </div>
                <span
                  className={
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider self-start " +
                    (calibration.status === "ok"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : calibration.status === "warn"
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : "bg-rose-50 text-rose-700 ring-1 ring-rose-200")
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {calibration.status === "ok"
                    ? "calibrated"
                    : calibration.status === "warn"
                    ? "drifting"
                    : "mis-calibrated"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold mb-1">
                    Hit rate inside CI
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-ink-primary break-words leading-tight tabular-nums">
                    {calibration.avg_hit_rate_inside_ci !== null
                      ? `${(calibration.avg_hit_rate_inside_ci * 100).toFixed(1)}%`
                      : "—"}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    target 80%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold mb-1">
                    Calibration error
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-ink-primary break-words leading-tight tabular-nums">
                    {calibration.avg_calibration_error !== null
                      ? calibration.avg_calibration_error.toFixed(2)
                      : "—"}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    abs(0.80 − hit-rate)
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold mb-1">
                    Latest week
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-ink-primary break-words leading-tight tabular-nums">
                    {calibration.latest_hit_rate_inside_ci !== null
                      ? `${(calibration.latest_hit_rate_inside_ci * 100).toFixed(1)}%`
                      : "—"}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    {calibration.latest_week
                      ? `wk ${calibration.latest_week.slice(5)}`
                      : "no data yet"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold mb-1">
                    Weeks measured
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-ink-primary break-words leading-tight tabular-nums">
                    {calibration.weeks_measured}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    of last 4
                  </div>
                </div>
              </div>
              <p className="text-[12px] text-ink-muted mt-3 leading-relaxed">
                Of slots whose post aged ≥ 7 days and whose forecast band
                exists, what fraction landed inside <code className="text-[11px] bg-ink-50 px-1 rounded">[low, high]</code>?
                The pipeline asserts an 80% CI; this measures whether the
                bands are empirically calibrated. Drift below 65% means the
                forecast layer is theatrical — Tier 2+ algorithm changes
                will inherit the miscalibration. See{" "}
                <code className="text-[11px] bg-ink-50 px-1 rounded">docs/PLAN_ALGORITHM_AUDIT.md</code>{" "}
                §1.1 for the full rationale.
              </p>
            </Card>
          )}

          {/* R5 (2026-05-02): Yesterday-focused inline card.
              v2 (2026-05-02 user feedback): repositioned BELOW the rollup so
              the weekly grade reads first; Yesterday is a focus shortcut for
              checking yesterday's slots without scrolling the per-day stack.
              The same rows ALSO render in the per-day breakdown below — this
              is a focus pin, not a data fork. */}
          {yesterdayRollup && yesterdayRows.length > 0 && (
            <Card className="mb-5 border-l-4 border-l-brand-shikho-magenta">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-shikho-magenta bg-shikho-magenta-50/60 rounded px-1.5 py-0.5">
                      Yesterday
                    </span>
                    <h2 className="text-base font-semibold text-ink-primary">
                      {yesterdayDayName} {yesterdayDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Dhaka" })}
                    </h2>
                  </div>
                  <p className="text-xs text-ink-muted mt-1">
                    {yesterdayRows.length} slot{yesterdayRows.length === 1 ? "" : "s"} · {yesterdayRollup.hits} hit{yesterdayRollup.hits === 1 ? "" : "s"} · {yesterdayRollup.missed} missed · {yesterdayRollup.pending} pending
                  </p>
                </div>
                <a
                  href={`#day-${yesterdayDayName}`}
                  className="text-[11px] font-semibold uppercase tracking-wider text-brand-shikho-indigo hover:underline self-start sm:self-auto"
                >
                  Jump to {yesterdayDayName} ↓
                </a>
              </div>
              <ul className="divide-y divide-ink-100">
                {yesterdayRows.slice(0, 8).map((s) => {
                  const m = s.matched_post_id ? postById.get(s.matched_post_id) : null;
                  const matchedPost = s.matched_post_id
                    ? allPosts.find((p) => p.id === s.matched_post_id)
                    : null;
                  const reach = matchedPost ? postReachFn(matchedPost) : (s.actual_reach ?? 0);
                  const qe = matchedPost ? qualityEngagementForPost(matchedPost) : 0;
                  const postTime = matchedPost?.created_time
                    ? bdt(matchedPost.created_time).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Dhaka",
                        hour12: false,
                      })
                    : "—";
                  return (
                    <li key={s.outcome_key} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-[11px] text-ink-muted font-semibold uppercase tracking-wider flex-shrink-0 mt-0.5 w-12 tabular-nums">
                          {postTime}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-ink-primary flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium">{s.pillar || "—"}</span>
                            <span className="text-ink-muted">·</span>
                            <span className="text-ink-secondary">{s.format || "—"}</span>
                            {s.hypothesis_id && (
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider bg-brand-shikho-indigo/10 text-brand-shikho-indigo rounded px-1.5 py-0.5 cursor-help"
                                title={hypothesisTip(s.hypothesis_id)}
                              >
                                {s.hypothesis_id}
                              </span>
                            )}
                            {s.preliminary && (
                              <span
                                className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded px-1.5 py-0.5"
                                title={`Post is ${s.age_days ?? "<7"} days old; verdict preliminary.`}
                              >
                                Prelim
                              </span>
                            )}
                          </div>
                          {matchedPost && (
                            <div className="text-[11px] text-ink-muted mt-0.5 flex items-center gap-x-3 flex-wrap">
                              <span className="tabular-nums">
                                <span className="font-semibold text-brand-shikho-indigo">{fmtNum(reach)}</span> reach
                              </span>
                              <span className="tabular-nums">
                                <span className="font-semibold text-brand-shikho-magenta">{qe}</span> QE
                                <span className="ml-1 text-ink-muted/70">({matchedPost.shares || 0}s + {matchedPost.comments || 0}c)</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {m && (
                          <PostReference
                            iconOnly
                            caption={m.message || ""}
                            permalinkUrl={m.permalink_url || ""}
                            iconLabel={`View matched post (${s.matched_post_id})`}
                          />
                        )}
                        <VerdictPill verdict={s.verdict} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {yesterdayRows.length > 8 && (
                <p className="mt-2 text-[11px] text-ink-muted">
                  +{yesterdayRows.length - 8} more slot{yesterdayRows.length - 8 === 1 ? "" : "s"} in {yesterdayDayName} below
                </p>
              )}
            </Card>
          )}

          {/* Per-day stacked cards */}
          <div className="space-y-3">
            {orderedDays.map((day) => {
              const slots = byDay[day];
              return (
                <details
                  key={day}
                  id={`day-${day}`}
                  open
                  className="group bg-ink-paper border border-ink-100 rounded-xl overflow-hidden scroll-mt-4"
                >
                  <summary className="list-none cursor-pointer px-4 sm:px-5 py-3 border-b border-ink-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="flex-shrink-0 text-ink-muted transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                      <span className="font-semibold text-ink-primary">
                        {day}
                      </span>
                      {slots[0]?.date && (
                        <span className="text-xs text-ink-muted">
                          {slots[0].date}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-ink-muted tabular-nums">
                      {slots.length} slot{slots.length === 1 ? "" : "s"}
                    </div>
                  </summary>

                  {/* Desktop: table. Mobile: stacked cards. Both inside
                      overflow-x-auto per mobile checklist rule 6. */}
                  <div className="overflow-x-auto">
                    <table className="hidden sm:table w-full text-sm">
                      <thead className="bg-ink-50 text-ink-muted">
                        <tr className="text-left">
                          <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider">
                            Pillar
                          </th>
                          <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider">
                            Format
                          </th>
                          {hasTargetMetric && (
                            <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider" title="The metric the slot was AIMED at when planned (e.g. 'Follows > 150', 'Engagement rate > 3%', '20K-35K unique reach'). When the slot's stated target isn't reach, the deterministic verdict still scores reach — that's the only dimension we have 90-day priors for.">
                              Target Metric<span className="ml-1 text-ink-muted normal-case font-normal">(slot&apos;s stated bet)</span>
                            </th>
                          )}
                          <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider text-right" title="Unique reach forecast (post_total_media_view_unique). Computed at pillar × format × season level from 90-day priors. Always shown in unique-reach units regardless of the slot's stated target metric.">
                            Reach Forecast<span className="ml-1 text-ink-muted normal-case font-normal">(unique · pillar-level)</span>
                          </th>
                          <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider text-right" title="Unique reach actually delivered by the matched post (Facebook insights post_total_media_view_unique). Always shown in unique-reach units regardless of the slot's stated target metric.">
                            Actual Reach<span className="ml-1 text-ink-muted normal-case font-normal">(unique)</span>
                          </th>
                          <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider text-right" title="Score = actual / forecast_mid. >1 = above forecast, <1 = below. Hit/Miss verdict is computed against the full CI band, not this ratio.">
                            Score<span className="ml-1 text-ink-muted normal-case font-normal">(actual ÷ mid)</span>
                          </th>
                          <th className="px-4 py-2 font-medium text-[11px] uppercase tracking-wider">
                            Verdict
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {slots.map((s) => (
                          <tr
                            key={s.outcome_key}
                            className="border-t border-ink-100"
                          >
                            <td className="px-4 py-2 text-ink-primary">
                              <span className="inline-flex items-center gap-1.5">
                                <span>{s.pillar || "—"}</span>
                                {s.hypothesis_id && (
                                  <span
                                    className="text-[10px] font-bold uppercase tracking-wider bg-brand-shikho-indigo/10 text-brand-shikho-indigo rounded px-1.5 py-0.5 cursor-help"
                                    title={hypothesisTip(s.hypothesis_id)}
                                  >
                                    {s.hypothesis_id}
                                  </span>
                                )}
                                {/* Sprint P7 v4.14 Tier 1.5 (2026-05-01):
                                    matched-post drill-down. Hover/tap reveals
                                    the actual post the matcher tied to this
                                    plan slot; click opens the post on
                                    Facebook. Shows only when a post matched. */}
                                {s.matched_post_id && (() => {
                                  const m = postById.get(s.matched_post_id);
                                  return (
                                    <PostReference
                                      iconOnly
                                      caption={m?.message || ""}
                                      permalinkUrl={m?.permalink_url || ""}
                                      iconLabel={`View matched post (${s.matched_post_id})`}
                                    />
                                  );
                                })()}
                                {s.preliminary && (
                                  <span
                                    className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded px-1.5 py-0.5"
                                    title={`Post is ${s.age_days ?? "<7"} days old; reach hasn't fully decayed. Verdict shown but excluded from Calibration_Log.`}
                                  >
                                    Prelim
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-ink-primary">
                              {s.format || "—"}
                            </td>
                            {hasTargetMetric && (
                            <td className="px-4 py-2 text-ink-primary">
                              {(() => {
                                const target = (s.slot_target_metric || "").trim();
                                const range = (s.slot_expected_reach_range || "").trim();
                                if (!target && !range) {
                                  return <span className="text-ink-muted text-xs italic">not stated</span>;
                                }
                                const isReachTarget = /reach|unique|view/i.test(target);
                                return (
                                  <div className="flex flex-col gap-0.5 min-w-[140px]">
                                    {target && (
                                      <span
                                        className={`text-xs leading-snug ${isReachTarget ? "text-ink-primary" : "text-ink-primary"}`}
                                        title={isReachTarget
                                          ? "This slot's stated target is a reach metric — directly comparable to the Reach Forecast/Actual columns."
                                          : "This slot's stated target is not a reach metric. The deterministic verdict (Hit/Miss) still scores reach because that's the only dimension with 90-day priors. Use this column to read the slot's intent."}
                                      >
                                        {target}
                                      </span>
                                    )}
                                    {range && (
                                      <span className="text-[10px] text-ink-muted">
                                        Expected: {range}
                                      </span>
                                    )}
                                    {target && !isReachTarget && (
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-700 font-semibold mt-0.5"
                                        title="The verdict scores reach (right two columns), not the slot's stated target metric. We only have priors for reach today — stating non-reach targets is allowed but not deterministically scored. Tier 6 of the audit roadmap addresses this."
                                      >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <circle cx="12" cy="12" r="10"></circle>
                                          <line x1="12" y1="8" x2="12" y2="12"></line>
                                          <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                        </svg>
                                        scored on reach
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            )}
                            <td className="px-4 py-2 text-right tabular-nums text-ink-primary">
                              <div className="inline-flex items-baseline gap-1 justify-end">
                                <span>{fmtNum(s.forecast_mid)}</span>
                                <span className="text-[10px] text-ink-muted font-normal lowercase">reach</span>
                              </div>
                              {s.forecast_low !== null &&
                                s.forecast_high !== null && (
                                  <div className="text-[11px] text-ink-muted">
                                    {fmtNum(s.forecast_low)}–{fmtNum(s.forecast_high)}
                                    <span className="ml-0.5 text-[9px] uppercase tracking-wider">CI</span>
                                  </div>
                                )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-primary font-semibold">
                              {s.actual_reach !== null ? (
                                <div className="inline-flex items-baseline gap-1 justify-end">
                                  <span>{fmtNum(s.actual_reach)}</span>
                                  <span className="text-[10px] text-ink-muted font-normal lowercase">reach</span>
                                </div>
                              ) : (
                                <span className="text-ink-muted font-normal">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-ink-secondary">
                              {fmtNum(s.score, 2)}
                              <span className="ml-1 text-[10px] text-ink-muted font-normal">×</span>
                            </td>
                            <td className="px-4 py-2">
                              <VerdictPill verdict={s.verdict} />
                              {s.exam_adjusted_used && (
                                <div className="mt-1 text-[10px] uppercase tracking-wider text-amber-700">
                                  Exam-adjusted
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Mobile stacked layout */}
                    <ul className="sm:hidden divide-y divide-ink-100">
                      {slots.map((s) => (
                        <li key={s.outcome_key} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-ink-primary break-words flex items-center gap-1.5 flex-wrap">
                                <span>{s.pillar || "—"}</span>
                                {s.hypothesis_id && (
                                  <span
                                    className="text-[10px] font-bold uppercase tracking-wider bg-brand-shikho-indigo/10 text-brand-shikho-indigo rounded px-1.5 py-0.5 cursor-help"
                                    title={hypothesisTip(s.hypothesis_id)}
                                  >
                                    {s.hypothesis_id}
                                  </span>
                                )}
                                {s.matched_post_id && (() => {
                                  const m = postById.get(s.matched_post_id);
                                  return (
                                    <PostReference
                                      iconOnly
                                      caption={m?.message || ""}
                                      permalinkUrl={m?.permalink_url || ""}
                                      iconLabel={`View matched post (${s.matched_post_id})`}
                                    />
                                  );
                                })()}
                                {s.preliminary && (
                                  <span
                                    className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded px-1.5 py-0.5"
                                    title={`Post is ${s.age_days ?? "<7"} days old; verdict preliminary.`}
                                  >
                                    Prelim
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-ink-muted mt-0.5">
                                {s.format || "—"}
                              </div>
                            </div>
                            <VerdictPill verdict={s.verdict} />
                          </div>
                          {hasTargetMetric && (() => {
                            const target = (s.slot_target_metric || "").trim();
                            const range = (s.slot_expected_reach_range || "").trim();
                            if (!target && !range) return null;
                            const isReachTarget = /reach|unique|view/i.test(target);
                            return (
                              <div className="mt-2 px-2.5 py-1.5 rounded-md bg-shikho-indigo-50/40 border border-shikho-indigo-100 text-xs">
                                <div className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
                                  Target metric (slot&apos;s stated bet)
                                </div>
                                {target && (
                                  <div className="text-ink-primary leading-snug mt-0.5">{target}</div>
                                )}
                                {range && (
                                  <div className="text-[10px] text-ink-muted mt-0.5">
                                    Expected reach: {range}
                                  </div>
                                )}
                                {target && !isReachTarget && (
                                  <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-700 font-semibold">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10"></circle>
                                      <line x1="12" y1="8" x2="12" y2="12"></line>
                                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                    </svg>
                                    Scored on reach (only metric with priors)
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <div className="text-ink-muted text-[10px] uppercase tracking-wider" title="Unique reach forecast (post_total_media_view_unique)">
                                Reach Forecast
                              </div>
                              <div className="tabular-nums text-ink-primary">
                                <span>{fmtNum(s.forecast_mid)}</span>
                                <span className="ml-1 text-[10px] text-ink-muted font-normal lowercase">reach</span>
                              </div>
                              {s.forecast_low !== null && s.forecast_high !== null && (
                                <div className="text-[10px] text-ink-muted mt-0.5">
                                  {fmtNum(s.forecast_low)}–{fmtNum(s.forecast_high)}
                                  <span className="ml-0.5 text-[9px] uppercase tracking-wider">CI</span>
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-ink-muted text-[10px] uppercase tracking-wider" title="Actual unique reach delivered by the matched post">
                                Actual Reach
                              </div>
                              <div className="tabular-nums text-ink-primary font-semibold">
                                {s.actual_reach !== null ? (
                                  <>
                                    <span>{fmtNum(s.actual_reach)}</span>
                                    <span className="ml-1 text-[10px] text-ink-muted font-normal lowercase">reach</span>
                                  </>
                                ) : (
                                  <span className="text-ink-muted font-normal">—</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-ink-muted text-[10px] uppercase tracking-wider" title="actual ÷ forecast_mid. >1 = above forecast, <1 = below.">
                                Score (actual ÷ mid)
                              </div>
                              <div className="tabular-nums text-ink-primary">
                                {fmtNum(s.score, 2)}<span className="ml-1 text-[10px] text-ink-muted font-normal">×</span>
                              </div>
                            </div>
                          </div>
                          {s.exam_adjusted_used && (
                            <div className="mt-1.5 text-[10px] uppercase tracking-wider text-amber-700">
                              Exam-adjusted forecast
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}

      {/* Footer note — explains exam-confound semantics without bloating
          the hero. Kept short; full methodology lives in DECISIONS.md. */}
      {rows.length > 0 && (
        <p className="mt-6 text-[11px] text-ink-muted leading-relaxed">
          <strong className="text-ink-secondary">Metric:</strong> all forecast
          and actual numbers on this page are <em>unique reach</em>
          (Facebook&apos;s <code className="text-[10px] px-1 py-0.5 rounded bg-ink-50">post_total_media_view_unique</code>{" "}
          insight — distinct viewers per post, not impressions, engagement, or
          shares). Forecast band is the 80% CI from
          Priors_Pillar × Priors_Format × Priors_AcademicSeason; band is
          stamped at plan time and never recomputed.{" "}
          <br />
          <strong className="text-ink-secondary">Hit rate</strong> ={" "}
          (hit + exceeded) ÷ (hit + exceeded + missed). Exam-confounded slots
          are excluded — an active exam window distorts reach unpredictably.
          Preliminary rows (post &lt; 7 days old) show their verdict but are
          excluded from Calibration_Log. Pending = post hasn&apos;t been
          published yet, or no published post matched the slot&apos;s
          (date, format, pillar) join.
        </p>
      )}
    </div>
  );
}

function VerdictPill({ verdict }: { verdict: OutcomeVerdict }) {
  const style = verdictStyle[verdict] ?? verdictStyle[""];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}
    >
      {style.label}
    </span>
  );
}

function Breakdown({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "amber" | "ink" | "indigo";
}) {
  const toneClass = {
    emerald: "text-emerald-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
    ink: "text-ink-muted",
    indigo: "text-brand-shikho-indigo",
  }[tone];
  return (
    <div>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold">
        {label}
      </div>
    </div>
  );
}
