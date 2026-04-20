# Master Plan — Shikho Organic Social Dashboard, Next Generation

**Authored:** 2026-04-18
**Scope:** end-to-end assessment of fetch → classify → sheet → TS aggregation → AI
prompt → dashboard → user interaction.
**Inputs:** 5 parallel research agents (pipeline fetch+classify, sheets+TS
boundary, statistical rigor, AI prompt layer, dashboard IA+viz) + live codebase
read.
**Constraint:** documentation only. No code changes until explicitly approved.
**Intended downstream:** feed to Claude Designer for mockups, then sequence
into commits.

---

## 1. Executive summary

The dashboard works. It renders reliably, mobile holds, the weekly pipeline
runs, and the Strategy/Plan artifacts show up on time. But it's stuck at
**"read-only weekly report."** Four structural gaps keep it from being the
"best possible helping tool a social media team can have":

1. **The numbers are naive for the data's shape.** Student-t CI on a 3-post
   pillar versus a 50-post pillar is mathematically wrong; reach is heavy-
   tailed and arithmetic means get dominated by a single viral outlier;
   there's no temporal decay, so a 90-day-old post weighs as much as
   yesterday's.
2. **The AI layer is a plain f-string.** No system prompt, no few-shot, no
   temperature control, no JSON mode, no prompt caching. Diagnosis gets
   15 KB of raw post JSON when it should receive precomputed stats. Top-5
   overall is passed where top-5 **per bucket** would surface 3× the
   insight. The timing baseline ("Sunday 25.8K/post, 9 PM–midnight 1.73%")
   is **hardcoded** — the prompt lies to Claude when the data shifts.
3. **Every chart aggregates posts away with no way back.** There is no
   post-level drill-down. Click a pillar bar and nothing happens. Every
   decision-maker's real question — "which posts are in this number?" — is
   unanswerable inside the dashboard today.
4. **The IA sprawls to 8 pages where 6 is the industry spine.** Trends
   duplicates Overview; Engagement is four near-identical bar charts;
   Strategy and Plan are two halves of the same "what's next" answer;
   Explore overlaps Engagement. Meta, Sprout, Hootsuite, Buffer all ship
   4–5 page dashboards with top-content tables on the landing page —
   Shikho has neither.

The fix is **not a rewrite**. It's a staged upgrade where each stage lands
as its own pre-commit QA-gated commit and compounds. The rest of this doc
lays out what we found per layer, the proposed end-to-end architecture, and
a five-phase rollout ranked lowest-risk-highest-impact first.

### The headline moves, in one sentence each

| Stage | Move | Why now |
|---|---|---|
| 1 | Prompt overhaul — XML structure, precomputed stats payload, top-5 per bucket, bottom-3 anti-patterns, computed timing baseline, prompt caching | One pipeline commit, zero UI work, reshapes every Monday's output |
| 2 | Stats upgrade — Empirical-Bayes shrinkage + exponential decay + log-transform on reach | One `lib/stats.ts` commit, every ranking on every page gets more honest automatically |
| 3 | Post-level drill-down + Top-5-posts strip on Overview | Closes the single biggest IA gap vs every competitor |
| 4 | IA consolidation — 8 pages → 6. Trends into Overview, Engagement into Content, Strategy+Plan into Next Week | Fewer surfaces, each more load-bearing |
| 5 | Python analytics sidecar — cadence, anomaly detection, forecasting, survival curves | The "even without AI" statistical ceiling |

---

## 2. Findings by layer

### Layer A — Pipeline fetch + classify (Python, `facebook-pipeline/`)

**What works.** Graph API v21.0 post/video/page insights pulls are clean.
Classifier uses Haiku 4.5 (cheap + fast); diagnosis + calendar use Sonnet
4.6. Graceful-degradation layer falls back to cached data when Anthropic
credits run out.

**What's weak.**

| Issue | Evidence | Impact |
|---|---|---|
| Classifier is single-pass, no self-consistency | `classify.py:165-318` | Low-confidence rows are treated as ground truth, inflating ranking noise |
| `classifier_confidence` is written but never read | BACKLOG.md 2B | We have the signal to down-weight noisy labels and ignore it |
| `manual_override` not honored | BACKLOG.md 2B | Human corrections don't beat the model in rankings |
| `featured_entity` vs `spotlight_name` schema drift | Pipeline vs views diverge | Pick one canonical field, migrate, delete the other |
| Error handling on Graph API retries is ad-hoc | `fetch.py` | Transient Meta 5xx can ghost a post from the pipeline |
| No per-post lineage / "what was changed when" | No audit trail | Silent reclassification is invisible |

**Proposed additions.**

- Wire `classifier_confidence` into aggregation weights (Phase 2).
- Honor `manual_override` in ranking and prompt payloads (Phase 2).
- Rename and migrate: one canonical `spotlight_name` field, deprecate
  `featured_entity` (Phase 1 cleanup, one PR).
- Optional: self-consistency classification (2–3 temperature-0.3 Haiku
  samples, majority vote) only on rows with confidence ≤ 0.7. Roughly
  doubles classification cost on ~15% of rows — acceptable for the
  accuracy lift (Phase 3).

### Layer B — Sheets + TS aggregation boundary (`lib/sheets.ts`, `lib/aggregate.ts`)

**What works.** Google Sheets as source of truth is cheap, transparent,
manually inspectable. `getPosts()` / `getRunStatus()` / `computeStaleness`
are well-factored. BDT timezone handling via `bdt()` is correct.

**What's weak.**

| Issue | Evidence | Impact |
|---|---|---|
| Every page does its own `getPosts()` + aggregation on every request | `force-dynamic` + `revalidate = 300` | Wasted CPU, Google Sheets quota pressure as volume grows |
| No caching layer between Sheets and React Server Components | Direct read every request | 5-minute revalidate masks the lack of materialized summaries |
| Aggregation happens in TypeScript on the server — fine for 1K posts, cracks at 10K | `lib/aggregate.ts` | Ceiling is closer than it looks |
| Sheet tabs are growing — `Raw_Posts`, `Classifications`, `Raw_Video` compound weekly | Currently fine | At ~50K rows reads get slow and flaky |
| No idempotency key on writes | Pipeline writes | A second run overwrites blindly |

**Proposed additions.**

- **Materialized `Summary_*` tabs** written by the Python pipeline: per-
  pillar, per-format, per-hook, per-hour, per-day weekly rollups. The
  dashboard reads summaries, not raw rows. Order-of-magnitude speedup,
  shrinks the TS aggregation surface (Phase 2).
- **Optional: swap to Supabase (Postgres) behind the same lib interface.**
  Not urgent — only do if Sheets latency becomes user-visible. The
  materialized summary tabs buy us 6–12 months before this is needed
  (Phase 5, conditional).
- Add a `generated_at` column to `Weekly_Analysis` and `Content_Calendar`
  and read it in `computeStaleness`. Source-of-truth for the banner
  becomes the artifact itself, not the pipeline run log.

### Layer C — Statistical approach (`lib/stats.ts`)

**What works.** Student-t 95% CI lower bound is the right baseline idea —
penalize small samples, reward consistency. Reach-weighted ER avoids one-post
buckets dominating.

**What's weak.**

| Issue | Formula gap | Impact |
|---|---|---|
| **No shrinkage.** A 2-post pillar at 8% ER ties a 50-post pillar at 8% | Empirical-Bayes shrinkage toward overall mean | Small buckets win "Best X" in short ranges when they shouldn't |
| **No temporal decay.** 90-day post weighs == yesterday's | Exponential decay with ~30-day half-life | Rankings reflect the distant past, not the present |
| **Arithmetic mean on heavy-tailed reach** | Geometric mean (mean of logs, then exp) | One viral 5M post dominates its pillar's mean |
| **No bootstrap CIs on composite metrics** | Only student-t on the mean | ER, CTR, virality coefficient CIs are rough approximations |
| **No anomaly detection** | None | An overperforming post that should be studied hides in a table |
| **No cadence / gap analysis** | Not computed | "Are we under/over-posting?" is unanswerable |
| **No seasonality decomposition** | None | Day-of-week effect is mixed into "pillar effect" |

**Proposed additions — implementable in native TypeScript.**

All three below are ~50 lines of code each, drop into `lib/stats.ts`, zero
new dependencies.

```ts
// Empirical-Bayes beta-binomial shrinkage toward pillar prior
shrunkMean(groupPosts, priorMean, priorStrength): number

// Exponential temporal decay — 30-day half-life
weightByRecency(posts, halfLifeDays): number[]

// Geometric mean for heavy-tailed (reach, impressions, plays)
geomMean(values): number
// and
summarizeLogNormal(values): { center: number, ciLow: number, ciHigh: number }
```

**Proposed additions — requires a Python analytics sidecar.**

These are not worth porting to TypeScript. They live in a new `analytics/`
stage inside `facebook-pipeline/`, run weekly, write results into a
`Summary_Analytics` tab the dashboard reads. Libs: `numpy`, `pandas`,
`scipy`, `statsmodels`, `scikit-learn` (all free, all standard).

| Analysis | Library | Output sheet | Impact |
|---|---|---|---|
| **MSTL decomposition** of weekly reach | `statsmodels.tsa.seasonal.MSTL` | Trend / seasonal / residual per week | Separates "audience growing" from "this week's content shone" |
| **Changepoint detection** on ER and reach | `ruptures` (PELT) | Changepoints with dates | Flags "something changed on Feb 14" — algorithm shift, holiday, brand pivot |
| **Anomaly detection** on per-post ER | `sklearn.IsolationForest` | Anomaly score per post | Overperformers and flops bubble to Overview automatically |
| **Survival curves** for reel retention | `lifelines.KaplanMeierFitter` | 25%/50%/75% drop-off time per pillar | "Where do reels die?" per pillar, not just in aggregate |
| **4-week forecast** of reach / ER | `prophet` | Forecast + 80% CI per metric | Trends page gets a future-looking strip, not just historical |
| **Lift estimation** for A/B experiments | `scipy.stats` bootstrap | Win probability per hypothesis | Underpins Phase 3C experiment log |

**Total install footprint:** ~600 MB in a virtualenv, all pip-installable,
all free. Runs in <2 min on the current dataset. No SaaS dependency.

### Layer D — AI prompt layer (`facebook-pipeline/src/classify.py` lines 165-318, 476-605, 717-802)

**Critical correction:** prompts live in `classify.py`, **not** `report.py`.
`report.py` is an HTML renderer for the weekly email — it has no model
calls.

**What works.** The prompts are clear, the task decomposition (classify →
diagnose → plan) is sound, and the Sonnet 4.6 choice for diagnosis is
appropriate for the reasoning required.

**What's weak — and this is the single biggest unforced cost and quality
loss in the stack.**

| Gap | Current state | Cost/quality impact |
|---|---|---|
| **No XML structure, no system prompt, no few-shot** | Plain f-string body | Claude reinvents the output schema every week |
| **No `temperature` set on any call** | Default 1.0 | Week-to-week output variance is pure noise |
| **No JSON mode, no tool-use, no structured output** | Parse free-form text | Brittle parsing, silent schema drift |
| **No prompt caching** | Cold prompt every run | ~80% input cost left on the table — Anthropic docs confirm the savings [Prompt caching — Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) |
| **Diagnosis receives ~15 KB of raw post JSON** | Data dump | Model spends tokens on aggregation it shouldn't do; answers are shallower |
| **Top-5 overall, not top-5 per bucket** | Single ranked list | Great reel + great carousel: one survives, one insight lost per pair |
| **No underperformer anti-patterns** | Winners only | Claude can't recommend "avoid this" without seeing the bottom |
| **Hardcoded timing baseline** | `classify.py:739-742` literal string | Prompt lies to Claude when data shifts |
| **No chain-of-thought / no self-critique** | One-shot generation | No reasoning trace, no confidence escape |
| **No "I don't know" output path** | Forced recommendation | Claude invents calendar slots on weeks with insufficient data |
| **UI ignores many diagnosis + calendar fields** | Schema drift | Signal produced, then dropped |

**Proposed prompt refactor (Phase 1 — one pipeline commit).**

Every item below is an explicit change to `classify.py`, not a vague
direction.

1. **XML-structured prompt with system message, cached prefix, and
   top/bottom/baseline payload blocks.** Template:

   ```xml
   <system>You are a content strategist for Shikho, a Bangladesh ed-tech
   brand. You analyze weekly Facebook performance and write actionable
   verdicts. You always cite post IDs. You never recommend a pillar,
   format, or hook that failed in the last 4 weeks without flagging the
   risk explicitly.</system>

   <context cache_control="ephemeral">
     <!-- brand guide, pillar definitions, glossary — cached 5min -->
   </context>

   <data>
     <top_per_bucket>
       <pillar>top 5 by bucket</pillar>
       <format>top 5 by bucket</format>
       <hook>top 5 by bucket</hook>
       <spotlight_type>top 5 by bucket</spotlight_type>
     </top_per_bucket>
     <bottom_per_bucket>
       <!-- bottom 3 each, "what not to do" anti-patterns -->
     </bottom_per_bucket>
     <timing_baseline>
       <!-- computed from last 60 days, NOT hardcoded -->
       best_day=...  best_hour=...  source=computed
     </timing_baseline>
     <precomputed_stats>
       <!-- NOT raw post JSON; shrunk means, CIs, decay-weighted rankings -->
     </precomputed_stats>
     <few_shot>
       <example label="good post"><post/><why_it_worked/></example>
       <example label="flopped post"><post/><why_it_failed/></example>
     </few_shot>
   </data>

   <task>
     <!-- exact output schema, with confidence field and "no-verdict" path -->
   </task>
   ```

2. **Set `temperature=0.3` on diagnosis and calendar calls.** Reduces
   week-over-week style churn.

3. **Enable prompt caching on the stable context block** (brand guide,
   glossary, schema). 5-min TTL is fine for a weekly run; for backfills
   it's ~80% savings.

4. **Enable JSON mode with a typed schema for calendar output.** No more
   regex parsing. Parse failures become first-class errors with a
   fallback path.

5. **Replace hardcoded timing baseline with a computed field.** Compute in
   Python from the last 60 days before the prompt is built. Pass as
   `timing_baseline.best_day` / `.best_hour`. The prompt stops lying.

6. **Add a confidence-gated "no verdict" path.** If `classifier_confidence`
   mean < 0.6 or sample size < threshold, model returns a "not enough
   signal — here's what we'd need" response instead of inventing a
   calendar.

7. **Wire every diagnosis + calendar output field into the UI** (or drop
   from the prompt). Current drift is invisible cost.

**Cost math — illustrative.** Current weekly run: ~3 Sonnet calls × ~20 KB
input ≈ 60 KB × ~$3/MTok = ~$0.18 per run. With prompt caching on the
stable half of the input: ~$0.04 per run. ~75% reduction on a tiny base —
not the headline win. The headline win is **quality**: structured output,
no timing lie, top-5-per-bucket, bottom-3-anti-patterns.

### Layer E — Dashboard IA + visualization (8 pages → 6)

See full Agent 5 report above. Headline audit:

| Page | Verdict |
|---|---|
| Overview | Ship — needs drill-down + top-5-posts strip |
| Trends | **Merge into Overview** |
| Engagement | **Merge into Content** — one dot-plot, not 4 bar charts |
| Timing | Rework — 7×6 time-of-day buckets, not 7×24 |
| Reels | Rework — sortable data grid, not 3 pseudo-table bar charts |
| Strategy | Ship — small reorder, merge with Plan |
| Plan | Ship — add review mode, merge with Strategy |
| Explore | **Cut or fold into per-page drill-down** |

**Proposed 6-page IA:**

1. **Overview** (landing, 60-sec read). Verdict headline, 5 KPIs with WoW,
   top-5 posts this week with thumbnails, Biggest Movers as dumbbell plot,
   weekly-at-a-glance sparklines.
2. **Content** (merges Trends + Engagement). Unified ER-by-dimension
   dot-plot with CIs and sample-size hover, underperformer panel, cadence
   gap, weekly volume/shares trend.
3. **Timing**. One-line recommendation, 7×6 bucketed heatmap, bivariate
   (color = ER, size = reach-per-post), day-of-week bars, best-hour KPIs.
4. **Reels**. 4 KPIs, retention curve, sortable reels data grid with
   thumbnail + permalink + 5 metrics, top-of-funnel hook retention.
5. **Next Week** (merges Strategy + Plan). Verdict hero, key findings,
   underperformer anti-patterns, 7-day plan with slot briefs + rationale
   chips linking back to findings, approve/override per slot.
6. **Explore** (power-user workbench). Dimension picker, filter stack,
   sortable post table with pagination.

**Wrong-tool-for-the-job — top 5 viz swaps.**

| Current | Replace with | Page |
|---|---|---|
| Donut "Format Distribution" | Horizontal ranked bar with % labels | Overview |
| 4 stacked horizontal bar charts (format/pillar/hook/spotlight ER) | Single dot-plot with 95% CI bars, dimension toggle | Content |
| 7×24 heatmap | 7×6 time-of-day × day-of-week bucketed heatmap | Timing |
| Top-N reels as three bar charts | One sortable data grid with thumbnail + 5 metrics | Reels |
| Retention curve + funnel bars (same data twice) | One filled-area retention curve | Reels |

---

## 3. Proposed end-to-end architecture

**The shape we're moving toward. Arrows are data flow, not weekly order.**

```
┌──────────────────┐
│  Facebook Graph  │   v21.0 post/video/page insights
│       API        │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│       facebook-pipeline/ (Python, weekly)        │
│                                                  │
│  1. fetch.py          — Graph API pulls          │
│  2. classify.py       — Haiku 4.5, XML prompt,   │
│                         self-consistency on      │
│                         low-confidence rows      │
│  3. analytics/        — NEW Python sidecar       │
│     ├─ stats.py       MSTL, changepoints,        │
│     ├─ anomaly.py     IsolationForest,           │
│     ├─ survival.py    Kaplan-Meier,              │
│     └─ forecast.py    Prophet                    │
│  4. summarize.py      — NEW: write materialized  │
│                         Summary_* tabs           │
│  5. report.py         — Sonnet 4.6 diagnosis +   │
│                         calendar, XML + cached   │
│                         context + JSON mode +    │
│                         temp=0.3 + top-5 per     │
│                         bucket + bottom-3 +      │
│                         computed timing baseline │
│  6. sheets.py         — write Analysis_Log,      │
│                         Weekly_Analysis,         │
│                         Content_Calendar,        │
│                         Summary_Analytics,       │
│                         Summary_{Pillar,Format,  │
│                         Hook,Hour,Day}           │
└────────┬─────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Google Sheets   │   Raw + Summary + Analytics tabs
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────┐
│            Next.js dashboard (Vercel)            │
│                                                  │
│  lib/sheets.ts     — read Summary_* first,       │
│                      fall back to raw            │
│  lib/stats.ts      — shrinkage, decay, geomMean  │
│  lib/aggregate.ts  — thinner, most work done     │
│                      in Python sidecar now       │
│                                                  │
│  6 pages:                                        │
│   Overview    — verdict + top-5 posts + sparks   │
│   Content     — unified dot-plot + underperf     │
│   Timing      — bucketed heatmap + recommend     │
│   Reels       — sortable data grid + retention   │
│   Next Week   — verdict + calendar + rationale   │
│   Explore     — power-user workbench             │
│                                                  │
│  Shared:                                         │
│   PostPanel    — slide-over, keyed to post_id    │
│   StalenessBanner — unchanged                    │
└──────────────────────────────────────────────────┘
```

---

## 4. Phased rollout — lowest-risk-highest-impact first

Each phase is **one or a small cluster of commits**, each gated by the
seven-perspective pre-commit QA gate, each followed by doc updates to
`CHANGELOG` / `DECISIONS` / `LEARNINGS`.

### Phase 1 — Prompt overhaul + schema cleanup (pipeline only, zero UI changes)

**Rationale for going first:** no UI risk, one PR, reshapes every Monday's
output. Easy to revert.

**Deliverables:**

- `classify.py`: XML structure, system prompt, cached context, JSON mode,
  `temperature=0.3` on diagnosis + calendar.
- New `lib/prompt_builder.py`: builds top-5 per bucket, bottom-3 per
  bucket, computed timing baseline from last 60 days.
- New few-shot examples: 2 "good" + 2 "flopped" annotated posts.
- Confidence-gated "no verdict" output path.
- `featured_entity` → `spotlight_name` migration PR.
- Wire `classifier_confidence` into ranking weights in `lib/aggregate.ts`
  (read-side change, no visible UI).

**Effort:** 2–3 days. **Impact:** high on calendar quality, low on risk.

### Phase 2 — Stats rigor in TypeScript (one `lib/stats.ts` commit)

**Rationale for going second:** orthogonal to prompt changes, affects every
page's rankings automatically, pure math with unit-testable inputs.

**Deliverables:**

- `shrunkMean(groupPosts, priorMean, priorStrength)` — Empirical-Bayes
  toward overall mean.
- `weightByRecency(posts, halfLifeDays=30)` — exponential decay.
- `geomMean(values)` + `summarizeLogNormal(values)` — for reach and
  impressions.
- Backfill existing ranking call sites: Engagement's "Best X," Overview's
  Biggest Movers, Timing's heatmap coloring.
- Honor `manual_override` in ranking (preferred over classifier label).

**Effort:** 1–2 days. **Impact:** rankings across every page get more
honest with zero UI work. Small pillars stop winning "Best X" on thin
ranges.

### Phase 3 — Post-level drill-down + Top-5 posts strip on Overview (biggest visible win)

**Rationale for going third:** Phases 1–2 quietly improve things; Phase 3
is the first move the user sees as "the dashboard is different now." Also
closes the single biggest IA gap vs every competitor.

**Deliverables:**

- `permalink_url` as an icon link on every Reels row and every post row
  (one-line change — the field already exists).
- New `components/PostPanel.tsx` — slide-over keyed to `post_id`,
  full caption, thumbnail, classification, all raw metrics, permalink,
  retention curve (reels), ±3-day timeline context.
- Entry points from every chart: `onBarClick` / `onCellClick` on Recharts
  wrappers, click-row on Reels table.
- New `app/page.tsx` section: "Top 5 posts this week" strip with
  thumbnails and one-click PostPanel open.

**Effort:** 3–4 days. **Impact:** the dashboard stops being a read-only
report and becomes an analytics tool.

### Phase 4 — IA consolidation (8 pages → 6)

**Rationale for going fourth:** Phase 3's drill-down has to exist before we
cut pages, because some cut-page functionality migrates into the drill-down.

**Deliverables:**

- Merge Trends into Overview — small-multiple sparklines plus the
  weekly-at-a-glance chart.
- Merge Engagement into new `/content` page — one dot-plot with
  dimension toggle (pillar / format / hook / spotlight), 95% CI bars,
  sample-size hover. Add underperformer panel.
- Merge Strategy + Plan into new `/next-week` page — verdict hero on top,
  7-day calendar below, each day slot links back to the finding that
  justified it.
- Timing: replace 7×24 heatmap with 7×6 bucketed heatmap; add 1-line
  recommendation above it.
- Reels: replace top-N bar charts with one sortable data grid.
- Decide: cut Explore, or keep as power-user workbench. See Open Q1.

**Effort:** 1 week. **Impact:** fewer surfaces, each more load-bearing,
faster Monday-morning scan.

### Phase 5 — Python analytics sidecar (the "ceiling" upgrade)

**Rationale for going last:** everything above can ship without Python
stats libs. This phase is additive — it lifts the statistical ceiling and
feeds new panels into the existing pages.

**Deliverables:**

- New `facebook-pipeline/analytics/` module with `stats.py`, `anomaly.py`,
  `survival.py`, `forecast.py`.
- New `Summary_Analytics` sheet tab with MSTL components, changepoints,
  anomaly scores per post, survival medians per pillar, 4-week Prophet
  forecasts.
- Dashboard panels that consume the new tab:
  - Overview: "This week is anomalous in ways X, Y" banner when
    IsolationForest flags it.
  - Content: cadence-gap chart, changepoint markers on reach trend.
  - Timing: seasonality-decomposed day-of-week (removes pillar mix
    confound).
  - Reels: survival-curve quartiles per pillar replaces the flat
    retention average.
  - Trends (or Overview): 4-week Prophet forecast ribbon with 80% CI.
- A/B experiment log (BACKLOG 3C) sits naturally here — lift estimation
  piggybacks on `scipy.stats` bootstrap.

**Effort:** 1–2 weeks. **Impact:** the analytical ceiling. Changes the
product from "what happened" to "what's about to happen and what's
anomalous right now."

**Cost footprint:** Python libs are all free. Weekly run adds ~90 seconds
to the pipeline. Zero new SaaS dependencies. Doesn't break the bank.

---

## 5. Sequencing rationale — why this order

- **Prompt first because it's isolated.** No UI changes, easy rollback,
  improves the most-consumed artifact (Strategy verdict + Plan calendar)
  immediately.
- **Stats second because it's orthogonal.** Touches `lib/stats.ts` only.
  Every page benefits automatically. Fast to ship, easy to unit-test.
- **Drill-down third because it's the first user-visible "whoa" moment.**
  Also it's a prerequisite for Phase 4's page merges — if you cut Explore,
  drill-down replaces the ad-hoc investigation entry point.
- **IA consolidation fourth because the drill-down backfills the features
  we remove.** Cutting Explore before drill-down exists loses capability;
  after, it's a strict upgrade.
- **Python sidecar last because it's additive.** Nothing blocks on it.
  Can be paused or staggered without breaking any other phase.

---

## 6. Explicit non-goals — do not re-propose

Carried forward from `BACKLOG.md` and user direction:

- Paid vs organic split. Dashboard is purely organic.
- Slack / email weekly digest. Deferred explicitly. Do not wire
  notification infra.
- CSV export on tables.
- Supabase/Postgres migration **unless** Sheets latency becomes
  user-visible. Materialized summary tabs buy 6–12 months.
- Bot-detection bypass, credential auto-fill, or any CAPTCHA handling.

---

## 7. Open questions for Shahriar

Each of these changes a phase's scope. Resolve before we start coding.

1. **Cut Explore, or keep it?** If you're the only user and the per-page
   filters + drill-down cover ad-hoc querying, cut it. If the broader team
   uses it, keep and fix overlap with Content.

2. **Plan: read-only preview or write path?** If read-only, current
   click-to-expand day cards are fine. If write (approve/override slots,
   push to Meta Scheduler), needs a bulk review mode and an API integration
   worth scoping separately.

3. **Is a `created_by` / editor tag worth adding upstream?** Would unlock
   a "Creator Performance" card on Content. Small team but there's signal.

4. **Should Strategy's verdict live on Overview as the hero, instead of
   its own page?** Sprout + Meta pattern. Saves a click Monday morning.
   Tradeoff: Overview becomes Claude-dependent and subject to
   StalenessBanner. Decision before Phase 4.

5. **Phase 5 scope: all five analyses, or just two or three?** If budget is
   tight on effort, MSTL decomposition + IsolationForest anomaly + Prophet
   forecast is the MVP. Survival curves and changepoint detection can ship
   later.

6. **Self-consistency classification: worth the ~2× cost on
   low-confidence rows?** Fixes the manual-override-heavy weeks. Only
   matters if classifier error is genuinely hurting the rankings —
   answerable by spot-checking a week of flagged rows.

7. **Mobile polish pass before or after Phase 4?** Current 7×24 heatmap at
   360px is probably unreadable. Could bundle with Phase 4's Timing
   rework.

---

## 8. What this plan deliberately does NOT say

- **Exact designs.** Claude Designer will produce the mockups downstream.
  This plan specifies the IA, the elements each page must contain, and the
  wrong-tool viz swaps — not the visual design.
- **Exact commit order within a phase.** That's scoped at PR time.
- **Hosting or infra changes.** Vercel + Google Sheets is fine through
  Phase 5. The architecture supports a Supabase migration later without
  rewriting views.
- **Claude model version bumps beyond Haiku 4.5 / Sonnet 4.6.** Defer until
  the next Anthropic release cycle makes it worth revisiting.

---

## 9. First commit after approval

If all 7 open questions above are answered, the first commit is:

**Title:** `phase 1: XML-structured prompt + cached context + top-5 per bucket`

**Scope:**
- `facebook-pipeline/src/classify.py` lines 476-605 (diagnosis) + 717-802 (calendar): XML rewrite, system prompt, `temperature=0.3`, JSON mode, cached context block.
- `facebook-pipeline/src/prompt_builder.py` (new): top-5 per bucket, bottom-3 per bucket, computed timing baseline.
- `facebook-pipeline/src/examples/` (new): 2 good + 2 flopped annotated posts.
- Doc updates: CHANGELOG, DECISIONS (why XML + caching), LEARNINGS (hardcoded baseline lesson).

Everything else waits until this lands and the following Monday's output
is reviewed.
