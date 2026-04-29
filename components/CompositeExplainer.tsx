"use client";
import { useState, useRef, useEffect, useId } from "react";

// Sprint P7 v3.5 (2026-04-29): explainer hover for composite scores.
// Surfaces the per-metric percentile breakdown that produced the
// composite value, so a user looking at "78" can see WHY — e.g.
// "78 = 90 reach + 65 engagement + 80 shares (equal weight)".
//
// Same hover-gap setTimeout pattern as PostReference + InfoTooltip
// (LEARNINGS 2026-04-28). Viewport-aware right-edge flip when the
// trigger sits near the viewport's right edge.
//
// Usage:
//   <CompositeExplainer
//     composite={78}
//     breakdown={[
//       { name: "Reach",        percentile: 90, weight: 33.33, raw: "48,500" },
//       { name: "Interactions", percentile: 65, weight: 33.33, raw: "1,240" },
//       { name: "Shares",       percentile: 80, weight: 33.33, raw: "75" },
//     ]}
//   />

export type CompositeBreakdownEntry = {
  /** Metric name shown in the popover (e.g. "Reach", "Engagement Rate") */
  name: string;
  /** Percentile rank within the population (0..100) */
  percentile: number;
  /** Weight as percentage of total (0..100); equal-weight = 100/N */
  weight: number;
  /** Optional raw-units value (e.g. "48,500" or "2.34%") for context */
  raw?: string;
};

type Props = {
  composite: number; // 0..100
  breakdown: CompositeBreakdownEntry[];
  className?: string;
};

export default function CompositeExplainer({ composite, breakdown, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [anchorRight, setAnchorRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => cancelClose(), []);

  // Viewport-aware anchoring on open.
  useEffect(() => {
    if (!open || !ref.current) return;
    const POPOVER_WIDTH = 320; // w-80 + small margin
    const rect = ref.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.left;
    setAnchorRight(spaceRight < POPOVER_WIDTH);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => {
          cancelClose();
          setOpen(true);
        }}
        onBlur={scheduleClose}
        aria-label="Composite score breakdown"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-ink-400 hover:text-brand-shikho-indigo transition-colors cursor-help"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>
      {open && (
        <span
          id={popoverId}
          role="tooltip"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={`absolute ${anchorRight ? "right-0" : "left-0"} top-full mt-1 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-shikho-indigo-900 text-white text-[12px] leading-snug p-3 shadow-lg ring-1 ring-shikho-indigo-800 whitespace-normal`}
        >
          <div className="flex items-baseline justify-between gap-2 mb-2 pb-2 border-b border-shikho-indigo-800">
            <span className="text-[11px] uppercase tracking-wider text-shikho-indigo-200 font-semibold">
              Composite score
            </span>
            <span className="text-base font-bold tabular-nums">
              {Math.round(composite)}
            </span>
          </div>
          <div className="space-y-1.5">
            {breakdown.map((b) => {
              // The metric's contribution to the composite = percentile × weight/100.
              // Show as "X (weight%)" on each row.
              const contribution = (b.percentile * b.weight) / 100;
              return (
                <div key={b.name} className="flex items-center gap-2">
                  <span className="text-[12px] text-shikho-indigo-100 flex-1 min-w-0 truncate">
                    {b.name}
                  </span>
                  <span className="text-[11px] text-shikho-indigo-200 tabular-nums">
                    {b.raw && <span className="opacity-75">{b.raw} · </span>}
                    p{Math.round(b.percentile)}
                  </span>
                  <span className="text-[10px] text-shikho-indigo-300 tabular-nums w-12 text-right">
                    × {Math.round(b.weight)}%
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums w-10 text-right">
                    {contribution.toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-shikho-indigo-800 text-[10px] text-shikho-indigo-300">
            p<span className="opacity-100">N</span> = percentile rank
            ({"100 = top"}). Σ contributions = composite.
          </div>
        </span>
      )}
    </span>
  );
}
