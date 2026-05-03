// Plan view — Content Calendar
import { getCalendar, getCalendarByRunId, getCalendarByWeekStarting, getRunStatus, computeStaleness, getStageEngine, getPlanNarrative } from "@/lib/sheets";
import { Card } from "@/components/Card";
import PageHeader from "@/components/PageHeader";
import StalenessBanner from "@/components/StalenessBanner";
import StaleDataBanner from "@/components/StaleDataBanner";
import AIDisabledEmptyState from "@/components/AIDisabledEmptyState";
import ArchivalLine from "@/components/ArchivalLine";
import PlanNarrativeCard from "@/components/PlanNarrativeCard";
import AcademicContextStrip from "@/components/AcademicContextStrip";
import WeekSelector, { computeWeekEndings, weekRange } from "@/components/WeekSelector";
// RegenerateThisWeekButton removed in v4.18 — admin-only, returns with SaaS access layers.
import { STAGES } from "@/lib/stages";
import { isStaleNow, getStaleReasons } from "@/lib/cache";

/**
 * Sprint P7 v4.7 (2026-04-30, P1.8): glossary tooltips for slot pills.
 * External stakeholders + new team members shouldn't have to hunt for
 * what SSC / HSC / BOFU / MOFU / TOFU mean. Plain English on hover/tap.
 */
function slotAudienceTooltip(audience: string): string {
  const map: Record<string, string> = {
    SSC: "Secondary School Certificate (class 9-10 students preparing for the SSC exam)",
    HSC: "Higher Secondary Certificate (class 11-12 students preparing for the HSC exam)",
    "SSC '26": "Secondary School Certificate batch graduating in 2026",
    "HSC '26": "Higher Secondary Certificate batch graduating in 2026",
    JSC: "Junior School Certificate (class 8 — phased out but still surfaces in older tags)",
    "Class 6-8": "Junior secondary students (class 6 through 8)",
    "Class 9-10": "SSC candidates (class 9 and 10)",
    "Class 11-12": "HSC candidates (class 11 and 12)",
    Admission: "University admission test prep audience",
    Mixed: "Cross-class content; not targeted to a single audience segment",
  };
  return map[audience] || `Audience segment: ${audience}`;
}

function slotFunnelTooltip(stage: string): string {
  const upper = stage.toUpperCase();
  const map: Record<string, string> = {
    TOFU: "Top of Funnel — awareness content. Targets new viewers who don't know Shikho yet (explainer reels, free lessons, thought leadership).",
    MOFU: "Middle of Funnel — consideration. Targets viewers who know Shikho but haven't bought (demos, student stories, course highlights).",
    BOFU: "Bottom of Funnel — decision/conversion. Targets viewers ready to buy (pricing, discount, enrollment deadline, last-call posts).",
  };
  return map[upper] || `Funnel stage: ${stage}`;
}

/**
 * Sprint P7 v4.13 (2026-05-01): the dashboard week convention was
 * unified to Mon-anchor (matching the pipeline's storage convention).
 * `targetWeekEnding` IS the Monday — passing it as the week_starting
 * argument is a no-op identity. Helper kept for back-compat with any
 * caller that historically passed a Sunday; it now Mon-snaps any input
 * by walking back to the prior Monday so misuse degrades to identity
 * for already-Mon inputs.
 */
function weekStartingFromEnding(weekEnding: string): string {
  if (!weekEnding) return "";
  const d = new Date(`${weekEnding}T12:00:00`);
  if (isNaN(d.getTime())) return "";
  const dow = d.getDay(); // 0=Sun..6=Sat
  const back = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setDate(mon.getDate() - back);
  return mon.toISOString().slice(0, 10);
}

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Day 2T: each day is a collapsed card at landing. User sees 7 day
// cards with date + post count + a preview row of format chips. Clicks
// one open to reveal the full slot briefs for that day. No information
// is lost — just layered.

const formatColors: Record<string, { bg: string; text: string; ring: string; stripe: string }> = {
  Reel:     { bg: "bg-pink-50",   text: "text-pink-700",   ring: "ring-pink-200",   stripe: "bg-pink-400" },
  Photo:    { bg: "bg-blue-50",   text: "text-blue-700",   ring: "ring-blue-200",   stripe: "bg-blue-400" },
  Carousel: { bg: "bg-amber-50",  text: "text-amber-700",  ring: "ring-amber-200",  stripe: "bg-amber-400" },
  Video:    { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-200", stripe: "bg-purple-400" },
  Link:     { bg: "bg-teal-50",   text: "text-teal-700",   ring: "ring-teal-200",   stripe: "bg-teal-400" },
  Status:   { bg: "bg-slate-100", text: "text-slate-700",  ring: "ring-slate-200",  stripe: "bg-slate-300" },
};

const dayAccent: Record<string, string> = {
  Monday:    "from-indigo-500/90 to-blue-500/80",
  Tuesday:   "from-cyan-500/90 to-teal-500/80",
  Wednesday: "from-emerald-500/90 to-green-500/80",
  Thursday:  "from-amber-500/90 to-orange-500/80",
  Friday:    "from-rose-500/90 to-pink-500/80",
  Saturday:  "from-fuchsia-500/90 to-purple-500/80",
  Sunday:    "from-violet-500/90 to-indigo-500/80",
};

// Resolve today's day-of-week AND today's calendar date in Asia/Dhaka (BDT).
// Both are needed: day-of-week controls which card's accent gradient matches
// the viewer's current weekday; calendar date controls whether the "Today"
// badge lights up. The prior version only checked day-of-week, which meant
// a Saturday-in-the-plan (e.g., "Saturday, April 25") lit up as "Today" when
// the viewer's real today was "Saturday, April 18" — the plan is for NEXT
// week, so day-of-week match isn't enough to prove it's actually today.
function todayInDhaka(): { weekday: string; dateKey: string } {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Dhaka",
  }).format(now);
  // Parseable ISO-ish form so we can match it against whatever the calendar
  // slot's Date column holds. Extracts YYYY-MM-DD in BDT.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return { weekday, dateKey: parts };
}

// Compare a calendar slot's date string to today's BDT date. Tolerant of
// multiple input shapes: "2026-04-25", "Apr 25, 2026", "April 25, 2026",
// "25 Apr 2026". Returns true only when the parsed calendar year+month+day
// exactly matches the viewer's today in BDT. Logic intentionally conservative:
// if we can't parse the date, we don't claim it's today.
function slotIsToday(slotDate: string | undefined, todayKey: string): boolean {
  if (!slotDate) return false;
  const s = String(slotDate).trim();
  // ISO-style already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10) === todayKey;
  // Try a native Date parse as a fallback
  const d = new Date(s);
  if (isNaN(d.getTime())) return false;
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return iso === todayKey;
}

// Sprint P4 wiring (2026-04-23): compact human-readable string for the
// native forecast CI. "unavailable" source is a legitimate cold-start
// outcome (no matching priors row); returns null so callers fall back
// to the AI-provided `expected_reach` range instead of showing a
// meaningless 0-0 display.
function formatNativeCI(ci: {
  low: number; mid: number; high: number; source: string;
} | undefined): string | null {
  if (!ci || ci.source === "unavailable") return null;
  const fmt = (n: number) => {
    if (!Number.isFinite(n) || n < 0) return "?";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(Math.round(n));
  };
  return `${fmt(ci.low)}–${fmt(ci.mid)}–${fmt(ci.high)}`;
}

export default async function PlanPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // Step 3 archival mode (legacy): `?archived=<run-id>` reads from the
  // legacy Calendar_Archive tab. Sprint P7 v3 supersedes this with the
  // week-by-week Content_Calendar history; archival mode kept for
  // backward compatibility with any existing deep links.
  const archivedParam = typeof searchParams?.archived === "string" ? searchParams.archived : "";
  const isArchival = Boolean(archivedParam);

  // Sprint P7 v3 (2026-04-29): Plan week selector. Resolves
  // ?week=this|next|last|YYYY-MM-DD to the corresponding week_ending
  // Sunday, then derives the Monday week_starting that Content_Calendar
  // rows live under. Default = "this" (current Mon-Sun running week).
  const weekParam = typeof searchParams.week === "string" ? searchParams.week : "";
  const { this_: thisWeekEnding, last: lastWeekEnding, next: nextWeekEnding } = computeWeekEndings();
  const isThisWeekView = !weekParam || weekParam === "this" || weekParam === thisWeekEnding;
  const isLastWeekView = weekParam === "last" || weekParam === lastWeekEnding;
  const isNextWeekView = weekParam === "next" || weekParam === nextWeekEnding;
  const targetWeekEnding = isThisWeekView ? thisWeekEnding : isLastWeekView ? lastWeekEnding : isNextWeekView ? nextWeekEnding : weekParam;
  const targetWeekStarting = weekStartingFromEnding(targetWeekEnding);

  const [archivedCalendar, weekCalendar, runStatus, calendarEngine, planNarrative] = await Promise.all([
    isArchival ? getCalendarByRunId(archivedParam) : Promise.resolve([] as Awaited<ReturnType<typeof getCalendar>>),
    isArchival || !targetWeekStarting
      ? Promise.resolve([] as Awaited<ReturnType<typeof getCalendar>>)
      : getCalendarByWeekStarting(targetWeekStarting),
    getRunStatus(),
    getStageEngine("calendar"),
    // PLN-07: read the week-level narrative summary the pipeline (PLN-06)
    // writes on every successful calendar generation. Skipped in archival
    // mode since we don't have week-indexed narrative archival yet.
    // Sprint P7 v4.11: scope Plan_Narrative read to the requested week so
    // the tooltip's hypotheses_map matches the calendar being shown. Older
    // call passed no arg → always returned the newest row, which mismatched
    // when viewing Last Week. Note: pipeline keys Plan_Narrative.Week Ending
    // off the running-Monday string (despite the column name), same as
    // Content_Calendar.Week Ending.
    isArchival ? Promise.resolve(null) : getPlanNarrative(targetWeekStarting),
  ]);
  // Sprint P7 v4.11 (2026-05-01): the silent cross-week fallback was
  // removed. Previously, when "Last week" or "Next week" had no rows in
  // Content_Calendar, the page silently rendered the most recent calendar
  // in the sheet — making all three weekly views look identical. That hid
  // the actual data state ("we don't have a plan for this week") behind
  // a misleading copy of another week's plan. Now the page shows an
  // honest empty state when the requested week has no rows; outcomes
  // measurement remains valid because the matcher only ever scores the
  // week the plan was actually written for.
  const calendar = isArchival ? archivedCalendar : weekCalendar;
  const staleness = computeStaleness("calendar", runStatus);
  const aiDisabled = calendarEngine === "native" || calendarEngine === "off";
  // Read-side resilience: caught any cache fallback during the data
  // fetches above? StaleDataBanner renders a soft heads-up.
  const staleData = isStaleNow();
  const staleReasons = staleData ? getStaleReasons() : undefined;
  const byDay: Record<string, typeof calendar> = {};
  for (const slot of calendar) {
    (byDay[slot.day] = byDay[slot.day] || []).push(slot);
  }
  const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const orderedDays = daysOrder.filter((d) => byDay[d]?.length);
  const { weekday: todayWeekday, dateKey: todayKey } = todayInDhaka();

  // AI-disabled empty state takes over when the calendar stage is off AND
  // we're NOT in archival-read mode. Returns a card explaining how to re-
  // enable the stage + a link to view the archived version if available.
  if (aiDisabled && !isArchival) {
    return (
      <div>
        <StaleDataBanner stale={staleData} reasons={staleReasons} />
        <StalenessBanner
          info={staleness}
          artifact="calendar"
          runStatus={runStatus}
          aiDisabled
          hasData={calendar.length > 0}
        />
        <AcademicContextStrip />
        <PageHeader
          title="Plan"
          subtitle="Next week's content calendar — AI generation is off"
          dateLabel="Generated by latest weekly run"
          showPicker={false}
          lastScrapedAt={runStatus.last_run_at}
          compact
        />
        <AIDisabledEmptyState
          stage={STAGES.calendar}
          lastSuccessfulAt={runStatus.last_successful_calendar_at}
          // Calendar_Archive doesn't exist yet; archive link hidden until the
          // pipeline starts writing it. Empty string hides the link.
          archiveKey=""
          noun="AI calendar"
          readsDescription="This page reads the weekly AI-generated content calendar."
        />
      </div>
    );
  }

  return (
    <div className={isArchival ? "opacity-[0.97] [filter:saturate(0.9)]" : ""}>
      <StaleDataBanner stale={staleData} reasons={staleReasons} />
      {isArchival ? (
        // Pass "" (not archivedParam) when we can't resolve a real date —
        // ArchivalLine falls back to "Viewing archived run" without a "from X"
        // clause, preventing the raw query param (e.g. "true") from leaking
        // into the UI.
        <ArchivalLine
          archiveDateLabel={runStatus.last_successful_calendar_at
            ? new Date(runStatus.last_successful_calendar_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : ""}
          livePath="/plan"
        />
      ) : (
        <StalenessBanner
          info={staleness}
          artifact="calendar"
          runStatus={runStatus}
          hasData={calendar.length > 0}
        />
      )}
      <AcademicContextStrip />
      <PageHeader
        title="Plan"
        subtitle={isArchival
          ? "Archived content calendar"
          : (isThisWeekView
              ? "This week's content calendar"
              : isNextWeekView
                ? "Next week's content calendar"
                : "Last week's content calendar (historical)")}
        dateLabel={isArchival ? "Archived snapshot" : `Mon–Sun BDT · ${weekRange(targetWeekStarting)}`}
        showPicker={false}
        lastScrapedAt={runStatus.last_run_at}
        compact
      />

      {/* Sprint P7 v3 (2026-04-29): Plan week selector. Hidden in
          archival mode — that path uses the legacy ArchivalLine UI.
          Selector enabled now that Content_Calendar is append-by-week
          (commit pending). Pre-existing rows from the clear+rewrite
          era live under whichever week's Date column they had at
          time of last write — usually "Next week" relative to that
          run. So immediately after this ships, "This week" or
          "Next week" tab will populate from the existing single-week
          row set, and "Last week" stays empty until next Monday's run
          appends fresh history. */}
      {!isArchival && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
          <WeekSelector
            basePath="/plan"
            current={weekParam}
            choices={["this", "next", "last"]}
            preserve={searchParams}
          />
          {/* RegenerateThisWeekButton removed in v4.18 — admin-only. */}
        </div>
      )}

      {/* Sprint P7 v4.11 (2026-05-01): honest per-week empty state.
          Previously a silent cross-week fallback caused all three weekly
          views to look identical when only one week's data was in
          Content_Calendar. Now each week stands on its own — the empty
          state tells the user which week is missing and why. */}
      {calendar.length === 0 && !isArchival && (
        <Card className="text-center py-12">
          <p className="text-ink-primary font-medium">
            No calendar for {isLastWeekView ? "last week" : isNextWeekView ? "next week" : "this week"} yet
          </p>
          <p className="text-ink-muted text-sm mt-2 max-w-xl mx-auto">
            {isLastWeekView
              ? `Content_Calendar has no rows for week starting ${targetWeekStarting}. Past plans are immutable — they only land here when the corresponding Monday cron runs (or has run). If this week was before the per-week archive landed (Sprint P7 v3, 2026-04-29), it was never preserved.`
              : isNextWeekView
                ? `Next week's calendar will be generated by the upcoming Monday cron (${targetWeekStarting}). You can also trigger it manually via the Regenerate Week button — only the upcoming week is regenerable; past + running weeks are locked so Outcomes can score against the original forecast.`
                : `This week's calendar will populate when the next weekly pipeline run lands. The running week's plan is locked once written so Outcomes can score actuals against the original forecast.`}
          </p>
        </Card>
      )}

      {/* PLN-07: week-level narrative summary sits above the per-day
          cards. Hidden in archival mode (narrative archive doesn't
          exist yet) and hidden when there are no slots to frame. */}
      {!isArchival && calendar.length > 0 && (
        <PlanNarrativeCard
          narrative={planNarrative}
          scope={isLastWeekView ? "last" : isNextWeekView ? "next" : "this"}
        />
      )}

      <div className="space-y-3">
        {orderedDays.map((day) => {
          const slots = byDay[day];
          const accent = dayAccent[day] || "from-slate-500 to-slate-400";
          // "Today" badge requires BOTH day-of-week match and actual-date
          // match. The calendar is for next week's slots, so Saturday in the
          // plan (next Sat) shouldn't light up when today is also a Saturday
          // (this Sat). `slotIsToday` checks the slot's date string against
          // the viewer's BDT today; this is the only claim that matches the
          // word "Today". The weekday-only match is used for the weekday
          // accent gradient (styling), not the badge (semantic).
          const isToday =
            day === todayWeekday && slots.some((s) => slotIsToday(s.date, todayKey));

          // Tally formats for the preview chip row on the day header
          const formatTally: Record<string, number> = {};
          for (const s of slots) {
            const f = s.format || "Status";
            formatTally[f] = (formatTally[f] || 0) + 1;
          }
          const formatEntries = Object.entries(formatTally).sort((a, b) => b[1] - a[1]);

          return (
            // Today's card: expanded by default via `open` + gets a stronger
            // indigo ring so it stands out from the collapsed six others.
            // The ring is offset so it doesn't clash with the card's own
            // rounded border on white backgrounds.
            <details
              key={day}
              open={isToday}
              className={`group bg-white border border-slate-200 rounded-xl overflow-hidden ${
                isToday ? "ring-2 ring-brand-shikho-indigo ring-offset-2 ring-offset-slate-50" : ""
              }`}
            >
              <summary className="list-none cursor-pointer">
                <div className={`relative px-4 sm:px-5 py-4 bg-gradient-to-r ${accent} text-white transition-opacity group-hover:opacity-95`}>
                  {/* Mobile: chevron + day + count on row 1, chips on row 2.
                      sm+: single row with chips flexing in the middle. */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Chevron — down arrow flips 180° on open. Standardized
                          across Plan + Strategy disclosures so the affordance
                          is consistent everywhere in the app. */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-white/80 transition-transform group-open:rotate-180">
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                      {/* Day + date */}
                      <div className="flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-bold leading-tight">{day}</div>
                          {isToday && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-white text-slate-900 rounded px-1.5 py-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-shikho-pink animate-pulse" />
                              Today
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-medium uppercase tracking-wider text-white/80 mt-0.5">{slots[0]?.date}</div>
                      </div>
                      {/* Post count — on mobile it sits top-right next to date */}
                      <div className="ml-auto sm:hidden flex-shrink-0 text-right leading-none">
                        <div className="text-2xl font-bold">{slots.length}</div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80 mt-1">post{slots.length > 1 ? "s" : ""}</div>
                      </div>
                    </div>
                    {/* Format chips — full-width row on mobile, flex-1 middle on sm+ */}
                    <div className="flex flex-wrap gap-1.5 items-center sm:flex-1 sm:min-w-0 sm:justify-end">
                      {formatEntries.map(([fmt, count]) => (
                        <span key={fmt} className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider bg-white/15 text-white/95 rounded-md px-2 py-1 ring-1 ring-white/20">
                          <span className="font-bold">{count}</span> {fmt}
                        </span>
                      ))}
                    </div>
                    {/* Post count — sm+ only; mobile version lives in the day/date row above */}
                    <div className="hidden sm:block flex-shrink-0 text-right leading-none">
                      <div className="text-2xl font-bold">{slots.length}</div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80 mt-1">post{slots.length > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                </div>
              </summary>

              {/* Slot briefs — only visible when day is expanded.
                  Alternating row shading + stronger divider pair up to give
                  each slot a visually distinct lane. `divide-slate-100` alone
                  washed out against the white card; `divide-slate-200` plus
                  `odd:bg-slate-50/40` gives a subtle zebra that reads clearly
                  on mobile without adding visual weight on desktop. */}
              <div className="divide-y divide-slate-200">
                {slots.map((slot, i) => {
                  const fc = formatColors[slot.format] || formatColors.Status;
                  return (
                    <div key={i} className="relative px-4 sm:px-5 py-5 odd:bg-slate-50/40 hover:bg-slate-50/80 transition-colors">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${fc.stripe}`} />
                      {/* Mobile: time + format row ABOVE content. sm+: time+format LEFT of content,
                          with the time pill in a fixed-width column so all slots align vertically. */}
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                        {/* Left group: time pill + format chip */}
                        <div className="flex items-center gap-2 sm:gap-3 sm:flex-shrink-0">
                          <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md px-2 py-1 sm:w-20 sm:justify-center">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 flex-shrink-0">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            {slot.time_bdt || "—"}
                          </div>
                          <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md ${fc.bg} ${fc.text} ring-1 ${fc.ring}`}>
                            {slot.format}
                          </span>
                        </div>
                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 mb-1.5">
                            <span className="font-semibold text-brand-shikho-pink">{slot.pillar}</span>
                            {(slot.spotlight_name || (slot.featured_entity && slot.featured_entity !== "None")) && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-brand-shikho-orange font-medium">
                                  {slot.spotlight_name || slot.featured_entity}
                                  {slot.spotlight_type && slot.spotlight_type !== "None" && (
                                    <span className="text-slate-500 font-normal"> ({slot.spotlight_type})</span>
                                  )}
                                </span>
                              </>
                            )}
                            {/* Sprint P7 v4.7 (2026-04-30, P1.8): tooltip
                                glossary on the abbreviation pills so external
                                stakeholders + new team members don't have to
                                hunt for what SSC/HSC/BOFU/MOFU/TOFU mean. */}
                            {slot.audience && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span title={slotAudienceTooltip(slot.audience)} className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">{slot.audience}</span>
                              </>
                            )}
                            {slot.funnel_stage && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span title={slotFunnelTooltip(slot.funnel_stage)} className="text-slate-600 font-medium cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2">{slot.funnel_stage}</span>
                              </>
                            )}
                            {/* Sprint P4 schema v2: hypothesis_id pill.
                                Links this slot to the strategy's weekly
                                hypothesis set. h0/h1/h2/... Renders only
                                when present; pre-schema-v2 rows skip it. */}
                            {slot.hypothesis_id && (() => {
                              // Sprint P7 v4.11 (2026-05-01): tooltip now binds
                              // to the actual hypothesis statement (resolved
                              // server-side by the pipeline into Plan_Narrative.
                              // Hypotheses Map). Falls back to a short generic
                              // line when the map is missing for that id (older
                              // weeks pre-migration, or h0 status-quo).
                              const text = planNarrative?.hypotheses_map?.[slot.hypothesis_id];
                              const tip = text
                                ? `${slot.hypothesis_id.toUpperCase()}: ${text}`
                                : `${slot.hypothesis_id.toUpperCase()} — hypothesis statement not yet resolved (older week or status-quo). Run the next weekly pipeline to populate.`;
                              return (
                                <>
                                  <span className="text-ink-200">·</span>
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-brand-shikho-indigo/10 text-brand-shikho-indigo rounded px-1.5 py-0.5 cursor-help"
                                    title={tip}
                                  >
                                    {slot.hypothesis_id}
                                  </span>
                                </>
                              );
                            })()}
                          </div>
                          {/* Hook */}
                          <div className="text-[15px] text-slate-800 font-medium leading-snug">{slot.hook_line}</div>
                          {slot.key_message && <div className="text-sm text-slate-600 mt-1 leading-relaxed">{slot.key_message}</div>}

                          {/* Spec rows */}
                          <div className="mt-3 space-y-1.5">
                            {slot.visual_direction && (
                              <div className="flex gap-2 text-xs">
                                <span className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-16">Visual</span>
                                <span className="text-slate-600 leading-relaxed">{slot.visual_direction}</span>
                              </div>
                            )}
                            {slot.cta && (
                              <div className="flex gap-2 text-xs">
                                <span className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500 w-16">CTA</span>
                                <span className="text-slate-600 leading-relaxed">{slot.cta}</span>
                              </div>
                            )}
                          </div>

                          {/* Expected + Success metric — inline chips.
                              Sprint P4 schema v2: when a native forecast CI
                              is available (stamped by
                              enrich_calendar_with_forecasts), the Target
                              chip widens to show low/mid/high + source so
                              the operator can see the evidence behind the
                              range. Absent CI or source="unavailable" falls
                              back to the AI's free-form expected_reach. */}
                          {(() => {
                            const nativeRange = formatNativeCI(slot.forecast_reach_ci_native);
                            const ciSource = slot.forecast_reach_ci_native?.source;
                            const showTarget = Boolean(nativeRange || slot.expected_reach);
                            if (!showTarget && !slot.success_metric) return null;
                            return (
                              <div className="flex flex-wrap gap-2 mt-3">
                                {showTarget && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] bg-brand-cyan/10 text-brand-cyan rounded-md px-2 py-1"
                                    title={ciSource ? `Forecast source: ${ciSource}` : undefined}
                                  >
                                    <span className="font-semibold">Reach:</span>
                                    <span>{nativeRange || slot.expected_reach}</span>
                                    {nativeRange && ciSource && (
                                      <span className="text-brand-cyan/70 ml-0.5">· {ciSource}</span>
                                    )}
                                  </span>
                                )}
                                {slot.success_metric && (
                                  <span className="inline-flex items-center gap-1 text-[11px] bg-brand-green/10 text-brand-green rounded-md px-2 py-1">
                                    <span className="font-semibold">Success:</span>
                                    <span>{slot.success_metric}</span>
                                  </span>
                                )}
                                {/* Sprint P4 schema v2: risk flag count pill.
                                    Detail lives inside the disclosure below
                                    so the chip stays compact. */}
                                {slot.risk_flags && slot.risk_flags.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[11px] bg-brand-shikho-coral/10 text-brand-shikho-coral rounded-md px-2 py-1">
                                    <span className="font-semibold">Risks:</span>
                                    <span>{slot.risk_flags.length}</span>
                                  </span>
                                )}
                              </div>
                            );
                          })()}

                          {/* Sprint P4 schema v2: risks disclosure. Same
                              disclosure pattern as "Why this post" below —
                              down-chevron flips 180° on open. Renders only
                              when the slot carries at least one risk flag. */}
                          {slot.risk_flags && slot.risk_flags.length > 0 && (
                            <details className="group/rf mt-3">
                              <summary className="list-none cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-brand-shikho-coral hover:text-brand-shikho-coral/80">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open/rf:rotate-180">
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                                Risks &amp; mitigations ({slot.risk_flags.length})
                              </summary>
                              <div className="mt-2 space-y-2">
                                {slot.risk_flags.map((rf, rfi) => (
                                  <div
                                    key={rfi}
                                    className="text-xs bg-brand-shikho-coral/5 border border-brand-shikho-coral/20 rounded-md p-3 leading-relaxed"
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-shikho-coral">
                                        {rf.category}
                                      </span>
                                    </div>
                                    <div className="text-ink-700">
                                      <span className="font-semibold">Risk:</span> {rf.detail}
                                    </div>
                                    <div className="text-ink-500 mt-1">
                                      <span className="font-semibold">Mitigation:</span> {rf.mitigation}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}

                          {/* Rationale disclosure — same chevron pattern as
                              the day cards: down-arrow flips 180° on open. */}
                          {slot.rationale && (
                            <details className="group/r mt-3">
                              <summary className="list-none cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open/r:rotate-180">
                                  <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                                Why this post
                              </summary>
                              <div className="mt-2 text-xs text-slate-600 bg-slate-50 rounded-md p-3 leading-relaxed border border-slate-100">{slot.rationale}</div>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      <div className="text-center text-xs text-slate-500 py-6">Edit slots in the Content_Calendar tab of the Google Sheet. Changes reflect here within 5 minutes.</div>
    </div>
  );
}
