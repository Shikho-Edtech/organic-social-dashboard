# Learnings

## 2026-04-18 — `overflow-x-auto` is invisible on mobile

Horizontal scroll containers without a visual affordance (fade edges,
scroll indicator, partial-tab tease) read as "no content beyond what's
shown" on touch devices. Users won't swipe a tab bar they don't know
scrolls. For nav specifically, don't rely on overflow-x-auto below the
`md` breakpoint — switch to a dropdown, menu, or bottom-sheet.

Caught this only because the user happened to open the site on a phone
after a month of desktop-only testing. Add "viewport < 400px" to the
stress-test checklist for any nav/header work.
