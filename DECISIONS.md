# Decisions

## 2026-04-18 — BarChart YAxis width: data-driven, not static (revised)

Revised the earlier "single static 100" call after a desktop regression
check. The static value worked for mobile but truncated long pillar
names on desktop. Ruled out a viewport-aware approach (Recharts props
don't accept CSS breakpoints; adding ResizeObserver + state to every
chart is overkill). Instead, the axis now sizes itself to the longest
label present in the data — ~6.5px per char at 11px sans-serif + 12px
padding, clamped [60, 140]. Short-label charts (TOFU/MOFU/BOFU) get
~60px, long-label charts (full pillar names) get ~130px. Same behaviour
on mobile and desktop; the drawing-area tradeoff is only paid when
the labels actually need it.

## 2026-04-18 — BarChart horizontal YAxis width: single value, not responsive (superseded)

Originally dropped 130 → 100 globally. Recharts doesn't support CSS
breakpoints on axis props and detecting viewport would require
client-side state + ResizeObserver — overkill for a 30px adjustment.
100 was a compromise: mobile got 30px back, desktop truncated long
pillar names with "…" (acceptable because full label shows in tooltip).
Superseded by the data-driven approach above after desktop review.

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
