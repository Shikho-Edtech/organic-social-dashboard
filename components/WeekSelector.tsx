// Sprint P7 Phase 2 (2026-04-28) + v4.13 unification (2026-05-01):
// shared week selector for time-bucketed pages (Diagnosis · Plan ·
// Outcomes). Each option resolves to an underlying YYYY-MM-DD running
// MONDAY (the canonical Mon-anchor key the pipeline writes to all the
// per-week tabs: Content_Calendar.Week Ending, Plan_Narrative.Week
// Ending, Weekly_Analysis.Week Ending, Outcome_Log.Week Ending).
//
// Pre-v4.13 the selector returned the closing SUNDAY which produced
// two pathologies: (a) lookups against the Mon-anchored data returned
// nothing → empty pages, and (b) date labels showed "Apr 26" while
// the data tables showed "2026-04-27" → user confusion.
//
// `this_` / `last` / `next` field names are kept for back-compat
// (consumers shouldn't need to change), but they now carry the Monday
// that STARTS the week, not the Sunday that ends it.

import Link from "next/link";
import { bdtNow } from "@/lib/aggregate";

export type WeekChoice = "this" | "last" | "next";

export type WeekOption = {
  /** Stable URL value: YYYY-MM-DD or one of the semantic shortcuts */
  href: string;
  /** Human label rendered in the pill */
  label: string;
  /** Optional sub-label (e.g. resolved range "Apr 27 – May 3") */
  subLabel?: string;
  /** Whether this is the active selection */
  active: boolean;
};

/**
 * Compute the YYYY-MM-DD Monday opening the BDT week containing `now`.
 * Mondays return their own date.
 */
function runningMonday(now: Date): string {
  const dow = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Walk back to Monday. Sun (0) → 6 days back; Mon (1) → 0; … Sat (6) → 5.
  const back = dow === 0 ? 6 : dow - 1;
  const mon = new Date(now);
  mon.setDate(mon.getDate() - back);
  mon.setHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}

/**
 * Build the canonical week-anchor (Monday) dates for "this / last / next"
 * relative to BDT now. Returns ISO date strings (YYYY-MM-DD).
 *
 * Naming preserved (`this_` / `last` / `next`) for caller compatibility,
 * but values are now the Monday-anchor of each week, not the Sunday-end.
 */
export function computeWeekEndings(): {
  this_: string;
  last: string;
  next: string;
} {
  const now = bdtNow();
  const this_ = runningMonday(now);
  const lastDate = new Date(`${this_}T00:00:00`);
  lastDate.setDate(lastDate.getDate() - 7);
  const last = lastDate.toISOString().slice(0, 10);
  const nextDate = new Date(`${this_}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + 7);
  const next = nextDate.toISOString().slice(0, 10);
  return { this_, last, next };
}

/**
 * Format an ISO date as "Mon DD" (e.g. "Apr 27") for sub-labels.
 */
export function shortDate(iso: string): string {
  if (!iso) return "";
  // Use BDT-aware parsing to avoid off-by-one near midnight.
  const d = new Date(`${iso}T12:00:00`); // noon to dodge DST edges
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Dhaka",
  });
}

/**
 * Format the Mon-Sun range for a week given its Mon-anchor.
 * E.g. "2026-04-27" → "Apr 27 – May 3".
 */
export function weekRange(mondayIso: string): string {
  if (!mondayIso) return "";
  const mon = new Date(`${mondayIso}T12:00:00`);
  if (isNaN(mon.getTime())) return "";
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "Asia/Dhaka",
    });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

/**
 * Resolve a `?week=this|last|next|YYYY-MM-DD` URL param to a concrete
 * YYYY-MM-DD week_ending Sunday. Defaults to "this" on bad input.
 */
export function resolveWeekParam(raw: string | undefined): string {
  const { this_, last, next } = computeWeekEndings();
  if (!raw || raw === "this") return this_;
  if (raw === "last") return last;
  if (raw === "next") return next;
  // Strict YYYY-MM-DD passes through (validated by date parse).
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(new Date(raw).getTime())) {
    return raw;
  }
  return this_;
}

type WeekSelectorProps = {
  /** Path prefix for the pill <Link>s (e.g. "/plan", "/diagnosis") */
  basePath: string;
  /** Current ?week=... param raw value (this | last | next | YYYY-MM-DD | undefined) */
  current: string | undefined;
  /** Which choices to render — Diagnosis = ["this","last"], Plan = ["this","next","last"] */
  choices: WeekChoice[];
  /** Optional preserved query params to keep on the URLs (e.g. metric=...) */
  preserve?: Record<string, string | string[] | undefined>;
};

export default function WeekSelector({
  basePath,
  current,
  choices,
  preserve = {},
}: WeekSelectorProps) {
  const { this_, last, next } = computeWeekEndings();
  // Resolve the active selection to its semantic key for highlighting.
  const activeKey: WeekChoice = (() => {
    if (!current || current === "this") return "this";
    if (current === "last") return "last";
    if (current === "next") return "next";
    // For raw YYYY-MM-DD, match against the three resolved dates.
    if (current === this_) return "this";
    if (current === last) return "last";
    if (current === next) return "next";
    return "this";
  })();

  const labelMap: Record<WeekChoice, { label: string; iso: string }> = {
    this: { label: "This week", iso: this_ },
    last: { label: "Last week", iso: last },
    next: { label: "Next week", iso: next },
  };

  function buildHref(choice: WeekChoice): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(preserve)) {
      if (k === "week") continue;
      if (typeof v === "string") params.set(k, v);
      else if (Array.isArray(v) && v.length) params.set(k, v[0]);
    }
    if (choice !== "this") params.set("week", choice);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  // R1 (2026-05-02): tighter chrome on Weekly bucket pages. mb-4 → mb-3,
  // pills px-3 py-1 → px-2.5 py-0.5 with smaller font, range subscript
  // shrunk to [9px]. Saves ~12-16px of vertical space + makes the row read
  // as a control strip rather than a hero.
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Week:
      </span>
      {choices.map((c) => {
        const isActive = c === activeKey;
        const { label, iso } = labelMap[c];
        return (
          <Link
            key={c}
            href={buildHref(c)}
            scroll={false}
            aria-pressed={isActive}
            className={`px-2.5 py-0.5 rounded-md border text-[11px] font-medium transition-colors ${
              isActive
                ? "bg-brand-shikho-indigo text-white border-brand-shikho-indigo"
                : "bg-ink-paper text-ink-secondary border-ink-100 hover:border-brand-shikho-indigo hover:text-brand-shikho-indigo"
            }`}
            title={`Mon-Sun BDT: ${weekRange(iso)} (week starts ${iso})`}
          >
            <span>{label}</span>
            <span
              className={`ml-1 text-[9px] ${
                isActive ? "text-white/80" : "text-ink-muted"
              }`}
            >
              ({weekRange(iso)})
            </span>
          </Link>
        );
      })}
    </div>
  );
}
