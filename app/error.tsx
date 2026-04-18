"use client";

// Root error boundary. Catches thrown errors from any Server Component in
// the app/ tree — most commonly a Google Sheets timeout or a transient
// auth failure when fetching Analysis_Log / Content_Calendar.
//
// Why this exists: without a boundary, a Sheets hiccup surfaced as an
// opaque Next.js error overlay in dev and a blank page in production.
// Now the user sees a friendly card with a Try again button that re-runs
// the failed Server Component (via Next's `reset` callback) instead of
// a full page reload.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logs the stack to the browser console so it reaches Vercel's
    // client-side error reporting. `digest` is Next's stable error id
    // (safe to show; doesn't leak stack details).
    // eslint-disable-next-line no-console
    console.error("[app/error.tsx]", error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="w-full max-w-lg rounded-xl bg-white border border-rose-200 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 mt-0.5 text-rose-600">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              Something went wrong loading this page
            </h2>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              The upstream data source (Google Sheets or the Facebook pipeline)
              may be momentarily unreachable. This is usually transient, try
              again in a few seconds.
            </p>
            {error?.digest && (
              <p className="mt-3 text-[11px] font-mono text-slate-500">
                Reference: {error.digest}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => reset()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-shikho-indigo text-white text-sm font-semibold hover:bg-brand-shikho-blue transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Back to Overview
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
