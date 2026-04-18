# Learnings

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
