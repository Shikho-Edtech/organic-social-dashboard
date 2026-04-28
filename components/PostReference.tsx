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
 *     "Open on Facebook" link. Closing is timed (180ms) so a quick mouse
 *     traverse from trigger to popover can cancel it — fixes the
 *     "popover disappears before I can click it" bug. The popover itself
 *     also carries onMouseEnter/Leave handlers so hovering the popover
 *     keeps it open (Radix HoverCard pattern).
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
 *   - `iconOnly` mode: render only the external-link icon + the hover
 *     popover, no inline truncated caption. Used inside disclosure
 *     summaries (Strategy performer headlines) where a full caption
 *     preview would compete with the headline copy.
 */
export default function PostReference({
  caption,
  permalinkUrl,
  maxChars = 60,
  className = "",
  iconOnly = false,
  iconLabel,
}: {
  caption: string;
  permalinkUrl?: string;
  maxChars?: number;
  className?: string;
  iconOnly?: boolean;
  /** When iconOnly, the icon's accessible label. Defaults to "View source post on Facebook". */
  iconLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchorRight, setAnchorRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();

  // Bucket P6F (2026-04-28): viewport-aware anchoring. The popover is w-72
  // (288px). Triggers near the right edge of the viewport — top/under
  // performer headlines on the right column of /strategy, post-reference
  // chips on /reels — pushed the popover off-screen so the caption was
  // clipped and unreadable. On open, measure available right-side space;
  // if the popover would overflow, anchor right-0 instead of left-0 so
  // it grows leftward into available space.
  useEffect(() => {
    if (!open || !ref.current) return;
    const POPOVER_WIDTH = 288 + 16; // w-72 + small safety margin
    const rect = ref.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.left;
    setAnchorRight(spaceRight < POPOVER_WIDTH);
  }, [open]);

  const clean = (caption || "").replace(/\s+/g, " ").trim();
  const full = clean || "(no caption)";
  const truncated = full.length > maxChars;
  const preview = truncated ? full.slice(0, maxChars - 1) + "…" : full;
  const hasLink = typeof permalinkUrl === "string" && permalinkUrl.length > 0;

  // Hover-gap fix: cancel any pending close, clear timer on unmount.
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

  // Icon-only mode: render the external-link icon + popover, no caption span.
  // Used in tight headline rows where the caption preview would visually
  // compete with the surrounding copy.
  if (iconOnly) {
    if (!hasLink && !clean) return null;
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
        <a
          href={hasLink ? permalinkUrl : undefined}
          target={hasLink ? "_blank" : undefined}
          rel={hasLink ? "noopener noreferrer" : undefined}
          onClick={(e) => {
            e.stopPropagation();
            if (!hasLink) {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
          onFocus={() => {
            cancelClose();
            setOpen(true);
          }}
          onBlur={scheduleClose}
          aria-label={iconLabel || (hasLink ? "View source post on Facebook" : "View source post caption")}
          aria-describedby={open ? popoverId : undefined}
          className="inline-flex items-center justify-center w-5 h-5 rounded-md text-ink-400 hover:text-brand-shikho-indigo hover:bg-shikho-indigo-50 transition-colors cursor-pointer"
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
            aria-hidden="true"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
        {open && (
          <span
            id={popoverId}
            role="tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className={`absolute ${anchorRight ? "right-0" : "left-0"} top-full mt-1 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-shikho-indigo-900 text-white text-[12px] leading-snug p-3 shadow-lg ring-1 ring-shikho-indigo-800 whitespace-normal break-words`}
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

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center gap-1.5 min-w-0 ${className}`}
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
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
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
