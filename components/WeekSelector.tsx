// Sprint P7 Phase 2 (2026-04-28): shared week selector for time-bucketed
// pages (Diagnosis · Plan · Outcomes). Each option resolves to an
// underlying YYYY-MM-DD week_ending Sunday, computed from `bdtNow()` so
// "This week" / "Last week" / "Next week" are always consistent with the
// dashboard's BDT calendar.
//
// Render: pills above the page content, mirroring the visual vocabulary
// of FormatHourMetricPills (engagement page) and the existing /outcomes
// week list. Server-rendered: pills are <Link>s that change ?week=...,
// page re-renders with the new week's data on next request.
//
// Why not <select>: Tailwind pills are easier to scan at a glance, work
// on touch devices without OS-style picker chrome, and match the rest
// of the dashboard's selector pattern (FormatHourMetricPills, etc.).

import Link from "next/link";
import { bdtNow } from "@/lib/aggregate";

export type WeekChoice = "this" | "last" | "next";

export type WeekOption = {
  /** Stable URL value: YYYY-MM-DD or one of the semantic shortcuts */
  href: string;
  /** Human label rendered in the pill */
  label: string;
  /** Optional sub-label (e.g. resolved date "Apr 26") shown below the label */
  subLabel?: string;
  /** Whether this is the active selection */
  active: boolean;
};

/**
 * Compute the YYYY-MM-DD Sunday closing the BDT week containing `now`.
 * Sundays return their own date (Sunday is the closing day).
 */
function closingSunday(now: Date): string {
  const dow = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const daysToSun = dow === 0 ? 0 : 7 - dow;
  const sun = new Date(now);
  sun.setDate(sun.getDate() + daysToSun);
  sun.setHours(0, 0, 0, 0);
  return sun.toISOString().slice(0, 10);
}

/**
 * Build the canonical week-ending dates for "this / last / next" relative
 * to BDT now. Returns ISO date strings (YYYY-MM-DD) for each.
 */
export function computeWeekEndings(): {
  this_: string;
  last: string;
  next: string;
} {
  const now = bdtNow();
  // "This week" = the BDT Mon-Sun containing today; closing Sunday.
  // E.g. on Tuesday April 28, this resolves to Sunday May 3.
  const this_ = closingSunday(now);
  // "Last week" = the just-completed Mon-Sun. Closing Sunday is 7 days
  // before this week's closing Sunday.
  const lastDate = new Date(`${this_}T00:00:00`);
  lastDate.setDate(lastDate.getDate() - 7);
  const last = lastDate.toISOString().slice(0, 10);
  // "Next week" = the upcoming Mon-Sun. Closing Sunday is 7 days after
  // this week's closing Sunday.
  const nextDate = new Date(`${this_}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + 7);
  const next = nextDate.toISOString().slice(0, 10);
  return { this_, last, next };
}

/**
 * Format an ISO date as "Mon DD" (e.g. "Apr 26") for sub-labels.
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

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        Showing:
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
            className={`px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
              isActive
                ? "bg-brand-shikho-indigo text-white border-brand-shikho-indigo"
                : "bg-ink-paper text-ink-secondary border-ink-100 hover:border-brand-shikho-indigo hover:text-brand-shikho-indigo"
            }`}
          >
            <span>{label}</span>
            <span
              className={`ml-1.5 text-[10px] ${
                isActive ? "text-white/80" : "text-ink-muted"
              }`}
            >
              ({shortDate(iso)})
            </span>
          </Link>
        );
      })}
    </div>
  );
}
