# Changelog

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
