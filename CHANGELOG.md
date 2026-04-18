# Changelog

## 2026-04-18 — Mobile nav fix

[components/Nav.tsx](components/Nav.tsx) — Replaced the horizontal
overflow-x-auto tab strip with a dropdown menu on < md breakpoint.
The 8-tab bar was ~600px wide; on a 375px phone only the first 1-2
were visible and nothing indicated the rest were swipeable, so mobile
users thought the dashboard had a single page. Desktop behaviour
unchanged. Header also tightened on narrow screens (badge hidden,
padding reduced, truncation added).

## 2026-04-17 — Dashboard batch: Reels page, Timing KPI tightening, Strategy clarity, Login redesign

Ships alongside pipeline Day 2G/2H/2I/2J. Six interrelated items from a
diagnostic sweep after Run #15 produced an empty Content_Calendar and the
team noticed a few pages had subtle bugs.

**New: `/reels` page** ([app/reels/page.tsx](app/reels/page.tsx))
- Surfaces `Raw_Video` tab (18 cols, populated by pipeline Day 2D).
- KPI strip: Reels Posted, Total Plays, Avg Watch Time, Completion Rate,
  Followers Gained.
- Secondary metrics: Total Views, 15s Views, 30s Views, Sound On Rate.
- Aggregate retention funnel chart (0s → 15s → 30s → complete).
- Top 10 reels by plays, by avg watch time (filtered to ≥500 views to
  avoid tiny-sample outliers), by followers gained.
- Recent reels table (up to 25 rows, newest first) with caption preview,
  pillar, plays, replays, watch time, completion %, sound-on, follows.
- Added to `Nav.tsx` between Timing and Strategy.

**Timing page KPI tightening** ([app/timing/page.tsx](app/timing/page.tsx))
- `MIN_N` raised from 5 → 10 for the "best slot" selector. Early (5–9am)
  was winning the KPI with 5–6 posts, one viral hit dragging the average
  up and painting a misleading "post at dawn" conclusion.
- All four KPI cards now show sample size (`n=X`) next to the metric.
- Amber asterisk beside slot KPI titles when no slot meets the threshold
  (all-slot fallback active).
- Chart caption updated 5 → 10.

**Strategy page date-range clarity** ([app/strategy/page.tsx](app/strategy/page.tsx))
- The Weekly Verdict card reads from `getLatestDiagnosis()` — always
  latest snapshot, unaffected by the date range picker. Funnel
  distribution charts on the same page DO honor the range, which created
  confusion.
- Added inline label `"Latest weekly run · not filtered by date range"`
  in the verdict card header.
- Page subtitle updated: `"Funnel charts filtered; verdict = latest
  weekly snapshot"`.

**Login page redesign** ([app/login/page.tsx](app/login/page.tsx))
- Replaced the generic `Weekly / Facebook / $0/mo` stats strip with four
  workflow cadence bullets: Daily 09:00 BDT data refresh, Monday 10:00
  BDT full Claude diagnosis, source-of-truth (Meta Graph API v21.0
  → Sheets), 5 minute server cache.
- Bottom-left attribution: `Prepared by Shahriar · Performance & Growth
  Marketing`.
- Form side cleaned up: uppercase "Team access" eyebrow, helper copy
  under the submit button listing what pages are available and that all
  times are BDT.

Known gap after this batch: Top Performers / Underperformers on Strategy
were blank because pipeline `_safe_cell` truncated JSON to 500 chars,
corrupting the Full Diagnosis cell. Fixed upstream in pipeline Day 2J —
see `facebook-pipeline/IMPROVEMENTS.md`. Dashboard reads will repopulate
automatically after the next weekly run.

---

## 2026-04-17 — Day 2E.4: Normalize post format on the getPosts read path (commit `5fe6ee7`)

The pipeline's `Classifications` tab shrank 18 → 16 cols, dropping `Format`
and `Featured Entity`. The dashboard used to read `c["Format"]` directly
and fall back to `r["Type"]`, but that fallback produced `"video"` (from
Raw_Posts lowercase) while the classifier used to write `"Video"`
(titlecase), so old and new rows landed in different aggregation buckets.

`getPosts()` in [lib/sheets.ts](lib/sheets.ts) now derives format
defensively:

```ts
format: (() => {
  if (c["Format"]) return c["Format"];               // legacy rows
  if (toBool(r["Is Reel"])) return "Reel";
  const t = (r["Type"] || "") as string;
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
})()
```

Legacy rows with a populated `Format` column still win. Post-2E.4 rows
derive `"Reel"` from `Is Reel`, else titlecase the `Type`. Pillar/format
aggregations in `lib/aggregate.ts` now see a single format taxonomy.

No type changes — `Post.format` is still optional string. Commit:
`5fe6ee7`.

---

## 2026-04-17 — Day 2E.3: Plan page reads v2 calendar (commit `f29609c`)

The pipeline's calendar writer (Day 2E.2) widened `Content_Calendar` from
16 → 18 cols, adding `Spotlight Type` and `Spotlight Name` alongside the
legacy `Featured Entity`.

Dashboard changes:

- [lib/types.ts](lib/types.ts) — `CalendarSlot` gained optional
  `spotlight_type` and `spotlight_name`.
- [lib/sheets.ts](lib/sheets.ts) — `getCalendar()` reads the two new
  columns with empty-string fallback for pre-v2 rows.
- [app/plan/page.tsx](app/plan/page.tsx) — renderer prefers
  `spotlight_name`, appends `(spotlight_type)` in muted text when
  present, falls back to `featured_entity` for rows written before the
  writer upgrade.

This is a forward-compatible read path — old calendars still render;
new calendars get richer display.

---

## 2026-04-17 — Day 2D: Dashboard read path for v2.2 classifier schema (commit `4a8cdc5`)

Pipeline-side `Classifications` schema widened 13 → 18 cols (Day 2A-2C)
splitting the old free-text `featured_entity` into the new pair:

- `spotlight_type` — strict 5-value enum
  (Teacher / Product / Program / Campaign / None)
- `spotlight_name` — canonical entity name

Plus three new cache/confidence fields: `prompt_version`,
`classifier_confidence`, `manual_override`.

Dashboard changes:

- [lib/types.ts](lib/types.ts) — `Post` type gained six optional v2
  fields (`spotlight_type`, `spotlight_name`, `classifier_confidence`,
  `prompt_version`, `manual_override`) alongside the preserved legacy
  `featured_entity`.
- [lib/sheets.ts](lib/sheets.ts) — `getPosts()` reads the new columns
  with empty-string fallback. `classifier_confidence` is parsed to
  number with `undefined` when the cell is blank or unparseable, so
  the UI can tell "no confidence reported" apart from "0.0 confidence".

No aggregator changes in this commit — the new fields are available
but not yet surfaced. Later passes light them up on `/strategy` and
`/explore`.

---

## 2026-04-17 — Explore filter dropdowns + footer alignment

### Changed: Explore page — filter chips replaced with multi-select dropdowns

The Explore page filter panel used to be a collapsible block of inline
chip-buttons for Pillar, Format, Audience, and Entity. With 100+ entity
values and long pillar/audience lists, the panel consumed roughly half
the viewport even when collapsed to 14 visible chips per row.

Filter UI is now a single horizontal toolbar of compact multi-select
dropdowns: **Pillar**, **Format**, **Audience**, **Entity**, plus the
**Group by** control, all on one row. Each dropdown button shows a
count badge when selections are active (e.g. `Pillar 3`), and the
Entity dropdown includes a search input because of its long option
list. The "posts match" count and Clear-all control sit on the right of
the same toolbar.

Net effect: the entire filter block went from ~320px tall to ~48px.
All filter state, filtering logic, and the Group-by dimension set are
unchanged — only the control surface was rebuilt.

Files touched: [ExploreClient.tsx](app/explore/ExploreClient.tsx) — new
local `MultiSelect` and `GroupBySelect` components; removed the
`FilterPanel` / `FilterChips` components.

### Fixed: DataFooter left/right alignment

The footer row used `flex flex-wrap` with `ml-auto` on the engagement-
rate definition item. On narrow viewports and at awkward breakpoints
the right-side text would wrap onto the same line as the left cluster
and drift, rather than sitting flush-right. Switched to a two-group
layout (`flex-col lg:flex-row lg:justify-between`): provenance items
group on the left, formula definition on the right, stacks cleanly on
mobile.

Files touched: [DataFooter.tsx](components/DataFooter.tsx).

---

## 2026-04-17 — UX overhaul (commit `d0e324e`)

A broad pass on chart legibility, branding, and data provenance based
on Shahriar's screenshot review.

### Added: metric names and axis labels across every chart

Charts previously rendered unlabeled Y/X axes and generic `value: XX`
tooltips, so viewers had to infer what was being measured. Every
`BarChartBase`, `TrendChart`, and `Donut` now accepts:

- `metricName` — replaces `"value"` in tooltips (e.g. `Reach: 12,345`)
- `valueAxisLabel` / `categoryAxisLabel` / `xAxisLabel` — render as
  Recharts `<Label>` on the relevant axis

All page-level chart usages across Overview, Trends, Engagement,
Timing, Strategy, and Explore were updated to pass these props.

### Added: percent-of-total on distribution charts

Charts showing a breakdown of a whole (format distribution, pillar
distribution, funnel distribution, Explore "Performance by X") now
pass `showPercent` to `BarChartBase`. Bars get a percent label and the
tooltip reads `12,345 (32.4% of total)`.

### Changed: unified date-range picker

Replaced the inline 7D/30D/90D pill strip + separate custom-date
inputs with a single branded dropdown button. One button shows the
active range label; opening it reveals 6 presets (7d, 30d, 90d, MTD,
YTD, All time) plus a custom range section with date inputs and an
"Apply custom range" CTA. Closes on outside click.

Files: [DateRangePicker.tsx](components/DateRangePicker.tsx), and the
Explore page got its own local `RangeDropdown` with the same UX.

### Added: branded login page

Two-column login: left panel is a Shikho indigo brand surface with
radial gradient blobs (pink, orange, blue), Shikho logo, the tagline
"Know what's working. Know why it's working.", and a stats strip.
Right panel is a clean form with focus state in brand indigo.

### Added: Shikho logo + brand palette in nav

Replaced the gradient "S" placeholder with the official Shikho bird
logo (`public/shikho-logo.png`, copied from Brand Guidelines). Added
`brand.shikho-indigo`, `shikho-blue`, `shikho-pink`, `shikho-orange`
to `tailwind.config.ts` and recolored nav, KPI, and accent surfaces to
the Shikho palette.

### Added: chart definitions and sample-size badges

`ChartCard` now accepts `definition` and `sampleSize` props. Definition
renders as a hover-ℹ tooltip next to the chart title so team members
can see exactly how a metric is computed (e.g. what "engagement rate"
means, or how a funnel stage is assigned). `sampleSize` renders as a
muted badge in the top-right (e.g. `n = 90 posts`), so viewers always
know how many observations a chart is based on. Every chart across
the dashboard now carries both where meaningful.

### Added: data-provenance footer

New `DataFooter` below every authenticated page: source of truth
(Facebook Graph API → Google Sheets), dashboard cache (5 min),
pipeline cadence (weekly run), and the engagement-rate formula. Gives
the team confidence that what they're seeing is current and fully
defined.

### Changed: Explore page restructure

Explore now follows the same shell as other tabs: `PageHeader` + KPI
row up top, then the filter toolbar, then charts. Removed the mixed
layout where filters sat awkwardly above a rag-tag chart list. This
pass is what enabled the follow-up filter-dropdown refactor above.

Commit: `d0e324e`.

---

## 2026-04-17 — Fixed: Server-side exception on Trends / Engagement / Timing / Strategy tabs

**Symptom.** In production, every tab except Overview rendered
`Application error: a server-side exception has occurred`. Dev server and
`npm run build && npm start` locally both looked fine.

**Root cause.** Next.js 14 App Router RSC → Client Component serialization.
The Server Component page files were passing inline arrow functions as a
`valueFormat` prop into chart components marked `"use client"`:

```tsx
// WRONG — function prop crosses the RSC boundary
<BarChartBase data={...} valueFormat={(v) => v + "%"} />
```

In production React throws `Error: Functions cannot be passed directly to
Client Components` because functions are not serializable across the
RSC wire format. Dev mode tolerated it; production did not. Overview was
the only tab that never passed this prop, which is exactly why it was the
only tab that worked.

**Fix.** Replaced the function-prop API with a string-spec API resolved
inside each client chart component:

```tsx
// RIGHT — string spec is serializable
<BarChartBase data={...} valueFormat="percent" />
```

Client components ([BarChart.tsx](components/BarChart.tsx),
[TrendChart.tsx](components/TrendChart.tsx),
[Donut.tsx](components/Donut.tsx)) now accept
`valueFormat?: "number" | "percent" | "percent1"` and build the formatter
locally via a `makeFormatter()` helper.

**Lesson for future changes.** Anything non-serializable — functions,
class instances, Dates (in some versions), Symbols — cannot be passed as
props from a Server Component to a `"use client"` component. If you need
configurable behavior at the boundary, pass a serializable spec (string
enum, plain object) and resolve it inside the client component.

Commits: `edcd3ac`, `174d1e7`.
