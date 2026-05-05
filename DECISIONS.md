# Decisions

## 2026-05-05 — Live-aggregate calibration on the dashboard, keep the pipeline writer

The calibration KPI on /outcomes was reading the pipeline's `Calibration_Log` tab, which is written once per Monday. Three options for the fix:

1. **Read from the weekly tab, accept staleness.** Status-quo, rejected — the staleness was 45 points off-truth mid-week (66.7% frozen vs 21.7% live).
2. **Make the pipeline rewrite Calibration_Log every scorer run.** Push the freshness problem to the writer. Rejected because the scorer runs ~3x daily on partial weeks and we don't want to thrash a weekly-shaped tab; also the dashboard would still be reading a snapshot, just a faster-moving one.
3. **Compute live on the dashboard, keep the pipeline writer for historical fallback.** Chosen.

Why option 3:
- The dashboard already reads `Outcome_Log` (raw event log) for the per-week table. Aggregating it for calibration is a few-dozen-line pure function over an array we're already loading. No new reads.
- The pipeline's `Calibration_Log` keeps its job of recording the weekly state for historical comparison and for tools that don't have raw `Outcome_Log` access (e.g. the pipeline's own report.py).
- Works for pre-OSL-04 historical weeks too: when `Outcome_Log` doesn't have rows for a week (pre-2026-04-23), the merge falls back to the frozen `Calibration_Log` value so the time series doesn't truncate.

What this implies for future KPIs: any metric backed by an event log + a periodic aggregation tab should follow the same pattern. Live-aggregate on the dashboard, use the pre-agg tab as fallback for weeks the event log doesn't cover.

Tradeoff acknowledged: the dashboard now does more work per page load (groups + counts `Outcome_Log` once on every render). At current scale (a few thousand rows total) it's well within the existing `getOutcomeLog` cache window. Worth revisiting if `Outcome_Log` grows past ~50K rows.

---

## 2026-05-05 — Single-return page shape; structural PageShell extraction deferred

The reactive drift cycle (parallel render paths in /diagnosis and /plan independently re-rendering chrome) had two possible fixes:

1. **Small fix (shipped):** consolidate to ONE top-level return per page. Compute chrome props into named variables; the body alone switches on `isEmpty`. Mechanical edit, ~150 lines moved, no new components.
2. **Structural fix (deferred):** extract a shared `<PageShell>` component owning chrome for ALL pages, plus an eslint rule banning multiple top-level returns in `app/**/page.tsx`.

**Chose the small fix because:**
- Closes the bug class on the two pages where it actually bit (/diagnosis, /plan).
- Doesn't introduce a new shared component before its API is stable. A PageShell that has to support 6+ pages with different chrome combinations (some have selector, some don't; some have ArchivalLine, some don't; outcomes has its own header pattern) is a refactor that benefits from a few weeks of catalog work first.
- Defers the eslint rule too — better to write the rule against a stabilized convention than against the in-flight refactor.

**What buys time before the structural fix is needed:** the new convention (one return per page) is now established on the two pages that drift most. /outcomes (7 chrome refs / 2 returns) and /today (5 chrome refs / 1 return — already conforming) are next candidates. When /outcomes drifts (it will), consolidate it the same way; that gives 3 examples to design PageShell against.

**Tradeoff acknowledged:** without the eslint rule, nothing mechanically prevents a future PR from re-introducing a second top-level return. Discipline rule: any new state branch on a page goes inside the body switch.

---

## 2026-05-04 — Playwright E2E NOT in the predeploy chain (yet)

`npm run predeploy` chains smoke + rsc:audit + brand:audit + build — each ≤10s, total ~45s. Adding Playwright would push it to ~70s. **Decided to keep them separate** for now:

- Predeploy stays fast → low friction → developers actually run it before push
- E2E runs on demand or as a separate (slower) CI job
- **Promote E2E into predeploy when** it catches a bug that predeploy missed twice in a row

Tradeoff: faster predeploy vs catching more bug shapes. Right call for a 1-developer codebase where bugs slip through reactively. Re-evaluate when the ratio of "user-caught bug" to "CI-caught bug" gets uncomfortable.

## 2026-05-04 — Smoke tests use `SMOKE_TEST_MODE=1` env hook, not dependency injection

`scripts/smoke-tests.ts` mocks `readTab` via `globalThis.__SMOKE_TEST_TABS__` + an env-var check inside `lib/sheets.ts::readTab`. Could have rewritten to inject a sheets-client provider instead — proper DI, more testable.

**Decided:** env-hook is fine because:
1. Production code path is one extra `if (process.env.SMOKE_TEST_MODE === "1")` branch — zero runtime cost
2. DI rewrite would touch every reader; large diff for marginal benefit
3. The hook makes the seams visible (only `readTab`); a DI rewrite scatters them
4. Test fixtures live in `globalThis` namespace, isolated from prod imports

If a future reader bypasses `readTab` (direct googleapis call), it can't be mocked — that's the limitation. Acceptable: every existing reader goes through `readTab`, and the smoke test would surface a bypass (unmocked call → real API → CI fail).

## 2026-05-04 — Re-export `_clearCacheForTests` from `lib/sheets.ts`, not direct cache import

CI run #1 of the gate caught a real bug: smoke test imported `_clearCacheForTests` from `../lib/cache.js`; readers used `./cache` (no extension). These resolved to separate ESM module records on Linux + tsx. Tests cleared one cache; readers used the other.

**Decided:** re-export the test hook from the SAME module that the readers use. Tests call `lib/sheets._clearCacheForTests()` → guaranteed one module record because there's only one import path.

Tradeoff: tiny pollution of `lib/sheets.ts`'s public surface. Worth it: the alternative (per-test specifier audits) is fragile, and the failure mode (tests pass locally, fail on CI) is exactly what wastes engineering time.

**Generalizable rule:** any "shared singleton" testing hook should be exposed via the SAME import path the production code uses — never via a parallel path that might resolve to a different module record.

## 2026-05-04 — Calibration KPI status thresholds: 65% / 50% / <50%

`/outcomes` calibration KPI shows a status pill: emerald "calibrated" (≥65%) / amber "drifting" (50–64%) / rose "mis-calibrated" (<50%). The asserted CI is 80%, so why aren't the thresholds 80%?

- **80% target, but pragmatic 65% acceptance.** Real-world calibration on small-n weekly batches is noisy; demanding 80% would set a perpetual "fail" state. 65% means "directionally calibrated enough to act on."
- **50% as the floor between drift and broken.** Below 50% the bands are no better than coin flips; the forecast layer is theatrical. Above 50% there's signal worth tuning.
- **Three-tier instead of binary** so the team can spot trend direction (drift toward green = tightening or widening is working).

If the team's preference shifts after observing a few weeks, bump the thresholds in `summarizeCalibration()` in `lib/sheets.ts` — single source of truth.

## 2026-05-04 — Fix-on-touch grep rule: discipline, not enforced by CI

After fixing a UI bug on one page, grep `app/**/*.tsx` for the same shape on sibling pages. ~30s per fix; would have caught today's `/plan` banner bug (same shape as `/diagnosis` fix from 2 commits earlier).

**Decided:** keep this as a CLAUDE.md rule, NOT enforced by CI. Reasons:

- Mechanical enforcement would need a "duplicate anti-pattern detector" — hard to express; would generate false positives for legitimately similar code
- The class of bug it catches (parallel implementations diverging) is partly covered by extracting shared helpers (`computeDiagnosisBannerState`, `computeCalendarBannerState`)
- Grep is a 30-second human action; the dev who wrote the fix is the right person to scan for siblings

If "fix on A, missed on B" repeats more than twice more, escalate to a real linter rule. For now: rule + checklist.

## 2026-05-02 — Closed-loop self-improvement: L0.5 discipline (advisory only, never auto-applied)

We added a closed-loop self-improvement layer (Tier 1 of
`docs/PLAN_ALGORITHM_AUDIT.md`) but bounded it deliberately. Three
levels of automation considered, only L0.5 shipped:

- **L0 — observability:** log everything, human reads + tunes. Was already in.
- **L0.5 — structured suggestions:** system writes deterministic
  prescriptions to `System_Suggestions`; strategy prompt reads them as
  context for next week's bet. **Auto Applied is invariant FALSE.**
- **L1+ — auto-tuning:** thresholds adjust forecast bands / hook windows
  / slot count without human approval. Explicitly **deferred** until
  ≥4 weeks of `Calibration_Log` data exist to set thresholds against.

Three rules apply at L0.5+:
1. Every auto-decision logs the rule that fired and the evidence.
2. Every auto-decision has a workflow-input kill switch.
3. Every auto-decision is read at the start of the next run, not
   silently injected — operators see "system applied X" before relying
   on the result.

This trades immediate cleverness for compounding learnability. The
bandit / online-Bayesian / auto-prompt-rewrite paths remain reachable
but require Tier 4's north-star metric first; without an objective
function, "improvement" is unfalsifiable.

---

## 2026-05-02 — Mon-anchor week convention everywhere

Every per-week tab uses the **running Monday in BDT** as its canonical
key (`Week Ending` column, despite the name). Pipeline normalizes at
write; dashboard filters at read; all date copy on the page renders the
Mon-Sun range ("Apr 27 – May 3"), never just one date.

Pre-v4.13 the dashboard's `WeekSelector` returned closing-Sunday strings
while the pipeline stored Mon-anchor — the mismatch caused empty
Diagnosis This-Week tabs and "Apr 26" pills next to "Apr 27" data
tables. Symptom space was huge; root cause was a single convention
conflict.

Rule going forward: **anything that references "the week" stores or
displays the running Monday.** No mixing. No Sunday-end labels on UI
even if some legacy data uses them — read with a Mon-snap helper.

---

## 2026-05-02 — Past-week plan immutability + closed-loop scoring contract

Once a Monday rolls over, that week's `Content_Calendar` rows are
**immutable**. The writer refuses to overwrite past weeks unless
`force_regenerate=True` is explicitly set (intentional backfill only).

Why: `Outcome_Log` scores actuals against the forecast band that was
stamped at plan time. If the plan can be silently rewritten after the
week starts, the verdict contract breaks — Hit/Miss becomes meaningless.
The lock is the structural guarantee that Hit today reads as Hit a
month from now.

Implication: live runs only ever modify the upcoming week's plan
(`target_week=next`, the cron default). Backfills are a one-time
operator action with both flags set explicitly.

---

## 2026-05-02 — Decay-aware Outcome scoring (Preliminary verdict)

Posts <7 days old emit a verdict but are flagged `Preliminary=TRUE`.
`Calibration_Log` excludes them from the calibration tally. Reach
decays for ~7-14 days; scoring a 3-day-old post against the 80% CI
over-fires "missed" verdicts because reach hasn't accumulated yet.

The Outcomes UI shows the verdict + "Prelim" amber chip so operators
see the data without it polluting the calibration trace. Final
verdicts (post age ≥7 days) are what feeds the closed-loop signal.

Trade-off: graded coverage drops temporarily (a Friday-published post
won't score until following Friday) but the calibration measurement is
honest. Without this, every prior-shift change would have been
indistinguishable from natural decay variance.

---

## 2026-04-30 — Known limitations of automated browser QA (and what to use instead)

The v4.4 live QA pass uncovered two limitations in browser-MCP-driven
testing that are worth codifying so they don't get re-discovered each
time:

**1. Recharts hover tooltips don't fire on programmatic mouse events.**
Recharts uses its own internal hit-testing on Bar/Line/Area elements
(SVG paths, not DOM nodes with onmouseover). MCP `computer.hover`
sends a synthetic mousemove via Chrome DevTools Protocol — the event
reaches the SVG, but Recharts' internal listeners are bound to React
synthetic events triggered by the actual mouse cursor's pointer
position over a Cell. Net: programmatic hover doesn't reliably show
tooltips, so the v4.1 per-cell composite tooltip couldn't be
visually verified by the browser-MCP harness.

Mitigation: code review proves the wiring (`compositeBreakdown` prop
threads through, custom `<Tooltip content>` render prop renders the
right structure when invoked). For visual verification, real human
mouse hover on the Vercel deploy is the only sufficient test.

**2. `resize_window(360, 740)` sets the OS window, not the viewport.**
Tested empirically during the v4.4 QA pass: setting browser window
to 360×740 produced screenshots that rendered at ~986×880 with the
desktop layout still visible. The OS-level window size includes
chrome (tab bar, address bar, scrollbars) and the inner viewport
ends up wider than expected, plus DPR scaling can inflate the
captured PNG dimensions further.

Mitigation: for true mobile-viewport QA, use one of:
- Chrome DevTools device-mode (Cmd+Shift+M / Ctrl+Shift+M, pick
  iPhone/Galaxy preset). Browser-MCP can drive this if you toggle
  device mode in the Chrome extension's side panel first.
- Real device — the primary author already checks Shikho on phone;
  mobile bugs caught there are the highest-confidence signal.
- CSS-level review: ripgrep for `flex-wrap`, missing
  `max-w-[calc(100vw-2rem)]`, missing `break-words leading-tight`
  per the CLAUDE.md mobile checklist.

Don't trust `resize_window` for "this works on mobile" claims — it
catches catastrophic overflow but misses the subtler mobile-only
patterns (tap-target size, hover-only affordances, popup
right-edge clipping).

## 2026-04-30 — Live QA over local-build QA for cross-boundary Next.js bugs

The v4.4 hotfixes (composite-crash + Diagnosis-button-misplacement) both
landed during a live QA pass on the Vercel deploy. Build was green and
local manual smoke tests had passed before the v4 commits shipped.

This drives a rule going forward:

For any change that crosses the **Server Component → Client Component
prop boundary** OR depends on **runtime state shipped from sheets**
(week-view conditionals, lock state, midweek vs end-of-week diagnosis
routing), the pre-commit gate is necessary but **not sufficient**.
The truth-test is:

1. `npm run build` (compiler-level)
2. Hit the live URL with the URL params that exercise the new path
   (`?metric=reach,interactions`, `?week=last`, etc.)
3. Walk every page that imports the changed component, even ones the
   commit didn't intend to touch — the v3.5 composite crash hit Trends
   too because it shared the bug-carrying component.

The v3.5 commit shipped with "Verified at 360/768/1280" in the message
but the verification was done in single-metric mode, where the
function-prop didn't cross the boundary. The composite path went
straight to production untested.

**Concrete addition to the QA gate (CLAUDE.md perspective #2):** "Data
extremes" already lists empty / single-row / max-realistic. Add: "URL
param extremes" — every URL param the route reads gets exercised. For
this project that's `?metric=...` (1, 2, 3, 4 metrics), `?weights=...`,
`?week=this|last|next`, `?range=...`. If any of those throws, fix
before commit. The full URL-param matrix is small and finite — there's
no excuse for shipping a broken composite path or broken last-week path.

## 2026-04-29 — Sprint P7 v4.2: zero-config link-out for "Regenerate this week" over PAT-route

The `force_regenerate` CLI bypass for running-week locking was already
live as `python main.py --force-regenerate` and as a workflow_dispatch
input on `weekly-analysis.yml` / `midweek-diagnosis.yml`. The dashboard
needed a UI surface for it.

Two ways to land it:

A. **Next.js API route** `/api/regenerate` → POSTs to
   `repos/:owner/:repo/actions/workflows/:workflow/dispatches`. Click
   triggers the run directly. Requires `GITHUB_PAT` env var on Vercel
   with `workflow:write` scope, plus an audit-log story (who clicked).

B. **Disclosure-style link out** to the GitHub Actions UI's "Run workflow"
   panel for the relevant workflow file. Operator flips the
   `force_regenerate` toggle ON in the GitHub UI before clicking Run.
   No secret on Vercel; no API route to maintain.

Picked B for v4.2.

**Why:**
- Audience size = 1 (the operator). The friction delta (2 clicks: open
  panel → toggle → click Run, vs. 1 click in dashboard) doesn't justify
  the ops cost of holding a `workflow:write` PAT in Vercel env.
- A Vercel-side PAT with `workflow:write` scope is high-blast-radius
  if leaked. Until at least one ops moment exists where the extra
  click materially hurt, the secret-free path wins.
- The disclosure copy doubles as documentation: it tells operators
  *why* the lock exists ("Strategy/Calendar/Plan_Narrative are locked
  for the running week so accidental mid-week reruns don't clobber a
  stable plan") and *what they're flipping* (`force_regenerate=true`).
  An API route would hide that context behind a single button.
- v4.5 candidate is the API route. Promote when (a) operator pain
  emerges, or (b) the audit-log story matters (e.g., shared-account
  ops where "who triggered the bypass" needs a paper trail).

## 2026-04-29 — Sprint P7 v4.3: bump Graph API in one step, audit-then-go (not n-1 conservative)

`scripts/check_graph_version.py` flagged us 4 majors behind (v21→v25).
Two postures available:

A. **Audit-then-bump-current** — read v22→v25 changelogs end-to-end,
   smoke-test every endpoint we use against v25, then bump to v25.
B. **Conservative n-1** — bump to v24 (one major behind current).
   Rationale: deprecation cliffs hit at the *current* version; n-1
   absorbs Meta's stability lag.

Picked A.

**Why:**
- The audit work is identical for v24 and v25. Once you're reading
  changelogs you might as well land on the highest safe version.
- `WARN_LAG = 2` in the version-check script means n-1 still won't
  silence the cron alert when v26 ships. We'd be back here in weeks.
- v25's deprecations are *queued for v26*, not active. There's no
  v25-specific stability tax to pay; v25 is functionally a refresh
  of v24 for our endpoint set.
- Conservative-by-default loses its value when "current minus 1" is
  visibly behind a recent deprecation that we already migrated for
  (`post_impressions_unique` → `post_total_media_view_unique` was
  pre-staged in `lib/aggregate.ts::reach`).

**Audit pattern that worked, codify for next bump:**
1. Read each major's changelog. Tag every breaking change for OUR
   endpoint set (Page Insights, Posts edge, Video edge, Reels insights,
   page-level posts insights). Skip Instagram/WhatsApp/Marketing/Live
   Video sections — we're FB-Page-only.
2. Cross-check the deprecation registry in `lib/aggregate.ts` and
   pipeline fetch path. Confirm anything deprecated isn't called live.
3. Live smoke-test every endpoint we DO call against the target
   version. Curl/PowerShell + token; check HTTP 200 + payload shape.
4. Flip `GRAPH_API_VERSION`. Push. Watch one full weekly run.
5. DECISIONS entry on what was tested + what's queued for the next bump.

## 2026-04-28 — Sprint P7 Phase 3: percentile-rank composite over weighted-sliders for v1

Spec called for "multi-metric scoring composite" in v1 (originally
deferred to v2 then promoted in the same review session). Two flavors:

A. **Weighted sliders**: 4 sliders/inputs sum to 100; composite =
   Σ(value_i × weight_i). Each metric's value pre-normalized somehow.
B. **Equal-weight percentile-rank**: each metric's value is converted to
   its percentile rank within the population (0..1), then averaged
   with equal weight across selected metrics.

Picked B for v1, A deferred to v3.5.

**Why:**
- Raw values across reach (10000s) and engagement rate (0.X%) aren't
  comparable for averaging without normalization. Weighted sliders need
  a normalization story BEFORE the weights matter — picking percentile
  rank as the normalization step reuses the work and lets v1 ship
  without sliders. v3.5 just adds sliders on top of the same normalizer.
- Multi-select pills are simpler UX than slider-with-input-values.
  Single-select still works (default = `?metric=reach`), so users who
  want a "rank by reach only" view get the same 1-click experience as
  before.
- Percentile-rank averaging is a defensible, common composite scoring
  approach (used in OKR scorecards, real-estate listing rank, etc.).
  The "what does composite=78 mean" answer is "this row scored at the
  78th percentile on average across the metrics you selected" — easier
  to explain than a weighted sum on z-scores or normalized values.

**Implementation:** lib/aggregate.ts: `percentileRankIn(value, sortedAsc)`
binary-searches a pre-sorted population array; `buildMetricSorts()`
pre-sorts once per page render (O(N log N) per metric); `compositeScore()`
+ `groupStatCompositeScore()` Schwartzian-transform sort posts /
group rows by their composite descending. Single-metric short-circuit
uses direct value sort (cheaper + exact ordering).

## 2026-04-28 — Sprint P7 Phase 3 wiring scope: deep-wire 2 pages + selector-only on 3

Spec asked for the page-level metric selector on 6 pages. Realistic
scope check during build: Overview + Explore re-rank cleanly with the
existing data shapes; Trends + Timing + Reels need bigger re-keying
work to make every chart honor the active metric (multi-line trends,
extra heatmaps, Top-10-by-active-metric).

Picked: ship the selector on all 5 (Engagement was Phase 1.4 with
box-level on Format×Hour) so URL persistence works cross-page; deep-wire
Overview (trend chart + pillar ranking) and Explore (post ranking)
because those are the highest-leverage rewires. Per-chart deep wiring
on Trends/Timing/Reels documented as v3.5 follow-up commits in CHANGELOG.

**Why this isn't a half-measure:** the selector being VISIBLE on every
page was the real product win (consistent vocabulary, URL persistence
when you click between pages with `?metric=` set). The per-chart
re-keying work is incremental — each chart can flip independently
without touching the selector plumbing.

## 2026-04-28 — Sprint P7 Phase 2 locking guards over architectural archive

Spec: "running-week artifacts shouldn't auto-overwrite". Two ways to
implement:

A. **Archive architecture**: Strategy / Content_Calendar / Plan_Narrative
   evolve from clear+rewrite to append-by-week. Dashboard reader filters
   by target week. Plan/Outcomes selectors get real history to show.
B. **Skip-on-existing guards**: each writer reads existing rows; if a
   row matches the running week with a clean engine, skip the write.
   Storage stays single-row per artifact. Plan/Outcomes selectors still
   only show the latest week.

Picked B for v1, A deferred indefinitely.

**Why:** A is a 2-3 day cross-repo refactor that affects every reader.
B is a 30-line per-writer guard that ships the locking semantics the
user actually asked for ("once this week's plan is created within a
running week, that should not change unless the user specifically asks
for it"). The history-aware view that A enables is a NICE-TO-HAVE; the
running-week stability is the ACTUAL FEATURE. Ship the feature, defer
the architecture.

`--force-regenerate` CLI flag exists for ops recovery without needing
A. The v2 "Unlock & regenerate this week" button on the dashboard would
write a sheet flag that triggers the same path.

## 2026-04-28 — Cross-repo data shape evolution: dashboard normalizer over breaking schema change

When evolving `what_happened` and `watch_outs` from bare strings to
`{text, source_post_ids}` objects (so each Finding/Watch-out can carry
a clickable post link), three real shapes existed in the wild:

1. legacy AI path: `["headline; evidence", ...]`
2. native engine: `[{summary, biggest_mover, top_format, source_post_ids}]`
   for what_happened, `[{severity, type, pillar, detail, source_post_ids,
   weeks_affected, ...}]` for watchouts
3. new AI path (v1.7): `[{text, source_post_ids}]`

Two paths to handle this:

**A. Force one shape.** Update pipeline + writer + reader simultaneously
to `{text, source_post_ids}`. Drop the other two shapes entirely. Risk:
any cached row from before the cutover renders blank or errors.
Migration would mean re-running every weekly run we have history on.

**B. Dashboard normalizer.** Accept all three shapes at the read seam,
collapse to one canonical shape with backward-compat fallbacks. Pipeline
ships the new shape on next run, but old rows still render correctly
because the normalizer reads `text || detail || summary` and treats bare
strings as `{text: str, source_post_ids: []}`.

Picked B. Reasons:
- Backward compat is the entire point of cross-repo lockstep — never
  ship a change that requires a sheet migration.
- The normalizer is ~15 lines and lives next to the only consumer
  (strategy page). One file, one diff, no platform risk.
- Pipeline can iterate on the AI prompt independently — if v1.8
  changes the shape again, the normalizer absorbs it.
- Native and AI paths can coexist without converging — they ship
  different fields, the normalizer reads what's there.

The cost: a tiny shape-mismatch at write/read time. Acceptable in
exchange for the migration immunity.

**Pipeline-side polish guard.** When `polish_watchouts` started seeing
the new `{text, source_post_ids}` AI shape, it would have re-paraphrased
already-polished prose against empty severity/detail/weeks_affected
fields. Discriminator: `severity` only exists on native dicts. The
guard `if not all("severity" in w for w in watchouts): return watchouts`
skips polish cleanly for both legacy bare strings (rejected upstream by
the isinstance-dict check) and new AI dicts.

## 2026-04-23 — Reels top-10: custom TopReelList over Recharts for clickable captions

Needed full-caption hover + permalink affordance on the Bangla captions
labelling Top 10 Reels by Plays / Watch Time / Followers Gained. The
existing BarChartBase renders labels via Recharts `YAxis`, which
emits SVG `<text>` nodes — they can't host a React popover or anchor
tag cleanly (pointer events and portaling into SVG coord space get
messy).

**Options considered:**

1. Custom tick component rendering `<foreignObject>` with an HTML
   `<PostReference>` inside. Works in theory, but foreignObject in
   SVG has well-documented sizing/clipping bugs across browsers, and
   Recharts layout assumes tick width is static.
2. Keep the chart, stack the PostReference chips underneath as a
   parallel list. Duplicates the data; users see captions twice.
3. Replace the chart with an HTML list (`<ol>` + rank badge +
   PostReference + CSS-flex proportional bar + value). Drops the
   Recharts dependency on these three charts, keeps the visual
   ranking bar via flex width percentage.

Picked (3). The bar was ornamental anyway — the rank and the
numeric value carry the signal; the bar is a nice-to-have. Keeping
the bar via CSS flex preserves the at-a-glance proportion. BarChartBase
still renders the Retention Funnel + Avg Retention Curve where labels
are short English strings and no interactivity is needed.

**Rule of thumb for future charts:** if the Y-axis labels are
user-generated content (captions, post titles, free-text), don't use
Recharts — HTML lists or tables handle the interactivity better.
Recharts is for numeric/categorical axes, not text-as-identifier.

## 2026-04-23 — Timing heatmaps: fixed-height cells over aspect-square

Heatmap cells were `aspect-square min-h-[18px]`. On desktop at
1280px+ the grid has 24 hour columns × 7 day rows; aspect-square
produced ~80px cells × 7 rows ≈ 560px+ of vertical space per heatmap,
pushing the second heatmap off the first-viewport-fold on 1080p
screens.

**Fix:** `h-[20px] sm:h-[22px] lg:h-[26px] min-h-[18px] w-full`.
The grid is now uniformly short; color intensity still carries
the signal and the two grids sit above each other in one viewport.

Trade-off: the cells are rectangular now, not square. No operator
has ever said "I need these cells to be square" — the information is
in the color, not the shape. Preferred scannability over geometric
purity.

## 2026-04-23 — SEA academic context: static mirror on the dashboard, not a cross-repo tab

The audit's SEA-01..05 gap had two plausible shapes: (a) persist a
full `Academic_Context` sheet tab from the pipeline and read it on
the dashboard, or (b) mirror the small `exams.yaml` constant on the
dashboard as static TypeScript. Picked (b).

**Why:** the dashboard only needs the macro signal — "are we in exam
season?" and "how many days until the next exam?" The full ~300-event
calendar is server-side grounding for priors bucketing and diagnosis
prompts; surfacing the whole thing on the dashboard would duplicate
state for no operator benefit. Two entries (HSC, SSC) change maybe
once a year; the lockstep cost is trivial compared to building,
persisting, and reading a new tab.

**Why 14-day threshold:** matches the pipeline's AMEND scorer exactly
(`EXAM_PROXIMITY_DAYS = 14`). Keeping the dashboard's "exam season"
pill and /outcomes' exam-confounded verdict pinned to the same
definition means operators don't see one page claim "exam season"
while another claims "regular."

**Graduation path:** when the Knowledge team's Google Sheet academic
calendar starts changing mid-season or operators want the event
list, promote to a `Academic_Context` tab written by the pipeline.
Until then, the static mirror is the pragmatic path. Header comment
in `lib/exams.ts` calls this out so the next person doesn't wonder.

## 2026-04-23 — /outcomes is its own page, not a strip on /plan

The v5 audit called out two plausible homes for the Outcome_Log
surface: tacked onto /plan, or a new /outcomes page. Picked the new
page.

**Why:** /plan is forward-looking — "this is next week's calendar."
Putting retrospective grading on the same page muddles the mental
model ("is the Hit pill I'm seeing about THIS row or last week's
same-pillar row?"). A separate page cleanly frames the three phases:
/strategy (what we decided — currently rolled back), /plan (what we
plan to ship next), /outcomes (what happened to last week's plan).

**Why no StalenessBanner:** the scorer is deterministic
(score_slot_outcome is a pure function). CLAUDE.md explicitly gates
the banner on Claude-powered artifacts. The page still shows
`Generated At` in the header so operators can see when grading last
ran, without the banner's alarmist framing.

**Why client-side rollup:** `computeOutcomeRollup` in lib/sheets.ts
mirrors the pipeline's `compute_calendar_quality_score` so the page
renders correctly even when OSL-07 (Calendar Quality Score in
Strategy_Log) hasn't been persisted. When OSL-07 ships, we can swap
to the persisted JSON without changing the UI — the shapes are the
same, the rollup function is just the canonical fallback.

## 2026-04-23 — StalenessBanner gates on Meta-fetch freshness, not just artifact age

Sprint P5 shipped a Calendar-coverage-by-hypothesis view on /strategy. On
first live viewing, users flagged it as clutter (duplicates /plan's job)
AND noticed the "AI calendar never succeeded" banner firing on pages that
had just run. Diagnosis: pipeline crashed at `write_run_log` (the final
write in `write_all`), so `Analysis_Log.last_successful_calendar_at` never
got stamped even though the calendar itself wrote successfully. Pipeline
fix: wrap `write_run_log` in try/except (commit 3ee710c).

Dashboard-side decision: even with the pipeline wrap, users don't care
about subtle AI-artifact age within a fresh Meta pull window. If the raw
Meta data is ≤7d old, the analysis layered on top is definitionally fresh
enough. Added a component-local gate in `StalenessBanner.tsx`:

```ts
const metaAgeDays = runStatus?.last_run_at ? daysBetweenNow(...) : -1;
const metaFresh = metaAgeDays >= 0 && metaAgeDays <= 7;
if (!aiDisabled && metaFresh) return null;
```

The underlying `computeStaleness()` in `lib/sheets.ts` still runs — it
feeds programmatic consumers and the `aiDisabled` mode still forces the
banner through. The gate is pure UX: don't nag when the user is obviously
seeing fresh data.

Tradeoff: if the AI layer has been broken for >7d while Meta still runs
fresh, we'd miss showing the banner until the 8th day. Acceptable —
the pipeline itself prints warnings when AI stages fail, and the
aiDisabled env flag path is preserved for the explicit-disable case.

## 2026-04-23 — Revert /strategy Calendar-coverage-by-hypothesis (Sprint P5)

Shipped the section a day ago. User feedback on first live view: the
/plan page already shows this week's calendar with slot cards and
hypothesis tags. Re-rendering it grouped by hypothesis on /strategy
was "cluttering" — strategy should stay at the arc-level, not drill
into per-slot ops.

Kept: Plan_Narrative schema, Content_Calendar v2 columns (Hypothesis
ID, Forecast Reach CI, Risk Flags), `getPlanNarrative()` reader,
`PlanNarrativeCard`. These feed /plan and are valid for future
programmatic use (e.g., pipeline-side retro comparing predicted vs
actual per-hypothesis reach).

Killed: /strategy imports of getCalendar/getLatestStrategy/getPlanNarrative
in that file, the `groupCalendarByHypothesis` helper, HypothesisBucket
type, the render block. 335 lines net deletion.

Takeaway: when a new view answers a question that feels adjacent to an
existing view's question, probe harder whether users actually need the
second angle or whether they'll see it as redundant. For /strategy, the
answer is "strategy = weekly arc narrative; plan = slot-level ops." Keep
them on separate altitudes.

## 2026-04-23 — /strategy reverse view: secondary hypotheses show ID only, not text

The hypothesis-to-slot reverse view on /strategy shows a hypothesis
card per distinct `hypothesis_id` in the live calendar. The PRIMARY
hypothesis (the one `PlanNarrative.hypothesis_id` tags as the arc
driver) carries the strategy sheet's `strategic_hypothesis` prose.
Secondary hypotheses (h1, h2, …) show their ID badge but no
descriptive text.

Why no text for secondaries: the pipeline's `Strategy` tab stores a
SINGLE `strategic_hypothesis` string — the primary only. Secondary
hypothesis text lives inside the calendar JSON's per-slot `rationale`
field, not in a hypothesis-id-keyed lookup. Surfacing text per
secondary would require either (a) a new pipeline writer that emits
`{h1: "text", h2: "text"}` into Strategy, or (b) extracting-and-
deduplicating rationales at render time — both more work than this
iteration wanted.

For now: the slot list under each secondary bucket carries its own
evidence (format, pillar, hook line), which is enough for the reader
to infer what the hypothesis is about. A later iteration can add a
richer `strategy.hypotheses[]` array and light up the secondary
descriptions in-place. Schema-extension point, not a blocker.

## 2026-04-23 — /strategy reverse view suppressed in archival mode

Archival mode on /strategy (`?archived=YYYY-MM-DD`) is a DIAGNOSIS
snapshot — it shows the verdict, findings, top/under performers, and
watch-outs as they were at that week's pipeline run. But the calendar
on the sheet is always live (Content_Calendar is upsert-by-week). So
rendering the hypothesis-to-slot section inside an archival view
would pair an archived diagnosis with the CURRENT week's slots — an
honest-but-confusing split.

Choice: suppress the reverse view section entirely when `isArchival`
is true. Users viewing an archive get a clean diagnosis snapshot
without the mismatch; if they want slot coverage, a single click on
the "← Live" link in the ArchivalLine takes them to the live view.

## 2026-04-23 — Content_Calendar schema v2 reader: defensive JSON parse, not strict

The pipeline serializes `forecast_reach_ci_native` + `risk_flags` as
JSON strings inside single Content_Calendar cells. Two options for the
dashboard reader:

(a) Strict — `JSON.parse` throws, propagate to /plan as an error.
(b) Defensive — try/catch around parse, bad cells degrade to
    `undefined`, page still renders.

Picked (b). The sheet is human-editable (the whole point of using
Sheets instead of a DB), so a hand-fixed typo in the JSON cell should
not take down /plan. Same philosophy as the existing `calendarFromRows`
fallbacks (`r["Featured Entity"] || "None"`, `r["Hook Line"] || r["Brief"]`).
A validator on the pipeline side already rejects structurally-invalid
payloads BEFORE write, so production sheets shouldn't hit the
degrade path — it exists to tolerate manual edits, not to hide
pipeline bugs.

## 2026-04-21 — Bucket E item 42: north-star score is a deliberate one-time historical break

The north-star score ships as `(saves + shares × 1.5) ÷ reach`. This is
not the textbook Bucket-E definition, which reads `(saves + shares + dms) ÷ 3`
normalized to reach. Two deliberate departures from the textbook:

1. **DMs excluded.** `dms_generated` is only available via the Meta Business
   Suite API. The weekly pipeline uses the standard Graph API, which does not
   expose it. Rather than ship a composite that silently reads 0 on a real
   input dimension (making every current north-star number inflated relative
   to the future version that includes DMs), the formula omits DMs entirely
   and the share term absorbs the weight. When MBS access lands (item 41),
   the formula becomes `(saves + shares × 1.5 + dms × 2.0) ÷ reach` and
   historical comparability breaks a second time. Both breaks are documented.

2. **Shares weighted 1.5×.** A share is a public recommendation that expands
   reach beyond the existing follower base — organic-growth-terms, it is
   strictly more valuable than a save (intent-to-return on an already-present
   viewer). A flat equal-weighted composite underrates shares. The 1.5 factor
   is a judgment call; if the team prefers parity, it's a single line change
   in `northStarScore()`.

Alternative considered: ship two scores — "north-star current" (without DMs)
and "north-star target" (with DMs, pinned to 0). Rejected because two metrics
on a leadership dashboard that the team has to mentally reconcile is worse
than one metric with a clear "break on access unlock" footnote.

The comparability break is called out in-UI on Overview (the "DMs pending MBS"
sublabel) and on Engagement. Anyone pulling this number into a deck needs to
know it isn't the same score last week's deck was reading, and the footnote
surfaces the distinction.

## 2026-04-21 — Bucket E item 39 (save rate) scoped down to "helper + tile, pending pipeline column"

The Bucket E spec treats save-to-reach as an existing-data metric. On inspection,
`Raw_Posts` has no `Saves` column — the Graph API `post_activity_unique` action=saved
signal is not currently fetched in `facebook-pipeline/src/fetch.py`. Rather than
block the rest of Bucket E on a pipeline-side change, the dashboard ships the
helper (`saveRate()` in `lib/aggregate.ts`) and the tile (Engagement "Save Rate"
card), both of which return 0 / "pending" today and auto-light-up once the
pipeline writes the column. The PLAN_COMPARISON row is marked `status-wip` so
the cut-down is visible from the roadmap view.

This is the same shape of scope-down used for item 41 (DM velocity) and is the
reason north-star is not blocked on either: the helper is the contract, the
data source is the variable.

## 2026-04-21 — StageEngine type keeps legacy "ai" alongside new provider values (Stage 0 item 11)

Alternative considered: migrate historical `Analysis_Log` rows from `"ai"` to
`"anthropic"` (the pre-Stage-0 runs were all Anthropic). Rejected — rewriting
shared-sheet history from the dashboard is a dangerous pattern and the data
is just noisy enough that a miss would silently corrupt audit trails. Instead,
the union carries both `"ai"` (legacy) and `"anthropic"` (Stage-0+) and the
new `isLiveAI()` helper treats them equivalently. Callers that don't need the
distinction use the helper; callers that want the provider name specifically
(e.g., a future "powered by Gemini" badge) key off the exact value.

Adding `KNOWN_ENGINE_VALUES` as a `ReadonlySet` instead of an inline equality
chain in `getStageEngine()` is minor but deliberate: the previous code checked
three values; the new union has six runtime-valid values plus `"unknown"` for
missing columns. Future engine values (e.g., `"openai"` when the adapter lands)
add one line to the set, not an edit to an `||` chain in two places.

## 2026-04-21 — Brand compliance enforced via ratchet baseline, not upfront cleanup

When brand compliance became a rule, the honest state of the codebase was 306
legacy violations (mostly `text-slate-500` carried over from pre-Shikho). Two
options:

1. Block all commits until the 306 violations are cleaned up.
2. Capture the 306 as a grandfathered baseline; enforce "no regressions"
   forward; ratchet down opportunistically.

Picked (2). The cleanup is low-risk but high-effort (mechanical find/replace
across 24 files), and blocking on it would stall every other change. The
ratchet pattern is standard (eslintrc grandfather lists, mypy baselines,
rubocop --auto-gen) — it respects that "reality has a legacy" without letting
"legacy" excuse new violations.

Mechanism: `.brand-audit-baseline.json` stores `{file: {ruleId: count}}`.
Audit reports **regressions** (current count exceeds baseline) and exits 1.
Cleanup is invited, not mandated: when a commit reduces violations, re-run
`npm run brand:audit -- --write-baseline` and the expectation drops and
never drifts back up.

The alternative — file-level allowlist — was rejected: it hides ratio of
violations per file. Count-per-rule-per-file is more honest.

## 2026-04-21 — Shikho v1.0 brand rollout: remap hex, keep token names

When applying the Shikho v1.0 design system, the obvious path was to rename Tailwind tokens
(`brand-shikho-indigo` → `brand-indigo`, `brand-cyan` → `brand-indigo-400`, etc.) to match
the Shikho naming convention. That would have touched 20+ component files with churn that
adds no visual value.

Picked the opposite: **keep all existing token names, remap the hex values inside
`tailwind.config.ts`**. `brand-shikho-indigo` now resolves to Shikho Indigo #304090,
`brand-cyan` to #4A66C4, `brand-amber` to Sunrise #E0A010, `brand-red` to Coral #E03050.
Consumers never learn the change happened — the entire app shifts palette on a single
config file.

Tradeoff accepted: token names don't literally match the Shikho spec labels. That's fine
because the spec is a palette contract, not a naming contract. Anyone reading the code
sees the hex and the usage; anyone reading the spec sees the hex and the role. The names
are an internal index, not a deliverable.

Where we did rename: added `brand-shikho-coral` as a new token (no existing mapping to
reuse for coral), so negative-delta KPIs now read `text-brand-shikho-coral` explicitly.

## 2026-04-21 — Archival mode via `?archived=<run-id>` URL param, not client-side tab state

Considered two patterns for "view last week's calendar":

1. In-page tab (Live | Archived) with client state — zero URL change.
2. `?archived=<run-id>` URL param — full re-render on change.

Picked URL param:

- **Bookmarkable + shareable.** "Here's what we planned for the Eid
  Salami week" is a thing someone sends as a link; client-side tab
  state can't do that.
- **Survives refresh + back/forward.** On a phone this matters —
  accidental refreshes shouldn't bounce you back to live view mid-review.
- **Next.js App Router handles it.** `searchParams` is a server-prop on
  the page; reading it triggers a normal server re-render. No extra
  state management, no hydration mismatch.
- **Return-to-live is a free `<Link href="/strategy">`** — no state
  reset ceremony.

Cost: every archival-link click is a server round-trip. For a page
that's opened rarely and changes weekly, that's fine. If we built a
high-frequency artifact archive (per-run, daily), we'd revisit.

## 2026-04-21 — Stage registry in `lib/stages.ts`, not inline in components

`StalenessBanner` + `AIDisabledEmptyState` + the Analysis_Log reader
all need to know the env-var names for each stage (CLASSIFY / DIAGNOSIS
/ CALENDAR) plus which page each stage backs. Three components with
drift-prone magic strings would fail the first time we rename a stage.

New `lib/stages.ts` exports `STAGES` (record of stage → metadata) +
`stageForPage(path)`. Banner reads `stage.envVars`; empty state reads
`stage.noun`; sheets reader reads `stage.readStatus` / `readLastSuccessful`.
One place to edit when a new stage or provider lands.

## 2026-04-21 — `ai-disabled` banner is slate + indigo accent, not amber/red

Amber = "something needs your attention" (warn). Red = "something is
broken" (crit). AI being intentionally off is neither — it's a state
the operator deliberately chose (ran the no-AI workflow) or a
degradation the operator CAN fix (top up credits). Using amber/red
for that state would train the user to ignore them when the signal is
genuinely urgent.

Slate + indigo accent puts it in the "informational" register, matching
the Cycle 1 design spec. The chevron expands to show the native
pipeline is still fresh — so the banner is load-bearing but not
alarming.

## 2026-04-20 — Lean plan over full architecture plan for the 6-stage migration

The full spec in `docs/ARCHITECTURE.md` covers every piece that might be
needed at scale (`Run_Ledger` mutex, `source_hash` + `engine_version`
columns on 8 `Summary_*` tabs, 4 provider adapters with per-provider
prompt templates, `Run_Ledger_Archive`, CLI rollback tooling, RunPicker
UI). Shipping it would take 4-6 weeks before any of the current pain
points (hardcoded timing baseline, credit-outage fallback quality, thin
weekly prompt) get fixed.

Picked the lean plan in `docs/ROADMAP.md` instead — 3 ordered steps over
2-3 weeks:

1. Prompt overhaul + timing fix (pipeline-only commit, ships value
   immediately)
2. LLM abstraction seam with Anthropic adapter only (byte-identical
   output, installs the port for future provider work)
3. Native classifier + AI-disabled workflow + consolidated
   `StalenessBanner` (unlocks zero-AI operation)

Deferred indefinitely: Run_Ledger mutex (GitHub Actions `concurrency:`
covers it for a single-writer setup), provenance columns, Gemini /
Mistral adapters, 5 of 8 Summary_* tabs, RunPicker UI, per-provider
prompt templates.

Why this is the right call for an N=1 project: the architectural
features in the full plan are insurance against problems that don't
exist yet (multi-writer races, unknown auditor requesting provenance,
provider outage we haven't hit). The pain points that *do* exist are
all addressed by steps 1-3. Architecture gets earned when something
forces it, not pre-built.

Re-evaluate the deferred list quarterly. Trigger conditions documented
in `docs/ROADMAP.md`.

## 2026-04-20 — Documentation reorganized under docs/

Moved all spec and planning docs into a new `docs/` folder so the repo
root isn't a dumping ground: ARCHITECTURE, PROJECT_ATLAS, DESIGN_BRIEF,
BACKLOG, WORKFLOW. Archived superseded artifacts (MASTER_PLAN.md,
DESIGN-AUDIT.html, DESIGN-ROADMAP.html) under `docs/archive/`.

Added three new docs to capture the lean-plan decision and its
consequences:
- `docs/ROADMAP.md` — current execution plan (lean, 3 steps)
- `docs/PROVIDER_SWITCHING.md` — per-stage AI env-var contract
- `docs/DESIGN_HANDOFF.md` — when and what to send Claude Design

Kept at root by convention: `CLAUDE.md` (Claude Code auto-picks this
up), `README.md` (deploy guide), `CHANGELOG.md`, `DECISIONS.md`,
`LEARNINGS.md`. Root README now points into `docs/` for everything
else.

Rationale: the prior root had ~10 markdown files competing for
attention and no entry point. A reader couldn't tell which was
"current" vs "historical" vs "aspirational." The new structure has
one index (`docs/README.md`) with a prescribed read order.

## 2026-04-18 — PageHeader.lastScrapedAt prefers pipeline timestamp over render time

`PageHeader` previously displayed `new Date()` labeled "Data as of"
— UI rendering time dressed up as a data-freshness claim. New
`lastScrapedAt?: string` prop, expected to be passed `RunStatus.last_run_at`
from `getRunStatus()`. When present, the header shows "Last Meta
fetch: <BDT timestamp>". When absent, it falls back to "Rendered
<timestamp>" — still honest about what the label means.

Why the fallback instead of requiring the prop: every page should
eventually pass `lastScrapedAt`, but the component is also used in
one-off contexts (error boundaries, future experimental pages) where
no run-status is available. A hard requirement would force every
caller to plumb getRunStatus; the fallback removes the friction
while keeping the label honest.

Why "Last Meta fetch" not "Last Refreshed": the pipeline's Run Date
is the moment Facebook was scraped. Users asking "how fresh is what
I'm looking at?" mean exactly that — when did we last talk to Meta's
API. "Refreshed" would also be true but ambiguous (refreshed what —
the sheet? the view? the verdict?).

## 2026-04-18 — Heatmap cells use confidence-weighted opacity, not binary cutoff

Original design: cells with `n < minN` render flat slate ("below
reliability threshold"). The problem is 168-cell grids with realistic
posting volumes (~50 posts) hit that branch for ~95% of cells, so the
grid visually communicated "no data" when it really had sparse but
informative data.

New design: cell min-n is hardcoded at 2 (below that = no posts →
almost-blank `#fafbfc`). Above 2, color is the full value-driven
interpolation blended back toward `minColor` by `(1 - confidence)`,
where confidence linearly scales 0.4 (at n=1) → 1.0 (at n≥MIN_N).
So a 1-post cell shows its metric direction at ~40% intensity, a
3-post cell at ~70%, a qualifying cell at full.

Tradeoff considered and rejected: a stricter threshold (`minN`
varying by range length, as the bar charts use) would be more
statistically honest, but in a 168-cell grid the visual cost of
near-total blanking outweighs the claimed rigor. Summary stats
ABOVE the heatmap (Best Day, Best Hour) still use the stricter
`minPostsForRange` gate for ranking; the heatmap itself is a
pattern-finder, not a ranker.

## 2026-04-18 — Staleness banner gets a `hasData` soft-fallback branch

`computeStaleness` returns crit+`days_since=-1` when no "Last
Successful X At" timestamp was ever written to Analysis_Log. Previously
this unconditionally produced a red banner: "No successful refresh
recorded yet". In practice, Weekly_Analysis can have rows even when
Analysis_Log doesn't have that column populated (pipeline can write
content without writing status), so users saw a red "broken" banner
above a fully rendered strategy verdict.

New design: `hasData?: boolean` prop. When the page has content AND
timestamp is unknown, the banner softens to info-style (slate colors,
"pipeline freshness not recorded" headline, explanation in the sub-
text). True crit (no data AND no record) stays red. Warn (stale
timestamp) stays amber.

Why a prop instead of probing the data upstream: keeps the component
pure. The page already knows whether it's rendering content; passing
a boolean is simpler than teaching `computeStaleness` about each
artifact's row structure.

## 2026-04-18 — Rangedays math centralized in lib/daterange

Three separate pages (Engagement, Strategy, Timing) each had their
own formula for "how many days is this range" — two used `+1`, one
used `Math.round`. All three fed `minPostsForRange()` which keys its
adaptive threshold on days. A 30d selection came out as 31 in two
places, which tipped into the 60d bucket (15-post floor instead of 10),
causing silent empty charts across the affected pages.

Fix: `lib/daterange.ts` exports `rangeDays(range)` using
`Math.floor(ms / 86_400_000)`. All pages import the same function
and pass it to `minPostsForRange`. No more local formulas.

Principle: any numeric input to an adaptive threshold must come from
a single source of truth. An off-by-one in an input to `if (n >= X)`
doesn't crash — it just quietly takes the wrong branch. These are
the worst bugs to find because the UI looks complete and "empty chart"
reads as "not enough data" rather than "wrong bucket".

## 2026-04-18 — Client-component format props are enums, not functions

After the /timing RSC-boundary crash (see LEARNINGS for full diagnosis),
Heatmap's `valueFormat` prop was changed from `(v: number) => string` to
`"percent" | "number"`. The format logic moved inside the component.

Why enum instead of function:

- A function prop is a silent trap: it works fine in dev and in unit
  tests, passes typecheck, passes `next build`, and crashes only in
  production. The failure is invisible until a user hits the route.
- A string enum is serializable by construction. There's no way to
  accidentally pass something that won't cross the RSC boundary.
- The format space is small and closed (two cases today, realistically
  three or four over the life of the component). Keeping the cases
  enumerated in the component keeps the call sites trivial and the
  behavior discoverable.

Tradeoff: callers can no longer pass custom format logic. If we ever
need a third format (e.g. "duration" for retention), we add it to the
enum and the helper; this is a deliberate choice. Any use case that
truly needs arbitrary formatting probably wants its own specialized
client component, not a generic Heatmap.

Applies to any future client-component prop that looks like a
"formatter" or "renderer" — default to enum + inline logic, escalate to
a proper API only if the cases genuinely can't be enumerated.

## 2026-04-18 — One heatmap beats a 2x2 bar grid (Batch 3a, #13)

Timing asked "when should we post?" with four separate charts: bars
of reach by slot, bars of ER by slot, bars of reach by day, bars of
ER by day. Readers had to remember slot-1 reach, slot-2 reach, slot-3
reach, then switch axis to day-1 reach, etc., and mentally overlay
the two to find (day, slot) hotspots. The answer to the question
only exists at the intersection — the 1D projections hid it.

Decided to replace all four with a 7x24 day-by-hour heatmap. Color
saturation = the metric; position = the (day, hour) pair. Two grids
(ER in pink, avg reach in indigo) because reach and ER diverge: a
cell can have high reach with meh ER (broad-audience post) or low
reach with high ER (niche but sticky). The dual view is the ONLY way
to see both simultaneously.

Alternatives considered:

- **3D surface plot**: perceptually dense but Cleveland-&-McGill-wrong
  for sequential data (position on a common scale beats color beats
  angle; 3D surfaces ruin "common scale"). Nobody reads these.
- **Small-multiples of 7 day-bars**: 7 tiny bar charts at 24 values
  each. 360px wide, wouldn't fit horizontally and stacking kills the
  compare-across-days story. Heatmap's grid layout is the compact form.
- **Keep bars, add annotations**: lipstick. The 1D projections still
  hide 2D patterns.

Tradeoff: Recharts has no native heatmap, so custom CSS grid
(`grid-template-columns: auto repeat(24, minmax(0, 1fr))`). RGB linear
interpolation between minColor and maxColor — not perceptually
uniform (LAB/OKLab would be), but for a sequential 0-max scale across
168 cells, the perceptual deficit is invisible and the compute cost
is a few hundred JS cycles per render. Not worth the import.

Takeaway: when a question only has answers at the intersection of two
dimensions, don't show two 1D projections. Show the 2D space directly,
even if the chart library doesn't ship with it.

## 2026-04-18 — Explore is a workbench, not a dashboard (Batch 3b, Pg-Ex)

Pre-Batch-3 Explore was a dashboard that happened to have filters:
KPI strip (5 big cards) → reach trend → group chart → Top 10 last.
The hierarchy said "here are summary numbers, then some charts, oh
and there's a list of posts at the bottom." But the USE CASE is "let
me slice my content and find what worked" — a workbench, not a
dashboard. The post list IS the output.

Decided: make filter the primary control (sticky toolbar pinned
below nav), demote summary numbers to a compact strip (same info,
less visual weight), promote Top Posts to the first output with
pagination so users can scan beyond the top 10. Trend and group
charts move below as deeper-dive context.

Alternatives considered:

- **Collapse filters into a sidebar**: the classic workbench
  pattern, but at 360px a sidebar becomes a modal which adds taps.
  Sticky horizontal toolbar is one-tap-from-anywhere.
- **Infinite scroll Top Posts**: keyboard-unfriendly (no jump-to-
  page-7), no "how many total" signal, and scroll hijacking on mobile.
  Page-size selector + prev/next is predictable.
- **Fixed toolbar (`position: fixed`)**: would escape the max-w-7xl
  container and need manual width management. `position: sticky`
  stays in flow, no layout surgery.

Tradeoff: sticky toolbar eats ~40px of vertical real estate all the
time. Acceptable — users scrolling the post list always need access
to filter tweaks, and the prior "scroll up to re-filter" pattern was
the main pain point flagged when the page was reviewed.

Takeaway: the hierarchy of a page should match the user's JTBD, not
the dashboard-template convention. If the "output" is a table, put
the table first.

## 2026-04-18 — aria-describedby + <details> are the free-lunch a11y wins (Batch 3c, #20)

An info-tooltip with `role="tooltip"` is still invisible to screen
readers unless the ELEMENT BEING DESCRIBED references it. The common
mistake is to set `role="tooltip"` on the popup text and assume
announce-on-focus works — it doesn't; the tooltip is semantically
orphaned. The fix is a one-line `aria-describedby={open ? id :
undefined}` on the (i) button, with a matching `id={id}` on the
tooltip span, and React's `useId` generates the stable id. Now when
the button gets focus, screen readers announce "What is this metric?
[definition text]."

Similarly, the "View data as table" disclosure was a candidate for
hand-rolled `useState` + `<button aria-expanded>` + `<div role=region>`.
Native `<details>/<summary>` does all of that for free: keyboard-
accessible (Enter/Space toggles), announces expanded state to screen
readers, works without JS. The CSS-only bit was the caret rotation:
`group-open:rotate-90` on the svg inside a `<details class=group>` is
a single-line CSS animation tied to the native open state.

Alternatives considered:

- **Headless UI Disclosure**: overkill — adds a peer dependency and
  state plumbing for what the platform does natively.
- **Custom hook + ARIA**: 20+ lines of code prone to regressions. If
  the platform ships a semantic primitive, use it.

Tradeoff: `<details>` comes with default browser styling we don't
want (the disclosure triangle). Stripped with `list-style: none` on
summary (implicit via `select-none` and no explicit `::marker`
override needed — the caret svg replaces it).

Takeaway: before building a custom ARIA widget, check if the
platform already ships the semantics. `<details>`, `<dialog>`, and
`<input list>` are all under-used primitives that get screen-reader
support for free.

## 2026-04-18 — Canonical page template is a default, not a mandate (Batch 3d, #19)

Roadmap #19 said "consistent page template: header → KPI strip (max
5) → primary chart → secondary charts → detail." Audit showed 4
pages comply cleanly (Timing, Explore, ~Reels, ~Overview) and 4
don't (Trends, Engagement, Strategy, Plan).

Forcing the template across all 8 would break intentional design:

- **Trends** is a trends page; the small-multiples strip IS the KPI
  summary layer. Adding a separate 4-card KPI strip on top would
  duplicate and compete with the sparklines.
- **Engagement** has Best X + Recommendations as a deliberate
  narrative (here are 4 signals, here's what they mean). Templating
  them as "KPI → chart → chart" erases the synthesis move.
- **Strategy** leads with the Weekly Verdict hero because the
  verdict IS the point; a KPI strip below it would shift attention
  away from the synthesis.
- **Plan** is a calendar, not a metrics view.

Decided: apply the template only where the page's domain naturally
fits (metric dashboards), and document the exceptions explicitly.
Templates exist to prevent inconsistency where it doesn't serve the
reader — not to override page-specific structural choices.

Alternatives considered:

- **Rewrite all 4 holdouts to fit the template**: would strip the
  actual value those pages provide. Roadmap priority was "consistency"
  but consistency-for-its-own-sake is worse than intentional variation.
- **Split the template into two (dashboard vs narrative)**: overkill
  for 4 pages; a documented exception per page is simpler.

Takeaway: design-system rules are usually defaults, not mandates.
When a page has a reason to break the rule, document WHY — that's
what DECISIONS.md is for. Applying the rule blindly converts
intentional designs into templated ones and destroys information
density in the process.

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
