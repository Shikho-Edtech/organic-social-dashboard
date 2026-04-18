# Decisions

## 2026-04-18 — Project-level CLAUDE.md over per-commit mobile reminders

User asked: "how do we ensure future updates are mobile-responsive?" Three
options considered:

- **Trust memory** (do nothing, rely on recent learnings): fails on fresh
  sessions and long gaps between UI work. Rejected — the user has already
  caught two rounds of desktop-only assumptions.
- **CI lint / visual-regression suite** (Playwright at 360/768/1280):
  overkill for a 11-page internal dashboard with no test infra. The cost
  (setup + maintenance) exceeds the bug class being prevented.
- **Project-level CLAUDE.md** with a checklist, breakpoint floor (360px),
  canonical patterns, and anti-patterns. Claude reads it automatically on
  every session that touches this repo.

Went with the third. It's durable, zero-runtime-cost, encodes the lessons
from LEARNINGS.md into actionable rules, and makes "mobile-responsive" the
default rather than an afterthought. If the checklist proves insufficient
after the next few changes, we'll revisit and consider lightweight visual
regression.

## 2026-04-18 — Header layout: `flex-col sm:flex-row`, not `flex-wrap`

`flex-wrap` was convenient ("items flow naturally when screen narrows") but
it made the date picker's apparent alignment content-dependent: narrow title
→ picker stays on same row at the right; long title → picker wraps below
and drifts LEFT (because with `justify-between` and a single item on the
wrapped row, cross-axis alignment becomes ambiguous). Different pages =
different alignments, no deterministic rule.

Fixed with an explicit mobile-first stack: `flex-col` on mobile (picker
below title, forced right-aligned via `self-end`), `sm:flex-row` at 640px+
(original side-by-side with `justify-between`). Trades one line of class
soup for a guarantee. Applied to both PageHeader and ExploreClient's
identical-but-duplicated header.

## 2026-04-18 — Popups: `max-w-[calc(100vw-2rem)]` everywhere

Every `absolute`-positioned popup (date picker, group-by, filter multiselect,
etc.) now has this clamp. Simpler than the alternatives (viewport-aware
positioning via useEffect + getBoundingClientRect, portal rendering, or a
full popover library). CSS-only, zero runtime cost, covers the
content-wider-than-viewport failure mode at every screen width without
caring about the button's position on the page. The 2rem accounts for the
layout's `px-4 sm:px-6` body padding.

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
