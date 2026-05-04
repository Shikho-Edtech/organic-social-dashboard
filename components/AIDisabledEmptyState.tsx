"use client";

// Step 3: empty state rendered on /strategy or /plan when the backing AI
// stage has been explicitly turned off (pipeline ran with --engine=native or
// the stage was skipped entirely).
//
// Design: docs/design/Cycle 1 - Banner and Empty States.html §6 (/strategy
// and /plan instances). Same card on both pages — only the noun and env-var
// names change. Byte-identical layout is the point, so the reader learns the
// pattern once.
//
// The "View archived" link wires the archival-read mode: clicking it pushes
// `?archived=<week-ending>` onto the URL and the page re-renders with the
// archived artifact. Landing on the same URL with no query param returns to
// this empty state. One URL param = one state flag; no router push needed
// beyond the link itself (Next.js App Router re-renders on searchParams).

import { useState } from "react";
import Link from "next/link";

export default function AIDisabledEmptyState({
  envVars,
  lastSuccessfulAt,
  archiveKey,
  noun,
  readsDescription,
}: {
  /**
   * The stage's env-var names (rendered as copy-on-click chips). 2026-05-04
   * incident #2: was previously `stage: StageDef` — that object carries
   * `readStatus` / `readLastSuccessful` FUNCTIONS which can't cross the
   * server→client RSC boundary. `Functions cannot be passed directly to
   * Client Components` was the actual digest 3451054532 root cause. Pass
   * just the serializable string-array slice instead.
   */
  envVars: readonly string[];
  /** ISO timestamp of the stage's most recent successful run. "" = never. */
  lastSuccessfulAt: string;
  /**
   * The ID to deep-link the archived artifact as `?archived=<archiveKey>`.
   * For diagnosis this is the Week Ending string (e.g., "2026-04-11").
   * For calendar it's the Run ID (future; "" until Calendar_Archive exists).
   * Empty string hides the "View archived" link.
   */
  archiveKey: string;
  /** Sentence noun, e.g. "strategy", "calendar". */
  noun: string;
  /**
   * One-sentence description of what the page reads, e.g. "This page reads
   * the weekly AI diagnosis." Kept as a prop so the component stays generic.
   */
  readsDescription: string;
}) {
  return (
    <div className="max-w-2xl mx-auto my-6">
      <div className="relative rounded-xl border border-slate-200 bg-white ring-1 ring-inset ring-brand-shikho-indigo/5 p-6 sm:p-8 shadow-sm">
        {/* Intentionally-off pill */}
        <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-shikho-indigo rounded-full px-2.5 py-1 ring-1 ring-brand-shikho-indigo/15"
             style={{ backgroundColor: "rgba(30,42,120,0.06)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-brand-shikho-indigo" />
          Intentionally off
        </div>

        <h2 className="mt-3 text-xl sm:text-2xl font-bold text-slate-900 leading-tight tracking-tight break-words">
          {titleFor(noun)}
        </h2>

        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          {readsDescription} Every other page on the dashboard still works on
          the native pipeline (extract + classify + analyse).
        </p>

        <div className="mt-4 flex items-start gap-2 text-[13px] text-slate-600">
          <svg aria-hidden className="flex-shrink-0 mt-0.5 text-slate-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>
            Last successful run:{" "}
            <span className="font-medium text-slate-800">
              {lastSuccessfulAt ? formatShortDate(lastSuccessfulAt) : "never"}
            </span>
            {lastSuccessfulAt && (
              <span className="text-slate-500"> ({daysAgo(lastSuccessfulAt)})</span>
            )}
          </span>
        </div>

        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-2">
            How to turn it back on
          </div>
          <p className="text-[13px] text-slate-600 leading-relaxed">
            Set{" "}
            <EnvChips vars={envVars} />
            {" "}in the pipeline&apos;s GitHub Actions secrets, then re-run the
            weekly workflow.
          </p>
        </div>

        {archiveKey && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <Link
              href={`?archived=${encodeURIComponent(archiveKey)}`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-shikho-indigo hover:text-brand-shikho-blue"
            >
              View archived {formatShortDate(lastSuccessfulAt)} version
              <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function titleFor(noun: string): string {
  // Match design copy: "AI diagnosis is not running this week" /
  // "AI calendar is not running this week"
  const n = noun.toLowerCase();
  if (n.includes("calendar")) return "AI calendar is not running this week";
  return "AI diagnosis is not running this week";
}

function EnvChips({ vars }: { vars: readonly string[] }) {
  // Inline-comma join with chips between words. Last chip gets no trailing
  // comma. Whitespace must remain as real spaces so the sentence reads
  // naturally when the inline comma-separated list is read aloud / copied.
  return (
    <>
      {vars.map((v, i) => (
        <span key={v}>
          <EnvChip name={v} />
          {i < vars.length - 1 ? ", " : ""}
        </span>
      ))}
    </>
  );
}

function EnvChip({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (http, unfocused doc) — fall back to selection.
      const r = document.createRange();
      const el = document.createElement("span");
      el.textContent = name;
      document.body.appendChild(el);
      r.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      document.body.removeChild(el);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy environment variable name ${name}`}
      title={copied ? "Copied" : "Click to copy"}
      className={`inline-flex items-center gap-1 text-[12px] bg-slate-100 hover:bg-slate-200/80 text-brand-shikho-indigo font-semibold rounded px-1.5 py-0.5 transition-colors ${copied ? "ring-1 ring-emerald-300 bg-emerald-50 text-emerald-700" : ""}`}
    >
      <code className="font-mono">{name}</code>
      {copied ? (
        <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : null}
    </button>
  );
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
