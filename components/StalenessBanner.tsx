// Day 2O: staleness banner for Strategy (diagnosis) and Plan (calendar) pages.
//
// The pipeline's APIError fallback (Day 2M-2N) is designed to keep the
// dashboard running even when Anthropic credits are exhausted — but that
// resilience creates a new failure mode: silent staleness. Without a
// banner, a user would open the Strategy page showing "Week Ending Apr 11"
// and have no idea the weekly refresh has been failing for 7 days.
//
// This component renders a banner when `computeStaleness(...)` returns
// `warn` or `crit`. Placement: top of Strategy + Plan pages, above the
// regular header content.

import type { StalenessInfo } from "@/lib/sheets";

export default function StalenessBanner({
  info,
  artifact,
  hasData = true,
}: {
  info: StalenessInfo;
  artifact: "diagnosis" | "calendar";
  /**
   * True when the page actually has content to show (a latest diagnosis or
   * calendar row exists). When `hasData` is true but staleness is "crit" with
   * `days_since = -1`, we soften the banner to "pipeline freshness unknown"
   * — don't scream "no successful refresh ever" while simultaneously
   * rendering a full strategy verdict below. The prior behavior was
   * technically correct (Analysis_Log didn't record a Last Successful
   * timestamp) but jarring to the user because the PAGE clearly had data.
   */
  hasData?: boolean;
}) {
  if (info.severity === "ok") return null;

  const isCrit = info.severity === "crit";
  const isUnknownFreshness = info.days_since === -1 && hasData;
  const label = artifact === "diagnosis" ? "Strategy" : "Plan";

  // Colour tokens match the dashboard's existing slate + accent palette.
  // `unknown freshness` reads as info (blue-ish slate), not error, because
  // data is present — we just can't verify its age. True crit (no data AND
  // no record) stays rose. warn stays amber.
  const wrapCls = isUnknownFreshness
    ? "border-slate-300 bg-slate-50 text-slate-800"
    : isCrit
    ? "border-rose-300 bg-rose-50 text-rose-900"
    : "border-amber-300 bg-amber-50 text-amber-900";
  const iconCls = isUnknownFreshness
    ? "text-slate-500"
    : isCrit
    ? "text-rose-600"
    : "text-amber-600";
  const icon = isUnknownFreshness ? "i" : "!";

  const lastSuccess = info.last_successful_at
    ? formatShortDate(info.last_successful_at)
    : "never";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${wrapCls}`}
    >
      <span
        aria-hidden
        className={`flex-shrink-0 mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-bold ${iconCls}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight">
          {isUnknownFreshness
            ? `${label} pipeline freshness not recorded`
            : isCrit
            ? `${label} view may be out of date`
            : `${label} refresh warning`}
        </div>
        <p className="mt-0.5 text-xs leading-snug opacity-90 break-words">
          {isUnknownFreshness
            ? `This ${label.toLowerCase()} is rendering from the sheet, but the pipeline hasn't recorded a "Last Successful ${label} At" timestamp in Analysis_Log yet — can't verify when the content below was last refreshed. Check the weekly pipeline logs.`
            : info.reason}
        </p>
        <p className="mt-1 text-[11px] leading-snug opacity-70">
          Last successful update:{" "}
          <span className="font-medium">{lastSuccess}</span>
          {info.last_run_at ? (
            <>
              {" · "}
              Last run:{" "}
              <span className="font-medium">
                {formatShortDate(info.last_run_at)}
              </span>
              {info.last_status !== "success" && info.last_status !== "unknown" ? (
                <> ({info.last_status})</>
              ) : null}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
