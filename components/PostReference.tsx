"use client";
import { useState, useRef, useEffect, useId } from "react";

/**
 * Post caption + permalink reference, usable in tables, lists, and cards.
 *
 * Motivation (Sprint P6 chunk 5 feedback):
 *   - Reels & other post-heavy views truncate captions ruthlessly, and the
 *     browser-native `title=""` tooltip is invisible on touch devices.
 *   - Every post reference in the dashboard should (a) show a readable
 *     truncated preview, (b) reveal the full caption on hover/tap, and
 *     (c) link out to the actual Facebook post when we have the permalink.
 *
 * Behaviour:
 *   - Desktop: mouseenter opens the popover with the full caption + a
 *     "Open on Facebook" link; mouseleave closes it.
 *   - Touch: tap the preview to toggle the popover. Tap outside, press
 *     Escape, or tap the preview again to close.
 *   - The external-link icon is always rendered next to the preview when
 *     `permalinkUrl` is a non-empty string, and it's independently
 *     clickable (a11y: keyboard-focusable, opens in a new tab with
 *     rel="noopener noreferrer").
 *   - When `permalinkUrl` is empty (historical rows pre-dating the
 *     Permalink URL column — see lib/types.ts), the icon is omitted and
 *     the component renders as an inline preview with a hover/tap-reveal
 *     for the full caption only.
 */
export default function PostReference({
  caption,
  permalinkUrl,
  maxChars = 60,
  className = "",
}: {
  caption: string;
  permalinkUrl?: string;
  maxChars?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  const clean = (caption || "").replace(/\s+/g, " ").trim();
  const full = clean || "(no caption)";
  const truncated = full.length > maxChars;
  const preview = truncated ? full.slice(0, maxChars - 1) + "\u2026" : full;
  const hasLink = typeof permalinkUrl === "string" && permalinkUrl.length > 0;

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
      className={`relative inline-flex items-center gap-1.5 min-w-0 ${className}`}
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
        aria-label={truncated ? "Show full caption" : "Caption"}
        aria-expanded={truncated ? open : undefined}
        aria-describedby={open ? popoverId : undefined}
        className="min-w-0 truncate text-left bg-transparent border-0 p-0 cursor-text"
      >
        {preview}
      </button>
      {hasLink && (
        <a
          href={permalinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open post on Facebook in a new tab"
          title="Open post on Facebook"
          className="flex-shrink-0 text-ink-400 hover:text-brand-shikho-indigo transition-colors"
        >
          {/* 12px external-link icon — enough to touch, small enough not to shout */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
      )}
      {open && (
        <span
          id={popoverId}
          role="tooltip"
          className="absolute left-0 top-full mt-1 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-shikho-indigo-900 text-white text-[12px] leading-snug p-3 shadow-lg ring-1 ring-shikho-indigo-800 whitespace-normal break-words"
        >
          <span className="block">{full}</span>
          {hasLink && (
            <a
              href={permalinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-shikho-indigo-200 hover:text-white underline underline-offset-2"
            >
              Open on Facebook
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          )}
        </span>
      )}
    </span>
  );
}
