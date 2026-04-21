"use client";
import { useState, useRef, useEffect, useId } from "react";

// Tap-to-toggle tooltip for definition icons inside chart cards.
// Replaces the pure-CSS `group-hover:opacity-100` pattern, which is
// invisible on touch devices (no hover). On mobile, users tap the (i)
// icon to reveal the definition; tapping outside, pressing Escape, or
// tapping the icon again dismisses it. Still works on desktop via
// hover + click.
//
// Batch 3c (a11y sweep): screen-reader users now get the tooltip text
// announced when they focus the (i) button, via aria-describedby
// pointing to the open tooltip's id. Keyboard users can dismiss with
// Escape without tabbing away.

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

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
      className="relative inline-flex items-center translate-y-[3px]"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label="What is this metric?"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        className="p-0 leading-none bg-transparent border-0 cursor-help"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-500 hover:text-slate-700"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute left-5 top-0 z-20 w-64 max-w-[calc(100vw-3rem)] rounded-lg bg-shikho-indigo-900 text-white text-[11px] leading-snug p-2.5 shadow-lg ring-1 ring-shikho-indigo-800"
        >
          {text}
        </span>
      )}
    </span>
  );
}
