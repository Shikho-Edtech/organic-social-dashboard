// Sprint P7 v4.18 W2 Thu (W12) — single switcher for the three Top-10 Reels
// lists (Plays / Avg Watch Time / Followers Gained). Replaces the previous
// pattern of 3 stacked ChartCards — operators only ever look at one ranking
// at a time, so making them peers in a tab strip saves vertical space and
// makes the comparison framing explicit ("the same 10 reels ranked three ways").
//
// Server pre-renders each list (TopReelList is a server component that uses
// PostReference + Bangla-aware truncation). This component receives them as
// pre-rendered ReactNodes via `tabs[].content` and just toggles which one is
// visible. Pure presentation — no data fetching, no expensive re-render cost.

"use client";

import { ReactNode, useState } from "react";

export type SwitcherTab = {
  /** Short label rendered on the toggle pill (e.g. "Plays"). */
  label: string;
  /** Helper line shown under the active tab's title (e.g. "Raw reach leaders"). */
  subtitle?: string;
  /** Plain-English explanation rendered as the active tab's caption. */
  caption?: string;
  /** Pre-rendered list (server component) — content swaps when active. */
  content: ReactNode;
  /** Active-pill accent color token (Shikho v1.0). Defaults to indigo. */
  accentBg?: string;
  /** Active-pill text color when active. */
  accentText?: string;
};

export default function TopReelSwitcher({
  tabs,
  initialTab = 0,
}: {
  tabs: SwitcherTab[];
  initialTab?: number;
}) {
  const [active, setActive] = useState(initialTab);
  if (tabs.length === 0) return null;
  const current = tabs[active] ?? tabs[0];

  return (
    <div>
      {/* Toggle pills — rendered inline above the active list. flex-wrap so
          a very narrow phone stacks them. role=tablist for screen readers. */}
      <div
        role="tablist"
        aria-label="Top Reels metric"
        className="flex flex-wrap gap-1.5 mb-3"
      >
        {tabs.map((t, i) => {
          const isActive = i === active;
          return (
            <button
              key={t.label}
              role="tab"
              aria-selected={isActive}
              aria-controls={`top-reel-panel-${i}`}
              id={`top-reel-tab-${i}`}
              onClick={() => setActive(i)}
              className={[
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-base ease-shikho-out",
                "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-shikho-indigo focus-visible:ring-offset-1",
                isActive
                  ? `${t.accentBg ?? "bg-brand-shikho-indigo"} ${t.accentText ?? "text-white"} border-transparent shadow-sm`
                  : "bg-ink-50 text-ink-secondary border-ink-100 hover:bg-ink-100",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active panel. role=tabpanel for screen readers; aria-labelledby
          ties it back to the active tab button. */}
      {current.subtitle && (
        <p className="text-xs text-ink-muted mb-3 leading-relaxed">{current.subtitle}</p>
      )}
      <div
        role="tabpanel"
        id={`top-reel-panel-${active}`}
        aria-labelledby={`top-reel-tab-${active}`}
      >
        {current.content}
      </div>
      {current.caption && (
        <p className="text-xs text-ink-muted mt-4 leading-relaxed">{current.caption}</p>
      )}
    </div>
  );
}
