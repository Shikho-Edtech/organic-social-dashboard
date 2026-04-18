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
}: {
  info: StalenessInfo;
  artifact: "diagnosis" | "calendar";
}) {
  if (info.severity === "ok") return null;

  const isCrit = info.severity === "crit";
  const label = artifact === "diagnosis" ? "Strategy" : "Plan";

  // Colour tokens match the dashboard's existing slate + accent palette.
  // Yellow (warn) uses amber for visibility against white cards; red (crit)
  // uses rose for unmistakable signal. Both have accessible contrast at
  // the sizes used (body text is slate-900 on tinted bg).
  const wrapCls = isCrit
    ? "border-rose-300 bg-rose-50 text-rose-900"
    : "border-amber-300 bg-amber-50 text-amber-900";
  const iconCls = isCrit ? "text-rose-600" : "text-amber-600";
  const icon = isCrit ? "!" : "!";

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
          {isCrit
            ? `${label} view may be out of date`
            : `${label} refresh warning`}
        </div>
        <p className="mt-0.5 text-xs leading-snug opacity-90 break-words">
          {info.reason}
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
