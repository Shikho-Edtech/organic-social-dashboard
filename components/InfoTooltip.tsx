"use client";
import { useState, useRef, useEffect } from "react";

// Tap-to-toggle tooltip for definition icons inside chart cards.
// Replaces the pure-CSS `group-hover:opacity-100` pattern, which is
// invisible on touch devices (no hover). On mobile, users tap the (i)
// icon to reveal the definition; tapping outside or the icon again
// dismisses it. Still works on desktop via hover + click.

export default function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
        aria-label="What is this metric?"
        aria-expanded={open}
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
          className="text-slate-400 hover:text-slate-600"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-5 top-0 z-20 w-64 max-w-[calc(100vw-3rem)] rounded-md bg-slate-900 text-white text-[11px] leading-snug p-2.5 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
