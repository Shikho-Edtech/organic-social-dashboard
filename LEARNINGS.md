# Learnings

## 2026-04-18 — Tailwind's `!` override is the escape hatch for component-default classes (Batch 2b)

KpiCard wraps `Card`, which emits a fixed `p-6 bg-white rounded-xl
shadow-sm`. To give KPIs a subtle gradient + slightly smaller padding
than the chart cards sharing the page, the clean approach would be to
thread a `padding` + `bg` prop through Card. But Card already accepts
a `className` that's appended AFTER its base classes — and Tailwind's
last-rule-wins doesn't kick in reliably because `p-6` and `p-5` have
the same specificity, so whichever wins depends on CSS source order.

`!p-5 !bg-gradient-to-br from-white to-slate-50/60` via the `className`
prop is the right escape hatch. The `!` generates `!important` which
overrides Card's defaults regardless of CSS order. Ugly but
single-purpose — don't reach for `!` on rules that aren't
component-default overrides, or the cascade becomes impossible to
reason about.

Takeaway: when a shared component has opinionated defaults and you
need to vary one instance, `!`-override on the `className` is
cheaper than refactoring the component's API. Keep the refactor
option in reserve for when three+ variants need to diverge.

## 2026-04-18 — "Rendered" reads as UI metadata, "Data as of" reads as freshness (Batch 2c)

PageHeader had been showing `Rendered {datetime} BDT` in the top-right
since Batch 1. With `force-dynamic + revalidate=300`, that timestamp
IS effectively the data freshness — yet every user reading "Rendered"
interpreted it as an internal UI metric, not an answer to "how fresh
is what I'm looking at?" Same value, wrong label → nobody looked at it.

Renamed to `Data as of`. Zero implementation change — just a label
swap — and the information actually reads as answering a question
users care about. Corollary for any UI timestamp: label it by the
question it answers, not by the technical event that produced it.

## 2026-04-18 — Mobile card-list beats horizontal-scroll table even when the table works (Batch 2c, #14)

Reels's Recent Reels table is 9 columns, inside `overflow-x-auto`.
Desktop-fine. On mobile, horizontal scroll is invisible — the user
sees the first 3 columns and no hint that 6 more are hidden to the
right. Even with a scroll indicator, this is "primary content locked
behind a touch gesture most users don't know to try."

Solution: `hidden md:block` on the table + `md:hidden` on a
vertically-stacked card list that renders the same rows with the key
metrics in a 3-col grid (Plays/Watch/Follows on row 1, Hook3s/Replay/
Replays on row 2). The table's dense scannability is still the right
answer on desktop where you'd lose it by forcing cards; mobile gets
the UX it needed.

Rule: `overflow-x-auto` is acceptable for dense analytical tables on
md:+ displays; **below md, stack the same data into per-row cards
regardless of how many columns**. Horizontal-scroll-for-primary-content
is already flagged as an anti-pattern in CLAUDE.md — this reinforces
that the fix is vertical card stacking, not a better scroll indicator.

## 2026-04-18 — Small multiples beat one big chart when the question is "does A correlate with B?" (Batch 2d, Pg-Tr)

Trends has four full-size charts (daily volume, daily reach, weekly
ER, weekly shares). Rich individually, but for the "did the reach dip
line up with the volume dip?" question each reader had to scroll
through four charts and hold the x-axis in their head.

Added a 4-up small-multiples strip at the top: four 40px sparklines
on the same week-based x-axis, with last-week absolute value + WoW %
delta. Two seconds to see that the reach-ER-volume trio all dipped
the same week (content problem, not cadence) vs. reach dipped but
volume and ER held (delivery algorithm problem).

Rule: **when the insight is cross-series correlation, the small-
multiples strip is a better first-render than the full chart grid.**
The full charts aren't redundant — they show the per-day granularity
the sparkline smooths over — so both belong. The strip becomes the
"summary/index", the full charts become the "deep dive."

## 2026-04-18 — `JSON.parse` inside a nested loop is silently O(n²) expensive

Reels page aggregated an average retention curve by iterating every reel,
calling `parseRetentionCurve(r.retention_graph)` inside the loop, and
inside THAT loop iterating every point of the curve. 60 reels × one
`JSON.parse` of a 60-point string per reel = 60 parses per render. Fine.
But the earlier implementation ALSO parsed once per point inside the
chart loop — so for a 60-reel × 60-point grid the parse ran ~3,600
times. Nothing breaks — it just quietly takes 40ms on every server
render and scales quadratically with reel count.

Fix: parse once at the top of the page into
`const parsedCurves: Record<number, number>[] = reels.map(...);`
then index `parsedCurves[idx]` inside the loop. 60× → 1× parse per reel,
and the work the loop does is now pure number math.

Rule: **any `JSON.parse` or `new Date(...)` or regex inside a render
loop is a smell.** Hoist it to a pre-computed array before the loop
runs. Next.js's `force-dynamic` means this cost is paid on every
request, not amortized via cache — so the savings are real.

## 2026-04-18 — Chart palette's first two colors dominate brand perception

When a dashboard uses BarChart/Donut across 8 pages and the palettes all
start with `#6366f1` (generic indigo) and `#f59e0b` (orange), the brand
never actually lands visually — users see "generic chart colors." The
fix isn't adding more brand color everywhere; it's making sure **the
first two slots of the default palette are the brand indigo + pink**
(`#4f46e5`, `#ec4899`). Almost every chart has ≤2 series, and the first
series is the one the eye tracks. Two slot swaps in `BarChart.tsx` +
`Donut.tsx` now do more brand work than any amount of accent tinting
in the chrome.

Corollary: the brand tint should ALSO live in the Nav active tab
(highest-frequency UI element), not just charts. Done in the same
batch.

## 2026-04-18 — Donut is wrong for ≥5 similarly-sized slices

Confirmed by Cleveland & McGill (1984): position on a common scale
(bars) is perceived ~3× more accurately than angle (pie/donut) for
magnitude comparisons. The Engagement page had a 6-slice reaction
donut where the 2nd–5th slices were all 10–20%. Readers physically
can't rank them without reading each label. Switching to a horizontal
bar chart sorted desc removed the ambiguity in a single edit.

Rule: **donut ≤ 3 slices, or when "part of whole = 100%" is the
primary message.** ≥ 4 or needing rank-order → bars, always.

## 2026-04-18 — `new Date().getDay()` is not "today" for a server component

`force-dynamic` pages run on the server, so `new Date().getDay()`
returns the server's TZ weekday — which, on Vercel, can be any of
several regions. The fix is `Intl.DateTimeFormat("en-US", { weekday:
"long", timeZone: "Asia/Dhaka" })` — always correct for the audience.
Cheap: one `Intl` call per render, no external dep.

Rule: **never use raw `Date` weekday/hour for audience-facing "now"
in a server component.** Always pin the time zone.

## 2026-04-18 — `justify-between` + `flex-wrap` makes alignment content-dependent

When you put `flex justify-between flex-wrap` on a row with two items, the
positioning of the second item is no longer predictable — it depends on
whether both items fit on one line. Narrow content → side-by-side with
space-between. Wide content → wraps, and the wrapped item drifts to whatever
the browser decides for a single item on a flex line with `justify-between`
(often the start/left).

Symptom: the date picker on this dashboard appeared left-aligned on pages
with long titles and right-aligned on pages with short titles. Same
component, same classes, different pages. Felt like a bug in one place but
it was the CSS working as specified.

Rule: **never use `flex-wrap` for an alignment that needs to be
deterministic.** If you want "side-by-side on desktop, stacked on mobile",
write it explicitly: `flex-col sm:flex-row`. The cost is 2 extra words in
the class list. The payoff is the layout is the same on every page and every
viewport width.

## 2026-04-18 — Absolute popups need a viewport clamp regardless of positioning

An absolute-positioned popup with `w-72` (288px) looks fine in a vacuum, but
the moment the popup is wider than the viewport minus padding, it spills
off one edge — typically the left (when `right-0`'d to a button that isn't
all the way at the right). Doesn't matter how carefully the button is
positioned; the data underneath changes, titles get longer, layouts shift,
and sooner or later the popup is somewhere unexpected.

Standard mitigation: `max-w-[calc(100vw-2rem)]` on every popup, full stop.
CSS-only, covers every failure mode, no JavaScript. The 2rem matches the
layout's body padding. One line on each popup beats a popover library.

## 2026-04-18 — "Fix mobile by picking smaller constants" regresses desktop

Two regressions from today's mobile pass had the same shape: I
replaced a single constant (YAxis width 130, Plan Time pill `w-20`)
with a value tuned for mobile, and desktop silently got worse. The
sanity check is cheap — after any mobile-targeted change, re-open at
desktop width and scan for truncation, broken alignment, or lost
affordances. Better yet: before reaching for a smaller constant, ask
whether the value should be data-driven (longest label) or
breakpoint-scoped (`sm:w-20`) instead. "Pick a middle number that's
bad for both but shippable" is usually a false compromise.

## 2026-04-18 — `group-hover` tooltips are invisible on touch

Touch devices don't fire hover events. Any `group-hover:opacity-100`
or `hover:block` tooltip is effectively a no-op on mobile — users tap
the trigger and nothing happens, with no signal that there was
supposed to be a tooltip. If a UI element conveys information only
via hover, it doesn't exist on mobile.

Rule of thumb: for any informational tooltip, pair hover (desktop
affordance) with tap-toggle (touch affordance). Cheap to implement,
and the desktop experience doesn't regress.

## 2026-04-18 — Recharts YAxis `width` counts against drawing area

Horizontal bar charts with long category labels need `width={N}` on
the YAxis to reserve room. That N is SUBTRACTED from the chart's
usable drawing area, not added as overflow. On desktop (700px+ card
width) the tradeoff is invisible. On mobile (~280px card width), a
width of 130 leaves only 150px for bars — so bars look like stubs and
percentage labels overflow.

Default to 100 unless labels demand more. If a page has genuinely
long category labels AND small bars, either: (a) rotate labels, (b)
truncate with "…" + tooltip, or (c) accept horizontal scroll on the
whole chart card.

## 2026-04-18 — `flex` 3-column layouts break under 400px

Any row with 3+ fixed-width siblings plus a flex-1 will collapse the
flex-1 to unreadable width on mobile. On Plan's slot brief: time pill
(80px) + format chip (70px) + content (flex-1) + gaps (32px) left
~100px for content on a 375px phone. The content WAS the whole point
of the row.

Default pattern for info-dense rows: `flex-col sm:flex-row`. Small
items go above on mobile (as a horizontal group), main content below
at full width. On sm+, the original 3-col layout applies. Cheap,
preserves desktop.

## 2026-04-18 — `overflow-x-auto` is invisible on mobile

Horizontal scroll containers without a visual affordance (fade edges,
scroll indicator, partial-tab tease) read as "no content beyond what's
shown" on touch devices. Users won't swipe a tab bar they don't know
scrolls. For nav specifically, don't rely on overflow-x-auto below the
`md` breakpoint — switch to a dropdown, menu, or bottom-sheet.

Caught this only because the user happened to open the site on a phone
after a month of desktop-only testing. Add "viewport < 400px" to the
stress-test checklist for any nav/header work.

## 2026-04-18 — Claude-powered analysis stages silently go stale when API credits run out

The pipeline has three Claude stages: classify (Haiku), diagnose (Sonnet,
powers the Strategy page's weekly verdict + top/under performers), and
calendar (Sonnet streaming, powers the Plan page's next-week calendar).
If Anthropic credits hit zero mid-week, each stage raises `APIError`.
Day 2M added graceful fallback in the pipeline: classify reuses cached
Sheet rows, diagnose/calendar skip the write so the previous week's
values stay in place. The pipeline keeps running. **The dashboard
doesn't notice.**

Symptom: Strategy page shows "Week Ending Apr 11" and confident verdict
prose; Plan page shows the same calendar it had 3 weeks ago. User acts
on stale recommendations assuming they're current. No visible signal
anything is wrong.

Root cause class: **any graceful-degradation layer that doesn't include
a visibility layer converts a loud failure into a silent lie.** The
pipeline's try/except made it resilient; the dashboard's trusting read
made it misleading.

Fix shape: the pipeline's `Analysis_Log` sheet gained per-stage status
columns (`success / fallback / skipped / failed / n/a`) and
carry-forward `Last Successful Diagnosis At` / `Last Successful Calendar
At` timestamps. The dashboard has a new `computeStaleness(artifact,
run)` helper and a `StalenessBanner` component rendered above the
PageHeader on both `/strategy` and `/plan`:

- **Hidden** when the most recent run succeeded within 7 days.
- **Amber banner** when the last run fell back, or data is 7–14 days
  old. Explains the last successful date + suggests the next weekly
  run.
- **Rose banner** when data is 14+ days old, or never succeeded. Makes
  it unmistakable the displayed analysis is not current.

Thresholds chosen from the weekly cadence: 7d warn = one cycle missed,
14d crit = two cycles missed (i.e., the weekly pipeline has been
falling back for a fortnight — almost certainly a real credit/auth
problem, not a transient blip).

Rule of thumb for this codebase going forward: **any dashboard view
backed by a Claude-generated artifact must have a staleness check.**
Pattern exists; re-use it. If a new page surfaces Claude output (reel
intelligence, content pillar summaries, future Instagram analysis),
add an `artifact` case to `computeStaleness` and render the banner at
the top of that page.

Anti-pattern seen in early Day 2M: wrapping the entire run in a single
`DEGRADED` flag. Too coarse — if diagnose failed but calendar
succeeded, the user reading Plan shouldn't see a warning about a
problem that didn't affect Plan. Per-artifact status is the right
granularity.

## 2026-04-18 — Transient Anthropic errors need retry, not fallback

Closely related but distinct: `APIError` is a broad base class covering
everything from "your credit card expired" (permanent) to "you hit a
per-minute rate limit for 3 seconds" (transient). If the pipeline
treats all APIError the same way (Day 2M did — always fall back),
transient rate-limit bursts during a 2-minute weekly run become silent
fallback-to-stale-cache events on a completely healthy account.

Anthropic's Python SDK exposes typed subclasses for exactly this:
`RateLimitError`, `APIConnectionError`, `APITimeoutError`,
`InternalServerError` → retry with backoff (schedule used:
2s → 8s → 30s). `AuthenticationError`, `PermissionDeniedError`,
`BadRequestError`, `NotFoundError`, `UnprocessableEntityError` → never
retry (these are config or prompt bugs; retrying wastes credits).
Unclassified `APIError` → don't retry (fail loud so we notice new
categories).

Gotcha: the SDK does its own retry at the transport layer by default.
If you wrap calls in your own retry, disable the SDK's
(`anthropic.Anthropic(max_retries=0)`) or you get layered retries that
compound delays unpredictably. **Never disable SDK retries without
wrapping in your own retry** — doing one without the other makes the
system strictly less reliable.

Streaming calls (`client.messages.stream`) need their whole context
manager re-entered on retry. Wrap the stream body in an inner function
and pass that to the retry helper; partial stream state from a failed
attempt is not recoverable.
