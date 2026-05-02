# Changelog

## 2026-05-02 — v4.18 R1: Pulse + Weekly bucket header compression

User feedback (transcript backlog): "the headers on Pulse and Weekly
pages take too much vertical space. By the time I see the first chart
I've scrolled half a screen on mobile."

Implementation:
- New `compact` prop on `PageHeader` (default false). When true:
  shrinks title `text-2xl` → `text-xl` on mobile (still text-2xl on sm+),
  drops `mb-6` → `mb-3 sm:mb-4`, inlines the picker meta onto a single
  line (`{dateLabel} · {dataAsOf}` instead of two stacked lines).
- `WeekSelector` slimmed from `mb-4` → `mb-3`, pills `px-3 py-1` → `px-2.5 py-0.5`,
  pill text `text-xs` → `text-[11px]`, range subscript `text-[10px]` → `text-[9px]`,
  label "Showing:" → "Week:". Saves ~12-16px.
- Explore's custom inline header rewritten to match the compact pattern
  (it doesn't use `PageHeader` because of its `RangeDropdown` client
  state — but the visual rules are identical now).

Applied to all 6 Pulse pages (Overview, Trends, Engagement, Timing,
Reels, Explore) and all 3 Weekly pages (Diagnosis, Plan, Outcomes).
**Today** and **Reference** keep the spacious version: they're focus
landing pages where the 28px title earns its space.

Total saved per affected page: ~40-60px of vertical chrome on mobile,
~24-32px on desktop. Cumulative effect: the first chart / first KPI
strip moves above the fold on a 360px screen for every Pulse page.

## 2026-05-02 — v4.18 R5: Outcomes Yesterday inline focus card

User feedback (transcript backlog): "when I open Outcomes on a Tuesday
morning to check Monday's results, I shouldn't have to scroll the
whole week — just show me yesterday."

Implementation: a new "Yesterday" Card pinned above the rollup on the
Outcomes page when (a) active week == current Mon-anchor week and (b)
yesterday's date string ≠ today's (avoids pinning Sunday on a Monday-
morning rollover where yesterday belongs to a different week). Same
rows still render in the per-day breakdown below — this is a focus
shortcut, not a data fork.

Each yesterday slot shows: post time (derived from matched post's
created_time), pillar · format, hypothesis chip, prelim chip if
applicable, reach + Quality Engagement inline (matching the Today
page's Yesterday card vocabulary), PostReference drill-down, and
verdict pill. "Jump to {Day} ↓" anchor link scrolls to the same day
inside the per-day breakdown. Per-day `<details>` blocks gained
`id="day-Monday"` etc. + `scroll-mt-4` for the anchor target offset.

Cap at 8 rows in the focus card with "+N more in {Day} below" hint
when yesterday had more slots than that. Magenta left-border accent
distinguishes it from the rollup's neutral card.

## 2026-05-02 — v4.18 W2 Fri (W13): Recent Reels pagination + reusable PaginatedList

User feedback (voice transcript 2026-05-01): "the Recent Reels table
should let me scroll through everything from the period. 25 rows is
arbitrary — if a week has 60 reels I should be able to see all 60."

Implementation: new `components/PaginatedList.tsx` — a reusable
render-prop pagination shell. Caller passes `items`, `pageSize`, and
a render function; PaginatedList owns page state + renders the Prev /
page-indicator / Next control strip below. Layout-agnostic: the same
component wraps a desktop table OR a mobile card list OR a ranked
leaderboard, as long as the caller's render function maps over
`visibleItems`.

API:
```tsx
<PaginatedList items={rows} pageSize={10} ariaLabel="Recent Reels">
  {({ visibleItems, page, totalPages, setPage }) => (
    <table>{visibleItems.map(...)}</table>
  )}
</PaginatedList>
```

Applied to Recent Reels: cap of 25 removed; pageSize=10. A 60-reel
period now renders 6 pages, all reachable via the bottom Prev / Next
strip. Both the desktop table AND the mobile card list share one
`{visibleItems.map(...)}` render function — pagination state is
shared, switching between viewports doesn't reset the page.

a11y: `nav[aria-label]` on the control strip, `aria-label` on Prev /
Next buttons, `disabled` state when at first / last page, focus-
visible ring on all controls. Tabular-nums on the page indicator
keeps the digits stable as the user pages.

Future: PaginatedList is now generic — Outcomes table (currently no
cap; 8+ weeks), Diagnosis source-post lists, Explore explorer rows,
all candidates for the same shell. P6 future-reuse target captured.

Build green; reels bundle 4.2 → 4.69 kB.

## 2026-05-02 — v4.18 W2 Thu (W12): Top 10 Reels merged into one switcher

User feedback (voice transcript 2026-05-01): "the three Top-10 Reels
charts on the reels page should just be a switcher — I'm only looking
at one of them at a time, and stacking three identical-looking ranked
lists below each other is wasteful."

Implementation: new `components/TopReelSwitcher.tsx` — a client tab
strip that toggles between pre-rendered list panels. Each panel is
still server-rendered (TopReelList stays a server component, uses
PostReference + Bangla-aware truncation), passed as a `ReactNode` via
the switcher's `tabs[].content` prop. The client component does
nothing but toggle visibility — zero re-render cost, zero data
fetching.

Tab list:
- **Plays** — raw reach leaders (default)
- **Avg Watch Time** — engagement-quality (≥500 views floor)
- **Followers Gained** — conditional (only included if any reels
  gained followers in range)

Each tab has its own accent color (indigo / magenta / green), its own
subtitle + caption, its own bar color, and its own value formatter.
Layout savings: ~600px of vertical space on desktop, ~1100px on mobile
(was 3 stacked cards, now 1 card with toggle pills above the list).

The dynamic 4th list (Top Reels by {active page metric}, surfaced
when metric != reach) stays as a separate card — different semantics
(it's framed as "what does the page-level metric say about reels?",
not "rank these reels by a reel-domain metric").

Build green; reels bundle 3.77 → 4.2 kB (small client component
added). Tab strip respects `focus-visible` ring and aria-selected /
aria-controls / role=tablist for keyboard + screen-reader nav.

## 2026-05-02 — v4.18 W2 Wed (W5 + W6): Reference content pass

W5 — concrete examples added under every Hook Type, Caption Tone,
Spotlight Type, and Language. Each example is a real Bangla / Banglish
caption-line (or scenario for Spotlight Types) so operators can
pattern-match the classifier's call against actual openers they've
seen, not just abstract descriptions. Examples render in italic with
a left border separator, indented under the value name. The Mixed
language gets its own example showing code-switching ("SSC '26
batch-এ enroll করার last day আজ — don't miss it!"), addressing the
specific user ask "what do you mean by mixed?"

W6 — every definition restructured from `{term, def}` to
`{term, key, def}`:
- `key` is a 1-line punchy summary (the headline-grade idea, ~12-18
  words). Reads like a "tldr" — scannable in <1s.
- `def` is the longer explanation, demoted to smaller / muted text.
- Cold-read test: scrolling the Definitions section reading only
  bolded keys now gives ~80% of the vocabulary without reading the
  full text. The defs are there for the curious operator who wants
  the precise mechanics.

Read-time presentation only. No data, schema, or classifier changes.

## 2026-05-02 — v4.18 W2 Tue (W4): Reference layout rework

Reference page restructured per the locked plan's W2 Tue ticket. Three changes:

1. **"Tones" → "Caption Tone"** — section header now matches the
   `caption_tone` classifier field exactly (per user clarification on
   2026-05-02). Reduces the "what is this called?" friction when an
   operator clicks through from a Tier-1 chart that uses the field name.
2. **Audiences nested grouping** — Students (Junior/SSC/HSC/Admission)
   become a single visual group with an indented sub-list; Parents,
   Teachers, General are sibling groups. Each group gets a tiny count
   suffix. Unknown audiences fall through to an "Other" group so live
   data drift can't hide behind the schema. Read-time only — no data
   change.
3. **Languages as inline pills** — was a vertical list (5+ rows of
   whitespace next to a 3-value column). Now horizontal flex-wrap
   pills, with descriptions in a compact text legend below. Section
   height drops by ~60%; aligns better with neighboring Caption Tone
   card on the right.

Spacing tightened across all taxonomy cards (`space-y-1` instead of
`space-y-1.5`, `mb-2.5` instead of `mb-3`) so dense cards (Pillars,
Hook Types) don't feel sparse anymore.

## 2026-05-02 — v4.14b: Outcomes Target Metric column + per-row drill-down

User feedback: "both forecast and actual columns should reflect the
metric being targeted for each row." Honest answer is priors-based
scoring only supports unique reach (only dimension with 90-day priors)
but the slot's stated success_metric IS real intent. Surfacing it lets
the user see what the slot was AIMED at vs what the deterministic
verdict can measure.

Pipeline (`65cbd1a`): Outcome_Log gets two new columns — Slot Target
Metric (the slot's success_metric string) + Slot Expected Reach Range
(human-readable forecast string). Schema migration appends both
in-place on existing tabs. Fired with `force_regenerate=true` to
backfill all existing rows.

Dashboard (`332f009`): new Target Metric column between Format and
Reach Forecast on desktop table; mobile gets a target-metric block
above the 3-stat grid. Shows the slot's stated bet + expected reach
range + a yellow "scored on reach" warning when target ≠ reach (so
user knows the verdict columns aren't measuring the same metric).

## 2026-05-01 → 2026-05-02 — v4.13 + v4.14: hypothesis tooltips, Mon-anchor unification, Outcomes drill-down, Diagnosis polish, Tier 1 + 1.5 self-improvement infra

Major sprint covering 12 commits. The full per-dimension breakdown +
roadmap lives in `LEARNINGS.md` (permanent reference) +
`docs/PLAN_ALGORITHM_AUDIT.md` (deeper critique). Highlights:

**Coherence + correctness fixes (the original symptom space):**
- Per-week archive on Content_Calendar (Week Ending column, retains 12 weeks)
- Past-week immutability lock — `Outcome_Log` scores against the band that was stamped at plan time
- Format vocabulary alignment (`_format_bucket` collapses Reel/Video to one matcher bucket because FB API only emits "video")
- `_post_reach()` flat-dict fix — was reading nested Graph API form, every post returned reach=0
- Diagnosis Week Ending normalized to running-Monday (10 legacy rows rewritten in-place)
- Outcome matcher iterates ALL Content_Calendar weeks, not just the run's target week
- Diagnosis multi-row resolver picks newest by generated_at (was returning oldest match)
- Outcomes weeks sorted newest-first in picker

**Convention unification (one source of all date-display bugs):**
- WeekSelector switched from closing-Sunday to running-Monday everywhere
- Page headers + pill subLabels show full Mon-Sun range ("Apr 27 – May 3") uniformly
- `weekStartingFromEnding` generalized to Mon-snap any input

**Visual + structural polish:**
- Plan slot rows + Plan narrative card + Outcomes rows + Diagnosis verdict header all have hypothesis chips with tooltips reading from `Plan_Narrative.hypotheses_map` (active week)
- Outcomes rows: PostReference iconOnly per row, hover-preview + Facebook permalink (mirrors Reels/Explore/Diagnosis pattern), Prelim chip on <7d posts
- Outcomes columns explicitly labeled with metric (unique reach + CI band + score-as-ratio); footer note defines `post_total_media_view_unique`
- Diagnosis: gradient stripe on verdict card, gradient-filled section headers (8x8 with shadow), hover-lift cards everywhere, quick-stat strip below headline
- Plan: per-week empty state with honest explanation (no silent cross-week fallback)

**Closed-loop self-improvement infra (Tier 1 + 1.5):**
- `Calibration_Log` weekly post-process — hit-rate inside CI + sharpness + per-pillar/format breakdown + regime marker
- `Experiment_Log` — pre-registered numeric success metric per `experiments_to_run[]`; deterministic pass/fail at ≥7-day decay
- `System_Suggestions` — auto-derived prescriptions (calibration drift, hypothesis retire, pillar over/underperform), advisory NEVER auto-applied
- Strategy prompt closed-loop edge: reads `Experiment_Log[-8w]` resolved + System_Suggestions for the upcoming week
- `recommend_weekly_slot_count` — replaces hardcoded 28-30 floor with median posts/day on top-tercile-by-reach days × 7
- `validate_funnel_balance` + `validate_hook_freshness` validators wired into `validate_plan` (PLN-08 rejects + retries on violation)
- Decay-aware Outcome scoring: `Preliminary` flag on posts <7 days old, excluded from Calibration_Log

**See:**
- `docs/PLAN_ALGORITHM_AUDIT.md` — multi-POV critique + Tier 1-8 roadmap
- `LEARNINGS.md` — permanent per-dimension decision-logic reference + Tier coverage status
- `DECISIONS.md` — Mon-anchor convention, past-week immutability, closed-loop discipline (L0.5 advisory only)

## 2026-05-01 — Plan-algorithm audit + roadmap recorded

Decomposed how the calendar / strategy stages choose every dimension
(slot count, pillar mix, format, hook, spotlight, time-of-day, forecast
band, hypothesis) and named where each decision is weakest. New
[`docs/PLAN_ALGORITHM_AUDIT.md`](docs/PLAN_ALGORITHM_AUDIT.md) is the
critical multi-POV audit (statistical, causal, identifiability,
calibration, evaluation, adversarial, behavioral, time-series,
information-theoretic). Recommends Tier 1-7 of upgrades; Tier 1 is
the only set that's a prerequisite for evaluating everything else
(calibration log + pre-registered experiment metric). Algorithm
decomposition + 3-tier ranking summary in [`LEARNINGS.md`](LEARNINGS.md).

## 2026-05-01 — Sprint P7 v4.10: Outcomes loop fix + calendar slot count + first POV discovery promoted

User asked the right question: "why are we not detecting what was
posted vs the plan and populating Outcomes?" Investigation found a
structural bug that 2 password-gated QA passes both missed.

**v4.10 P0a — Outcomes loop closure (pipeline `1896515`):**
- Pre-v4.10 matcher in `src/sheets.py` read `_p.get("slot_index")`
  from each post — a field Facebook posts don't carry. So the
  actuals-by-slot dict was always empty, every Outcome row was
  "no-data", and the loop never closed across any v4.x run.
- Replaced with `_build_outcome_actuals(calendar, posts, classifications)`
  — joins by (date, format, pillar) with time_bdt proximity tiebreak.
  Smoke-tested with synthetic data; correctly handles single-match,
  no-match, and multi-candidate-with-time-tiebreak cases.

**v4.10 P0b — Calendar prompt slot count + distinctness (pipeline
prompt v1.7 → v1.8):**
- Slot target raised from "3-5/day" floor (which AI was treating as
  21/week) to explicit "28-30/week, 4/day with weekend bumps in exam
  season."
- New DISTINCTNESS RULE explicitly forbids regenerating a default
  template each week. Each calendar must reflect last week's
  diagnosis, last week's outcome scores, this week's academic
  context, this week's brand-comms context.

**Discovery promoted to Tier 1 — T1.11 join-key existence audit
(`docs/LIVE_CHECK_POVS.md`, `docs/LIVE_CHECK_DISCOVERIES.md`):**
- The new POV that would have caught the matcher bug. Generalizes:
  every join across data sources must verify the join key exists on
  both sides. Promoted from Discoveries because it's a P0 loop bug
  that no existing Tier 1/2/3 POV would have caught.
- The discovery doc workflow worked first time: bug found, lens
  named, generalization tested (Diagnosis ↔ source_post_ids,
  Strategy ↔ Calendar, etc all verified clean), promoted to T1.

**v4.10 verification status:**
- Run `25202864494` (force_regenerate, days=30) completed before v4.10
  shipped, so the matcher fix isn't reflected yet. v1.12 prompt + brand
  comms context wins ARE visible: Plan size up to 30 slots/week (was
  22), narrative cites academic + brand context + named top performers,
  Calendar Alert hedges instead of commands, active-exam banner
  correct ("Active: SSC 2026 · ends in 19 days").
- Outcomes still 30/30 pending in this run. Matcher fix takes effect
  on next cron (Mon May 4) or manual trigger.

## 2026-04-30 — Sprint P7 v4.5 (close out QA findings — multi-line on Explore + outlier-aware y-axis + copy fixes)

Working through the open findings from the v4.4 QA report.

**v4.5.1 — Explore composite-trend chart now multi-line (Finding #7):**
- Was: single `TrendChart` plotting first active metric; caption
  apologized "Multi-line composite trend is a v3.5 follow-up."
- Now: composite mode (2+ metrics) renders `<MultiLineTrendChart>`
  with each series normalized to % of own peak — same pattern as
  Overview + Trends. Title flips to "Composite Trend (N metrics,
  normalized)"; caption adapts.
- Single-metric path unchanged.
- `formatKind` discriminator (not function prop) — applied the v4.4
  Server→Client lesson preemptively even though `ExploreClient.tsx`
  is itself `"use client"`.

**v4.5.2 — Plan Last-Week empty-state copy (Finding #5):**
- Was: silent fallback to "most recent calendar in the sheet" — on
  Last-Week view this meant showing future-week content with the
  "showing fallback" note. Confusing.
- Now: when `isLastWeekView && usingFallback`, copy is explicit:
  "Last week's calendar wasn't archived — history started accumulating
  from Sprint P7 v3 (append-by-week writer, 2026-04-29). The slots
  below are the most recent calendar in the sheet (a future week's
  plan), shown so the page isn't empty. They are NOT last week's
  actual posting plan."
- This/Next-Week views keep the existing fallback copy (where falling
  back is more helpful than empty during the running week).

**v4.5.3 — Outcomes pill labeling (Finding #6):**
- Was: most-recent week pill labeled "Last week (May 4)" — but May 4 is
  a Monday (the grading-run date), not the Sunday week-ending. Reads
  like the past when it's actually the most-recent grading cycle.
- Now: pill says "Most recent (May 4)"; rollup card header says
  "Grading run: 2026-05-04" (was "Week ending 2026-05-04").
- The grading-date vs week-end distinction is now explicit in copy.

**v4.5.4 — Trend chart outlier-aware y-axis (Finding #8):**
- Problem: when one viral day dominates (180k reach in a week of
  10k-typical days), Recharts default auto y-domain caps at 180k and
  the rest of the line hugs the baseline — chart looks empty.
- Fix: new `computeYDomain()` helper. Triggers cap at 1.1× p98 only
  when max ≥ 2.5× p90 AND max ≥ 1.4× p98 (i.e. a real outlier is
  present, not just a smooth peak). The viral day clips through the
  top — visually obvious as "this exceeds the chart" — and the rest
  of the data gets proportional vertical space.
- Tooltip shows the raw value (capping is purely visual). When values
  are evenly distributed, the helper returns undefined → Recharts
  uses its default auto-domain. Net: only fires when it would help.
- Applied to all `<TrendChart>` instances (Overview reach trend,
  Trends daily-metric, Explore single-metric trend).

**v4.5.5 — DECISIONS entry: known limitations of browser-MCP QA
(Findings #9 + #10):**
- Recharts hover tooltips don't fire on programmatic mouse events
  (synthetic mousemove via CDP doesn't reach Recharts' SVG hit-test).
  Code review + real-mouse manual hover are the only sufficient
  verifications.
- `resize_window(360, 740)` sets OS window size, not viewport. Plus
  DPR scaling. For true mobile QA: Chrome DevTools device-mode, real
  device, or CSS-level review per the CLAUDE.md mobile checklist.

**Findings #2 + #3 investigated, not bugs:**
- #2 Question hook ER 1.63%: hook distribution healthy (113
  classifications: 38% Announcement, 23% Question, 19% Stat). 1.63% is
  highest within the hook dimension; lower than Best Format (5.50%)
  because hook is a tertiary signal. Working as intended.
- #3 99.2% retention reel: short reel artifact. With avg watch time
  5.0s and 3s-retention defined as `curve[3]`, a ≤6s reel where most
  viewers complete the first 3s legitimately scores ~100% retention-
  at-3s. Not a bug.

**One finding NOT shipped — depends on external action:**
- "Theoritical" typo in calendar alert lives in the Knowledge team's
  external academic calendar Google Sheet (sheet ID
  `1dos36Slg2zDIRdcL_ZqL2PCcisssXp2CtflXQwj-c6s`). Pipeline reads it
  verbatim. Fix requires editing that sheet directly.

## 2026-04-30 — Sprint P7 v4.4 hotfix pass (live QA caught composite crash + Diagnosis button placement)

Live QA across all 9 dashboard pages turned up 2 ship-stopping bugs in
the v4 work that the build gate didn't catch. Both fixed in flight.

**v4.4 hotfix #1 — composite mode crashed Overview + Trends (`a5e1dfc`):**
- Symptom: any URL with 2+ active metrics (`?metric=reach,interactions`,
  etc.) threw "Something went wrong loading this page" with a Server
  Components render error in the production logs.
- Root cause: `MultiLineTrendChart`'s `MultiSeries` type accepted a
  `formatter: (v: number) => string` function prop. v3.5 commits c34a01b
  (Overview) and the Trends page constructed series with inline
  formatter closures and passed them to the client component. Next.js 14
  forbids passing functions across the Server→Client component prop
  boundary; the build was green (no type-level violation) but the
  server threw at request time on every composite-mode request.
- Fix: replaced `formatter` with a serializable
  `formatKind: "percent" | "number"` discriminator. `formatRaw(kind, v)`
  helper now lives inside `MultiLineTrendChart.tsx` (the client component
  side). Identical tooltip output, no behavior change for end users.
- Files: `components/MultiLineTrendChart.tsx`, `app/page.tsx`,
  `app/trends/page.tsx`.

**v4.4 hotfix #2 — Diagnosis regenerate button on wrong view (`e3c40f3`):**
- Symptom: `<RegenerateThisWeekButton scope="weekly" />` showed on
  Diagnosis Last-Week view. But Diagnosis is exempt from running-week
  locking (per Sprint P7 v3 spec — mid-week + Monday cycle is intentional
  dual-write), and `scope="weekly"` regenerates Strategy/Calendar/
  Plan_Narrative — content not visible on Diagnosis. Net: button did
  nothing useful from the user's POV.
- Fix: moved button to Diagnosis This-Week view with `scope="midweek"`
  so it re-runs the Thursday mid-week diagnosis the user is currently
  reading. Disclosure copy updated to reflect the midweek scope.
- File: `app/diagnosis/page.tsx`.

**QA pass coverage:** Overview, Trends, Engagement, Timing, Reels,
Diagnosis, Plan, Outcomes, Explore at desktop (1280) + mobile (360).
Pipeline-side Graph API v25 fetch validated end-to-end (31 posts +
16 videos + 7 days page_daily, 0 failures, 33.4s).

**Lower-severity findings logged but not yet shipped** (see
DECISIONS for the prioritization rationale): "Theoritical" typo in
diagnosis prompt output; Plan narrative card title hardcoded; Plan
Last-Week fallback shows future calendar; Outcomes "Last week" pill
ambiguous; Explore composite-trend chart is single-line (v3.5
follow-up not yet adopted on Explore); single-metric trend charts
hug the y-axis baseline when one viral day dominates.

## 2026-04-29 — Sprint P7 v4 (per-cell explainer wired, regenerate UI button, Graph API v25 bump)

Three v4 follow-up items pulled forward in one session. Closes the
v3.5 explainer-primitive loop, adds a UI surface for the locking
escape hatch, and lifts the pipeline to a current Graph API version.

**v4.1 — per-cell composite explainer wired (`874ecb3`):**
- `BarChartBase` accepts optional `compositeBreakdown` prop keyed by
  bar label. When passed (composite mode only), a custom Recharts
  `<Tooltip content={...}>` render prop replaces the default tooltip
  with a dark indigo popover matching `<CompositeExplainer>` /
  `<PostReference>` styling.
- Each tooltip row shows: per-metric percentile, weight, raw value,
  and contribution to the composite score. Weights are sum-normalized
  to match `compositeScore` math.
- Wired on Overview (Pillar performance) + Explore (Performance by X).
  Explore uses the FULL grouped population for percentile ranks (not
  the top-12 slice) so ranks stay honest. Single-metric mode still
  uses the default Recharts tooltip — no behavior change there.

**v4.2 — "Regenerate this week" UI button (`9061767`):**
- New `<RegenerateThisWeekButton>` disclosure component. Coral border
  on hover; 3-step instructions panel with link to GitHub Actions UI.
- `scope` prop ("weekly" | "midweek") routes to the right workflow.
  Operator flips the `force_regenerate` workflow_dispatch input to
  bypass running-week locking. Zero-config — no PAT secret needed.
- Wired on Diagnosis (`isLastWeekView` only — where end-of-week
  verdict gets locked) + Plan (`isThisWeekView || isNextWeekView` —
  where Calendar/Plan_Narrative are locked). v4.5 candidate is a
  Next.js API route POSTing to `actions/workflows/dispatches`
  directly; deferred until pain emerges.

**v4.3 — Graph API v21.0 → v25.0 bump (pipeline `bb2a1e8`, closes #2):**
- Audited Facebook Graph API changelogs v22→v25. v22 (Instagram-only),
  v23 (WhatsApp + Marketing), v24 (Live Video + Marketing) all safe
  for our FB-only endpoints. v25 Page Insights deprecations are
  *queued for v26*, not active in v25.
- Live smoke-tested every endpoint we use against v25.0:
  `post_total_media_view_unique`, `post_engagements`,
  `post_impressions_unique`, `post_clicks`, `post_reactions_*`,
  `page_daily_follows_unique`, `page_daily_unfollows_unique`,
  `/me?fields=followers_count,fan_count` — all HTTP 200.
- Deprecated metrics (`post_impressions`, `post_negative_feedback`,
  `page_fans`, `page_fan_adds_unique`, `page_fan_removes_unique`,
  `page_negative_feedback`) confirmed not in live fetch path; they
  sit in the deprecation registry only.
- `scripts/check_graph_version.py` now reports `STATUS: current`
  (lag 0/0). Sunday cron will stop firing red.
- Next bump (→ v26.0) needs a separate audit when v26 lands; that's
  the deprecation cliff for several Page-level `_unique` metrics
  we use today.

## 2026-04-29 — Sprint P7 v3 + v3.5 (live validation, Plan selector unblocked, multi-line composite, weight sliders)

Live triggers + cross-repo architectural unblock + v3.5 follow-ups
shipped in one autonomous session. 8 commits across 2 repos:

**Live validation (3 runs):**
- `25099892852` — first ever mid-week diagnosis run. Wrote
  `engine="ai-midweek"` row for week_ending=2026-05-03 with the
  PARTIAL_WEEK headline ("In this mid-week update, follower growth
  accelerated…"). Caught a strategy-shouldn't-run-on-midweek bug
  (strategy stage slipped through main.py's --mode midweek dispatch
  because run() had no midweek_mode guard). Fixed in commit `f43e14f`
  with explicit guard at strategy stage start.
- `25104738385` — first weekly run after fix. Wrote Strategy +
  Content_Calendar + Plan_Narrative for week_ending=2026-04-26.
  Content_Calendar + Plan_Narrative locks fired (existing rows
  from earlier runs); Strategy didn't lock (existing row was for
  week_ending=2026-05-03 from the leftover mid-week run, different
  week so different lock state).
- `25105294793` — second consecutive weekly run. **All three locks
  fired correctly:**
  - `Strategy: running-week locked (week_ending=2026-04-26, engine=ai); skipped write`
  - `Content_Calendar: running-week locked (week starting 2026-05-04 already in sheet); skipped write`
  - `Plan_Narrative: running-week locked (week=2026-05-04 already in sheet); skipped write`
  - Diagnosis correctly NOT locked (exempt per spec — mid-week +
    Monday cycle is intentional dual-write).

**Plan selector unblocked (cross-repo Sprint P7 v3):**
- Pipeline `f43e14f`: Content_Calendar writer changed from
  clear+rewrite to APPEND-BY-WEEK. Each weekly run adds 7 new rows
  for its target week; older weeks stay in place as historical
  record. Lock check broadened (skip if any existing row matches
  the new week's first Date). Strategy stage skipped on midweek mode.
- Dashboard `6a24d95`: new `getCalendarByWeekStarting()` reader,
  `listCalendarWeeks()` helper. Plan page wires `<WeekSelector>`
  with `["this", "next", "last"]` choices. Subtitle/dateLabel adapt;
  fallback "showing latest week" pill bridges the gap until the next
  Monday cron lands historical rows.

**v3.5 multi-line composite trend (`c34a01b`):**
- new `<MultiLineTrendChart>` component plotting 2+ metrics on one
  axis via per-series % of peak normalization. Raw values stay
  in the tooltip; shapes are directly comparable.
- Wired into Overview + Trends primary trend cards. Title flips
  to "Composite Trend (N metrics, normalized)" when 2+ active.
  Single-metric path unchanged.

**v3.5 multi-metric weight sliders (`5766c85`):**
- new URL param `?weights=W1,W2,...` (positional, matches active
  metric set). When absent, equal-weight (Flavor B) — backward
  compatible with current behavior.
- `<MetricSelector>` renders a "Customize weights" disclosure
  below the pills when 2+ metrics active. Each metric gets +/−
  buttons (±10 points). Reset link drops the weights param.
- `compositeScore` + `groupStatCompositeScore` + `sortByComposite`
  all accept optional `weights` argument. `normalizeWeights()`
  helper handles sum-normalization, all-zero edge case, negative
  clamping.

**v3.5 composite explainer primitive (`3eb4bb0`):**
- new `<CompositeExplainer>` component as a reusable popover
  primitive showing per-metric percentile + weight breakdown.
- Not yet wired into specific charts — Recharts bar tooltip
  customization for per-cell breakdowns is invasive. Component
  ships as a tooling primitive for future per-cell wiring.

## 2026-04-28 — Sprint P7 Phase 3 QA pass (deep-wire metric selector across 5 pages)

User QA caught that the page-level metric selector was visually present
on Trends/Timing/Reels but only re-keyed selected charts. Spec
philosophy: every chart with a comparable metric should follow the
selection (only categorical/count things stay invariant). 5 commits
fix the gap:

- `7e2c033` — Explore: Performance by X + Reach Over Time both re-key.
  Single-metric uses raw value sort; multi-metric uses composite. Bar
  chart's percent share + axis label adapt; trend chart title flips.
- `5c6e8a2` — Overview Biggest Movers: ranks by primary metric delta
  with metric-aware floor (reach 5000, interactions 50, engagement
  0.5%, shares 5). Item rows show appropriate units.
- `b71f91b` — Trends: collapsed 4 charts into 3 (Daily Posting Volume
  invariant + Daily {metric} + Weekly {metric}). Engagement-rate path
  preserves reach-weighted aggregation; other metrics sum per ISO week.
- `2336baa` — Timing: 3rd heatmap surfaces when active metric is
  shares or interactions (canonical reach + ER pair stays for
  divergence-spotting on those metrics).
- `c50781a` — Reels: "Top 10 Reels by {metric}" list surfaces when
  metric != reach. Reach already covered by existing Top-by-Plays.

Categorical/count things stay invariant per spec: Format Distribution
(Overview), Daily Posting Volume (Trends), Reels-domain lists by
Plays/Watch Time/Followers Gained (Reels).

Net: every page that exposes the MetricSelector now propagates
selection to every chart it should. Engagement page Format×Hour box
was Phase 1.4. Diagnosis/Plan/Outcomes correctly don't have the
selector at all.

## 2026-04-28 — Sprint P7 Phases 2 + 3 shipped (locking, mid-week diagnosis, week selectors, multi-metric ranking)

Eleven commits land the rest of Sprint P7 across both repos in one
autonomous session:

**Phase 2 — pipeline (commit `22126be`):**
- `--mode midweek` CLI flag in main.py routes Thursday cron to a
  fetch+classify+diagnosis-only run with `engine="ai-midweek"` stamped
  on the Weekly_Analysis row.
- `generate_weekly_diagnosis(midweek_mode=True)` injects a PARTIAL_WEEK
  banner so the model qualifies claims with "so far this week" rather
  than definitive end-of-week language. DIAGNOSIS_PROMPT_VERSION
  v1.8 → v1.9.
- Running-week locking guards on `write_strategy`, `write_content_calendar`,
  `write_plan_narrative`. Each writer reads existing rows, skips if a
  matching week already has a clean AI write. Diagnosis exempt.
  `--force-regenerate` CLI flag bypasses for ops recovery.
- New `.github/workflows/midweek-diagnosis.yml` (Thursday 04:00 UTC =
  10:00 BDT) with the same auto-Issue failure-notify pattern.

**Phase 2 — dashboard (commits `8afde55`, `21c29b4`):**
- New `<WeekSelector>` shared component (Diagnosis · Plan · Outcomes).
  Server-rendered pills, URL param `?week=this|last|next|YYYY-MM-DD`
  persistent across nav. `computeWeekEndings()` resolves semantic
  shortcuts off `bdtNow()`.
- `lib/sheets.ts::getDiagnosisByWeekPreferred()` handles
  multi-row-per-week_ending: prefer="midweek" picks `engine="ai-midweek"`
  first (with end-of-week fallback); prefer="full" inverts.
- Diagnosis page: WeekSelector with This/Last; "Preliminary,
  mid-week (Thu)" amber pill on this-week views; empty-state card for
  Mon-Wed before mid-week cron fires.
- Outcomes page: most-recent week pill now shows "Last week (Apr 26)"
  semantic label.

**Phase 3 — multi-metric ranking (commits `ae77a23`, `b1b5378`,
`2b3435c`, `dc29464`):**
- New `<MetricSelector>` component. Multi-select pills (Total reach ·
  Interactions · Engagement rate · Shares). URL `?metric=reach,interactions`.
  Equal-weight percentile-rank composite when 2+ active.
- `lib/aggregate.ts` adds `RankingMetric` type, `compositeScore()`,
  `percentileRankIn()`, `buildMetricSorts()`, `sortByComposite()`,
  `dailyMetricTrend()`, `groupStatValue()`, `groupStatCompositeScore()`.
- 6-page wiring: Overview (trend chart + pillar ranking deep-wired),
  Explore (post ranking deep-wired), Trends/Timing/Reels (selector-only
  for v1; per-chart deep wiring is v3.5). Engagement box-level was
  Phase 1.4.

**v3.5 deferrals** (post-Sprint-P7):
- Multi-line composite trend chart on Overview/Trends
- Reels Top-10 deep-wiring to active metric
- Timing 3rd heatmap (shares/interactions) when active
- Multi-metric weight sliders (Flavor A composite scoring)

## 2026-04-28 — Sprint P7 Phase 1 shipped (UI cleanup + Strategy→Diagnosis rename + Format×Hour metric selector)

Four focused commits land the Phase 1 deliverables from the brand-team
review session:

- **Engagement page cleanup** (`f7efb53`): dropped 4 second-row metric
  boxes (Virality / Discussion Quality / Sentiment Polarity / Save Rate)
  per spec. Save Rate was permanently "pending"; the other three
  duplicated signal already in Funnel Engagement chart. Variable
  cleanup + JSX removal.
- **Terminology sweep** (`d47cff9`): `ER` → `engagement rate` across
  user-facing strings on Engagement + Timing pages. Internal variable
  names (formatER etc.) left alone — code-only.
- **Strategy → Diagnosis rename** (`efd5095`): full rename across label
  + URL (`/strategy` → `/diagnosis`, no redirect) + nav + stages config.
  Brand-audit baseline path migrated. Old `/strategy` URL now 404s per
  spec.
- **Format × Hour metric selector** (`f2e2847`): box-level URL-persistent
  pills (Total reach / Interactions / Engagement rate / Shares). Preview
  of Phase 3 page-level pills. `formatHourMatrix()` extended from binary
  to 4-metric.

Plan + Outcomes week selectors **promoted to Phase 2** — discovered
during build that Content_Calendar overwrites each weekly run, so a
This/Next/Last selector would render empty tabs until Phase 2's
locking ships. ROADMAP updated.

## 2026-04-28 — BDT wall-clock for daysAgo + AI cost weekly bucket (timezone audit)

Sweep audit found three families of timezone drift:

- **D1** `lib/daterange.ts daysAgo` + `resolveRange now` used `new Date()`
  (UTC on Vercel) for the start of every "Last 7d / 30d / 90d / MTD / YTD"
  range. Compared against `bdt(post.created_time)` (BDT-as-local), this
  excluded posts created BDT 00:00–05:59 of the start day from every
  range-aware page (Trends/Engagement/Timing/Reels/Strategy/Explore/Overview).
- **D2** `lib/sheets.ts runCostSummary → _monday(d)` bucketed AI cost by
  UTC Monday, not BDT Monday. Sunday 18:00–23:59 UTC runs (= BDT Mon
  00:00–05:59) landed in the wrong week.
- **D3** `startOfWeekBDT(d)` carried a latent `getDay()` issue if called
  with a non-BDT-shifted Date. Not a bug today; documented the contract.

Fix: new `bdtNow()` helper in `lib/aggregate.ts`. Returns a Date whose
local-time methods reflect BDT wall-clock, regardless of runtime timezone
(uses `Intl.DateTimeFormat({ timeZone: "Asia/Dhaka" })` and parses the
parts as a naive local string — same trick as `bdt(iso)`). Both `daysAgo`
helpers and `runCostSummary` now use it.

D4 (outcomes page period sanity) audited, clean — reads pipeline-written
week_ending which is already Mon-Sun BDT.

## 2026-04-28 — Strategy: clickable post link on every Key Finding + Watch-out (cross-repo)

Closes the follow-up parked earlier today. `what_happened` and
`watch_outs` previously rendered as bare strings on the dashboard with
no per-entry post linkage. Three input shapes now collapse to
`{text, source_post_ids}` via a normalizer:

1. **legacy AI**: bare strings → `{text, source_post_ids: []}` (no link)
2. **new AI**: `{text, source_post_ids}` → direct (active once pipeline
   prompt v1.7 ships its first row)
3. **native**: `{detail | summary, source_post_ids, ...}` → reads detail
   for watchouts, summary for legacy what_happened

When `source_post_ids[0]` resolves in `postById`, the headline gets an
`iconOnly` PostReference (click → Facebook). When 2+ IDs back a finding,
an expanded "Source posts (N)" list appears below the body text.

Cross-repo lockstep: pipeline ships `DIAGNOSIS_PROMPT_VERSION = "v1.7"`
+ native engine updates same session. Backward compat means dashboard
ships safe — no live regression while old cached rows remain.

## 2026-04-28 — PostReference hover-gap fix + iconOnly mode on Strategy performer headlines

Two issues caught during a screenshot review of `/strategy`:

**Hover popover dismissed mid-mouse-traverse.** Classic hover-card bug:
the popover sat at `top-full mt-1` (4px gap), and moving the mouse from
trigger to popover fired `mouseleave` on the trigger before `mouseenter`
on the popover, killing the open state. Fix: 180ms `setTimeout`-based
close + `onMouseEnter/Leave` on the popover itself that cancel/reschedule
the close. Radix HoverCard pattern. Universal benefit — every
PostReference instance (Reels top-10, Strategy Source posts, Explore
table) inherits the fix.

**No primary-post link in performer headlines.** Top/Under performer
cards on `/strategy` had Source posts in the expanded view but the
closed headline gave no clickable affordance to jump to the post.
Added `iconOnly` prop to PostReference (20px external-link icon +
hover popover, no inline caption text), wired into both Top/Under
summary rows. Click → Facebook in new tab; doesn't toggle the
disclosure (e.stopPropagation).

Parked as follow-up: Key Findings + Watch-outs are flat string arrays
in the diagnosis JSON; per-entry post linking needs a pipeline-side
change in `findings.py` to emit `source_post_ids` per item.

## 2026-04-23 — P6 polish: 7 live-dashboard corrections (funnel migration, clickable post refs, compressed heatmaps, recommended redesign)

Seven user corrections from a live-screenshot review, all shipped in one pass:

1. **Funnel charts back on Engagement.** Funnel Distribution +
   Funnel Engagement + the TOFU/MOFU/BOFU inline explainer moved
   from `/strategy` → `/engagement`. Strategy is now Claude verdicts
   only, no raw aggregates — aligns with the page's "what does AI
   think" framing.
2. **Reels top-10 captions are clickable.** Swapped BarChartBase →
   new inline `TopReelList` (ol/li + CSS-flex proportional bar) on
   Plays / Watch Time / Followers Gained charts. Recharts YAxis renders
   labels as SVG `<text>` which can't host React popovers; HTML list
   items can. Bar visualization preserved via proportional flex width.
3. **Strategy top/under performers carry source post chips.** Each
   disclosure now renders PostReference per `source_post_ids` (pipeline
   already emits this on every performer row). Hover/tap shows full
   caption + permalink icon.
4. **Post-ID audit.** Swept every page for bare post_id mentions in
   UI copy — none found. Explore already uses PostReference; Outcomes
   doesn't reference posts directly. Diagnosis JSON stays internal.
5. **Timing heatmaps compressed.** Both ER·Day×Hour and
   Avg Reach·Day×Hour grids were `aspect-square` → produced ~80px
   cells × 7 rows, pushing the grid past one viewport height on
   desktop. Switched to fixed `h-[20px] sm:h-[22px] lg:h-[26px]` cells;
   grid now fits in one glance.
6. **Engagement "Recommended this period" redesign.** Plain `<ul>` →
   4-card grid (Lead format × pillar, Opening hook, Feature spotlight,
   Caption tone) with colored left border, icon, eyebrow label,
   colored winner value, and meta line. Scannable now.
7. **Copy polish.** Cleaned up dateLabel strings on Strategy after
   funnel charts moved; tightened section intros.

Brand audit caught 4 new slate-* violations I introduced in the
Strategy Source posts blocks (`text-slate-500`, `text-slate-700`).
Fixed to `text-ink-muted` / `text-ink-secondary` before commit.
Baseline ratcheted 292 → 291.

## 2026-04-23 — SEA-01..05 academic context strip on /plan and /strategy

Audit gap #3 closed. New `components/AcademicContextStrip.tsx` renders
a thin strip above PageHeader on `/plan` and `/strategy` with the
macro exam signal: season pill (Exam season → Shikho sunrise; Regular
season → Shikho indigo) + next-exam countdown (`HSC 2026 · in 8 days`).
Hidden when no future exam is known.

Static mirror of `facebook-pipeline/config/exams.yaml` lives at
`lib/exams.ts` (HSC 2026-05-01, SSC 2026-06-15) with
`EXAM_PROXIMITY_DAYS = 14` matching the pipeline's AMEND scorer.
`currentSeason()`, `nextExam()`, `daysUntilExam()` all read from
there. Why static over a full cross-repo persistence: the dashboard
only needs the macro signal — the full ~300-event calendar stays
pipeline-side. Trade-off documented in the file header; when the
Knowledge team's sheet changes, update both files in lockstep.

Brand audit: 292/292 (no regressions). Build green. Mobile layout:
`flex-col sm:flex-row`, pill flex-shrink-0.

## 2026-04-23 — OSL-04 Outcome_Log reader + new /outcomes page (v5 audit follow-up)

Audit gap #2 closed. New `/outcomes` page surfaces the pipeline's
Outcome_Log tab — per-slot verdict for last week's plan. Hero card:
hit count / hit rate / grade letter (A–F) / mean score / breakdown
strip. Per-day disclosures with a desktop table + mobile stacked
layout. Week picker when Outcome_Log has more than one week. Verdict
pills: Hit (emerald), Exceeded (deeper emerald), Missed (rose),
Pending (ink), Exam confounded (amber). Empty state calls out that
the next weekly run populates the page.

New `lib/sheets.ts` readers: `getOutcomeLog`, `getOutcomeLogByWeek`,
`getLatestGradedOutcomeWeek`, `listOutcomeWeeks`,
`computeOutcomeRollup`. Client-side rollup mirrors the pipeline's
`compute_calendar_quality_score` (A≥0.75, B≥0.60, C≥0.45, D≥0.30,
F<0.30, ungraded when graded_count=0) so the page renders honest
totals even when OSL-07 Calendar Quality Score isn't persisted yet.

Nav.tsx gains "Outcomes" between "Plan" and "Explore" — retrospective
view sits next to the forward-looking plan. No StalenessBanner: the
scorer is deterministic (not Claude-powered) per CLAUDE.md.

QA: typecheck clean, brand audit 292/292, build green. New route
2.1 kB / 96.4 kB first-load. Mobile layout stress-tested at 360px
(table → cards), exam-adjusted forecast gets its own amber annotation.

## 2026-04-23 — Sprint P6 chunk 7: v5 wiring audit + DYN-03 hook-fatigue cross-repo fix

- New `docs/V5_WIRING_AUDIT_2026-04-23.md`: sample-based audit of the 167-
  item QualityPlan v5 against the live repos. Sections for wired end-to-
  end, wired-but-orphan (STR-01..14, OSL-04/07/08, PL-05..09/13), missing-
  link (DYN-03, SEA-01..05, DYN-01), and internal-only. Summary calls out
  four gaps in priority order and tracks them as open items.
- DYN-03 fix (cross-repo lockstep): `lib/types.ts` + `lib/sheets.ts`
  getPosts() merge now read `Hook Fatigue Flag` + `Hook Fatigue Reason`.
  Pipeline side extended `write_classifications` headers 17 → 19 cols
  APPEND-only (separate pipeline commit). Audit originally flagged this
  as a "one-line reader addition" — turned out the sheet writer was
  dropping the fields on the floor too, so the fix was both sides.
  Post-audit correction appended to the doc.

QA: typecheck clean, brand audit 292/292, build green. Pre-fix rows
read false / "" on the reader, as intended.

## 2026-04-23 — Sprint P6 declutter 4/N: PostReference component + /reels readability + /explore reorder

- New `components/PostReference.tsx`: truncated caption preview → hover/tap
  popover with the full caption → click-through to the Facebook permalink.
  Keyboard-accessible external-link button, outside-click and Escape
  dismissal. Falls back to a plain preview when `permalink_url` is empty
  (pre-Apr-2026 rows).
- /reels table: caption column threads the full message + permalink into
  `PostReference`. Mobile card list same treatment at 90-char cap.
- /explore: reverted Batch 3b's Top-Posts-first order. Perf-by-X + Reach-
  Over-Time charts now sit right under the filter controls ("does this
  segment make sense?" read first), Top Posts drops to the bottom of the
  scroll for the deep-dive. Top Posts list captions also use
  `PostReference` now instead of a hard 200-char truncation.

QA: typecheck clean, brand audit 292/292, build green.

## 2026-04-23 — Sprint P6 declutter 3/N: 24hr time, BDT 10-23 window, darker engagement table

- `components/Heatmap.tsx`: grid compressed from 24 cols to 14 (hours 10-23).
  Overnight dead zone (00:00-09:00) hid real activity behind empty columns.
  Hour labels switched to 24hr zero-padded (10:00 / 12:00 / 14:00 / ...).
  Ticks every 2h.
- `app/timing/page.tsx`: `formatHour12` → `formatHour24`. Winner callouts
  now read "Best hour: 19:00" instead of "Best hour: 7 PM" — matches the
  24hr time markers the user asked for globally.
- `app/engagement/page.tsx` Format × Hour table: mirrors the Heatmap
  (14 cols, 24hr labels, "BDT 10:00–24:00" legend annotation). Alpha floor
  bumped 0.08 → 0.22 and the low-n reducer 0.35 → 0.55 so weak cells are
  visible without squinting. Cell height 20px → 22px for touch targets.
- Fix-on-touch: `text-ink-400` → `text-ink-500` on an engagement label.

Paired with pipeline commit 0b70da8 (UTC-aware timestamps across sheets.py):
old rows still display the ghost +6h, new rows from the next pipeline run
will show the real BD wall-clock everywhere the dashboard reads them.

QA: typecheck clean, brand audit 292/292, build green.

## 2026-04-23 — Sprint P6 declutter 2/N: /overview + /trends cleanup, readable week labels

- /overview: removed AI cost banner + virality/north-star/cadence KPI strip.
  Second-order signals that nobody opened Overview to read. ~80 lines of
  pre-render math gone with them. Helpers stay in lib/aggregate.
- /trends: dropped "Weekly at-a-glance" 4-sparkline strip. Duplicated signals
  already on /overview (reach trend, biggest movers).
- `formatWeekRange(weekKey)` helper: "2026-W17" → "Apr 20–26" (same-month)
  or "Apr 28–May 4" (cross-month). Wired into trends weekly-engagement chart
  and weekly-shares bar labels. ISO 8601 Monday anchor.
- Fix-on-touch: slate-500 → ink-500 in app/page.tsx. Brand baseline
  ratcheted 306 → 292 (14 violations cleaned up).

## 2026-04-23 — Sprint P6 declutter 1/N: /strategy + /plan cleanup

Post-P5 feedback pass. Users flagged that Sprint P5's "Calendar coverage by
hypothesis" section duplicated what Plan already shows, the Weekly Verdict
hero was a 2-part split with a bolded incomplete first line, PlanNarrativeCard's
4-stat grid was clutter, and the StalenessBanner was firing for AI artifacts
after fresh Meta runs because the pipeline had crashed at write_run_log.

- StalenessBanner: component-local gate — suppress banner when Meta fetch is
  ≤7d fresh (unless AI explicitly disabled). `daysBetweenNow` helper. The
  underlying `computeStaleness` still runs for programmatic callers.
- /strategy: reverted P5 Calendar-coverage-by-hypothesis section — imports,
  helpers, types, fetches, and the ~110-line render block. -335 lines net.
- /strategy: Weekly Verdict flattened to indigo chip + week-ending label +
  single `diagnosis.headline` paragraph. Exam alert still renders as coral
  callout. Killed the splitHeadline + line-clamp disclosure.
- /strategy: added inline TOFU/MOFU/BOFU explainer below funnel grid.
- /plan PlanNarrativeCard: stripped 4-stat grid + priors footer + hypothesis
  pill. Storyline paragraph only. SummaryStat helper deleted.

QA: typecheck clean, brand audit 301/306, build green.

## 2026-04-23 — Sprint P5: /strategy hypothesis-to-slot reverse view

The /plan page asks "what ships this week?" — slot cards tagged with a
hypothesis ID. The /strategy page now answers the reverse: "my weekly
hypothesis is H. Which slots on the calendar actually serve it?"

Implementation — `app/strategy/page.tsx`:

- **Data fan-out** now pulls `getCalendar()`, `getLatestStrategy()`, and
  `getPlanNarrative()` alongside the existing diagnosis + run-status
  fetches. All parallel; no serial hops.
- **`groupCalendarByHypothesis`** groups live slots by `hypothesis_id`,
  aggregates `forecast_reach_ci_native.mid` per bucket, and sorts by
  numeric ID (h0, h1, h2…) falling back to lexical.
- **New section** "Calendar coverage by hypothesis" renders between
  Top/Under performers and Watch-outs. One `<details>` card per
  hypothesis. Primary bucket (the one PlanNarrative tags as the week's
  arc driver) opens by default, gets the strategy's full
  `strategic_hypothesis` prose, and wears a coral "Primary" badge.
  Secondary buckets render ID-only (pipeline serializes IDs, not
  per-ID text — future iteration).
- **Slot row** per bucket: short weekday+date, BDT time, format chip
  (ink-100), pillar chip (canonical pillar color at 12% alpha), hook
  line. Mobile-first stacking via `flex-col sm:flex-row`.
- **Empty-safe**: the whole section hides when no slot carries a
  `hypothesis_id` (schema v1 sheet, or pipeline skipped arc tagging
  this week). No misleading "Unassigned" bucket.
- **Archival mode** suppresses the section — archival view is a
  DIAGNOSIS snapshot, calendar coverage reflects live state.

Brand: all new classes are Shikho v1.0 tokens (`text-ink-*`,
`bg-brand-shikho-indigo/*`, `text-brand-shikho-coral`, canonical
pillar colors from `lib/colors.ts`). Audit: 306/306 baseline, no
regressions.

Ties off the calendar-slot ↔ strategy loop. A reader can now trace
any hypothesis bet from weekly verdict → hypothesis ID → the slots
that carry it, then jump to /plan to see slot detail.

## 2026-04-23 — Sprint P4 iter 7: /plan surfaces schema v2 fields (hypothesis, native CI, risk flags)

Three additions to `app/plan/page.tsx` make the schema v2 evidence
visible to operators reviewing next week's calendar:

- **Hypothesis ID pill** (meta row, right of funnel stage): small
  indigo chip like "h1" linking the slot to the strategy's weekly
  hypothesis set. Tooltip: "Strategy hypothesis this slot serves."
- **Native forecast CI** (Target chip upgrade): when
  `forecast_reach_ci_native` is present with a non-"unavailable"
  source, the Target chip widens from the free-text AI range (e.g.
  "8k–12k reach") to `low–mid–high · source` (e.g. "4.2k–7.1k–9.8k
  · pillar×format"). Falls back to the AI range when the CI is
  unavailable (cold start).
- **Risks & mitigations disclosure**: coral chip showing the count
  next to Target/Success, plus a collapsible section below with each
  `{category, detail, mitigation}` entry in a coral-tinted card.

All three render only when the field is present — pre-schema-v2 rows
(calendars written before today) display exactly as before. New
helper `formatNativeCI` handles "unavailable" source gracefully
(returns null → caller falls back to AI range). Tokens: the coral
semantic for risks comes from `brand-shikho-coral` (warning/critical
role per BRAND.md). Build green, tsc clean, brand audit 0
regressions beyond baseline.

## 2026-04-23 — Sprint P4 iter 6: Content_Calendar schema v2 reader (cross-repo, in lockstep)

`CalendarSlot` gains three optional fields in `lib/types.ts`:
`hypothesis_id` (string), `forecast_reach_ci_native` (typed
`{low, mid, high, source}`), and `risk_flags` (array of typed
`{category, detail, mitigation}`).

`lib/sheets.ts::calendarFromRows` reads the new columns. Defensive
JSON parsing via two new helpers (`parseCI`, `parseRiskFlags`) —
stale rows without the columns, or malformed cells from hand edits,
degrade to `undefined` instead of crashing /plan. No UI changes in
this commit: the fields flow through the reader and are available
for `/plan` + `/strategy` pages to consume in a follow-up. Paired
with pipeline commit (same date) that ships the writer side. Build
green, tsc clean.

## 2026-04-22 — Sprint N3 P2: STR-12 runCostSummary reads Strategy Cost USD

Widened the cost-column candidate list in `runCostSummary` to include
`"Strategy Cost USD"` so the Overview budget banner starts summing
actual strategy spend. Paired with pipeline commit `a93a0e1` which
writes the column + ships the pricing table
(`facebook-pipeline/src/llm/pricing.py`). Pre-Sprint-N3 rows are
unaffected — they fall through the existing `??` chain and contribute
nothing to the sum. Build green.

## 2026-04-22 — Sprint N3 P1: STR-11 dashboard reader for Strategy tabs

Reads the 17-col Strategy / Strategy_Log schema the pipeline writes in
Sprint N1+N2. Four new public readers in `lib/sheets.ts`:
`getLatestStrategy`, `getStrategyLog`, `getStrategyByWeek`,
`listStrategyArchive`. JSON cells (pillar_weights, teacher_rotation,
format_mix, risk_register, abandon_criteria, cited_priors, adherence
summary) decode back to typed shapes via `StrategyEntry` in
`lib/types.ts`. `_parseJsonCell` wraps `JSON.parse` in try/catch so a
pre-Sprint-N2 row without the three trailing provenance cols returns
safe defaults instead of crashing. Staleness infra extended: `RunStatus`
carries `strategy_status` + `last_successful_strategy_at`;
`computeStaleness("strategy")` and `getStageEngine("strategy")` both
wired. Paired with pipeline commit `031d6c4`
(`scripts/qa_sprint_n3_str11.py`, 9/9 green cross-repo schema
contract). Existing `app/strategy/page.tsx` (still reading
`diagnosis`) unchanged — extension is purely additive. Build green.

## 2026-04-22 — PL-12: priors stage in the staleness banner

Extended `RunStatus` (`lib/sheets.ts`) with `priors_status` +
`last_successful_priors_at` reading new Analysis_Log columns, and
registered `priors` as its own entry in `lib/stages.ts` between
`ai_classify` and `diagnosis` (aiBacked: false, no pages consume it
directly — it's upstream of strategy/plan). Pre-PL-12 Analysis_Log
rows missing the columns coerce to `"unknown"` via `normalize`, so
the dashboard doesn't crash on historical rows. Paired with pipeline
commit `867ab6c` which writes the new columns. `npm run build` green.

## 2026-04-22 — Engagement page: drop CTR Proxy, Reel Completion, North-Star Score

Trimmed the derived-metrics strip on `/engagement` from seven cards to four.
CTR Proxy, Reel Completion, and North-Star Score removed (low-signal on a
purely-organic page; CTR proxy in particular is misleading when reach is the
real denominator, and North-Star composite was redundant with the four
component metrics). Save Rate promoted to the fourth slot so the second row
keeps its rhythm. Final strip: Virality | Discussion Quality | Sentiment
Polarity | Save Rate. Dead imports + intermediate vars
(`nsScores/avgNorthStar/reelsInRange/completionNumerator/...`) removed.
`npm run build` green, no type errors.

Shipped alongside the pipeline-side Phase 0 bug-fix round
(schema check + polish pass guard + traceback visibility + viral-refresh
range fix) — see `facebook-pipeline/CHANGELOG.md`. QA round continues with
Phase 1 (classifier v2.6 + historical re-ingest from 2025-10-01).

## 2026-04-21 — Session roll-up: PLAN_COMPARISON items 1–58 (dashboard side)

Dashboard contributions to the bulk shipment covering Buckets A–G of the
89-item master plan. Per-item detail lives in the entries below; this
entry is the roll-up.

- **Bucket E (items 33–42):** nine new derived-metric helpers in
  `lib/aggregate.ts` — virality (shares ÷ reach), discussion quality
  (comments ÷ reactions), sentiment polarity, CTR proxy, cadence gaps,
  format × hour matrix, save/completion, north-star score
  ((saves + shares × 1.5) ÷ reach). Surfaced on Overview KPI strip and
  Engagement-page derived-metrics strip + heatmap. Item 39 (saves-to-reach)
  is WIP pending pipeline ingestion. Item 41 (DM velocity) skipped
  (Meta Business Suite API blocker).
- **Bucket G item 58:** `runCostSummary(logs)` + AI cost budget banner on
  Overview (`$5/week` budget, `brand-shikho-coral` >80%, `brand-red` >100%,
  mobile-first, `role="status"` + `aria-live="polite"`).
- **Ranking honesty:** `RANKING_CONFIDENCE_FLOOR = 0.5` + `isLowConfidence`
  helper in `lib/aggregate.ts` — low-confidence rows excluded from rankings,
  flagged for manual review instead.
- **Type surface:** `Post.caption_primary_language?: string` added to match
  the v2.5 classifier field in `Classifications` col 17.
- **Brand audit:** clean, no regressions.
- **Pause point:** items 59–89 (dashboard interactivity, exports,
  Buckets H–K) remain queued pending sanity checks against the fresh
  90-day run.

## 2026-04-21 — Bucket G item 58: AI cost budget banner on Overview

`runCostSummary(logs)` in `lib/sheets.ts` aggregates Analysis_Log rows into
`{this_week, last_week, budget, pct_of_budget, tracked}` using `AI_WEEKLY_BUDGET_USD = $5.00`.
New banner at the top of `app/page.tsx` renders the week's AI spend vs the
budget with progress bar — `brand-shikho-coral` above 80%, `brand-red` +
bold above 100%. Mobile-first (stacked on narrow, row at `sm:`), no
`slate-*`/`gray-*` classes. When the pipeline hasn't shipped per-run cost
capture yet, surfaces `tracked=false` with the budget still visible so the
commitment is on-screen from day one. Brand audit clean (no regressions),
build green.

## 2026-04-21 — Bucket E items 33-42: metrics library (virality, discussion, polarity, CTR, cadence, heatmap, completion, north-star)

Shipped nine derived-metric helpers in `lib/aggregate.ts` and surfaced them
across Overview + Engagement. All are pure ratios over fields already on
`Post` / `VideoMetric` — no API changes, no new tabs. Matters because the
team was mentally computing these from raw KPIs every week.

- **Item 33 virality (shares ÷ reach):** new Overview KPI tile with WoW delta. Reach-weighted at the period level to avoid mean-of-ratios bias.
- **Item 34 discussion quality (comments ÷ reactions):** Engagement card. Separates "liked and scrolled past" from "sparked thread."
- **Item 35 sentiment polarity ((love+wow) ÷ (sad+angry)):** Engagement card. Returns null (renders "all +") when there are no negative reactions, so we don't paint Infinity into the UI.
- **Item 36 CTR proxy:** Link-post-only clicks ÷ reach. Card shows "—" and link-post count when no links in range.
- **Item 37 cadence gap:** Overview tile with avg + min + max hours between posts. First view that surfaces posting rhythm.
- **Item 38 format × hour heatmap:** Engagement chart. 6-format × 24-hour grid, mean reach per cell, dim cells with n<2.
- **Item 39 save rate:** SCOPE DOWN — helper + tile shipped but returns 0% because `Saves` isn't ingested yet (see DECISIONS). Marked WIP in PLAN_COMPARISON. Auto-lights-up when pipeline adds the column.
- **Item 40 reel completion rate:** Engagement card, view-weighted over reels with non-zero Meta `complete_views`. Dim when Meta didn't populate the field.
- **Item 41 DM velocity:** BLOCKED on Meta Business Suite API. Marked WIP, north-star weighting adjusted to compensate (see DECISIONS).
- **Item 42 north-star score ((saves + shares × 1.5) ÷ reach):** Overview KPI + Engagement card. Documented one-time comparability break in DECISIONS.

Stress-tested: build green, brand audit green (306 baseline, no regressions), all new code uses `ink-*` / `shikho-*` / hex tokens — no new `slate-*` / `gray-*`.

## 2026-04-21 — Bucket C item 22: read `caption_primary_language` from Classifications

Pipeline bumped classifier to v2.5 and appended `Caption Primary Language`
as a trailing column on the Classifications tab. Reader side: `lib/sheets.ts`
now pulls that column into `Post.caption_primary_language` (string enum:
`"bangla" | "english" | "mixed" | "unknown"`, empty string on pre-v2.5
rows), and `lib/types.ts` declares the optional field on the `Post` type.
No UI surfaces it yet — the wire-through is so future pages (tone-by-
language ranking, Bangla-vs-English engagement split) can light up without
a schema change.

## 2026-04-21 — Stage 2 item 18: hard-exclude low-confidence rows from rankings

New `isLowConfidence(p)` helper + `RANKING_CONFIDENCE_FLOOR = 0.5` in
`lib/aggregate.ts`. Engagement page now computes an `inRangeConfident`
subset (drops posts where `classifier_confidence < 0.5`) and uses it for
the classifier-derived rankings: pillar, hook, spotlight, and tone.
Format still uses the full `inRange` set because format comes from
`Raw_Posts.Type`, not the classifier.

Pairs with the pipeline's new `_low_confidence` flag — classifications
written by `classify_posts_v2` at `classifier_confidence < 0.5` get
tagged so the row still appears in Classifications (for human review)
but can't crown a "Best X" card.

Soft `confidenceWeight` (0.3 floor, used inside `weighted_reach`) stays
— it's the right knob for the [0.5, 1] confidence band. The hard
exclusion is specifically for ranking verdicts where a 0.3-confidence
label shouldn't compete with a 0.95-confidence one at all.

## 2026-04-21 — Stage 0 item 10: caption_tone surfaced on Engagement

Engagement page gets a new "Best Tone" card in the top strip (now 5-up on
desktop, 2-up on mobile), a full-width "Caption Tone Effectiveness"
horizontal bar chart, and a matching line in the "Recommended this period"
synthesis. `lib/colors.ts` gets a `TONE_COLORS` canonical map mirroring the
pipeline's 7-tone vocabulary (Educational / Motivational / Promotional /
Entertaining / Informational / Celebratory / Urgent / FOMO), plus `"tone"`
added to the `ColorField` union. Same MIN_N gate + reach-weighted ranking
as the existing dimensions — a single viral post can't crown a tone. New
copy uses `text-ink-400` instead of `text-slate-500` so we're not growing
the brand-audit baseline.

Why tone AND hook both: they answer different questions. Hook is the
opening line. Tone is the caption's overall register. A tone that wins on
a losing hook (or vice versa) is directly actionable — keep the tone, vary
the hook. The recommendation copy spells this out.

## 2026-04-21 — Stage 0 items 8 + 9: confidence-weighted aggregates + entity canonicalization

Item 8: `lib/aggregate.ts` gains `confidenceWeight(p)` and `weightedReach(p)`
helpers and three new fields on `GroupStatRow` (`weighted_reach`,
`avg_weighted_reach_per_post`, `avg_confidence`). Classifier confidence is
clamped to [0.3, 1] and defaults to 1 when missing (pre-v2.3 rows). Existing
`total_reach` stays untouched for display; new fields let "best X" rankings
down-weight low-confidence labels so noisy classifications can't drive a
pillar to the top of the leaderboard.

Item 9: new `lib/entities.ts` canonical dictionary mirrors
`facebook-pipeline/src/entities.py`. `getPosts()` in `lib/sheets.ts`
canonicalizes spotlight_name at read-time so historical rows (written
pre-pipeline-canonicalization) show one bucket per entity during the
migration window. Keep both dicts in sync when adding teachers/products.

## 2026-04-21 — Stage 0 item 12: Post.permalink_url wired through from Raw_Posts

`Post.permalink_url` (optional) added to `lib/types.ts` and read from the new
`Permalink URL` column in `Raw_Posts` via `getPosts()`. Enables deep-linking
from UI cards to live Facebook posts once the UI consumers land. Empty string
for historical rows until the pipeline's next fetch run.

## 2026-04-21 — Stage 0 item 11: StageEngine type expanded to carry provider + cache signal

`lib/sheets.ts` `StageEngine` union grew from `"ai" | "native" | "off" |
"unknown"` to seven values: `"ai"` (legacy), `"anthropic"`, `"gemini"`,
`"native"`, `"cache"`, `"off"`, `"unknown"`. Added `isLiveAI(engine)` and
`isAiRunning(engine)` helpers so callers don't need to enumerate the valid
values in equality chains. `getStageEngine()` now reads against a
`KNOWN_ENGINE_VALUES` set — future engine values land in one place.

Existing callers (`app/strategy/page.tsx:131`, `app/plan/page.tsx:95`) use
`=== "native" || === "off"` which is forward-compatible: the new `"cache"`
value correctly evaluates to `aiDisabled = false`, so cached output still
renders under the staleness banner instead of flipping to the AI-disabled
empty state. Build + brand:audit green; no UI regressions.

## 2026-04-21 — Brand compliance made an enforceable rule (QA gate #8 + ratchet audit)

Shikho v1.0 is now a hard contract, not a style guideline. Four artifacts:

1. **`docs/BRAND.md`** — single-page spec (core hues, ink scale, fonts, tokens,
   forbidden patterns, light/dark-surface mapping).
2. **`scripts/brand-audit.mjs`** — zero-dependency Node script that greps for
   banned patterns (`slate-*` / `gray-*` / `zinc-*` classes, legacy Tailwind
   dark hexes, Inter font, non-brand chart hexes) across dashboard + pipeline
   + master HTML. Uses a ratchet baseline (`.brand-audit-baseline.json`) —
   exits non-zero only on **regressions** beyond the grandfathered count.
   Current baseline: 306 legacy violations across 24 files.
3. **`package.json`** → `npm run brand:audit` (+ `--list`, `--write-baseline`).
4. **CLAUDE.md updates** (dashboard + pipeline + master): new "Brand system"
   section in each, plus perspective #8 ("Brand compliance") added to the
   pre-commit QA gate. Accessibility copy updated to recommend `text-ink-*`
   instead of `slate-*`.

Ratchet rule: never introduce a new violation; fix violations in lines you
touch; re-run `--write-baseline` after cleanup passes so the expectation
only moves down.

## 2026-04-21 — Shikho v1.0 brand system rolled out across dashboard, pipeline reports, and master HTML decks

Applied the Shikho v1.0 design system (March 2026) end-to-end. `tailwind.config.ts` now carries
the four core hues (Indigo #304090, Magenta #C02080, Sunrise #E0A010, Coral #E03050) with full
50-900 scales, ink neutrals on #F4F5FA canvas / #FFFFFF paper, Poppins + Hind Siliguri font
stack, 4/8/12/16/20/28px radii, ambient Shikho shadows plus `indigo-lift` for primary CTAs,
and 140/220/420ms motion tokens with `ease-shikho-out` cubic-bezier.

Shared chart components (BarChart, Donut, TrendChart, Heatmap) lead with the four core hues;
`lib/colors.ts` FORMAT/HOOK/SPOTLIGHT/FUNNEL maps now resolve to Shikho palette; KPI cards use
`shadow-indigo-lift` and coral for negative deltas. `app/login/page.tsx` CTA uses the new
motion + shadow tokens. `facebook-pipeline/src/report.py` re-skinned with the matching dark
surface (#0A0C18 ink-900, #1A2558 borders) and indigo+magenta+sunrise tri-colour headline box.
`START_HERE.html`, `docs/PLAN_COMPARISON.html`, `docs/ROADMAP_V2.html` all swapped Inter for
Poppins + Hind Siliguri and remapped their root variables to the Shikho palette.

Build verified green (all 13 routes compile, no type errors). Token names left unchanged so
component-level classes (`brand-shikho-indigo`, `brand-cyan/amber/red`) pick up the new hex
automatically — no rename sweep needed.

## 2026-04-21 — Fix: archival URL no longer leaks raw query param into UI copy

Live check caught `/strategy?archived=true` rendering "Archived diagnosis
for week ending **true**" and `/plan?archived=true` rendering "Viewing
archived run from **true**". Root cause: both pages fell back to the raw
`archivedParam` string when no real date could be resolved (no matching
`Weekly_Analysis` row for the diagnosis, blank `last_successful_calendar_at`
on the Plan side).

Fix: pages now pass `""` (empty string) to `ArchivalLine` and suppress
the "for week ending X" subtitle clause when no date is resolvable.
`ArchivalLine` itself has a small guard — `looksLikeDateLabel()` — that
rejects values like `true/false/1/0/yes/no/null/undefined` and degrades
to "Viewing archived run" without a "from X" clause. Defence in depth so
neither the Strategy/Plan pages nor any future page hitting the same
component can accidentally leak a raw param.

## 2026-04-21 — Step 3 shipped: 4-state banner + AI-disabled empty state + archival URL param

4-state `StalenessBanner`: `ok` (emerald) / `warn` (amber) / `crit` (red)
/ `ai-disabled` (slate + indigo accent). The new `ai-disabled` mode
fires when the upstream pipeline ran with `engine=native` (or `off`)
for the stage backing the current page — so the banner tells the user
"AI diagnosis is off this run" instead of silently showing last week's
artifact like fresh data.

New `components/AIDisabledEmptyState.tsx`: replaces the page body on
`/strategy` + `/plan` when the relevant stage is off, rendering the
"intentionally off" card (max-w-2xl, indigo pill, env-var chips with
copy-to-clipboard) per the Cycle 1 design spec. Chips map to the
stage's contract in new `lib/stages.ts` (single source of truth for
`DIAGNOSIS_PROVIDER/MODEL/API_KEY` + `CALENDAR_*`).

Archival mode via URL param on both pages: `?archived=<run-id>` reads
the archived artifact (Week Ending for diagnosis, Run ID for calendar)
and renders a persistent slate-500 breadcrumb (`ArchivalLine`) with a
"Return to live view" link. Archived content gets a subtle
`opacity-[0.97] [filter:saturate(0.9)]` dim so the user always knows
they're not looking at live data. Bookmarkable + shareable, survives
refresh.

`lib/sheets.ts` extended: `getDiagnosisByWeek(weekEnding)`,
`listDiagnosisArchive()`, `getCalendarByRunId(runId)` (reads
`Calendar_Archive` tab; tolerates absence until pipeline writes it),
and `getStageEngine(stage)` which reads `Diagnosis Engine` /
`Calendar Engine` off `Analysis_Log` and falls back to treating
`"skipped"` status as `"off"` when the columns don't exist yet.
PageHeader date-freshness label renamed "Rendered" → "Data as of"
to match the Cycle 1 spec.

Why it matters: pre-Step-3, a Claude outage meant /strategy + /plan
silently rendered last week's verdict as if fresh — the dashboard lied.
Now when the operator runs `weekly-no-ai.yml` (or the main workflow
falls back mid-run), both pages explicitly render "AI is off" with a
recovery path (env chips to copy, link to the last good archived run).

Verified: `npm run build` green, 13 routes compiled clean; /plan
208 B, /strategy 1.41 kB; type-check passes including new `lib/stages.ts`
typing + `StalenessBanner` prop changes.

## 2026-04-20 — Moved under shikho-organic-social-analytics/ parent folder

Both repos (this one + `facebook-pipeline/`) now live under a single parent
folder `shikho-organic-social-analytics/` alongside `START_HERE.html` — a
polished navigational overview covering system flow, folder tree, common
tasks with copy-to-clipboard commands, URLs + external services,
per-repo env vars, and a doc map. No code changes; git remotes untouched;
all relative cross-repo links (`../../facebook-pipeline/docs/...`) still
resolve correctly from the new depth.

Why it matters: before the move, someone opening
`D:\Shahriar\Claude\Shikho\` couldn't tell which folders were part of
this project vs other unrelated work. `START_HERE.html` now serves as a
single entry point that answers "where does X live" and "how do I run Y"
without digging through either repo's docs.

## 2026-04-20 — Docs reorganized into docs/; lean roadmap added

Moved ARCHITECTURE, PROJECT_ATLAS, DESIGN_BRIEF, BACKLOG, WORKFLOW into
`docs/`; archived MASTER_PLAN and the two legacy design HTMLs under
`docs/archive/`. Added ROADMAP.md (lean 3-step execution plan),
PROVIDER_SWITCHING.md (per-stage AI env contract), DESIGN_HANDOFF.md
(when/what to send Claude Design), and a docs/README.md index with the
prescribed read order. Root README now points into docs/. Why it
matters: the root had ~10 markdown files with no clear entry point and
no signal on which was current vs aspirational vs history — new
structure makes ROADMAP.md the single source of truth for what ships
next. See DECISIONS.md for the rationale behind the lean-plan choice.

## 2026-04-18 — UX + data-integrity Phase 1: off-by-one, freshness, heatmap density, visual polish

User-surfaced review from a real user session flagged eight regressions
and UX smells. All addressed in a single pass. Each fix is low-risk
(component or page-local) but collectively they turn the dashboard from
"technically correct" into "actually usable on a phone".

- **rangeDays off-by-one** (`lib/daterange.ts` + 3 pages). Engagement
  and Strategy computed `daysBetween + 1`, Timing used
  `Math.round(...)`; a 30-day window came out as 31, which tipped the
  adaptive `minPostsForRange` gate into the 60-day bucket (15 posts).
  Most groupings never cleared that and charts rendered empty. New
  centralized helper uses `Math.floor` so 30d → 30 → 10-post gate.
- **Heatmap density** (`components/Heatmap.tsx` + `app/timing/page.tsx`).
  Cell min-n dropped from `max(2, MIN_N/2)` to hardcoded 2, and cells
  below threshold now render at reduced opacity (confidence blend:
  0.4 at n=1, 1.0 at n≥minN) instead of flat slate. Turns a mostly-
  empty 7×24 grid into a continuous signal where sparse data still
  communicates direction but reads faded.
- **Heatmap hours** (`components/Heatmap.tsx`). Hour axis now shows
  "6a/6p" compact am/pm markers. Prior pass stripped the suffix thinking
  "3" was unambiguous — but 3am vs 3pm matters when picking a publish
  slot. Tooltip uses full "6am" form, cells aria-label it too.
- **Plan "Today" badge** (`app/plan/page.tsx`). Matched only by day-of-
  week, so Saturday-today was highlighting Saturday-next-week. Now
  requires weekday match AND actual date match (BDT-aware via
  `Intl.DateTimeFormat('en-CA')`).
- **Staleness banner soft-fallback** (`components/StalenessBanner.tsx`).
  When Weekly_Analysis has data but Analysis_Log never recorded a
  "Last Successful X At" timestamp, the banner used to scream red
  "No successful refresh recorded yet" alongside a fully rendered
  verdict. Now: `hasData` prop → info-style slate banner reading
  "pipeline freshness not recorded" instead of false crit.
- **BarChart single-bar width** (`components/BarChart.tsx`). Added
  `maxBarSize={56}` so a 1-category chart (e.g. only one pillar cleared
  the reliability gate) doesn't stretch to ~900px and read as
  "mandatory data". Multi-bar charts are unaffected — Recharts still
  shrinks bars under the cap when many share the axis.
- **PageHeader last-fetch** (`components/PageHeader.tsx` + all 7 pages).
  Header showed `new Date()` at render time, formatted as "Data as of".
  That's UI timing — meaningless for a pipeline on a weekly cadence.
  New `lastScrapedAt` prop consumed from `RunStatus.last_run_at`
  renders "Last Meta fetch: <timestamp>" — the honest answer. Falls
  back to "Rendered <timestamp>" label when the prop isn't passed.
- **Engagement Best-X card heights** (`app/engagement/page.tsx`).
  `text-xl sm:text-2xl` on 4 cards with long winner labels wrapped to
  3+ lines and pushed the KPI strip to ~160px per card — eating the
  top half of the page on mobile. Dropped to `text-base sm:text-lg`,
  added `line-clamp-2 + title` so the value caps at two lines with
  full label discoverable on hover/long-press.
- **Reels table polish** (`app/reels/page.tsx`). Pale grey text-on-white
  was hard to scan. Added: zebra striping on odd rows, colored pillar
  pill (canonicalColor hash) in place of grey text, Plays column
  stronger/darker as the hero metric vs Replays/Replay% dimmed as
  supporting, Hook-3s% tinted green (≥60) / amber / rose (<40) so
  weak retention reads red at a glance. Mobile card list got matching
  treatment.

## 2026-04-18 — Data-integrity audit: labels, pluralization, false-precision, CI floor

Sweep across every view for number / calculation / source-fidelity /
cross-page-consistency / logic-appropriateness issues. Six distinct
classes of display-layer bugs were hiding data-integrity concerns under
polished typography. All fixes are cosmetic (no aggregation logic
changed); upstream pipeline + `lib/aggregate.ts` were confirmed correct.

- **Engagement "Like + Care"**: label claimed two reactions but value
  was `totals.like` only. No Care column exists anywhere in the pipeline
  (Raw_Posts → `getPosts` → Post type). Relabeled; definition string
  corrected.
- **Engagement fake "combined engagement rate"**: averaged two
  independent group-by rates (format + pillar) and presented the mean as
  a composite metric. The two cuts are measured on different post sets,
  so the intersection is unknown. Replaced with prose that names each
  rate separately and flags the combination as a test.
- **Pluralization**: "1 pillars shown", "n = 1 posts", "1 weeks", "1
  reels have retention curves", etc. — fixed across 5 files with inline
  singular/plural guards.
- **Best-X false 0.00%**: Engagement's Best Format/Pillar/Hook/Spotlight
  cards fell through to `(x?.rate || 0).toFixed(2)` when no bucket
  qualified, showing "0.00% eng rate" as if it were a real measurement.
  Now conditionally rendered; empty state says "Not enough posts in
  range to rank (N+ needed per …)".
- **Timing "reliable floor 0"**: four Best-X cards clamped
  `lowerBound95` to zero and displayed the clamped value as a floor —
  "we expect at least 0" reads as meaningful but is trivially true when
  the real CI lower bound is negative. Suppressed when `lb <= 0`; the
  reliability label already carries the variance message.
- **Explore shares formatting**: `{p.shares} shares` → locale-formatted
  with null-guard and plural-aware unit, matching the rest of the app.

Commit 994a0b6. Pattern captured in LEARNINGS — display layer hides
data-integrity issues under false precision far more often than the
underlying math is wrong.

## 2026-04-18 — Fix /timing RSC-boundary crash (real root cause)

`/timing` was passing inline arrow functions as `valueFormat` to the
`<Heatmap>` client component. Next.js 14 App Router can't serialize
non-server-action functions across the Server→Client boundary — prod
threw on every render, dev only warned. Build passed, types checked, no
signal until production. Replaced the function prop with a
`"percent" | "number"` enum; Heatmap owns the format logic internally.
Commit 9e60773. Full post-mortem + detection heuristics in LEARNINGS,
design rationale for enum-over-function in DECISIONS.

Earlier commit 015b048 (NaN guards in /timing's day/hour grid) was a
plausible-but-wrong fix for the same symptom. Those guards are kept —
they address a different latent bug — but they weren't what was
breaking the page.

## 2026-04-18 — Batch 3 design pass: Timing heatmap, Explore workbench, a11y sweep, page template

Final of three design-roadmap batches. Batch 1 fixed foundation,
Batch 2 unified color/rhythm/callouts, Batch 3 rebuilds the two
outlier pages (Timing, Explore) and closes the a11y gaps that every
popover in the app shared.

**3a — Timing heatmap (#13).** The 2x2 bar-chart grid (slot-reach /
slot-ER / day-reach / day-ER) that made readers cross-reference four
charts to answer "when to post?" replaced by a single 7x24 day-by-hour
heatmap. New `components/Heatmap.tsx` with RGB-linear color
interpolation, keyboard-focusable cells (each is a button with
aria-label + tooltip on focus), Escape-to-dismiss, and per-cell min-N
threshold scaled down from the page-level min-N (cells see fewer
posts than whole-day buckets). Two heatmaps — ER in pink, avg reach
in indigo — because those metrics can diverge. "Best X (Slot)" KPIs
replaced by "Best X (Hour)" using CI-ranked hourly buckets.

**3b — Explore workbench (Pg-Ex).** Was three stacked outputs
(KPIs, reach trend, group chart, then Top 10 last) with filters
buried at the top. Now filter-first: sticky filter toolbar pinned
below the nav (backdrop-blurred, full-bleed via `-mx-6 px-6`),
demoted KPI strip (5 full cards -> single `divide-x` row), promoted
Top Posts as the first output with pagination 25/50/100 and per-row
rank numbers, trend + group charts pushed below as deeper-dive
context. Page resets to 1 on filter change so users don't land on
empty pages.

**3c — Accessibility sweep (#20).** InfoTooltip gets
`aria-describedby` (useId-generated) announcing the definition on
focus, plus global Escape handler. DateRangePicker and all three
Explore popovers (RangeDropdown, MultiSelect, GroupBySelect) get
`aria-haspopup` + `aria-expanded` + descriptive `aria-label`
announcing current state, plus Escape to close. ChartCard gains a
`viewData?: { columns, rows }` prop that renders a native
`<details>/<summary>` disclosure below the chart — both Timing
heatmaps now expose their full grid as a sortable-ready HTML table
for screen-reader and keyboard users. No rewiring of existing
tooltips or buttons; all changes are additive.

**3d — Canonical page template (#19).** Overview trimmed from 6
KPIs to 5 (dropped Interactions, which Engagement Rate normalizes).
Reels merged two stacked strips (5+4 = 9 cards) into one 5-card
strip, with Replay Rate folded onto the Total Plays sublabel and
15s/30s retention reabsorbed by the Retention Funnel chart's bars
(which already carried those numbers). Trends / Engagement /
Strategy / Plan deliberately NOT reshuffled — their non-canonical
structure is intentional (small-multiples summary, Best-X narrative,
verdict hero, calendar). The template is a default, not a mandate.

Build green across all four commits, 13 routes, no regressions. Each
commit passed the seven-perspective QA gate; Batch 3 rationale +
recurring gotchas captured in DECISIONS + LEARNINGS (below).

## 2026-04-18 — Batch 2 design pass: color system, visual family, data states, per-page callouts

Four thematic commits landing the second of three design-roadmap batches.
Not a rewrite — polish on top of Batch 1 that makes the dashboard read as
one coherent product rather than eight independent pages.

**2a — Color system.** New `lib/colors.ts` owns category-canonical hexes
for format / hook / spotlight / funnel / pillar. `canonicalColor(field, value)`
returns the brand-canonical color (falling back to djb2-hash for unknowns
so colors are stable across renders). BarChart accepts a per-row `color`
field so each bar carries its category color without the chart caring.
FORMAT_COLORS now matches Plan's pill hues (Reel=pink, Photo=blue,
Carousel=amber, Video=purple, Link=teal). Engagement's Best X strip
switched from one-color-fits-all to per-category coloring. Default
BarChart color flipped from cyan (`#06b6d4`) to brand indigo (`#4f46e5`).

**2b — Visual family.** Three coordinated tweaks: (i) drop `text-[10px]`
and `text-[9px]` entirely — collapse the below-14px scale to `text-xs`
(12px) for labels and `text-[11px]` for eyebrow/uppercase; (ii) `gap-4
mb-6` on every page-level section stack for consistent 24px rhythm; (iii)
`shadow-sm hover:shadow transition-shadow` on Card plus a whisper
`bg-gradient-to-br from-white to-slate-50/60` on KpiCard so KPIs read
touchable.

**2c — Data + states.** New `components/EmptyChart.tsx` — a single
role-status empty-state used by Timing's four filter fallbacks (was
four hand-rolled copies of `flex items-center justify-center h-48`).
Reels table swaps to a mobile card-list below `md:` (the 9-col table
at 360px forced horizontal scroll for primary content, an explicit
CLAUDE.md anti-pattern). PageHeader's "Rendered {datetime} BDT" becomes
"Data as of {datetime} BDT" — same timestamp, better honesty about what
it represents.

**2d — Per-page narrative callouts.** Overview's Engagement Mix donut
(low-information, never shifts meaningfully) is replaced by a Biggest
Movers card — top 3 risers + 3 fallers by pillar reach %-delta vs prev
period, with a 5k-reach floor so tiny-base pillars can't hijack the
list. Engagement gets a Recommendations callout under the Best X strip
that synthesizes the four signals into 2-3 actionable sentences.
Trends gets a 4-up small-multiples strip (reach / volume / shares /
engagement rate sparklines on the same x-axis), so correlated weekly
dips/spikes pop in two seconds. Login's 4-bullet workflow cadence block
is replaced by a three-stop data-flow illustration (Source → Store →
Surface) with daily and weekly cadences labelled on the arrows —
communicates the pipeline shape in one visual pass.

Build green across all four commits, 13 routes, no new warnings. Each
commit passed the seven-perspective QA gate; specific catches captured
in LEARNINGS (below).

## 2026-04-18 — Batch 1 foundation pass (WCAG AA, loading/error, brand palette, Strategy hero, Plan today marker)

First of three design-roadmap batches. Foundation-level polish that every
subsequent page inherits. WCAG AA contrast bumped across 13 files
(text-slate-400 → 500, Recharts ticks slate-400 → slate-500), a global
focus-visible ring added via `@layer base` so every focusable element shows
a 2px indigo outline on keyboard traversal, and the first-ever
`app/loading.tsx` + `app/error.tsx` (skeleton shell + friendly error card
with a reset button and error.digest reference). Brand tint now lives in
the active Nav tab and leads the BarChart + Donut palettes (indigo →
pink → orange). Strategy's weekly verdict got a hero redesign: bigger
headline (`text-2xl lg:text-4xl`), gradient blur bloom, explicit "Read full
verdict / Collapse" CTA with rotating chevron. Plan auto-opens today's
slot in Asia/Dhaka time with a pulsing pink "Today" pill and indigo ring;
chevrons are now a single downward pattern everywhere they appear.
Engagement's 6-slice donut became a horizontal bar chart (Cleveland &
McGill — position beats angle for magnitude); Reels' average retention is
now a line chart (TrendChart) rather than a bar-per-second wall.
Performance: retention curves are parsed once at page load instead of
~60× per reel. Mobile: Explore's filter toolbar stacks cleanly at 360px
with 44×44 tap targets. Card no longer shows the "Meta data / AI-classified
/ Derived" text pill — kind is now conveyed by the left-border color alone
(+ `data-kind` attribute for tooling), which was visual noise on a
6-KPI Overview grid. Build passes (~30s, 13 routes compiled).

## 2026-04-18 — Staleness banner on Strategy + Plan (Day 2O, dashboard side)

Strategy and Plan pages now show an amber (7–14d / fallback) or rose
(14+ days / never succeeded) banner above the PageHeader when the
upstream Claude pipeline has fallen back to cached data. Matters
because the pipeline gracefully degrades on API credit exhaustion
(Day 2M/2O), so without a visibility layer the dashboard silently
serves stale verdicts + calendars. New `getRunStatus()` +
`computeStaleness(artifact, run)` in `lib/sheets.ts` read per-stage
status from `Analysis_Log`; new `components/StalenessBanner.tsx`
renders the warning with accessible `role="status"` + aria-live.
Project `CLAUDE.md` now documents the pattern so any future
Claude-powered page inherits it.

## 2026-04-18 — Date picker consistency + right-edge overflow audit + project CLAUDE.md

User reported the date-range selector appeared left/right/center aligned on
different pages from mobile, and asked for a system-wide check on text
overflowing card/viewport right edges.

- **PageHeader + ExploreClient header**: `flex-wrap` swapped for
  `flex-col sm:flex-row` with `self-end` on the picker container. Picker is
  now always at the top-right on desktop and bottom-right on mobile — no
  more drifting based on title length.
- **All popups constrained**: DateRangePicker, Explore's RangeDropdown, and
  Explore's GroupBySelect all got `max-w-[calc(100vw-2rem)]` so they
  physically can't spill off-screen on a 360px phone.
- **KpiCard**: `text-3xl` → `text-2xl sm:text-3xl` + `break-words` so 7-digit
  numbers don't overflow 2-col mobile cards.
- **ChartCard title row**: added `flex-wrap` + `min-w-0` + `break-words` so
  long titles ("Spotlight Performance — Engagement") stop colliding with the
  sample-size / kind badges.
- **"Best X" cards** on Engagement + Timing: `text-2xl` → `text-xl sm:text-2xl`
  + `break-words leading-tight`. Long pillar names wrap inside the card.
- **New [CLAUDE.md](CLAUDE.md)**: project-level rulebook so mobile-first is
  the default for every future change. Pre-commit checklist, 360px floor,
  canonical copy-paste patterns, anti-patterns to never ship. Answers the
  "how do we ensure future changes are mobile-responsive" question
  structurally, not by Claude remembering each time.

## 2026-04-18 — Desktop regression fixes from the mobile pass

Two regressions introduced by today's mobile audit. (1)
[BarChart.tsx](components/BarChart.tsx): the static 130→100 YAxis
width fix for mobile was truncating long pillar names like "Study
Tips & Exam Prep" on desktop. Replaced with a dynamic width sized to
the longest label in each chart's data (~6.5px/char + 12px padding,
clamped 60–140). Mobile charts with short labels still reclaim pixels;
desktop charts with long names get the room they need. (2)
[app/plan/page.tsx](app/plan/page.tsx): restructuring the slot brief
to stack time+format above content on mobile dropped the `w-20` on
the Time pill, so desktop Time columns no longer aligned vertically
across slots. Restored `sm:w-20 sm:justify-center` — mobile keeps its
natural-width pill, desktop gets its grid back.

## 2026-04-18 — Mobile audit pass (tooltips, Plan layout, bar labels)

Three fixes from a full-site mobile audit. (1) ChartCard (i) tooltips
are now tap-activated via a new [InfoTooltip](components/InfoTooltip.tsx)
client component — hover-only meant every chart definition was
invisible on touch devices. (2) Plan page slot briefs stack time+format
above content on mobile so main content stops being crammed to ~100px.
(3) Plan day-header chips wrap to their own row below the day/date on
mobile. (4) BarChart horizontal YAxis width reduced 130 → 100 — the old
value ate 44% of the drawing area on a 375px phone.

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
