// Step 3 archival mode: persistent, single-line breadcrumb at the top of a
// page when the user is viewing an archived artifact via `?archived=<key>`.
//
// Deliberately quiet — slate-500 text, bottom-border only, no fill, no icon
// tint. Design: "nothing fancy" (Cycle 1 §7). The "Return to live view" link
// drops the `?archived` query param; Next.js App Router re-renders the page
// without the archival artifact.

import Link from "next/link";

export default function ArchivalLine({
  archiveDateLabel,
  livePath,
}: {
  /** Short human-readable label for the archived run, e.g. "Apr 11". */
  archiveDateLabel: string;
  /** The page's base path, without any query. Link target for "Return". */
  livePath: string;
}) {
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
        Viewing archived run from{" "}
        <span className="font-medium text-slate-700">{archiveDateLabel}</span>
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
