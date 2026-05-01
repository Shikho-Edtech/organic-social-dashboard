// Sprint P7 v4.15 (2026-05-02): Today page — operational landing.
//
// Three sections, top-to-bottom, no clicks needed:
//  1. ALERT STRIP (conditional) — exam window proximity + System_Suggestions
//     critical/warning items + any structural anomalies
//  2. TODAY — today's planned slots from Content_Calendar with publish status
//     (cross-checked against today's actually-published posts)
//  3. YESTERDAY — yesterday's posts with reach + Outcome_Log verdict
//  4. THIS WEEK SO FAR — running totals: Reach + Quality Engagement (the
//     candidate north-star) with WoW deltas
//
// Quality Engagement is displayed in PARALLEL with reach — neither is
// declared the canonical north-star yet. After 4-8 weeks of `North_Star_Trace`
// data + team subjective verdicts, we'll pick the winner. See
// `docs/PLAN_ALGORITHM_AUDIT.md` Tier 4 + DECISIONS 2026-05-02 for rationale.

import {
  getPosts,
  getCalendar,
  getOutcomeLog,
  getRunStatus,
  computeStaleness,
  getPlanNarrative,
} from "@/lib/sheets";
import { bdt, bdtNow, dateStr, startOfWeekBDT } from "@/lib/aggregate";
import {
  totalReach,
  totalQualityEngagement,
  totalShares,
  totalComments,
  wowDelta,
  formatWowDelta,
  deltaColorClass,
  qualityEngagementForPost,
  postReach,
} from "@/lib/qualityEngagement";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/Card";
import StalenessBanner from "@/components/StalenessBanner";
import PostReference from "@/components/PostReference";
import HypothesisChip from "@/components/HypothesisChip";
import Link from "next/link";
import { weekRange } from "@/components/WeekSelector";

export const dynamic = "force-dynamic";
export const revalidate = 300;

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (Math.abs(n) < 1000) return String(Math.round(n));
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export default async function TodayPage() {
  const now = bdtNow();
  const today = dateStr(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dateStr(yesterdayDate);

  const weekStart = startOfWeekBDT(now);
  const weekStartIso = dateStr(weekStart);
  const priorWeekStart = new Date(weekStart);
  priorWeekStart.setDate(priorWeekStart.getDate() - 7);
  const priorWeekStartIso = dateStr(priorWeekStart);

  const [posts, calendar, outcomeLog, runStatus, planNarrative] = await Promise.all([
    getPosts(),
    getCalendar(),
    getOutcomeLog(),
    getRunStatus(),
    getPlanNarrative(weekStartIso),
  ]);
  const staleness = computeStaleness("calendar", runStatus);
  const hypothesesMap = planNarrative?.hypotheses_map || {};

  // -------- TODAY's plan slots (from Content_Calendar) --------
  const todaysSlots = calendar.filter((s) => s.date === today);
  const todaysSlotsByTime = [...todaysSlots].sort((a, b) =>
    (a.time_bdt || "").localeCompare(b.time_bdt || "")
  );

  // -------- TODAY's published posts (from Raw_Posts) --------
  const todaysPosts = posts.filter((p) => {
    if (!p.created_time) return false;
    return dateStr(bdt(p.created_time)) === today;
  });

  // -------- YESTERDAY's published posts --------
  const yesterdaysPosts = posts.filter((p) => {
    if (!p.created_time) return false;
    return dateStr(bdt(p.created_time)) === yesterday;
  });
  const yesterdayOutcomes = outcomeLog.filter((r) => r.date === yesterday);
  // Index outcome by matched_post_id for drill-down
  const outcomeByPostId = new Map<string, typeof outcomeLog[0]>();
  for (const r of outcomeLog) {
    if (r.matched_post_id) outcomeByPostId.set(r.matched_post_id, r);
  }
  const postById = new Map<string, { message?: string; permalink_url?: string }>();
  for (const p of posts) {
    postById.set(p.id, {
      message: (p as any).message || "",
      permalink_url: (p as any).permalink_url || "",
    });
  }

  // -------- THIS WEEK SO FAR (Mon → today) --------
  const thisWeekPosts = posts.filter((p) => {
    if (!p.created_time) return false;
    const d = bdt(p.created_time);
    return d >= weekStart && d <= now;
  });
  // Prior period of equal length: Mon last week → Mon-of-this-week + 1 + same-many-days-into-prior-week
  const priorEnd = new Date(priorWeekStart);
  const daysIntoWeek = Math.floor((now.getTime() - weekStart.getTime()) / 86_400_000);
  priorEnd.setDate(priorEnd.getDate() + daysIntoWeek);
  const priorWeekPosts = posts.filter((p) => {
    if (!p.created_time) return false;
    const d = bdt(p.created_time);
    return d >= priorWeekStart && d <= priorEnd;
  });

  const thisWeekReach = totalReach(thisWeekPosts);
  const priorWeekReach = totalReach(priorWeekPosts);
  const thisWeekQE = totalQualityEngagement(thisWeekPosts);
  const priorWeekQE = totalQualityEngagement(priorWeekPosts);
  const thisWeekShares = totalShares(thisWeekPosts);
  const thisWeekComments = totalComments(thisWeekPosts);

  const reachDelta = wowDelta(thisWeekReach, priorWeekReach);
  const qeDelta = wowDelta(thisWeekQE, priorWeekQE);

  const thisWeekOutcomes = outcomeLog.filter((r) => r.week_ending === weekStartIso);
  const hits = thisWeekOutcomes.filter((r) => r.verdict === "hit").length;
  const exceeded = thisWeekOutcomes.filter((r) => r.verdict === "exceeded").length;
  const missed = thisWeekOutcomes.filter((r) => r.verdict === "missed").length;
  const pending = thisWeekOutcomes.filter(
    (r) => r.verdict === "no-data" || r.verdict === "unavailable"
  ).length;

  // -------- ALERTS --------
  type Alert = { severity: "info" | "warning" | "critical"; text: string };
  const alerts: Alert[] = [];
  // Heuristic exam-window alert (placeholder until SystemSuggestions reader lands)
  if (runStatus.last_successful_calendar_at) {
    const ageHours = (now.getTime() - new Date(runStatus.last_successful_calendar_at).getTime()) / 3_600_000;
    if (ageHours > 36) {
      alerts.push({
        severity: "warning",
        text: `Calendar pipeline last ran ${Math.round(ageHours)}h ago — fresh run may be due`,
      });
    }
  }
  if (!todaysSlotsByTime.length) {
    alerts.push({
      severity: "warning",
      text: `No planned slots in Content_Calendar for ${today} — running-week plan may be incomplete`,
    });
  }
  if (todaysSlotsByTime.length && todaysPosts.length > todaysSlotsByTime.length) {
    alerts.push({
      severity: "info",
      text: `Today: ${todaysPosts.length} posts published vs ${todaysSlotsByTime.length} planned — over-publishing`,
    });
  }

  // -------- Match today's posts to today's slots (best-effort) --------
  // For each slot, find the post with closest time match + same date
  const formatBucket = (s: string): string => {
    const f = (s || "").toLowerCase();
    if (f === "reel" || f === "video") return "video";
    return f;
  };
  const slotPublishStatus = todaysSlotsByTime.map((slot) => {
    const candidates = todaysPosts.filter((p) => {
      const ptype = formatBucket(p.type || "");
      return ptype === formatBucket(slot.format);
    });
    return {
      slot,
      published: candidates.length > 0,
      matchedPost: candidates[0] || null,
    };
  });

  const dayLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Dhaka",
  });

  return (
    <div>
      <StalenessBanner info={staleness} artifact="calendar" runStatus={runStatus} hasData />
      <PageHeader
        title="Today"
        subtitle="What to watch right now"
        dateLabel={`${dayLabel} · BDT`}
        showPicker={false}
        lastScrapedAt={runStatus.last_run_at}
      />

      {/* ALERT STRIP — only renders when there's something to flag */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 px-3 py-2 rounded-md text-sm border ${
                a.severity === "critical"
                  ? "bg-brand-red/5 border-brand-red/30 text-brand-red"
                  : a.severity === "warning"
                    ? "bg-brand-amber/5 border-brand-amber/30 text-brand-amber"
                    : "bg-shikho-indigo-50 border-shikho-indigo-100 text-brand-shikho-indigo"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span className="leading-snug">{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* TODAY: today's planned slots */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">Today&apos;s Plan</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {todaysSlotsByTime.length} slots planned · {slotPublishStatus.filter(s => s.published).length} published · {slotPublishStatus.filter(s => !s.published).length} upcoming
            </p>
          </div>
          <Link
            href="/plan"
            className="text-xs font-semibold uppercase tracking-wider text-brand-shikho-indigo hover:underline self-start sm:self-auto"
          >
            Open Plan →
          </Link>
        </div>
        {todaysSlotsByTime.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">
            No slots planned for today. Either the running-week plan hasn&apos;t been generated yet (Plan&apos;s Regenerate button) or this is an unexpected gap — check Plan page.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {slotPublishStatus.map(({ slot, published, matchedPost }, i) => (
              <li key={i} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                    published
                      ? "bg-brand-green/15 text-brand-green"
                      : "bg-shikho-indigo-50 text-brand-shikho-indigo"
                  }`}>
                    {published ? "✓" : "⏰"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-ink-primary font-medium flex items-center gap-1.5 flex-wrap">
                      <span>{slot.time_bdt || "—"} · {slot.format} · {slot.pillar}</span>
                      {slot.hypothesis_id && (
                        <HypothesisChip id={slot.hypothesis_id} map={hypothesesMap} />
                      )}
                    </div>
                    {slot.hook_line && (
                      <div className="text-xs text-ink-muted mt-0.5 line-clamp-2">
                        {slot.hook_line}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                  {published && matchedPost && (
                    <PostReference
                      iconOnly
                      caption={matchedPost.message || ""}
                      permalinkUrl={matchedPost.permalink_url || ""}
                      iconLabel="View today's matched post on Facebook"
                    />
                  )}
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                    published ? "text-brand-green" : "text-ink-muted"
                  }`}>
                    {published ? "Published" : "Upcoming"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* YESTERDAY: published posts + verdicts */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">Yesterday</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {yesterdaysPosts.length} posts published · {yesterdayOutcomes.filter(r => r.verdict === "hit" || r.verdict === "exceeded").length} hits · {yesterdayOutcomes.filter(r => r.verdict === "missed").length} missed
            </p>
          </div>
          <Link
            href={`/outcomes?week=${weekStartIso}`}
            className="text-xs font-semibold uppercase tracking-wider text-brand-shikho-indigo hover:underline self-start sm:self-auto"
          >
            Open Outcomes →
          </Link>
        </div>
        {yesterdaysPosts.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">
            No posts published yesterday.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {yesterdaysPosts
              .sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())
              .slice(0, 6)
              .map((p, i) => {
                const reach = postReach(p);
                const qe = qualityEngagementForPost(p);
                const outcome = outcomeByPostId.get(p.id);
                const verdict = outcome?.verdict || "";
                const verdictColor =
                  verdict === "hit" || verdict === "exceeded" ? "text-brand-green" :
                  verdict === "missed" ? "text-brand-red" :
                  "text-ink-muted";
                return (
                  <li key={i} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-[11px] text-ink-muted font-semibold uppercase tracking-wider flex-shrink-0 mt-1 w-12">
                        {bdt(p.created_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka", hour12: false })}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm text-ink-primary truncate">
                          {p.type ? `${p.type[0].toUpperCase()}${p.type.slice(1)}` : "—"} ·{" "}
                          {(p.message || "").slice(0, 60) || "(no caption)"}
                        </div>
                        <div className="text-[11px] text-ink-muted mt-0.5">
                          {fmtNum(reach)} reach · QE {qe} ({p.shares || 0}s + {p.comments || 0}c)
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PostReference
                        iconOnly
                        caption={p.message || ""}
                        permalinkUrl={p.permalink_url || ""}
                        iconLabel="View post on Facebook"
                      />
                      {verdict && (
                        <span className={`text-[11px] font-semibold uppercase tracking-wider ${verdictColor}`}>
                          {verdict}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      {/* THIS WEEK SO FAR — dual-metric header (Reach + Quality Engagement) */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">This Week So Far</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Mon–Sun BDT · {weekRange(weekStartIso)} · {thisWeekPosts.length} posts published · {hits + exceeded} hits · {missed} missed · {pending} pending
            </p>
          </div>
          <Link
            href="/diagnosis"
            className="text-xs font-semibold uppercase tracking-wider text-brand-shikho-indigo hover:underline self-start sm:self-auto"
          >
            Open Diagnosis →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Reach */}
          <div className="rounded-lg border border-ink-100 bg-ink-paper p-4">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold">
              Reach (current scoring anchor)
            </div>
            <div className="text-2xl font-bold text-brand-shikho-indigo tabular-nums mt-1 break-words leading-tight">
              {fmtNum(thisWeekReach)}
              <span className="text-xs text-ink-muted font-normal ml-1.5">unique</span>
            </div>
            <div className={`text-xs font-semibold mt-1 ${deltaColorClass(reachDelta)}`}>
              {formatWowDelta(reachDelta)} vs prior period
            </div>
          </div>
          {/* Quality Engagement */}
          <div className="rounded-lg border border-shikho-indigo-100 bg-gradient-to-br from-shikho-indigo-50/30 to-ink-paper p-4">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold">
              Quality Engagement <span className="ml-1 normal-case font-normal text-ink-muted">candidate</span>
            </div>
            <div className="text-2xl font-bold text-brand-shikho-magenta tabular-nums mt-1 break-words leading-tight">
              {fmtNum(thisWeekQE)}
            </div>
            <div className={`text-xs font-semibold mt-1 ${deltaColorClass(qeDelta)}`}>
              {formatWowDelta(qeDelta)} vs prior period
            </div>
            <div className="text-[10px] text-ink-muted font-normal mt-1.5 leading-relaxed">
              {thisWeekShares} shares × 2 + {thisWeekComments} comments × 1
            </div>
          </div>
        </div>
        <div className="mt-4 px-3 py-2 rounded-md bg-ink-50 border border-ink-100 text-[11px] text-ink-secondary leading-relaxed">
          <strong className="text-ink-primary">Two metrics shown in parallel.</strong> Reach is the current scoring anchor (what priors and Outcomes verdicts measure). Quality Engagement (Shares × 2 + Comments × 1) is a candidate north-star — displayed alongside reach for 4–8 weeks while we collect data on which one tracks team intuition better. Decision deferred to <code className="text-[10px] px-1 py-0.5 rounded bg-ink-100">North_Star_Trace</code> review. See <Link href="/docs" className="underline">PLAN_ALGORITHM_AUDIT.md Tier 4</Link> for rationale.
        </div>
      </Card>
    </div>
  );
}
