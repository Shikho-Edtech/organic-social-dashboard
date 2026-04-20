// Step 3 archival mode: persistent, single-line breadcrumb at the top of a
// page when the user is viewing an archived artifact via `?archived=<key>`.
//
// Deliberately quiet — slate-500 text, bottom-border only, no fill, no icon
// tint. Design: "nothing fancy" (Cycle 1 §7). The "Return to live view" link
// drops the `?archived` query param; Next.js App Router re-renders the page
// without the archival artifact.

import Link from "next/link";

// `archiveDateLabel` is considered a valid display date only when it looks
// like a human-readable date (letters + digits). Raw query params like "true"
// or "1" would otherwise render as "Viewing archived run from true" — we
// degrade gracefully to "Viewing archived run" without a date in that case.
function looksLikeDateLabel(s: string): boolean {
  const v = (s || "").trim();
  if (!v) return false;
  if (/^(true|false|1|0|yes|no|null|undefined)$/i.test(v)) return false;
  // Expect at least one letter (month abbreviation) OR an ISO-ish date.
  return /[A-Za-z]/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v);
}

export default function ArchivalLine({
  archiveDateLabel,
  livePath,
}: {
  /** Short human-readable label for the archived run, e.g. "Apr 11". May be
   *  empty or a raw param like "true" — the component degrades gracefully. */
  archiveDateLabel: string;
  /** The page's base path, without any query. Link target for "Return". */
  livePath: string;
}) {
  const showDate = looksLikeDateLabel(archiveDateLabel);
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 pb-2 text-[13px] text-slate-500"
    >
      <svg
        aria-hidden
        className="flex-shrink-0 text-slate-400"
        width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      <span>
        {showDate ? (
          <>
            Viewing archived run from{" "}
            <span className="font-medium text-slate-700">{archiveDateLabel}</span>
          </>
        ) : (
          <>Viewing archived run</>
        )}
      </span>
      <span className="text-slate-300" aria-hidden>·</span>
      <Link
        href={livePath}
        className="text-slate-600 hover:text-slate-900 underline underline-offset-2"
      >
        Return to live view
      </Link>
    </div>
  );
}
