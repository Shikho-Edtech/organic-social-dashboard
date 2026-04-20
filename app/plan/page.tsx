// Plan view — Content Calendar
import { getCalendar, getCalendarByRunId, getRunStatus, computeStaleness, getStageEngine } from "@/lib/sheets";
import { Card } from "@/components/Card";
import PageHeader from "@/components/PageHeader";
import StalenessBanner from "@/components/StalenessBanner";
import AIDisabledEmptyState from "@/components/AIDisabledEmptyState";
import ArchivalLine from "@/components/ArchivalLine";
import { STAGES } from "@/lib/stages";

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

export default async function PlanPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  // Step 3 archival mode: `?archived=<run-id>` switches the page into a
  // read-only view against a specific past Content_Calendar snapshot. Until
  // Calendar_Archive exists in the sheet, the archival reader always returns
  // []; the page falls back to "archive not found" copy via the empty list.
  const archivedParam = typeof searchParams?.archived === "string" ? searchParams.archived : "";
  const isArchival = Boolean(archivedParam);

  const [liveCalendar, archivedCalendar, runStatus, calendarEngine] = await Promise.all([
    isArchival ? Promise.resolve([] as Awaited<ReturnType<typeof getCalendar>>) : getCalendar(),
    isArchival ? getCalendarByRunId(archivedParam) : Promise.resolve([] as Awaited<ReturnType<typeof getCalendar>>),
    getRunStatus(),
    getStageEngine("calendar"),
  ]);
  const calendar = isArchival ? archivedCalendar : liveCalendar;
  const staleness = computeStaleness("calendar", runStatus);
  const aiDisabled = calendarEngine === "native" || calendarEngine === "off";
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
        <StalenessBanner
          info={staleness}
          artifact="calendar"
          runStatus={runStatus}
          aiDisabled
          hasData={calendar.length > 0}
        />
        <PageHeader
          title="Plan"
          subtitle="Next week's content calendar — AI generation is off"
          dateLabel="Generated by latest weekly run"
          showPicker={false}
          lastScrapedAt={runStatus.last_run_at}
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
      {isArchival ? (
        <ArchivalLine
          archiveDateLabel={runStatus.last_successful_calendar_at
            ? new Date(runStatus.last_successful_calendar_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : archivedParam}
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
      <PageHeader
        title="Plan"
        subtitle={isArchival
          ? "Archived content calendar"
          : "Next week's content calendar — click a day to expand"}
        dateLabel={isArchival ? "Archived snapshot" : "Generated by latest weekly run"}
        showPicker={false}
        lastScrapedAt={runStatus.last_run_at}
      />

      {calendar.length === 0 && (
        <Card className="text-center py-12">
          <p className="text-slate-700 font-medium">No calendar generated yet</p>
          <p className="text-slate-500 text-sm mt-2">The next weekly pipeline run will populate next week&apos;s plan.</p>
        </Card>
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
                            {slot.audience && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span>{slot.audience}</span>
                              </>
                            )}
                            {slot.funnel_stage && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-600 font-medium">{slot.funnel_stage}</span>
                              </>
                            )}
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

                          {/* Expected + Success metric — inline chips */}
                          {(slot.expected_reach || slot.success_metric) && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {slot.expected_reach && (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-brand-cyan/10 text-brand-cyan rounded-md px-2 py-1">
                                  <span className="font-semibold">Target:</span>
                                  <span>{slot.expected_reach}</span>
                                </span>
                              )}
                              {slot.success_metric && (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-brand-green/10 text-brand-green rounded-md px-2 py-1">
                                  <span className="font-semibold">Success:</span>
                                  <span>{slot.success_metric}</span>
                                </span>
                              )}
                            </div>
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
