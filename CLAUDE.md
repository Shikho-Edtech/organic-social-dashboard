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

## Build + test

- `npm run build` — the only verification that matters pre-commit. Compiles
  in ~30s. Type-checks.
- Dev server needs `.env.local` with Google Sheets creds; it's fine to verify
  on the live Vercel deployment instead.
- No unit test suite. Changes are verified via build + live visual review.
