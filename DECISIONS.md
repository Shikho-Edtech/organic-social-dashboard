# Decisions

## 2026-04-18 — BarChart horizontal YAxis width: single value, not responsive

Dropped YAxis width from 130 → 100 globally instead of making it
breakpoint-aware. Recharts doesn't support CSS breakpoints on axis
props and detecting viewport in the chart component would require
client-side state + ResizeObserver — overkill for a 30px adjustment.
100 is a compromise: mobile gets back 30px of drawing area, desktop
still fits most labels (longer pillar names now truncate with "…",
which is acceptable since the full label is in the tooltip).

## 2026-04-18 — InfoTooltip: tap-toggle, not long-press or always-visible

Three options considered for the chart-card (i) icon:
- Pure hover (current): broken on touch.
- Long-press: not a discoverable pattern on web; users don't know to
  try it.
- Tap-toggle with outside-click dismiss: standard iOS/Android popover
  pattern, works on desktop too (hover shows, click pins/dismisses).

Went with the third. `onMouseEnter`/`Leave` preserve the desktop hover
behaviour, `onClick` toggles open state, `mousedown` outside closes it.

## 2026-04-18 — Mobile nav: dropdown over bottom-bar or hamburger

Picked a labelled dropdown ("Page — Overview") over two alternatives:

- **Bottom tab bar (iOS-style):** 8 routes is too many for 4-5 bottom slots,
  and a horizontally-scrolling bottom bar reproduces the original discovery
  problem. Also eats vertical space on every page.
- **Hamburger icon top-right:** standard but iconic-only — the user has to
  know what the icon means and tap to discover any navigation exists. A
  labelled button with the current page name ("Page — Overview ▾") tells
  them at a glance what they're on and that there's more.

Dropdown wins: discoverable without icons, shows current state in-line,
reveals the full 8-route list on tap. Desktop (md+) keeps the horizontal
tab strip — plenty of room at that width.
