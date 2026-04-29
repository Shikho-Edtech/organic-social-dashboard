"use client";
import { useState, useEffect } from "react";

// Sprint P7 v4 (2026-04-29): "Regenerate this week" escape hatch.
//
// Why this exists: Sprint P7 v3 added running-week locking guards on
// Strategy/Content_Calendar/Plan_Narrative writers (commit f43e14f
// pipeline-side). Default behavior = skip-on-existing for the running
// week so accidental mid-week reruns don't clobber a stable plan.
// When the operator INTENTIONALLY wants a fresh generation (bad output,
// ops recovery, post-prompt-iteration), the pipeline-side bypass is
// `--force-regenerate`. This button gives that escape a UI surface.
//
// v4 implementation: zero-config link out to the GitHub Actions UI's
// "Run workflow" panel for weekly-analysis.yml, with copy explaining
// to flip the `force_regenerate` toggle ON before clicking Run.
// No PAT secret needed; no Next.js API route. Power-user UX = 3 clicks.
//
// v4.5 candidate: Next.js API route `/api/regenerate` that POSTs to
// `repos/:owner/:repo/actions/workflows/:workflow/dispatches` so the
// click triggers the run directly. Requires `GITHUB_PAT` env var on
// Vercel + workflow-write scope. Deferred until pain emerges.

const GH_REPO = "Shikho-Edtech/organic-social-analytics";

export type RegenerateScope = "weekly" | "midweek";

const WORKFLOWS: Record<RegenerateScope, { workflow: string; label: string; description: string }> = {
  weekly: {
    workflow: "weekly-analysis.yml",
    label: "Weekly analysis",
    description:
      "Strategy, Content_Calendar, Plan_Narrative are locked for the running week. Force-regenerate writes fresh AI output for week_ending=this Sunday.",
  },
  midweek: {
    workflow: "midweek-diagnosis.yml",
    label: "Mid-week diagnosis",
    description:
      "Diagnosis is exempt from locking (mid-week + Monday cycle is intentional dual-write), so this option is mostly for ops recovery — re-run Thursday's partial-week diagnosis on demand.",
  },
};

export default function RegenerateThisWeekButton({
  scope = "weekly",
  className = "",
}: {
  /** Which workflow's "Run workflow" UI to open. Default = weekly. */
  scope?: RegenerateScope;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wf = WORKFLOWS[scope];
  const url = `https://github.com/${GH_REPO}/actions/workflows/${wf.workflow}`;

  // Close on Escape when expanded.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-ink-100 bg-ink-paper text-ink-secondary text-xs font-medium hover:border-brand-shikho-coral hover:text-brand-shikho-coral transition-colors"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        Regenerate this week
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Regenerate this week instructions"
          className="absolute right-0 top-full mt-1.5 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-ink-paper border border-ink-100 shadow-lg p-4 text-xs"
        >
          <div className="flex items-start gap-2 mb-2">
            <span className="flex-shrink-0 mt-0.5 text-brand-shikho-coral">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-ink-primary font-semibold leading-snug mb-1">
                Bypass running-week lock
              </p>
              <p className="text-ink-secondary leading-relaxed">{wf.description}</p>
            </div>
          </div>
          <ol className="text-ink-secondary leading-relaxed space-y-1.5 pl-1">
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-shikho-indigo-100 text-brand-shikho-indigo text-[10px] font-bold flex items-center justify-center">
                1
              </span>
              <span>Open the {wf.label} workflow on GitHub Actions.</span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-shikho-indigo-100 text-brand-shikho-indigo text-[10px] font-bold flex items-center justify-center">
                2
              </span>
              <span>
                Click the <span className="font-semibold text-ink-primary">Run workflow</span> dropdown (top-right of the workflow runs list).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-shikho-indigo-100 text-brand-shikho-indigo text-[10px] font-bold flex items-center justify-center">
                3
              </span>
              <span>
                Set <span className="font-mono text-[10px] bg-shikho-indigo-50 text-brand-shikho-indigo px-1 py-0.5 rounded">force_regenerate</span> to <span className="font-semibold text-ink-primary">true</span>, then click Run.
              </span>
            </li>
          </ol>
          <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-shikho-indigo text-white text-xs font-medium hover:bg-shikho-indigo-700 transition-colors"
            >
              Open on GitHub
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1.5 text-ink-muted hover:text-ink-primary text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
