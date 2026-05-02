# Learnings

## 2026-05-02 — Render-prop pagination is the cleanest cross-page reuse pattern

When a page needs pagination on a heterogeneous list (table on desktop, card list on mobile, ranked leaderboard, etc.), a render-prop component beats a layout-aware one. `<PaginatedList items pageSize>{({visibleItems, page, setPage}) => ...}</PaginatedList>` knows nothing about whether the caller renders a `<table>` or a `<ul>` or a `<div>` — it just hands over the visible slice + the paging API.

**Why this matters:** Recent Reels needs both a desktop table AND a mobile card list under one shared pager. Earlier prototypes tried `renderDesktop={...} renderMobile={...}` props — that doubled the call site without doubling the render code (the same map() with different markup wrappers). The render-prop version writes one render function, and the caller decides where to put the desktop and mobile clauses inside it.

**Reuse rule:** when a future page needs pagination, USE this component. Don't reinvent. Outcomes (8+ weeks, no cap), Diagnosis source posts, Explore rows — all candidates.

---

## 2026-05-02 — Server components inside client tab strips: pass them as ReactNode children

`TopReelSwitcher` (client) needs to toggle visibility of three `TopReelList` panels (server). React's rule: a server component can't be rendered inside a client component except as `children`. So the page (server) renders all three lists eagerly and passes them as `tabs[i].content` ReactNode props; the client switcher just shows/hides via local state.

**Cost:** all three panels render server-side every page load even though only one is visible. Acceptable here because each list is ~10 rows of mostly static text and the page is already SSR'd. If panels were expensive (chart with lots of data points), use a client-side data store + lazy mount instead.

**Pattern repeats anywhere a tab strip toggles between things that depend on server data.**

---

## 2026-05-02 — Schema migration that runs at write time fails open silently

`write_outcome_log` adds new columns via `ws.update_cell(1, next_pos, name)` lazily — only when a write fires. If a run skips the outcome stage (no calendar generated, AI off, etc.) the new columns never appear in the sheet. Symptom: dashboard reads empty values for `Matched Post ID` / `Slot Target Metric` and conditionally-rendered drill-down icons silently disappear from rows that should have them.

**Lesson:** lazy schema migrations only work if a guaranteed-fires write follows the schema bump. For tabs that ship new columns, either (a) trigger an explicit migration step at run start, or (b) have a force-rewrite path that doesn't depend on the AI stage outputting fresh data.

**Workaround applied:** the next pipeline run with `force_regenerate=true` re-fires every Outcome_Log write through `_read_calendars_from_sheet` → all archived weeks get rewritten with the new column values.

**Detection rule for next time:** after committing a `*_HEADERS` change, run `python -c "from src.sheets import OUTCOME_LOG_HEADERS; print(len(OUTCOME_LOG_HEADERS))"` against the live sheet via a one-off audit script BEFORE assuming the dashboard will pick up the new fields. If sheet column count < code header count, the migration hasn't fired yet.

---

## 2026-05-02 — Closed-loop edge: structured suggestions feeding the next prompt is the cheapest leverage we found

`System_Suggestions` (auto-derived prescriptions) → strategy prompt context block. Single-line prompt change. Doesn't auto-apply anything. But it converts "did h1 hold?" prose adherence into "h2 failed 3 weeks running, system flagged retire" hard evidence. The AI sees the data layer's read of itself instead of re-deriving lessons every run.

**Why it works:** the AI is a stochastic compressor of its prompt. If the prompt contains the deterministic conclusion ("calibration drift detected on pillar X"), the AI's output is grounded in that conclusion. If the prompt forces the AI to *derive* the conclusion from raw rollups, the conclusion drifts run-to-run.

**Pattern to repeat:** any time we add an evaluator (calibration, experiment-pass-rate, drift detector), wire its output back into the next strategy prompt as a structured block. Cheap; massive compounding effect.

---

## Plan-algorithm decomposition (permanent reference — used by every algorithm-touching commit)

This is the canonical map of every plan dimension and how it gets decided. **Read before proposing any change to plan generation, calibration, or outcome scoring.** Pair with `docs/PLAN_ALGORITHM_AUDIT.md` for the deeper multi-POV critique.

### Per-dimension decision logic (current state, post Tier 1 + 1.5)

| Dimension | What decides it | Strength | Weakness | Tier addressed |
|---|---|---|---|---|
| Slot count | `recommend_weekly_slot_count()` median posts/day on top-tercile-by-reach days × 7 | Data-driven, falls back to 28-30 below 14-day coverage | Sample sensitive in low-coverage windows | Tier 1.5 ✅ |
| Pillar mix | Strategy emits weights summing to 1.0; calendar enforces ≥85% adherence | Auditable, forces explicit choice | AI gut-feel within prompt; no objective function | Tier 1 partial (System_Suggestions feedback) |
| Format mix | Strategy weights (Reel/Video/Photo/Carousel) | Same as pillar | Same | Tier 1 partial |
| Day-of-week | `Priors_WeekdaySeasonality` consulted; AI distributes within constraints | 90-day grounded | No substitution modeling | Tier 2 (joint priors / counterfactual MC) |
| Time of day | `Priors_SlotTime` best historical hour per format | Empirical anchor | Per-cell n<10, noise dominates | Tier 6 (hierarchical Bayes) |
| Hook line | `validate_hook_freshness`: same-pillar 6w block, cross-pillar 2w block | Avoids fatigue, context-conditioned | Top-quartile selection still unconditional on context | Tier 1.5 ✅ |
| Spotlight | Strategy `teacher_rotation` ordered list | Explicit accountability | Recency bias — viral post dominates rotation | Tier 5 (propensity scoring) |
| Pillar × format pairing | AI judgment | Flexible | Joint gaps not surfaced | Tier 2 (joint priors) |
| Visual + key message | AI per slot | Specific + creative | Not measurable | Tier 5+ (engagement experiments) |
| CTA / funnel stage | `validate_funnel_balance`: TOFU≥20%, MOFU≥30%, BOFU≥20% with ceilings | Forces balanced funnel | None at default thresholds | Tier 1.5 ✅ |
| Forecast band | `Priors_Pillar × Priors_Format × Priors_AcademicSeason` (multiplicative marginals) | Reproducible, immutable | Independence assumption (interactions ignored) | Tier 2 (joint priors) |
| Hypothesis | `Experiment_Log` — pre-registered numeric metric → deterministic pass/fail | Forces falsifiability | First closed-loop primitive in the system | Tier 1 ✅ |

### Coverage status

- **Fully closed: 4/12** — hypothesis, slot count, funnel balance, hook freshness
- **Partially closed: 4/12** — pillar/format mix, spotlight, pillar×format pairing (via System_Suggestions feedback)
- **Pending Tier 2-7:** 4/12 — day-of-week substitution, time-of-day power, visual prose measurability, forecast band independence

### Tier roadmap (`docs/PLAN_ALGORITHM_AUDIT.md` §2 has full detail)

1. **Tier 1** ✅ — Calibration_Log + Experiment_Log + System_Suggestions + decay-aware scoring + closed-loop edge
2. **Tier 1.5** ✅ — slot count from data, funnel balance validator, conditional hook freshness
3. **Tier 2** — joint priors, A/B framework, regime-change KS-test, counterfactual MC, hypothesis grammar
4. **Tier 3** — bandits, Bayesian online updates, audience segmentation
5. **Tier 4** — north-star metric + utility function (team decision, not engineering)
6. **Tier 5** — pre-registered experiments, propensity scoring, DiD, holdout days
7. **Tier 6** — hierarchical Bayes, GBT, walk-forward backtest, calibration plots
8. **Tier 7** — adversarial hardening
9. **Tier 8** — multi-page generalization

### Discipline (always)

- Tier N+1 cannot be evaluated without Tier N's measurement infra
- No auto-applied changes — every closed-loop output is advisory at L0.5
- Calibration before model improvements (cheap floor before Bayesian/GBT)
- North-star metric is a team decision; engineering can't pick it
- Every shipped tier names which §1 assumption it undoes

---

## 2026-05-01 — Plan generation algorithm decomposition + factor decision logic (per-dimension audit)

Asked: "for a given week, what algorithm decides format / hook / spotlight /
time / pillar mix, and how do we know it's right?" Walked the pipeline
end-to-end and decomposed each dimension's decision rule. Surfaced
weaknesses that the audit never named before.

**Per-dimension decision logic (today's state):**

| Dimension | Decided by | Strength | Weakness |
|---|---|---|---|
| Slot count (28-30/wk) | Hardcoded floor | Bounded | Not derived from page's diminishing-returns curve |
| Pillar mix | Strategy AI emits weights summing to 1.0 | Auditable | AI gut-feel within prompt; no objective function |
| Format mix | Same as pillar | Same | Same |
| Day-of-week | `Priors_WeekdaySeasonality` consulted; AI distributes | 90-day grounded | Doesn't model substitution effects |
| Time of day | `Priors_SlotTime` best historical hour per format | Empirical | Sample size per (day × hour × format) often n<10; noise dominates |
| Hook line | `Hook_Library` (top-quartile) + 4-week reuse veto | Avoids fatigue | Top-quartile selection unconditional — winner during Boishakh ≠ winner during exam week |
| Spotlight (teacher / app feature) | Strategy's `teacher_rotation` ordered list | Explicit | Recency bias — one viral post dominates rotation 3 weeks |
| Pillar × format pairing | AI judgment | Flexible | Big known gaps (Reel × Live Class >> Photo × Live Class for Abdullah Bhaiya) not surfaced explicitly |
| Visual + key message | AI per slot | Specific | Pure prose; no downstream-metric tie |
| CTA / funnel stage | AI heuristic | OK | No guardrail forcing balanced TOFU/MOFU/BOFU |
| Forecast band | Deterministic: `Priors_Pillar × Priors_Format × Priors_AcademicSeason` | Reproducible | Independence assumption; interaction effects erased |
| Hypothesis (h1, h2) | Strategy + experiments_to_run | Forces falsifiability | Adherence checked qualitatively; no pre-registered metric threshold |

**Where today's "certainty" leaks:**

- Validators reject malformed structure → doesn't prove choices are good
- Cited priors row must exist → doesn't prove the cited row supports the conclusion
- Forecast bands from 90-day priors → 80% CI by design, but we don't measure if calibration holds
- Outcome scorer is deterministic → the math is right, the band might still be a bad prediction
- Adherence to last week's hypothesis is asked qualitatively → no pass/fail gate
- Source-post drill-down → AI samples the IDs, can cherry-pick

**The deeper structural gaps (3-tier improvement ranking):**

- **Tier 1 (≤1 week each, ship first):** Calibration_Log (was hit-rate inside 80% CI?); pre-registered numeric success metric per experiment; per-pillar/format hit-rate dashboard; post-decay-aware reach (don't score < 7 days old); slot count from data not floor; conditional hook freshness.
- **Tier 2 (2-4 weeks each):** joint priors `Priors_PillarFormatSeasonTeacher`; slot A/B test framework (2 paired slots/wk); statistical power gates on findings; regime-change detector (KS-test recent vs prior); counterfactual Monte Carlo simulator; hypothesis grammar (reject multi-claim "and" hypotheses).
- **Tier 3 (1+ month each):** Bayesian online prior update; causal model for spotlight-effect deconfusion; multi-armed bandit slot scheduler; negative-result memory; audience-segmented forecasts.

**The honest summary:** today the choices are *defensible* (every chip cites
evidence, every forecast cites priors, every plan ties to a hypothesis),
but they're not *optimized* and not *calibrated*. Tier 1 converts
"defensible" into "demonstrably calibrated"; Tier 2+ converts that into
"demonstrably better than obvious baselines." Without Tier 1's calibration
trace, every later improvement is opinion-vs-opinion.

Deeper multi-POV critique (statistical, causal, decision-theoretic,
identifiability, evaluation, adversarial) and Tier 4-7 roadmap moved into
[`docs/PLAN_ALGORITHM_AUDIT.md`](docs/PLAN_ALGORITHM_AUDIT.md). That doc
is the one to read before proposing any algorithmic change — it names
which assumptions each tier is undoing.

---

## 2026-04-30 — Multi-line text in JSX fragments inside inline elements: SSR/CSR whitespace drift

Second class of "build green, crash production" bug shipped (and hot-
fixed) in v4.5. Pattern:

```tsx
<span>
  {cond ? (
    <>
      Multi-line text with &apos; entities
      that wraps across source lines.
    </>
  ) : (
    <>
      Different multi-line text with &apos; entities.
    </>
  )}
</span>
```

This passed `npm run build` and worked in dev. In production it threw:
- React error #425 (Hydration failed because the initial UI does not
  match what was rendered on the server)
- React error #422 (Suspense boundary hydration error)
- Server Components render error → app/error.tsx fallback

The /plan and /plan?week=last URLs both crashed (both render the
fallback path that contained this JSX shape).

Most likely root cause: JSX collapses multi-line text whitespace (tabs,
newlines, leading spaces) using its own rules that can diverge between
Server Component render and client hydration when the text is wrapped
in a Fragment inside an inline element. Multiple `&apos;` entities in
the text amplify the rendering surface area and increase the chance of
a divergence. The combination — Fragment + inline element + multi-line
+ named entities — was enough to trip up SSR/CSR consistency.

**Rule going forward:** for conditional text content inside inline
elements, prefer a plain string ternary over JSX-fragment ternaries:

```tsx
// SAFE
<span>{cond ? "string A" : "string B"}</span>

// RISKY (works most of the time, fails unpredictably)
<span>{cond ? <>multi-line text</> : <>other</>}</span>
```

If you need rich content (links, bold, etc.) inside the conditional,
extract the branches into their own components and conditionally
render the components — single component instances at the JSX level
don't have the same fragment-whitespace ambiguity:

```tsx
<span>{cond ? <CopyA /> : <CopyB />}</span>
```

**Detection for future commits:** ripgrep `<>\s*\n\s*[A-Z]` inside
.tsx files to find multi-line fragment opens. If the matched fragment
is inside an inline-rendering element (`<span>`, `<p>`, `<a>`, `<em>`,
`<strong>`), inspect for SSR/CSR risk.

**Pairs with the v4.4 LEARNING** (function props can't cross the
Server→Client boundary): both classes of bug ship build-green and
crash only in production. Live QA on Vercel is the only sufficient
verification for cross-boundary changes — local `npm run build` +
local `npm run start` happy-path test is necessary but not sufficient.

## 2026-04-30 — Functions can't cross the Server→Client component prop boundary (Next.js 14)

Sprint P7 v3.5 introduced `<MultiLineTrendChart>` for composite-mode
dashboards. Its `MultiSeries` type accepted a `formatter: (v: number) => string`
function prop. Two callers (Overview, Trends) — both Server Components —
constructed series objects with inline formatter closures and passed
them as props.

**`npm run build` passed.** No type error, no lint warning, no
Vercel-build failure. The page even rendered fine in single-metric
mode (where `compositeTrendSeries` was an empty array and no formatter
crossed any boundary).

**It crashed on every composite-mode page load in production.** Server
threw `An error occurred in the Server Components render` (digest only;
specific message redacted in prod). The user got the
`app/error.tsx` fallback ("Something went wrong loading this page").

**Why:** Next.js App Router serializes Server Component output → HTML +
JSON-encoded props for hydration. JSON can't encode functions.
Server-passed function props throw at render time, not at build time.

**Trap mechanics:**
- Type system says it's fine: a function-typed prop is structurally
  valid TypeScript. Build passes.
- Single-metric path didn't pass the function (`compositeTrendSeries = []`).
  So `npm run build` + `npm run start` + happy-path manual test all
  succeeded. The bug shipped.
- Live QA caught it because production runs the full Server Component
  pipeline; dev mode is more forgiving.

**Rule going forward:** when defining a prop type for a `"use client"`
component, never type a field as a function if a Server Component might
construct that prop. Use a serializable discriminator
(`kind: "percent" | "number"`) and resolve to a function inside the
client component. The compiler can't enforce this — it's a code-review
checklist item.

**Detection pattern:** ripgrep for `:\s*\([^)]*\)\s*=>\s*[a-zA-Z]` or
`formatter:|onClick:|render:|callback:` in `components/` Props types,
then check whether each field is constructed by a Server Component
caller. If yes → swap to discriminator.

**Why we missed it on the original commit (c34a01b):** the v3.5
"verified" claim was based on `npm run build` green + manual eyeball
of the rendered chart in single-metric mode. The composite-mode path
shipped untested in production.

**Fix landed in commit `a5e1dfc`** — formatter→formatKind discriminator,
no end-user-visible behavior change.

## 2026-04-29 — Deprecation registry vs live fetch: check both before panicking on a Graph API bump

When validating the v21→v25 Graph API bump, an early smoke test
panicked: `page_fans`, `page_fan_adds_unique`, `page_fan_removes_unique`,
`page_negative_feedback`, `post_impressions`, and `post_negative_feedback`
all returned HTTP 400 on v25. First instinct: "v25 broke us, we need
to find replacements before bumping."

Real picture after checking the live fetch path: NONE of those metrics
are actually requested. They live in `lib/aggregate.ts`'s deprecation
registry — a defensive list of "if the sheet ever has a column with
this name, treat it as alias for X" — but the pipeline `src/fetch.py`
already migrated to v25-compatible alternatives months ago
(`page_daily_follows_unique`, `page_daily_unfollows_unique`, etc.).

**Rule going forward:** when a Graph API bump audit shows endpoints
returning 4xx, before assuming they're broken, check the actual fetch
path in `src/fetch.py` and confirm whether the metric is requested
live OR only resolved as an alias when reading historical sheet data.
Two different code paths, two different blast radii.

The deprecation registry exists for backward compat with old sheet
columns; it isn't a list of "things we still call live." Conflating
the two adds an hour of phantom debugging on every bump.

## 2026-04-29 — UI surfaces for CLI escape hatches: link out > API-route until pain emerges

The `--force-regenerate` bypass for running-week locking shipped with
both a Python CLI flag AND a `workflow_dispatch` input on the GitHub
Actions workflows. Adding a dashboard button could either (a) POST
directly to the GitHub API via a Next.js route + Vercel-side PAT, or
(b) link out to the GitHub Actions "Run workflow" panel.

Picked (b). The 2-click cost of the link-out is invisible to the
operator (audience size = 1), and skipping the secret-on-Vercel
removes a high-blast-radius credential. The disclosure copy
*doubles as documentation* — it tells the operator why the lock
exists and what they're flipping. An API route hides that context
behind a single button click; arguably worse for ops literacy.

**Rule going forward:** when adding a UI surface for an existing
CLI escape hatch, default to link-out + clear copy. Promote to API
route only when (a) operator pain emerges from extra clicks, or
(b) an audit-log requirement materializes. "We could automate it"
isn't a reason to hold a workflow-write PAT in production env.

## 2026-04-29 — "Skip stage X on mode Y" needs an explicit guard at the stage, not just the mode dispatch

When implementing `--mode midweek` for the Sprint P7 mid-week diagnosis
cron, the dispatcher in main.py looked correct:

    run(skip_calendar=True, skip_preagg=True, midweek_mode=True, ...)

But strategy still ran. Why: `run()` doesn't have a `skip_strategy`
parameter. Strategy is gated INSIDE the function body by other
conditions (`insights_engine_used`, `skip_claude`, `claude_failed`,
`diagnosis is None`). None of these matched mid-week mode, so
strategy generated for the running week and clobbered the previous
Monday's strategy.

**Rule going forward:** when adding a new "mode that skips stage X",
add an explicit `if mode_x: skip` guard AT THE TOP of stage X's
block. Don't rely on the dispatcher to enumerate every skip flag.
The dispatcher is correct in spirit ("--mode midweek skips strategy")
but the actual stage code needs to opt out via its own conditional.

Cost of this miss: one wasted live mid-week run that polluted
Strategy_Log with a partial-week row. Recovered by adding an explicit
`if midweek_mode: ... skip` block at the strategy stage start.

## 2026-04-29 — Composite scoring needs a unit-mismatch normalizer; trend charts need a different one

Two different composite-style problems on the dashboard with
DIFFERENT solutions:

**Composite ranking (across rows at one time)**: each metric
percentile-rank within the population (0..1). Average percentiles
across metrics. Why percentile: it's a ranking-among-peers question
("how does this row compare to others on each metric"). Implemented
in `compositeScore()` / `groupStatCompositeScore()`.

**Composite trend chart (across time)**: percentile across time
doesn't make sense ("this Tuesday's reach was at the 80th percentile
across the period" is true but misleading — what users want is "did
the metric trend up or down?"). Right answer: per-series % of own
peak. Each metric peaks at 100% on its own scale; lines become
shape-comparable while raw values stay in the tooltip. Implemented
in `<MultiLineTrendChart>`.

**Rule going forward:** composite math depends on the question.
Ranking-among-peers → percentile rank. Trend-over-time → % of own
peak. Don't reuse the wrong one — they look similar in the URL
(`?metric=reach,interactions`) but the rendering math differs.

## 2026-04-28 — "Selector visible everywhere" ≠ "selector re-keys everything"

When wiring the page-level MetricSelector, I shipped Trends/Timing/Reels
with the SELECTOR rendered but only Overview + Explore deep-wired.
Reasoning at the time: selector visibility gives URL persistence + the
right vocabulary; per-chart re-keying is incremental.

User QA caught the gap on the very first check — picked Shares on
Explore, expected "Reach Over Time" to flip to "Shares Over Time" and
"Performance by Pillar" to rerank by shares. Both were still showing
reach. The selector being VISIBLE created the expectation that
selection PROPAGATES. Visible without propagation is broken UX, not
"shipped foundation."

**Rule going forward:** if a control is visible on a page, it must
visibly affect things on that page. Otherwise it's misleading. When
deferring deep-wire work, defer the SELECTOR too — don't ship
half-wired UI that lies about what it does.

The fix took 5 atomic commits across 4 pages, ~2 hours. Cheaper to
have done it right the first time. The only true exception is
"categorical/count things" (Format Distribution, Daily Posting Volume)
that genuinely don't have a comparable metric — explicitly call those
out in the chart's caption ("invariant to active metric").

## 2026-04-28 — When 2 metrics aren't comparable in raw units, percentile-rank first

Tried to ship multi-metric ranking as "average the raw values" — but
reach is in 10000s and engagement rate is 0.X%. A simple average puts
all the weight on whichever metric has the larger numeric scale.

Right move: percentile-rank each metric within the population first
(0..1), then average. A row at the 90th percentile on reach and 80th
percentile on engagement rate gets composite = 0.85, regardless of
the underlying units.

This is true for any "multi-criteria scoring" UI — OKR scorecards,
real-estate listings ranked by price + proximity + size, etc. The
unit mismatch problem is universal; percentile-rank is the universal
fix. Reused in `compositeScore()` (per-row) and
`groupStatCompositeScore()` (per-group) in lib/aggregate.ts.

## 2026-04-28 — Server-rendered <Link> selectors are simpler than client state

For URL-persistent selectors (WeekSelector, MetricSelector,
FormatHourMetricPills), there are two implementations:

A. **Client component**: useState for selection, useRouter().push() to
   change URL on click, useSearchParams() to read.
B. **Server component**: pills are <Link> elements that point to the
   updated URL. The page server-renders with the new searchParams.
   No client state at all.

Picked B for all three Sprint P7 selectors. Why:
- Zero client-side hydration cost (the pill bar is a few <a> tags).
- The URL IS the state — refresh / share / back button all work
  trivially without extra plumbing.
- No "loading" state mid-toggle — Next.js handles the navigation +
  re-render natively.
- Code is shorter (no useState, no useRouter, no useSearchParams).

The one caveat: clicking a pill triggers a full server re-render of
the page. For pages that fetch heavy data, that's slower than a
client-side toggle. We mitigate with `scroll={false}` on the <Link>
so the viewport doesn't jump; revalidate=300 caches the data fetch
for 5 min so successive toggles within that window are fast.

## 2026-04-28 — `force-regenerate` CLI flag covers v1 unlock without UI work

When implementing running-week locking on Strategy / Content_Calendar /
Plan_Narrative writers, the immediate question was: "how does someone
intentionally regenerate?" Two paths:

A. v1 also ships a UI button on the dashboard that writes an unlock
   flag to a sheet column. The pipeline reads it on next run, bypasses
   the lock, then resets the flag.
B. v1 ships a CLI-only `--force-regenerate` flag. UI button deferred
   to v2.

Picked B. Why: the lock + UI button are independent pieces. The lock
provides the safety (default behavior). The UI button is a CONVENIENCE
for when someone wants to override. Locking is the core feature; UI is
ergonomics. Ship the safety now; ergonomics can be a 1-day v2 commit
when we actually need it (haven't yet).

`--force-regenerate` works via Actions UI workflow_dispatch (the
weekly-analysis.yml + midweek-diagnosis.yml both expose it as an
input). Power user can trigger a re-run with the flag set. That's
already 90% of the unlock UX without any dashboard code.

## 2026-04-28 — Brand-audit baseline tracks file paths; `git mv` migrations need baseline edits too

When renaming `app/strategy/page.tsx` → `app/diagnosis/page.tsx` via
`git mv`, the brand-audit script reported a regression:
`1 new violation type(s) beyond baseline · organic-social-dashboard/app/diagnosis/page.tsx`.

Root cause: `.brand-audit-baseline.json` keys violations by file path.
A `git mv` preserves the git history but the file path is new, so all
the previously-grandfathered violations are now "new violations on a
new file" from the audit's POV.

Fix: edit the baseline JSON in the same commit as the rename — change
the key path from `app/strategy/page.tsx` to `app/diagnosis/page.tsx`,
keep the violation count identical. Audit goes back to clean.

**Rule going forward:** any `git mv` of a tracked-by-baseline file
needs a paired baseline-key rename. Same commit. Doesn't count as
"new violations" — just a path migration.

Discovered during Sprint P7 Phase 1 Strategy → Diagnosis rename.

## 2026-04-28 — Sheet-overwrite-on-write blocks historical-week selectors

Tried building a "This / Next / Last week" selector for `/plan` in
Phase 1; discovered `getCalendar()` reads from `Content_Calendar`
which the pipeline OVERWRITES each Monday (not appends). So at any
moment only one week's calendar exists in the sheet — historical
weeks aren't preserved.

Building the selector anyway would render two empty tabs (This week
+ Last week always blank), only Next week populated. Cargo-cult UX.

**Fix:** promoted the selector to Phase 2 alongside locking. Phase 2
changes the pipeline writer from overwrite to append-by-week, which
is what makes the selector meaningful. Same dependency for
Outcomes copy update — the shared `<WeekSelector>` component
(used by all three pages) only ships when the data underneath
supports multiple weeks.

**Rule going forward:** before building a UI that needs historical
data slices, audit the underlying sheet writer. Overwrite-on-write
patterns can't support history-aware UIs without a writer change first.

## 2026-04-28 — `new Date()` and `getDay()` are runtime-timezone, not BDT — wrap them in bdtNow()

Symptom: dashboard "Last 7 days" range-picked windows silently
excluded posts created in the BDT 00:00–05:59 window of the
start-of-range day. AI cost weekly bucket sometimes put runs in the
wrong week. Both rooted in the same class of bug.

**Root cause:** JS `new Date()` returns the runtime instant in the
runtime's timezone. On Vercel prod that's UTC. `getDay()`, `getDate()`,
`getMonth()`, `getHours()` etc. all read the runtime-local view of
the Date. So `daysAgo(7).setHours(0,0,0,0)` produces "7 days ago at
UTC midnight" — which is BDT 06:00 of that day. Posts created BDT
00:00–05:59 of that day numerically precede the cutoff and get filtered
out.

The codebase already had `bdt(iso)` for converting UTC FB timestamps
to BDT-as-local (strips the +06:00 offset, parses naive). But there
was no equivalent for "now" — every caller used `new Date()` directly.

**Fix:** added `bdtNow()` to lib/aggregate.ts. Same convention as
`bdt(iso)`: returns a Date whose `getFullYear()` / `getMonth()` /
`getDate()` / `getHours()` etc. return BDT wall-clock. Implementation:

```typescript
export function bdtNow(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
  );
}
```

The `en-CA` locale gives ISO-shaped date components and 24h time, so
the stitched string is a valid naive ISO local-time literal that
`new Date()` parses without applying any offset.

**Rule going forward:** any time you reach for `new Date()` to build a
"now" value that will be compared against a `bdt(iso)`-shifted Date,
or used for calendar reasoning (week boundaries, month boundaries,
day-of-week buckets), use `bdtNow()` instead. `new Date()` is fine
for absolute-instant math (staleness diffs in milliseconds, "did this
happen before that") because both sides are UTC instants.

Don't use `Date.now()` either — same problem, returns the absolute
UTC instant. Use bdtNow.

**Where to use the existing helpers:**
- `bdt(post.created_time)` — convert a single FB UTC timestamp to BDT-as-local
- `bdtNow()` — current "now" in BDT-as-local
- `dateStr(d)` — `YYYY-MM-DD` string from a (BDT-shifted) Date
- `Intl.DateTimeFormat({ timeZone: "Asia/Dhaka" })` — for displayed strings to
  the user (the `bdt*` helpers are for math, this is for rendering)

## 2026-04-28 — Hover popovers with a visible gap need a setTimeout-close + popover-side handlers

Symptom: user moves mouse from trigger toward popover to click "Open
on Facebook"; popover disappears before the mouse arrives. Reported
on `/strategy` PostReference but applies to every popover the
codebase has shipped with this pattern.

**Root cause:** popover at `top-full mt-1` (4px gap from trigger).
The mouse traverse fires `mouseleave` on the trigger before
`mouseenter` on the popover. `setOpen(false)` runs synchronously,
the popover unmounts, the mouse never reaches it.

**Fix that works (Radix HoverCard pattern):**
1. Close on a `setTimeout` (~180ms) instead of synchronously.
2. Cancel that timeout on `mouseenter` of the popover (so hovering
   the popover keeps it open) and re-schedule on the popover's
   `mouseleave` (so leaving the popover closes it normally).
3. Clear the timer on unmount to avoid stray state updates.

```tsx
const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 180); };
useEffect(() => () => cancelClose(), []);

// trigger
onMouseEnter={() => { cancelClose(); setOpen(true); }}
onMouseLeave={scheduleClose}

// popover
onMouseEnter={cancelClose}
onMouseLeave={scheduleClose}
```

**What didn't work:** removing the `mt-1` (zero gap eliminates the
traverse). It works on desktop but causes the popover to overlap
the trigger — readability suffers, and a touch-tap-to-toggle UX
gets confused because the popover area now covers the trigger area.
The timeout pattern is the right answer; keep the visual gap.

**Rule going forward:** any new popover/hover-card we add MUST have
the timeout-close pattern. Don't ship `setOpen(false)` synchronously
in `onMouseLeave`. Add it to `components/InfoTooltip.tsx` next time
that file is touched.

## 2026-04-28 — Disclosure summaries can host independently-clickable affordances via stopPropagation

Wanted to add a "view source post" icon link inside a `<summary>` row
without it triggering the disclosure expand/collapse. Native
`<details>` toggles on any click within `<summary>` by default, so a
nested `<a>` inside the summary will both navigate AND expand the
disclosure (jarring).

**Fix:** `onClick={(e) => e.stopPropagation()}` on the inner anchor
keeps the click from bubbling to the summary, while the `href` +
`target="_blank"` still navigate. Tested: clicking the icon opens
Facebook in a new tab; clicking the headline still expands the
disclosure. Both flows preserved.

**Note:** this works for clicks but not for keyboard activation —
`Enter`/`Space` on the link does navigate but also toggles the
disclosure when focus is on the summary. For keyboard users the
focus order goes button → icon → chevron, so `Enter` on each lands
correctly without overlap. Acceptable for now.

## 2026-04-23 — Recharts axis labels can't host React popovers (use HTML list when labels are content)

When a chart's Y-axis labels are user-generated text (captions, post
titles, free-form strings) **and** you need click/hover affordances
on them (full-caption tooltip, outbound permalink), Recharts is the
wrong tool. YAxis tick labels render as SVG `<text>` nodes inside
the chart's `<svg>`. You can't mount a React popover there cleanly:
pointer event propagation through SVG is quirky, foreignObject has
cross-browser sizing bugs, and Recharts' layout math assumes static
tick widths.

**What I tried:** keeping BarChartBase and stacking PostReference
chips underneath as a parallel list. Felt redundant — users saw the
caption in the chart AND in the list below. Dropped.

**What worked:** replace the chart with an HTML `<ol>` of ranked
rows (rank badge + PostReference + CSS-flex proportional bar + value).
The flex-width percentage reproduces the bar-chart-ordering at-a-glance
signal; the HTML rows let PostReference mount cleanly with hover +
tap popover.

**Rule going forward:** if Y-axis labels are content (identifiers,
not categories), skip Recharts. Use a `<ol>`/`<table>` with a
proportional CSS bar. Recharts is for numeric axes and short
categorical labels where interactivity on the label itself isn't
needed. Already applied to `app/reels/page.tsx` Top 10 by Plays,
Watch Time, Followers Gained.

## 2026-04-23 — aspect-square heatmap cells explode vertically at desktop widths

Used `aspect-square min-h-[18px]` on Heatmap.tsx cells. At mobile
(360-414px) cells were ~12-15px — fine. At desktop 1280px+ the
container width divided by 25 columns (label + 24 hours) yielded
~50px per cell, so aspect-square made each row ~50-80px tall, and
7 rows × 2 heatmaps pushed the second grid well past the fold.

**The screenshot feedback was "too extended vertically, not even
visible in computer window"** — classic aspect-square-on-wide-grid
failure mode. Fixed to breakpoint-driven heights: `h-[20px]
sm:h-[22px] lg:h-[26px] min-h-[18px] w-full`. Grids are compact and
scannable in one glance at every breakpoint now.

**Rule:** aspect-square is right for small grids where cell size
scales with container. For wide grids (24+ columns), the aspect
ratio amplifies container width into cell height — clamp with fixed
heights instead.

## 2026-04-23 — brand:audit catches slate-* regressions I almost shipped

Added `text-slate-500` and `text-slate-700` in the Strategy Source
posts blocks without thinking — muscle memory from other projects.
Brand audit flagged it immediately: "1 new violation type(s) beyond
baseline (295 total, baseline 292)". The 4 new violations were in
lines I added that session; the audit correctly didn't flag the 31
grandfathered ones in the same file.

**The ratchet worked exactly as designed:** grandfathered violations
stay invisible, but any new slate-* / gray-* / zinc-* in a line I
touched this session blocks the commit. Fixed to `text-ink-muted` /
`text-ink-secondary` and the audit went 292 → 291 (actually cleaned
up a bit, not just stayed flat), then ratcheted the baseline down
via `--write-baseline` so the next regression check is tighter.

**Rule:** run `npm run brand:audit` AS PART OF the pre-commit dance,
not after committing. It catches new regressions cheaply and gives
the "clean up on touch" opportunity before diff review.

## 2026-04-23 — "Wired writer" can still mean the sheet drops the field on the floor

The v5 wiring audit flagged DYN-03 (hook_fatigue_flag +
hook_fatigue_reason) as a "one-line dashboard reader fix". The writer
reference in the audit pointed at `classify.py:216,2574` — where
`annotate_hook_fatigue` mutates the classification dict in memory.
Looked fine. But when I opened `sheets.py` to confirm the column
headers, `write_classifications` only serialized 17 of the 19
populated dict keys. The annotator ran, mutated the dict, and the
sheet writer just… didn't have those two positional slots in its
header list.

The fix was cross-repo (sheet schema bump APPEND-only to 19 cols +
dashboard reader), not one-line. Takeaway: when auditing whether a
field reaches the UI, `grep` for the **column header string** in the
sheet writer, not the Python attribute name. `hook_fatigue_flag` got
hits in `classify.py` / `main.py`; `"Hook Fatigue Flag"` got zero
hits anywhere until this commit added it. The header list in
`write_classifications` is the actual writer — everything upstream
is just in-memory chatter.

Corollary for future audits: any "wired but orphan" or "silent drop"
entry should cite both the Python field key AND the exact column
header string the sheet carries. If the second one doesn't exist,
the write never happens regardless of how many callers set the
attribute.

## 2026-04-23 — Don't trust naive ISO strings from cross-process writers

The dashboard reads `Analysis_Log.last_run_at` (and several similar columns)
as ISO strings from Google Sheets. It then does the right thing: parses
with `new Date(...)`, formats with `toLocaleString(..., { timeZone:
"Asia/Dhaka" })`. That's correct — **provided the string has a timezone
marker**.

The pipeline was writing naive `datetime.now().isoformat()` strings. No
offset, no `Z`. On the dashboard side, `new Date("2026-04-23T14:35:00")`
in Node (UTC runtime) parses as UTC, not BDT. The `toLocaleString` then
adds +6h, and users see 20:35 when the pipeline actually ran at 14:35.

The fix lived on the pipeline side (switch to `datetime.now(timezone.utc)
.isoformat()` — pipeline commit 0b70da8). But the dashboard-side takeaway
is: **a timestamp without a tz marker is a bug, not data**. If a future
reader needs one of these columns and the string has no offset, treat the
writer as broken — don't paper over it with ad-hoc `+6:00` assumptions in
the reader. The reader's job is to trust the offset.

Class-of-bug marker for future readers: if a "last X at" value displays 6h
off (or any whole-number hours matching a real tz delta), check the writer
before debugging the reader.

## 2026-04-23 — New UI additions slip slate-* through even with brand audit baseline

Added three schema-v2 surfacings to `/plan`. First pass used
`text-slate-300` for a middot separator matching the surrounding
visual pattern. Audit caught it on the next pass:
"+1 slate-* Tailwind class (was 28, now 29)."

Two takeaways:

1. The ratchet baseline is asymmetric on purpose — grandfathered
   violations in the same file don't shield new additions from being
   flagged. "Was 28" is the budget; any increase fails. Good.
2. Muscle memory kicks in when copy-patterning off nearby code. When
   the surrounding lines all read `text-slate-*`, the reflex is to
   match rather than look up the token. The fix is a mechanical
   replace (`text-slate-300` → `text-ink-200`), but the habit is the
   real fix.

Rule of thumb: before committing any UI change, grep the diff itself
for `slate-\|gray-\|zinc-` — faster than waiting for the audit. If
the grep is empty, the audit will pass.

## 2026-04-21 — Palette discipline needs a scriptable audit, or the palette drifts

The Shikho v1.0 rollout did a wide remap across three surfaces, then I claimed
"done." Running `npm run brand:audit` immediately found **308 residual
violations**: `text-slate-500` still in engagement pages and StalenessBanner,
three legacy hexes still in `report.py`, Inter font still in an archived deck
and START_HERE.html. Human-scale sweeps miss human-scale things; a 200-line
component has dozens of colour classes and the eyeballing miss rate is high.

Rule: **every brand rule gets a grep-based audit before it's considered
enforceable.** The rule in CLAUDE.md is advisory; the script is the contract.
Same pattern as the mobile checklist (which would also benefit from a linter,
but that's a harder script to write).

Audit design notes worth reusing for future contracts:

- **Zero dependencies.** Node stdlib only. Surviving `npm install` is one
  fewer failure mode.
- **Ratchet baseline, not absolute.** Real codebases carry legacy. An absolute
  audit that fails from commit 1 gets disabled within a week.
- **Regressions report the delta, not the full list.** When a commit introduces
  a new violation, the output shows only the new lines, not the 300 legacy
  ones — otherwise the signal drowns in noise.
- **Opt-in verbose.** `--list` prints everything for audits/cleanups.
- **Document the ratchet ritual.** Re-running `--write-baseline` after cleanup
  must be explicit — automatic silent updating defeats the contract.

## 2026-04-21 — Cross-repo brand rollouts: swap hex inside the config, never the class names

Rolling out Shikho v1.0 across dashboard + pipeline + master HTML decks had two seductive
forms: (a) rename tokens to match the new design system ("brand-indigo-400" not
"brand-shikho-indigo"), or (b) keep every class in every component and just change the hex
behind the existing tokens in `tailwind.config.ts`. (a) feels cleaner in isolation; (b) is
what actually works when the same repo has 40+ component files, 8 pages, and two sibling
surfaces (Python-generated HTML + standalone docs) that don't share the Tailwind config.

Rule: **for any palette shift, the rename cost compounds with every consumer surface.** The
config remap is O(1) regardless of how much UI exists. Only rename when the semantics of
the token genuinely change (e.g. adding `brand-shikho-coral` as a new token because
nothing previously mapped to that role), never because the new palette uses different
vocabulary.

Corollary for the Python reports + master HTML: they each have their own `:root` block with
a palette vocabulary. When rolling out, touch each `:root` + the font-family + any hardcoded
rgba tuples that were written before the CSS variables existed (ripgrep for `rgba\(` and
remap the exact tuples). Don't try to unify the vocabulary across surfaces — let each
surface keep its own role-based names (`--shipped`, `--v2`, `--p1`) and just remap the hex.

## 2026-04-21 — Raw URL params leak into UI copy when the fallback path isn't thought through

**Context:** live-check on `/strategy?archived=true` and `/plan?archived=true`
revealed both pages rendering the literal string "true" into visible copy
("Archived diagnosis for week ending **true**" / "Viewing archived run from
**true**"). "true" is a valid test-case for an archival mode — user typing
`?archived=true` to see what the empty archival state looks like is
reasonable — and the correct response is graceful degradation, not exposure
of the raw param as if it were data.

**What went wrong:** both pages had a shape like
`archivedParam ? resolveToDate(archivedParam) : ""` but the resolver (e.g.
`getDiagnosisByWeek("true")` or `new Date("true")`) returned a falsy/NaN
value, and the callsite fell back to `archivedParam` as a label — assuming
the resolver always succeeded. Then the PageHeader template-literal stitched
it into "for week ending true" without a guard.

**Takeaway:** any place a URL param reaches user-facing copy needs three
states, not two: (1) resolver succeeded → show resolved label,
(2) resolver failed but param is present → show a generic "archived run"
label, (3) no param → show the live variant. The distinction between (1)
and (2) has to be made explicitly at the callsite; a one-line ternary that
collapses "no data" with "no param" leaks the param. Defence in depth at
the component layer (`looksLikeDateLabel` in `ArchivalLine`) is belt-and-
suspenders but the real fix is the page not passing the raw param in the
first place.

## 2026-04-21 — `?archived=` changes the ROUTE but not always the DATA

**Context:** wiring `?archived=<run-id>` on `/strategy` and `/plan` to
read an archived diagnosis / calendar from Sheets.

**What went wrong:** the first cut passed `searchParams.archived` to the
page component but the `Promise.all` block still called `getDiagnosis()`
(latest) and used that for the body. The archival URL changed the
subtitle ("Viewing archived run from Apr 11") but the chart and cards
rendered live data. Spotted only because the Apr 11 headline contradicted
the cards' engagement numbers.

**Takeaway:** when a URL param selects a DATA source, every read that
depends on that data must branch on the param. The cleanest pattern:

```tsx
const [..., liveDiagnosis, archivedDiagnosis, ...] = await Promise.all([
  ..., getDiagnosis(), archivedParam ? getDiagnosisByWeek(archivedParam) : null, ...
]);
const diagnosis = isArchival ? archivedDiagnosis : liveDiagnosis;
```

Fetching both in parallel costs nothing (the Sheets read is already
the dominant latency), and the single `diagnosis` variable prevents the
rest of the page from re-deciding which source to use.

## 2026-04-21 — AI-off is NOT the same as stale

**Context:** first pass at the 4-state `StalenessBanner` collapsed
`ai-disabled` into the `warn` state — because the data IS days old, so
"stale" feels right.

**What went wrong:** conflates two different user actions. Stale data
means "the pipeline tried and failed / the cron didn't run / something
is broken". AI-off data means "the operator deliberately ran the no-AI
workflow OR Anthropic credits ran out and the fallback kicked in" —
both are recoverable by the operator (re-run with AI on, top up
credits). A warn banner tells them to investigate the pipeline; an
ai-disabled banner tells them to investigate their AI spend. Different
fix, different CTA.

**Takeaway:** when two states share a visual signal (old data), split
them by what action the user should take. Color (amber vs slate+indigo),
copy ("diagnosis is N days old" vs "diagnosis is OFF this run"), and
the expandable detail panel's contents all differ now.

## 2026-04-18 — "Data as of" is a rendering timestamp lie

`PageHeader` showed `new Date()` formatted into BDT under the label
"Data as of". That read as "here's when the data was refreshed", but
what it actually meant was "here's when Next.js rendered this HTML".
For a pipeline on a weekly cadence, the gap between those two answers
can be six days — and the header was actively misleading during every
one of them. The root cause is using render time as a stand-in for any
data-freshness question. Whenever a UI element implies "freshness",
the source has to be the actual last-write timestamp of the data
(`Analysis_Log.Run Date` in this case), not a `new Date()` anywhere
in the render path. Render time is only honest when it's labeled as
such — we now fall back to "Rendered <timestamp>" when no scrape
timestamp is available.

## 2026-04-18 — Off-by-one in rangeDays tipped charts into the wrong adaptive gate

`minPostsForRange()` is an adaptive min-N floor keyed to the selected
window. A 30d range should unlock the 10-post gate; a 60d range steps
up to 15. But Engagement and Strategy computed range length as
`daysBetween(start, end) + 1` and Timing used `Math.round`, both of
which turned a 30-day window into 31 — pushing every computation into
the 60d bucket. Most groupings never cleared 15 posts, so page after
page rendered empty charts that LOOKED like "no data in range" when
the data was actually there, just gated one bucket too high. The fix
was trivial (a shared `rangeDays = Math.floor(ms/86_400_000)`); the
lesson is that any off-by-one in an input to an adaptive threshold
becomes invisible — the charts don't crash, they just quietly wrong-
gate. Centralize range math so this can only happen in one place.

## 2026-04-18 — Min-n thresholds in sparse grids hide more than they reveal

The Day × Hour heatmap has 168 cells. A page with 50 posts in the
range averages 0.3 posts per cell. At a floor of `max(2, MIN_N/2)`
(which was 5 for 30d, 8 for 60d), the grid rendered ~95% grey. The
lesson: a binary "above/below min-n → full color / flat slate" cutoff
in a sparse grid visually communicates "we have no data" even when
what we actually have is low-confidence data that's still informative.
Fix: keep min-n for the summary stats above the heatmap, but render
cells with opacity-weighted color (n=1 at 0.4 confidence, n≥minN at
1.0). The eye still distinguishes strong from faded, sparse from dense,
and zero from low — without blanking 160 of 168 cells.

## 2026-04-18 — Staleness banner's null-timestamp branch screamed at users staring at data

`computeStaleness` returns crit with `days_since = -1` when
`Analysis_Log` never recorded a "Last Successful X At" timestamp. The
banner rendered a red "No successful refresh recorded yet" warning
— correct in the log sense, but surreal to a user looking at a page
that was obviously rendering the latest weekly verdict. The failure
mode is taking a meta-observation about logging ("we don't know when
the last success was") and presenting it as a claim about content
("the data is broken"). Fix was a `hasData` prop that re-reads the
situation: if the page has something to show AND we can't verify
freshness, that's "freshness unknown" (info-style slate), not "stale"
(crit-style rose). The real crit — no data AND no record — stays rose.
Principle: banners are a claim about content quality; when the signal
is really about logging/observability, say that, in the language of
logging, not in the language of stale data.

## 2026-04-18 — Single-bar charts without maxBarSize read as "mandatory signal"

When only one category cleared the reliability gate, Recharts drew
that lone bar at the full width of its container (~900px on desktop).
The visual result was a giant monochrome bar that read as "the one
true answer" — when the underlying truth was "only one category had
enough posts to rank, don't over-weight this". Capping `maxBarSize={56}`
brings it back to a reasonable thickness so the reader correctly sees
"one category in a chart that could hold many". Multi-bar charts are
untouched — Recharts still shrinks bars below the cap when many share
the axis. Generalizes: any viz that scales a visual mark with
denominator needs a cap, or sparse denominators produce false
emphasis.

## 2026-04-18 — Day-of-week matching isn't enough for "Today" highlighting

Plan shows next week's calendar (Sun → Sat). On a Saturday, matching
"Today" by `day-of-week === currentDay` correctly identified Saturday
in the calendar — but Saturday-in-the-calendar is NEXT Saturday, not
today. The user saw "Today" highlighting a date a week away. Fix
requires dual check: weekday match AND actual calendar date match via
a BDT-formatted `YYYY-MM-DD` key. Weekday alone is never sufficient
for recurring week views.

## 2026-04-18 — The display layer hides data-integrity issues under false precision

A full data-sanity audit across every view found six distinct bugs, and
the pattern across all six was the same: the math was correct, but the
display layer was taking a null / zero / low-confidence / single-cut
result and rendering it with confident typography that read like a real
measurement.

Examples from the audit:

- A label said "Like + Care" but the value was just `like`. The typed
  formatting "12,345 Like + Care reactions" reads as a composite even
  when the sum is one term.
- A recommendation card averaged format-ER and pillar-ER and displayed
  "combined engagement rate of X%". The arithmetic works; the claim
  doesn't — the two cuts are measured on different post sets.
- Best-X cards fell through to `(winner?.rate || 0).toFixed(2)` with no
  winner, rendering "Best Format: — · 0.00% eng rate". The zero looks
  like data.
- "Reliable floor 0" from `Math.max(0, lowerBound95)` where the actual
  lower bound was negative. Reads as a guaranteed minimum; is actually
  "variance is too wide to commit to a floor".
- "1 pillars shown", "1 weeks", "n = 1 posts" — not wrong, but the
  plural form makes a one-data-point chart feel like a trend.

Takeaways for next time:

1. **When labels name multiple things, the value must sum them.** Every
   "A + B" / "A & B" / "A and B" label needs a grep of the computed
   value to confirm both terms are included. Treat any multi-term label
   as a claim that can lie.
2. **Composition of group-by statistics is almost always invalid.**
   Averaging `ER_by_format` with `ER_by_pillar` is not a combined ER —
   it's the mean of two means measured on different cuts. If you find
   yourself writing `(x.rate + y.rate) / 2` on grouped output, stop.
3. **Fallback values should fail loudly, not silently.** `x || 0`
   rendered in bold typography is worse than showing "—" or a null-state
   card. The zero inherits the confidence of the real numbers next to
   it.
4. **Every CI lower bound display needs a ≤ 0 guard.** Clamping to zero
   before display turns "variance too wide to call a floor" into "the
   floor is zero". Let the reliability label carry the variance story;
   suppress the numeric floor when the CI crosses zero.
5. **Plural-aware copy is a sanity check, not a polish pass.** "1
   weeks" and "1 reels" don't just read awkwardly — they erode trust in
   the rest of the numbers on the page. Do the guard at the site where
   the count is interpolated, not in a helper; the conditional is
   one-liner overhead.
6. **Audit display copy against source columns.** Anytime a label names
   a raw field (Like, Care, Sad, Wow), grep `lib/sheets.ts` to confirm
   the column actually exists in Raw_Posts. Labels drift when upstream
   schemas change and downstream copy doesn't.

The audit also surfaced two issues that were noted but deferred (not
shipped in commit 994a0b6): (a) timezone asymmetry in Overview where
post filters use BDT wall-clock but daily-metrics filters parse
`YYYY-MM-DD` as UTC, producing ~6h boundary fuzziness at range edges;
(b) Trends' `weekKeys` dedupe parses date strings as UTC while
`weekBuckets` uses BDT, so a Sunday post in BDT that's Saturday in UTC
can land in two different week keys. Both are edge-case and not worth
a separate fix pass yet — flagged here so the next touch on those files
catches them.

## 2026-04-18 — Functions cannot cross the RSC boundary in Next 14 production

`/timing` crashed with a generic Server Component error on every production
load (reference 2007790820). First fix (015b048) added NaN guards around
`grid[day][hour]` array indexing — those were plausible defensive code but
not the actual bug. Second production browse still 500'd with the same
digest. That same-digest signature was the giveaway: Next.js error.digest is
derived from the error MESSAGE, not the stack trace. Same digest across
commits meant the same error message was still being thrown, just from
slightly different code paths after the first fix.

Actual root cause: the Heatmap client component received `valueFormat` as an
inline arrow function passed down from the Server Component:

    valueFormat={(v) => v.toFixed(2) + "%"}

Next.js 14 App Router cannot serialize a plain function across the RSC
boundary. Only Server Actions (functions marked with 'use server') are
allowed. Passing any other function throws:

    "Functions cannot be passed directly to Client Components unless you
     explicitly expose it by marking it with 'use server'."

`next build` does NOT catch this — the build succeeds, the types check,
the dev server only logs a warning. It shows up only when production
actually tries to serialize the render tree, and only on pages that
actually pass a function to a client component (here: just /timing, because
it's the only consumer of `<Heatmap>`).

Fix: replace function props with serializable descriptors. `valueFormat` is
now a `"percent" | "number"` string enum, and Heatmap owns the format logic
internally (fine, it's already a client component).

### Detection heuristics for this failure class

1. **Same digest across commits that change page code** = same error
   message, likely a serialization throw at the RSC boundary, not a code
   path you fixed.
2. **Page compiles + next build green + dev works + prod 500s** = classic
   RSC-only issue. Dev doesn't round-trip through the full serializer.
3. **Only one page affected even though the bad file is shared** = that
   page is the only one exercising the bad prop. Audit consumers.

### Preventive guardrails

- **Prop audit for every new client component**: functions, class
  instances, Dates, Maps, Sets, Symbols, and non-plain objects cannot be
  passed from a Server Component. Use enums / primitives / plain objects.
- **Default function props with fallback strings**, not fallback functions,
  so a future caller from a Server Component can't fall into the same
  trap.
- **When in doubt, grep for `<ClientComponent` across `app/` and check
  every prop**. If a prop's value starts with `(` or is a function
  reference, it's a bug waiting to hit prod.

### What to do differently next time

Don't assume a "possible-looking" bug explanation is the right one.
015b048's NaN guards were a plausible-sounding fix, defensible in review,
and technically correct (the guards ARE needed for a different latent
bug). But we never verified the fix removed the actual symptom before
declaring it done. The signal we missed: error digest is a hash of the
error message in Next.js — same digest across builds = same error still
throwing. Verify in production, not just in a passing build.

Fixed in 9e60773.

## 2026-04-18 — Sticky toolbars need to know how tall the nav is (Batch 3b)

Explore's sticky filter toolbar at first was `sticky top-0 z-30`. The
nav is `sticky top-0 z-50`. Both fire sticky at the viewport top — the
higher z-index wins the pixel, so the toolbar slid BEHIND the nav and
became invisible once scrolled. The symptom was "I scrolled past the
nav and my filter is gone."

Fix: measure the nav's full rendered height. Desktop Nav stacks a
`h-14` (56px) logo row above a `py-2.5 text-sm` tab row (~40px) = ~96px.
Mobile Nav stacks logo row (56) + dropdown button row (~48) = ~104px.
Set `sticky top-[104px] md:top-24 z-30` — toolbar pins immediately
below the nav, still below nav in z-order so it can't fight for the
top edge.

Second gotcha: the Explore page body is inside `<main class="px-6">`.
Applying the sticky toolbar inside that container means background
color stops at the padding gutters, looking like a floating pill. Fix
with `-mx-6 px-6` — negative margin extends to the main edges, padding
puts content back where it was. The toolbar now reads as a full-bleed
bar flush with the page edges.

Takeaway: sticky positioning is relative to the nearest scrolling
ancestor, and it doesn't KNOW about other sticky siblings. If the
header is sticky at top-0, every OTHER sticky below it needs an
explicit `top` greater than the header's height. For full-bleed sticky
bars inside a padded container, `-mx-{n} px-{n}` is the one-liner.

## 2026-04-18 — React's useId is the right primitive for aria-describedby (Batch 3c)

InfoTooltip's (i) button needed to announce its definition to screen
readers on focus. The typical broken versions:

1. `role="tooltip"` on the popup text span, nothing else. Screen
   readers never associate the tooltip with the button — the role is
   semantically orphaned.
2. Hardcoded `aria-describedby="tooltip-1"`. Works for one tooltip.
   The MOMENT a page has two (e.g., two ChartCards), both share the
   same id and the association breaks in HTML-spec terms.
3. `Math.random()` id in state. Works, but mismatches between SSR
   and hydration fire a warning and occasionally detach the tooltip.

`useId()` is the exact primitive for this — it returns a stable,
SSR-safe unique id string per component instance. Set
`aria-describedby={open ? id : undefined}` on the button and
`id={id}` on the tooltip; the association is one-line and hydrate-
safe.

Takeaway: when an ARIA attribute references an id, use `useId`. Not
a counter, not a random string, not a hardcoded value. React 18+
ships the primitive specifically for this.

## 2026-04-18 — Heatmap cells need a LOWER min-N than day/slot buckets (Batch 3a)

Per-day/slot KPIs use `minPostsForRange(rangeDays)` — returns 3 for
7d, 5 for 14d, 10 for 30d. A whole day bucket aggregates ~5-10 posts
per day. Applying the same threshold to heatmap CELLS (day × hour
pairs) silently muted most cells: at 30d, a cell needs n>=10, but a
given (Monday, 3pm) cell across 30 days gets ~4 posts at best. The
first render was a sea of dimmed cells.

Fix: `CELL_MIN_N = Math.max(2, Math.floor(MIN_N / 2))` — half the
per-day threshold, floored at 2 so we at least demand two posts
before calling a cell "reliable." Cells now surface meaningful
patterns; genuinely single-post cells are still muted.

Takeaway: if a reliability threshold was calibrated against one
aggregation granularity, it will be too strict at any finer
granularity. Divide the threshold by the relative bucket-size shrink
(here, 24 hours of spread → ~halved min-N works empirically).

## 2026-04-18 — Removed UI leaves ghost variables unless you clean up (Batch 3d)

Collapsing Reels's two-strip layout into one strip deleted 4 Card
elements. The variables feeding those cards — `total15s`, `total30s`,
`denom15s`, `denom30s`, `total15sBucket`, `total30sBucket`,
`totalViews` — were still declared at the top of the component. TS
didn't error (those are just `const` declarations with no specific
type use after), and Next.js's build didn't warn. They'd silently
bit-rot and confuse the next person who edits the file.

Process fix: after removing UI, `grep` the variable names that lived
only in the removed JSX. Remove the dead `const` declarations. Add
a comment where the logic was non-trivial (the bucket-vs-curve
reconciliation here is subtle and might be wanted again) so it's
discoverable instead of lost.

Takeaway: deleting UI is only half of the delete. The compute layer
feeding it is dead too — unless the same values power something
else on the page. Run `grep` on the variables. If they're orphaned,
remove them or leave a pointer comment.

## 2026-04-18 — `<details>` + `group-open:rotate-90` is a free disclosure widget (Batch 3c)

ChartCard's "View data as table" disclosure could've been a
`useState` + `<button aria-expanded>` + conditional render + CSS
transition for the caret. 15+ lines of React, state management, and
keyboard handling.

Native `<details>/<summary>` does all of it for free: keyboard
toggle via Enter/Space, announces expanded state to screen readers,
no JS needed. The one missing piece (caret rotation on open) is a
single-line CSS rule thanks to Tailwind's `group-open:` variant:

```
<details class="group">
  <summary>
    <svg class="transition-transform group-open:rotate-90" />
    View data
  </summary>
  <div>...</div>
</details>
```

No JS, no state, no a11y plumbing. Works in every browser shipped
since 2020.

Takeaway: before reaching for `useState` + `aria-*` to build a
disclosure, check if `<details>` fits. It's a semantic primitive
that's been waiting to be used since Chrome 12.

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
