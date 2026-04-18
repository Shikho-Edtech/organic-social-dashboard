# CLAUDE.md — organic-social-dashboard

Project-specific rules. Merged on top of the user's global `~/.claude/CLAUDE.md`.
These rules exist because the dashboard is used from phones (primary author checks
from mobile regularly) and earlier batches of changes shipped with desktop-only
assumptions that had to be fixed in follow-up commits. Every change from now on
is expected to pass the mobile checklist before it's reported done.

---

## Mobile-first is the default, not a follow-up

Every change that touches layout, text, or interactive elements is expected to
work at **360px width** (small Android) through **desktop (1280px+)**. Not "look
acceptable" — actually work. No content cut off at the right edge, no hover-only
affordances, no tab bars that silently scroll offscreen.

This is project policy, not a nice-to-have. If a change can't hold the
checklist below, it's not ready to commit.

### The pre-commit mobile checklist

Before any commit that changes UI:

1. **Right-edge scan.** Read every new/modified element and ask: what happens if
   the content is 30% longer than the sample data? The failure mode is text
   pushing past the card's right edge or forcing horizontal page scroll.
2. **No `flex-wrap` for header/alignment.** When two items need to sit
   side-by-side on desktop but stack on mobile, use `flex-col sm:flex-row`, not
   `flex-wrap` — the latter makes alignment drift depending on content length.
3. **Popups and dropdowns get `max-w-[calc(100vw-2rem)]`.** Every absolute-
   positioned popup (`w-56`, `w-72`, `w-96`, etc.) must clamp to viewport so it
   can't spill off the right/left edge on narrow screens.
4. **Big-text values get `break-words leading-tight`.** Any `text-2xl`/`text-3xl`
   inside a narrow mobile column (typically `grid-cols-2`) will overflow if the
   value is 7+ digits or a long string. Use responsive sizes
   (`text-xl sm:text-2xl`) plus `break-words`.
5. **No hover-only tooltips.** Touch devices don't fire `:hover`. Pair hover
   with tap (see `components/InfoTooltip.tsx` for the canonical pattern).
6. **Tables live inside `overflow-x-auto`**, full stop. Never try to make a
   9-column table fit at 375px.
7. **Tab bars over `md` breakpoint only.** Below `md`, switch to a dropdown
   (see `components/Nav.tsx`). `overflow-x-auto` tab strips are invisible as
   nav on mobile.

### Breakpoint defaults

The project is on Tailwind 3.4 with default breakpoints:

- `< 640px` — default, assume this is a phone. Design here first.
- `sm:` 640px+ — small tablet / large phone landscape
- `md:` 768px+ — tablet. This is where `Nav.tsx` switches to horizontal tabs.
- `lg:` 1024px+ — desktop. Charts go 2-up.

**Stress-test widths:** 360, 375, 414, 768, 1280. 360px is the realistic floor
(small Androids). Anything narrower isn't worth optimizing for.

### Canonical patterns

Copy-paste these — they are already proven in the codebase.

**Header with right-aligned controls** (see `components/PageHeader.tsx`):
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
  <div className="min-w-0">…title…</div>
  <div className="flex flex-col items-end gap-2 self-end sm:self-auto">…controls…</div>
</div>
```

**Popup that can't overflow viewport**:
```tsx
<div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] …">
```

**Big-value card (KPI, "Best X")**:
```tsx
<div className="text-xl sm:text-2xl font-bold break-words leading-tight">{value}</div>
```

**Info-dense row that stacks on mobile**:
```tsx
<div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
  <div className="flex items-center gap-2 sm:flex-shrink-0">…pills…</div>
  <div className="flex-1 min-w-0">…content…</div>
</div>
```

### Anti-patterns — do not ship these

- `flex items-center justify-between flex-wrap` for layout alignment.
  Alignment becomes content-length-dependent. Use `flex-col sm:flex-row`.
- `group-hover:opacity-100` / `hover:block` for informational tooltips.
  Invisible on touch.
- Fixed `width={130}` on Recharts `YAxis` with long labels. It subtracts from
  the drawing area — 130 left only 150px for bars on a 375px phone. Data-driven
  width is in `components/BarChart.tsx`.
- `flex-wrap` rows with 3+ fixed-width siblings plus a `flex-1`. The flex-1
  collapses to unreadable width on phones.
- `overflow-x-auto` for primary navigation below `md`. Users don't know to
  swipe a tab bar.

See `LEARNINGS.md` for the full set of mobile gotchas encountered so far.

---

## Post-commit documentation

This project already follows the global rule to update CHANGELOG/DECISIONS/
LEARNINGS after a commit. Nothing project-specific to add except: **if a
commit fixes a mobile regression, it ALWAYS goes in LEARNINGS** so the same
class of bug doesn't keep reappearing.

---

## Claude-powered views need staleness awareness

Pages that surface artifacts produced by the upstream Claude pipeline
(Strategy's weekly verdict, Plan's content calendar, and any future
view backed by `Analysis_Log`-written data) **must** render a
`StalenessBanner` above the `PageHeader`. The canonical pattern lives
in `app/strategy/page.tsx` and `app/plan/page.tsx`:

```tsx
import { getRunStatus, computeStaleness } from "@/lib/sheets";
import StalenessBanner from "@/components/StalenessBanner";

const [..., runStatus] = await Promise.all([..., getRunStatus()]);
const staleness = computeStaleness("<artifact>", runStatus);

return (
  <div>
    <StalenessBanner info={staleness} artifact="<artifact>" />
    <PageHeader ... />
    ...
  </div>
);
```

Why this exists: the pipeline has a graceful-degradation layer
(Day 2M/2O in `facebook-pipeline/IMPROVEMENTS.md`) that falls back to
cached data when Anthropic credits run out or the API errors. Without
a banner, the dashboard silently shows week-old verdicts + calendar
as if they were fresh. Any new page that reads Claude output inherits
that failure mode and must wire in the same banner.

When adding a new artifact:

1. Extend `computeStaleness` in `lib/sheets.ts` to accept the new
   artifact name.
2. Make sure the pipeline writes a corresponding `<artifact>_status` +
   `Last Successful <artifact> At` column to `Analysis_Log` (pipeline
   side: `src/sheets.py write_run_log`).
3. Render the banner at the top of the page, matching the pattern
   above.

See `DECISIONS.md` (2026-04-18 "Staleness banner for Claude-powered
pages") and `LEARNINGS.md` (2026-04-18 "Claude-powered analysis
stages silently go stale...") for the rationale and failure mode.

---

## Pre-commit QA gate — multi-perspective pass

`npm run build` is necessary but **not sufficient**. Every commit that changes
UI, data flow, or user-facing logic must pass the seven perspectives below
before it's reported done. This exists because past commits shipped with
desktop-only assumptions, broken empty states, and keyboard-inaccessible
controls that all compiled cleanly. Type-checks don't catch intent.

Run this as a **self-review before commit**, not as a reason to ask the user
to verify. Report what was checked and what was caught.

### The seven perspectives

1. **Viewport sweep.** Mentally (or via the running dev server) walk every
   changed page at **360 / 768 / 1280px**. Anything that overflows, stacks
   weirdly, or becomes untappable at 360px is a fail. This is the existing
   mobile checklist — just run it, every time.

2. **Data extremes.** What does this look like with:
   - Empty data (0 rows, null artifact)
   - A single row
   - Max-realistic data (30% longer labels, 7-digit numbers, 60+ reels)
   - A stale artifact (triggers StalenessBanner)

   If the page crashes, renders a blank card, or truncates without
   indication on any of these, fix before commit.

3. **Interaction modes.** Tab through every new interactive element with
   the keyboard. Confirm:
   - Focus is visible (global `focus-visible` ring in `globals.css` handles
     this — but confirm nothing disables it locally)
   - Tab order is sensible (top-to-bottom, left-to-right)
   - Every hover affordance has a tap/click equivalent
   - No `:hover`-only tooltips or menus

4. **Accessibility.** For each new piece of UI:
   - Text contrast ≥ 4.5:1 on regular copy (use slate-500 minimum for
     secondary text on white; slate-700 on slate-50 backgrounds)
   - Dynamic content (banners, toasts) has `role="status"` / `aria-live`
   - Icons that convey state have `aria-label` or visible text siblings
   - Tap targets are ≥ 44×44px (pad with `py-2 px-3` minimum)

5. **Error + loading states.** Confirm `app/loading.tsx` renders a sensible
   skeleton and `app/error.tsx` triggers on a thrown error (temporarily
   `throw new Error("qa")` in a server component to verify). Don't leave
   the check for production.

6. **Build + type-check.** `npm run build` must be green — no type errors,
   no unused imports, no missing `"use client"` on event-handler components.
   Warnings are tolerated; errors are not.

7. **Cold-read test.** Reopen the changed page as if you'd never seen it.
   Does the headline answer "what is this?" Does the first KPI answer "is
   this good or bad?" Can a new user act on the page in under 30 seconds?
   If not, the copy or layout needs one more pass.

### What to report

After running the gate, a commit summary should mention what was checked
and what was caught — not as a wall of green checkmarks, but as prose:
"Verified at 360/768/1280, empty-state renders, tab order is header → KPI
→ chart, build green." If something was caught and fixed, call it out
explicitly so the pattern ends up in LEARNINGS.

If a perspective is **not applicable** (e.g., a pure copy change touches
only viewport sweep + cold-read), say so. Skipping silently means the
next commit quietly skips more.

---

## Build + test

- `npm run build` — required but not the only gate. See "Pre-commit QA gate"
  above. Compiles in ~30s. Type-checks.
- Dev server needs `.env.local` with Google Sheets creds; it's fine to verify
  on the live Vercel deployment instead.
- No unit test suite. Changes are verified via build + QA gate + live visual
  review on Vercel.
