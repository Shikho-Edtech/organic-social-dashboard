"use client";

// AI-pending / AI-failed / AI-off empty state for content-team-facing pages.
//
// 2026-05-05 rewrite (page-by-page review feedback): the prior version
// surfaced env-var copy chips ("set DIAGNOSIS_PROVIDER, DIAGNOSIS_MODEL,
// DIAGNOSIS_API_KEY in the pipeline's GitHub Actions secrets") and an
// archived-version deep link. End users don't have access to those
// secrets and don't need that detail. Replaced with a state-aware pill
// + last-successful-run + next-scheduled hint + one short message.
//
// State drives copy (ArtifactStatus from lib/sheets.ts):
//   - "failed"   → AI [noun] run failed (numbers still update)
//   - "fallback" → AI [noun] unavailable (likely credits — numbers still update)
//   - "skipped"  → AI [noun] is off this week (numbers still update)
//   - other      → AI [noun] pending (will populate at next scheduled run)
//
// Numerical data on the page (live KPIs from posts) is independent of AI
// status; this card never blocks numbers from rendering.

import type { ArtifactStatus } from "@/lib/sheets";

export default function AIDisabledEmptyState({
  noun,
  lastSuccessfulAt,
  status,
  nextScheduledLabel,
}: {
  /** Sentence noun, e.g. "AI diagnosis", "AI calendar". */
  noun: string;
  /** ISO timestamp of the stage's most recent successful run. "" = never. */
  lastSuccessfulAt: string;
  /** Drives the pill copy + the body sentence. */
  status: ArtifactStatus;
  /**
   * Optional hint about WHEN the next run is expected, e.g. "Thursday
   * morning" or "Monday morning". When omitted, the body falls back to
   * a generic "the next scheduled run". Caller computes this because the
   * cadence differs by artifact (diagnosis runs Mon + Thu; calendar
   * runs Mon only).
   */
  nextScheduledLabel?: string;
}) {
  const pill = pillFor(status);
  const title = titleFor(noun, status);
  const body = bodyFor(status, nextScheduledLabel);

  return (
    <div className="max-w-2xl mx-auto my-6">
      <div className="relative rounded-xl border border-ink-100 bg-ink-paper p-5 sm:p-6 shadow-sm">
        <div
          className={`inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] rounded-full px-2.5 py-1 ring-1 ${pill.classes}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {pill.label}
        </div>

        <h2 className="mt-3 text-lg sm:text-xl font-bold text-ink-primary leading-tight tracking-tight break-words">
          {title}
        </h2>

        <p className="mt-2 text-sm text-ink-secondary leading-relaxed">
          {body}
        </p>

        <div className="mt-3 text-[12px] text-ink-muted">
          Last successful run:{" "}
          <span className="font-medium text-ink-secondary">
            {lastSuccessfulAt ? formatShortDate(lastSuccessfulAt) : "never"}
          </span>
          {lastSuccessfulAt && (
            <span className="text-ink-muted"> ({daysAgo(lastSuccessfulAt)})</span>
          )}
        </div>
      </div>
    </div>
  );
}

function pillFor(status: ArtifactStatus): { label: string; classes: string } {
  if (status === "failed") {
    return {
      label: "Run failed",
      classes:
        "bg-rose-50 text-rose-700 ring-rose-200",
    };
  }
  if (status === "fallback") {
    return {
      label: "Unavailable",
      classes:
        "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }
  if (status === "skipped") {
    return {
      label: "Off this run",
      classes:
        "bg-ink-50 text-ink-secondary ring-ink-100",
    };
  }
  return {
    label: "Pending",
    classes:
      "bg-shikho-indigo-50/60 text-brand-shikho-indigo ring-brand-shikho-indigo/15",
  };
}

function titleFor(noun: string, status: ArtifactStatus): string {
  const base = noun || "AI artifact";
  if (status === "failed") return `${base} run failed`;
  if (status === "fallback") return `${base} unavailable for this week`;
  if (status === "skipped") return `${base} is off this week`;
  return `${base} pending`;
}

function bodyFor(
  status: ArtifactStatus,
  nextScheduledLabel: string | undefined,
): string {
  if (status === "failed") {
    return "The most recent run did not complete successfully. Numerical data on this page continues to update independently of AI runs.";
  }
  if (status === "fallback") {
    return "The AI run for this week did not produce a verdict (commonly an AI credit limit). Numerical data on this page continues to update independently.";
  }
  if (status === "skipped") {
    return "AI generation is intentionally off this run. Numerical data on this page continues to update independently.";
  }
  // pending / unknown / other
  if (nextScheduledLabel) {
    return `Will populate after ${nextScheduledLabel}'s scheduled run. Numerical data on this page continues to update independently of AI runs.`;
  }
  return "Will populate after the next scheduled run. Numerical data on this page continues to update independently.";
}

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysAgo(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
