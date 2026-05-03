// Stale-data banner — surfaces when a server-component read fell back
// to last-known-good cache (lib/cache.ts).
//
// Shipped 2026-05-03 alongside the read-side resilience layer. Without
// this banner, a transient sheets blip looked identical to a stale-but-
// no-banner render — the user couldn't tell whether they were looking
// at fresh-but-empty data or at cached-from-an-earlier-run data.
//
// Renders nothing when reads were fresh — it's a soft heads-up, not a
// permanent fixture. The pages all import isStaleNow() at server-render
// time and pass it as a boolean prop, so the banner never has to read
// module state on its own (cleaner SSR semantics).

import Link from "next/link";

type Props = {
  /** Pass `isStaleNow()` from `lib/cache` after your data fetches. */
  stale: boolean;
  /** Optional: the human reasons from `getStaleReasons()`. Shown in title attr for hover tooltip. */
  reasons?: { key: string; reason: string; ageMs: number }[];
};

export default function StaleDataBanner({ stale, reasons }: Props) {
  if (!stale) return null;
  const tooltip = reasons && reasons.length > 0
    ? reasons
        .map(
          (r) =>
            `${r.key} — ${r.reason} (${Math.round(r.ageMs / 1000)}s ago)`,
        )
        .join("\n")
    : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 px-3 py-2 rounded-lg border border-brand-amber/40 bg-brand-amber/10 flex items-start sm:items-center gap-2 flex-wrap"
      title={tooltip}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-brand-amber flex-shrink-0 mt-0.5 sm:mt-0"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span className="text-xs text-brand-amber font-semibold uppercase tracking-wider">
        Data refreshing
      </span>
      <span className="text-xs text-ink-secondary leading-snug">
        Showing the last successful read while a sheets fetch hiccup clears. Numbers may be a few minutes behind. Refresh in a moment for live values.
      </span>
    </div>
  );
}
