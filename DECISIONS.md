# Decisions

## 2026-04-18 — Categorical color is a product concept, not a chart setting (Batch 2a)

Pre-Batch-2, every chart component had its own `colorByIndex` toggle and
its own interpretation of "what color should bar 3 be?" A Reel bar on
Engagement was amber; the Reel pill on Plan was pink; the Reel slice on
Overview's donut was cyan. Three surfaces, same category, three colors.
Readers had no way to build the "oh, pink means Reel" association.

Decided to centralize category→color in `lib/colors.ts` with:
- `FORMAT_COLORS`, `HOOK_COLORS`, `SPOTLIGHT_COLORS`, `FUNNEL_COLORS` as
  explicit maps (canonical brand-compatible hexes)
- `canonicalColor(field, value)` as a single call-site that all pages use
- A djb2 string-hash fallback for pillars (too many + open-ended, can't
  be hand-mapped), so colors are STABLE across renders even for unknown
  pillars — the same pillar name always hashes to the same palette slot

Alternatives considered:

- **Tailwind theme extend only**: tempting because it keeps class strings
  clean, but Tailwind 3.4 can't compile classes at runtime from DB values.
  `text-[${color}]` requires static analysis and silently fails — user
  had hit this before. Inline `style={{ color }}` is uglier but it works.
- **Recharts `colorBy` prop**: already exists but only on BarChart, and
  it takes an index, not a category value. Would need a pre-compute step
  per page anyway, so might as well do it in `canonicalColor`.
- **Themed palettes per page**: rejected — the whole point is consistency
  ACROSS pages, not within.

Tradeoff: pages now have a handful of `canonicalColor("format", s.key)`
calls instead of passing a single `color` string. Worth it; the visual
cohesion payoff is immediate on Engagement (Best Format and Format
Performance chart now agree on what color Reel is).

## 2026-04-18 — Donut → Biggest Movers on Overview (Batch 2d, Pg-Ov)

Overview had two donuts side-by-side in the lower row: Format Distribution
(useful — answers "am I over-relying on one format?") and Engagement Mix
(reactions vs comments vs shares). The Engagement Mix donut was
aesthetically fine but informationally near-zero: the ratio rarely
shifts enough to change a decision, and "Shikho's audience leaves more
reactions than comments" is not a finding that drives content planning.

Considered:

- **Keep the donut, add a delta annotation**: still fundamentally
  shows a ratio that doesn't change week-over-week. Lipstick on a pig.
- **Swap to a follower trajectory chart**: already in the KPI strip
  via the Followers card; would duplicate.
- **"Biggest Movers"**: what the user actually wants to know when
  opening Overview — "what changed vs last period, for good or bad?"

Went with Movers: top 3 risers + 3 fallers by pillar reach %-delta,
with a 5k-reach floor on either side. The floor matters — without it a
pillar going from 50 reach to 200 is a "+300%" and would dominate the
list over a pillar that actually moved meaningful audience (-15% off a
200k base). Reach is used as the mover axis (not engagement rate)
because reach is the primary signal on Overview and the deltas tend
to be larger / more informative. Pillars color-code via
`canonicalColor("pillar", key)` so color is consistent with Engagement's
Pillar Performance chart.

Follow-ups if needed: allow user to toggle the mover axis between reach
and engagement rate; add a drilldown link to the pillar in Explore.

## 2026-04-18 — Pre-commit QA gate formalized in project CLAUDE.md

User asked: "do we have this as a global rule to do extensive qa from multiple
perspectives before any commit or deployment?" Answer was partial — global
CLAUDE.md has "stress test before delivering" and project CLAUDE.md has a
mobile checklist + `npm run build`, but there was no explicit multi-
perspective gate. Batch 1 shipped with build + general stress-testing, but
no formal pass through 360/768/1280 or keyboard traversal.

Options considered:

- **Global rule in `~/.claude/CLAUDE.md`**: applies everywhere. Rejected —
  the specifics (viewports, breakpoints, stack-specific perspectives) depend
  on the project. A generic "do thorough QA" in global is already covered
  by "stress test before delivering" and adding more there just dilutes it.
- **CI pipeline (Playwright, axe-core, Lighthouse)**: catches more
  automatically but costs setup + maintenance for an 11-page internal
  dashboard. Rejected — same tradeoff as the visual-regression decision:
  overkill for this scale.
- **Seven-perspective gate in project CLAUDE.md**: Claude reads it every
  session that touches this repo, specifics match the stack (Tailwind
  breakpoints, `focus-visible`, `StalenessBanner`, Recharts), and it
  encodes the exact failure classes that have actually shipped bugs
  (desktop-only, hover-only, empty-state crashes).

Went with the third. Seven perspectives: viewport sweep, data extremes,
interaction modes, accessibility, error + loading states, build + type-check,
cold-read test. Explicitly frames `npm run build` as necessary-but-not-
sufficient. Requires Claude to report what was checked in the commit
summary so skipped perspectives are visible.

Tradeoff: every commit now carries more self-review overhead (a few minutes
at most). Acceptable because the user has flagged three separate rounds
of follow-up fixes so far (mobile, date-picker alignment, right-edge
overflow) that would have been caught by this gate.

## 2026-04-18 — Donut → horizontal bar for Engagement's reaction breakdown

The 6-slice donut on Engagement broke Cleveland & McGill's perception
hierarchy: people judge position on a common axis (bars) ~3× more
accurately than angle (pie/donut). Six similarly-sized slices was the
worst case — readers couldn't tell which reaction was second-vs-third
without reading each legend label.

Switched to a horizontal bar (sorted desc, `colorByIndex`, `showPercent`)
with dynamic height of `max(220, rows * 36)`. Position is now the
encoding; color is secondary. Kept Donut.tsx in place for two-slice or
explicitly-part-of-whole visuals where the "whole = 100%" framing
matters more than rank-order.

## 2026-04-18 — "Today" detection in Asia/Dhaka, not via `new Date().getDay()`

Plan runs server-side (`force-dynamic`). If Vercel's build region shifts
to UTC (or any non-BDT region), `new Date().getDay()` returns the
server's weekday, not the user's. On a Friday evening BDT that's a
Thursday or a Saturday on the server — the wrong day gets auto-opened.

Used `Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Dhaka" })`
which is always right for the primary audience. If we ever add a user
selector, the helper becomes `todayInZone(tz)` — trivial to extend.

## 2026-04-18 — Removed Card's text kind badge, kept left-border + data-kind

Overview used to show a small "Meta data / AI-classified / Derived" pill
on every KPI card. On a 5-up Overview grid that was 5 pills repeating
essentially "where this number came from" which most viewers don't
check per-card. The left-border color already encodes kind for the
1-5% of power users who care. Added `data-kind` to the Card's inner
div so tooling, tests, or future UIs (filter by kind, legend) can
discriminate without the visual badge.

Tradeoff: brand-new users no longer see the kind spelled out. Acceptable
because (a) the data footer already explains sources per-card, (b) the
audit found this was "6 pills saying three things that are already
color-coded" style noise, (c) the rule from LEARNINGS stays: if you
need to re-add, do it as an `<abbr>` or hover-only affordance, not a
default-rendered pill.

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

## 2026-04-18 — Staleness banner for Claude-powered pages, not a silent refresh

When the upstream pipeline falls back to cached data (API credits
exhausted, rate limits, transient errors — see
facebook-pipeline/IMPROVEMENTS.md Day 2M/2O), Strategy and Plan pages
would otherwise continue rendering last week's verdict and calendar
with zero indication anything was off. Three options considered:

- **Do nothing, trust the pipeline to alert.** Rejected — the pipeline
  only writes to GitHub Actions logs, which the user doesn't check
  daily. The dashboard is the consumption surface; the warning belongs
  there.
- **Toast / ephemeral notification on load.** Rejected — easy to
  dismiss accidentally, doesn't persist when switching between pages,
  and gives the wrong mental model ("one-time problem") when the
  underlying state is "this view is actually stale."
- **Persistent banner at the top of the affected page.** Shipped.
  Amber for warn (fallback or 7–14 days old), rose for crit (14+ days
  or never succeeded). Always visible while the condition holds,
  disappears automatically when the next successful run lands.

Per-artifact, not per-run: diagnosis and calendar can fall back
independently (diagnose fails on a long prompt, calendar stream
succeeds). Strategy banner reflects diagnosis freshness; Plan banner
reflects calendar freshness. A single global "something's wrong"
banner was rejected because it would under-inform (which view?) and
over-warn (users reading Plan shouldn't see a warning about a
Strategy-only failure).

Thresholds: 7d warn / 14d crit. The pipeline is weekly, so 7d = one
cycle missed (next Monday's run will catch it); 14d = two cycles
missed (likely a persistent credit/auth issue that needs attention).

Implementation deliberately thin: `getRunStatus()` reads the last
Analysis_Log row; `computeStaleness(artifact, run)` returns a shape
the `StalenessBanner` component renders. ~80 LOC across helper +
component. No client-side state, no polling — Server Component
renders on each page load with the freshest sheet read.

## 2026-04-18 — Retry policy for Anthropic SDK: 2→8→30s, 3 retries, own the schedule

Owned the Claude call-retry policy in the pipeline (`src/classify.py`
`_call_with_retry`) instead of relying on the SDK's built-in retries.
Three reasons:

- **Typed error differentiation.** SDK retries all retryable errors
  the same way. We distinguish `RateLimitError` (wait it out),
  `InternalServerError` (retry), from `AuthenticationError` / `BadRequestError`
  (permanent, fail fast). SDK doesn't expose per-type retry policy.
- **Logging.** Per-attempt logs labeled per call site
  (`classify-batch-N`, `diagnosis`, `calendar-stream`) make outages
  diagnosable from GitHub Actions logs. SDK retries are silent.
- **Schedule control.** 2→8→30 (40s total cap) is tuned for the
  weekly run's overall budget. Most rate-limit windows clear in ≤30s;
  anything longer is an outage that no retry schedule will rescue.

Gotcha captured in LEARNINGS: disabling SDK retries (`max_retries=0`)
without wrapping in your own retry is strictly worse than either
default. Always replace, don't just disable.
