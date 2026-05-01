# Live-Check Points of View (POVs)

The master reference for QA passes on the Shikho Organic Social dashboard.
Built from the bugs caught in our 2 password-gated live checks (Pass 1
bug-hunting, Pass 2 information-quality + UX). Every "proven" POV below
points to a real fix shipped in v4.4 → v4.7.

This document is **append-only**. New POVs surface during real QA work
and get logged in [`LIVE_CHECK_DISCOVERIES.md`](./LIVE_CHECK_DISCOVERIES.md);
quarterly review promotes the ones that generalized into Tier 2 here.

---

## How to use this doc

| When | What to run | Time |
|---|---|---|
| **Post-deploy** (required gate, alongside `npm run build`) | Tier 1 (10 items) | ~30 min |
| **Major sprint shipped** / **quarterly deep audit** | Tier 1 + Tier 2 (48 items) | ~3 hours |
| **Specific concern** (a11y, perf, locale, bias, etc.) | Tier 3 by category | varies |

If you found a bug that no POV here would have caught — that's a discovery.
Log it in `LIVE_CHECK_DISCOVERIES.md`.

---

## Tags

- ✅ **proven** — caught at least one real fix shipped in v4.x
- 🔵 **speculative** — reasonable lens, hasn't fired yet
- 🆕 **promoted from discoveries** — new POV that generalized through 3+ checks

Cost: 🟢 < 1 min · 🟡 5-15 min · 🔴 deliberate session

---

# Part A — The 12 meta-lenses

These are the **generators**. Each one, applied to a page, produces
specific POVs. Keep this map handy when something breaks but no Tier-1
or Tier-2 POV would have caught it — the meta-lens helps you name and
classify the new POV.

| # | Meta-lens | Mode | Definition |
|---|---|---|---|
| 1 | Mechanical exhaustion | bug-hunt | Exercise every input combination. Don't trust the happy path. |
| 2 | Cross-element consistency | bug-hunt | Things that look alike should behave alike (siblings, pages, colors, icons) |
| 3 | Render-layer integrity | bug-hunt | Output is what we intended. No `\u…`, `undefined`, `[object Object]` leaks |
| 4 | Code-vs-copy alignment | bug-hunt | UI claims match implementation. Threshold strings = constants. Button labels = effects |
| 5 | Time-window honesty | bug-hunt | Data scope is visible. Partial / cached / stale / forecasted all flagged |
| 6 | Structural deduplication | bug-hunt | Same finding doesn't appear in multiple structurally-different sections |
| 7 | Interaction matrix exhaustion | bug-hunt | Touch every control end-to-end. Verify side-effect, not just appearance |
| 8 | Design fitness | critique | Could this be better? Different chart, fewer cards, sharper copy? |
| 9 | Failure-mode coverage | bug-hunt | What does the user see when X fails? (AI bad JSON, sheet rename, 529, etc.) |
| 10 | Temporal continuity | bug-hunt | State persists sensibly across time, deploys, sessions, devices |
| 11 | Trust signal density | critique | How many independent verifications per claim? (formula + n + timestamp + source) |
| 12 | Cognitive cost per insight | critique | Clicks-per-insight ratio. Reads-per-decision. Synthesis-density. |

---

# Part B — Tier 1: must-run every check (~30 min)

10 items. These caught **75% of all fixes shipped across our 2 password-gated checks**.

| # | POV | Backtest evidence | Cost |
|---|---|---|---|
| **T1.1** | **URL parameter matrix exercise** — for every `?` param the route reads, hit at least one non-default value (`?metric=`, `?week=`, `?weights=`, `?range=`, `?archived=`) | ✅ 2 P0 production crashes (composite-mode crash on Overview/Trends, Plan fragment-in-span hydration crash) | 🟡 |
| **T1.2** | **Trust drift / methodology traceability** — every aggregate has formula + n + timestamp + source link visible (or 1 click away) | ✅ 3 fixes (ER reach-weighted tooltip, Hook Retention 25-35% benchmark, Forecast pillar-level disclosure) | 🟡 |
| **T1.3** | **Visual consistency across sibling elements** — rows of similar cards/pills should share treatment (deltas, sublabels, units) | ✅ 2 fixes (AVG REACH/POST missing delta, Followers card visually identical to flow KPIs) | 🟢 |
| **T1.4** | **Tone matches certainty** — no CRITICAL on partial-week data; midweek diagnoses look preliminary, not definitive | ✅ 2 fixes (Calendar Alert hedge-language prompt v1.10, midweek amber color) | 🟡 |
| **T1.5** | **Mon-Sun convention applied uniformly** — every page's week math agrees (week_starting Monday, week_ending Sunday, BDT timezone) | ✅ 2 fixes (Plan fallback banner explicit, Outcomes "Most recent" pill) | 🟡 |
| **T1.6** | **Outlier influence audit** — pull the highest-reach post; without it, do "best format/pillar/hook" winners change? | ✅ 2 fixes (Shares per Post min-n bumped to 5, Trend chart outlier-clip threshold loosened) | 🔴 |
| **T1.7** | **Render-layer scan** — no `undefined` / `null` / `NaN` / `[object Object]` / `\u…` / `${var}` / unfilled-template leaks anywhere on the page | ✅ 1 fix (`–` en-dash leaked in Engagement heatmap caption); covers a whole class | 🟢 |
| **T1.8** | **Cross-page metric reconciliation** — same metric should produce same number across pages (Overview Posts = Explore Posts with no filters) | ✅ 1 fix (Explore missing "Data as of" stamp made cache-window mismatches invisible) | 🟢 |
| **T1.9** | **Hardcoded calendar dates drift** — every static date in code cross-checked vs source-of-truth (academic_calendar sheet, brand_comms sheet) | ✅ 1 fix (`lib/exams.ts` hardcoded HSC 2026-05-01; actual = 2026-07-02) | 🟡 |
| **T1.10** | **Every visible interactive element gets clicked once** — button → action; pill → re-key; disclosure → open; link → opens correctly | ✅ 2 fixes (Reels RANK BY pills decorative, Diagnosis regenerate button wrong scope) | 🟡 |
| **T1.11 🆕** | **Join-key existence audit** — for every matcher / aggregator that joins data across sources (Plan ↔ Posts, Strategy ↔ Calendar, Diagnosis ↔ source_post_ids), verify the join key actually exists on both sides. A `dict.get("nonexistent_field")` that always returns None is a structurally-broken loop. | ✅ 1 P0 (Outcomes matcher read non-existent `slot_index` field on posts → entire loop never closed across all v4.x QA passes) — promoted from `LIVE_CHECK_DISCOVERIES.md` 2026-05-01 | 🟡 |

**Total Tier 1 cost: ~30-35 minutes.** If you only have time for one thing, run this.

---

# Part C — Tier 2: deep audit (Tier 1 + 38 more, ~3 hours)

## Proven POVs (each caught 1 fix in v4.x)

| # | POV | Backtest evidence |
|---|---|---|
| T2.1 | Marketing-lead Mon-9am persona — first thing they need to know? | ✅ Diagnosis 8-disclosure cognitive load |
| T2.2 | Founder briefing screenshot test — does any section stand alone? | ✅ Engagement no-synthesis hero card |
| T2.3 | External stakeholder cold open — comprehensible without insider knowledge? | ✅ H1/BOFU/SSC abbreviations missing tooltips |
| T2.4 | Returning user week 2 — story continuity? | ✅ Plan narrative card always-open eats fold space |
| T2.5 | First-time-user orientation — confidently click right tab in seconds? | ✅ Outcomes subtitle "Last week's plan, graded slot by slot" misled with all-pending |
| T2.6 | Aggregation type matches metric semantic (sum vs reach-weighted vs mean) | ✅ Outcomes per-slot forecast pretending pillar-level estimates were independent |
| T2.7 | Number format consistency (1.27M everywhere or 1,287,585 everywhere) | ✅ same as 7.1 below |
| T2.8 | Data-as-of timestamps internally consistent across pages | ✅ Explore had no timestamp; cross-page numbers appeared to disagree |
| T2.9 | No anti-recommendations — Best-X cards never recommend the absence of X | ✅ Best Hook = None excluded from filter |
| T2.10 | Number format consistency (editorial) | ✅ Biggest Movers `12.7×` instead of `+1169.7%` |
| T2.11 | Cross-page redundancy scan — same chart on N pages adds value or redundant? | ✅ 3 daily-reach charts (Overview / Trends / Explore) considered + reframed |
| T2.12 | Threshold copy matches threshold logic — copy claims must match `MIN_N=2` etc. | ✅ "Faded fill = fewer than 2 posts" → "1 post" when MIN_N=2 |
| T2.13 | Partial-window indicator — incomplete week / day visually distinct | ✅ Trends current-week bar faded indigo |
| T2.14 | No duplicate findings across structurally-different sections | ✅ Photo-trailing duplicate in Underperformer + Watch-out (prompt v1.11 dedupe rule) |
| T2.15 | `>300%` change → multiplier format (×) instead of overflowing percent | ✅ Biggest Movers Risers (12.7× / 6.5× / 4.4×) |
| T2.16 | First thing eye lands on answers "good or bad?" | ✅ Engagement page hero "Winning pattern this period" synthesis |
| T2.17 | Drop jargon for cold-read user — every abbreviation has glossary tooltip | ✅ Plan slot pills (SSC / BOFU / MOFU / H1) dotted-underline tooltips |
| T2.18 | Add benchmark — single number gets context | ✅ Hook Retention 30.1% with ed-tech 25-35% benchmark |
| T2.19 | Synthesis-density — 1 hero card preferred over 5 atomic cards | ✅ Engagement hero + Timing hero (both shipped) |
| T2.20 | Auto-expand the highest-priority disclosure | ✅ Diagnosis Key Findings #1 auto-expanded |

## High-leverage speculative POVs (untested but pattern-fits proven ones)

| # | POV | Why it's high-leverage |
|---|---|---|
| T2.21 | Percentages add to 100% (donuts, share charts) | Cheap math sanity; catches rounding / off-by-one |
| T2.22 | N exposed for every aggregate metric | Trust-signal building block |
| T2.23 | Headline = falsifiable claim — could you disprove it from data shown? | Prevents AI vibes-as-analysis |
| T2.24 | AI prose vs underlying numbers — recompute one cited number per paragraph | Catches AI hallucination |
| T2.25 | Recommendations actionable — who/what/when explicit? | Prevents abstract "lean into" filler |
| T2.26 | Calibration of certainty — "high confidence" matches actual n + variance | Trust-signal accuracy |
| T2.27 | Slack-screenshot test — section stands alone outside dashboard | Real-world workflow check |
| T2.28 | URL shareability — copy/paste reconstructs identical state | Power-user workflow |
| T2.29 | Back button after deep state changes | Mechanical exhaustion follow-up |
| T2.30 | No `undefined` / `null` rendered anywhere | T1.7 deepening |
| T2.31 | AI-fallback (credits ran out) visually distinct from AI-fresh — StalenessBanner fires when expected | Time-window honesty |
| T2.32 | Different chart type? — could this donut be a stacked bar? Line a step? | Design fitness applied per chart |
| T2.33 | Card removable without losing meaning? | Negative-space audit |
| T2.34 | Plan slot → its row in Outcomes once graded (loop closure) | Workflow integrity |
| T2.35 | Scoping precision — every claim's scope explicit ("across all posts" vs "for HSC content") | Prevents AI sloppy generalization |
| T2.36 | AI returns malformed JSON — pipeline degrades or crashes? | Failure-mode coverage |
| T2.37 | Trust signals per claim count — formula + n + timestamp + source | T1.2 deepening, applied claim-by-claim |
| T2.38 | Clicks-per-insight ratio per page | Cognitive-cost audit |

**Total Tier 2 cost: ~3 hours including Tier 1.** Run after major sprints, before stakeholder review, end-of-quarter.

---

# Part D — Tier 3: specialty (~120 items, run when concern arises)

Reference index. Walk these only when you have a specific question that
directly maps to a category. Listed compactly by category for skim.

## When to walk which Tier 3 category

| Concern | Category | Items |
|---|---|---|
| Accessibility audit | Cat 6 | 6 |
| Performance audit | Cat 20 | 4 |
| Bias / fairness audit | Cat 22 | 3 |
| Locale audit | Cat 6.5/6.6 + Cat 23 | 6 |
| Power-user feature gap | Cat 24 | 5 |
| Comparison/diff feature design | Cat 17 | 4 |
| Loop-closure design | Cat 18 | 4 |
| Selection-bias / data gap | Cat 19 | 4 |
| Causality / claim integrity | Cat 21 | 4 |
| Failure-mode coverage | Cat 25 | 5 |
| Temporal continuity | Cat 26 | 4 |
| Trust-signal deepening | Cat 27 | 4 |
| Cognitive-cost deepening | Cat 28 | 4 |

## Cat 1 — User personas (proven moved to Tier 1/2)

1.2 Content executor Sun afternoon (3-action prep cost) · 1.3 Head of growth end-of-month trend story · 1.8 Mobile commute glance · 1.9 Trust-drift defenses (in T1.2)

## Cat 2 — Data sanity

2.1 Zeros real or null? · 2.3 Boundary leakage at midnight · 2.5 Time-series gaps · 2.9 Decimal precision · 2.11 Backfill vs natural-flow divergence

## Cat 3 — Information sanity

3.4 So-what density · 3.6 Confirmation vs novelty · 3.8 Failure-mode visibility

## Cat 4 — Workflow / integration

4.3 Click-through journey (Overview chart → filtered Explore) · 4.4 Edit-loop accuracy · 4.5 Re-trigger workflow downstream invalidation · 4.6 Sun-evening prep cadence

## Cat 5 — System integrity

5.1 Idempotency · 5.2 Retry behavior on transient failures · 5.3 Cost observability per run · 5.4 Rate-limit handling · 5.5 Schema evolution safety · 5.6 Cache parity (cold vs warm) · 5.7 Empty-pipeline first-run grace

## Cat 6 — Accessibility

6.1 Keyboard-only navigation · 6.2 Touch tap targets ≥ 44×44px + tooltips on tap · 6.3 Screen reader pass · 6.4 Color contrast ≥ 4.5:1 · 6.5 Bangla numeral consistency · 6.6 Multi-script line breaks at 360px

## Cat 7 — Editorial / brand

7.2 Term consistency (Diagnosis vs Verdict vs Strategy) · 7.3 Voice differentiation (analytical/instructional/suggestive) · 7.4 Brand audit `npm run brand:audit` green · 7.5 Negative space defense

## Cat 8 — Calendar / locale

8.2 Date arithmetic edge cases (Dec 31, Feb 29, ISO week-1 wrap) · 8.3 BDT timezone rendering at midnight boundary

## Cat 9 — Mechanical exhaustion deeper

9.2 Empty/null/zero/negative/very-large inputs · 9.3 Auth-expired mid-session · 9.5 Refresh during loading

## Cat 10 — Cross-element consistency deeper

10.3 Same color → same meaning everywhere · 10.4 Same icon → same meaning · 10.5 Same KPI strip pattern across pages · 10.6 Same affordance → same gesture · 10.7 Same data type → same format

## Cat 11 — Render-layer integrity deeper

11.2 No `[object Object]` · 11.4 No HTML-entity double-encoding · 11.5 No unfilled template-literal placeholders · 11.6 No raw markdown leaking · 11.7 No "0/0" / "—/—" reading as data

## Cat 12 — Code-vs-copy alignment deeper

12.2 Button label = effect · 12.3 Empty-state copy = actual reason · 12.4 Loading copy describes what's loading · 12.5 Error copy describes actual error

## Cat 13 — Time-window honesty deeper

13.2 Future predictions visually distinct · 13.5 Backfilled vs natural-flow visually distinct

## Cat 14 — Structural deduplication deeper

14.2 No duplicate post in two top-N lists same page · 14.3 No duplicate metric in KPI strip · 14.4 No duplicate filter pill · 14.5 No duplicate copy on same page

## Cat 15 — Interaction matrix exhaustion deeper

15.3 Every dropdown opens/scrolls/closes/persists · 15.4 Every disclosure opens/closes/persists · 15.5 Every link target/rel correct · 15.6 Every hover affordance + touch equivalent · 15.7 Every form input validates/recovers · 15.8 Every regenerate-style action: loading + landing + no double-fire · 15.9 Every cross-page nav preserves state · 15.10 Keyboard shortcuts work + help · 15.11 Focus state + tab order · 15.12 Copy-pasteable elements selectable · 15.13 Drag/scroll/swipe smooth + memory

## Cat 16 — Design fitness deeper

16.2 Axes reframed? · 16.3 Legend inline labels? · 16.4 Color encoding carries meaning beyond identity? · 16.5 Annotation makes insight explicit? · 16.6 Absolute → comparison? · 16.8 Rate-normalized? · 16.9 Lower precision? · 16.11 Section moveable to better page? · 16.12 Two pages collapse into tabs? · 16.14 Page headline carries verdict? · 16.15 Copy shorter without losing meaning? · 16.16 More specific (concrete > abstract)? · 16.19 Sharper CTA (concrete time/audience)? · 16.20 2-step → 1-step? · 16.21 Modal → inline? · 16.22 Link-out → in-app?

## Cat 17 — Comparison / diff

17.1 Last-week vs this-week side-by-side · 17.2 Forecast vs actual divergence chart · 17.3 Pillar trajectory over multiple weeks · 17.4 Hypothesis tracking over multiple weeks

## Cat 18 — Loop closure

18.1 Plan slot → Outcomes once graded · 18.2 Outcomes verdict → next-week prediction calibration · 18.3 Strategy hypothesis → Diagnosis grading · 18.4 Outcomes "missed" → next Plan's forecast adjustment

## Cat 19 — Selection bias / what's NOT in the data

19.1 Excluded posts (deleted, scheduled, draft) reflected? · 19.2 Missing dimensions (paid ads, comments sentiment) signaled? · 19.3 Time horizons excluded — 90d view available? · 19.4 Survivorship in "Top X" lists — failed posts visible somewhere?

## Cat 20 — Latency / perceived performance

20.1 Time-to-first-meaningful-paint < 2s · 20.2 Skeleton state quality during load · 20.3 Flash-of-wrong-data on cache hit · 20.4 Action latency on regenerate (< 200ms feedback)

## Cat 21 — Causality / claim-vs-evidence

21.1 AI causal claims supported by data shown · 21.2 Counterfactual reasoning supportable · 21.3 Scoping precision (every claim's scope explicit) · 21.4 Single-cause overfitting on complex outcomes

## Cat 22 — Bias / fairness

22.1 Audience coverage balanced (SSC/HSC/Class 6-8/Admission) · 22.2 Teacher coverage over/under-representation · 22.3 Pillar over-classification toward populous classes

## Cat 23 — Pluralization / micro-copy / locale

23.1 Singular vs plural correctness ("1 post" / "2 posts" / "0 posts") · 23.2 Capitalization consistency · 23.3 Date format localization (Bangla vs English) · 23.4 Color semantic universality + color-blind safety

## Cat 24 — Power-user features (gap analysis)

24.1 Keyboard shortcuts · 24.2 Saved views / bookmarks · 24.3 Annotation / agreement marker · 24.4 Diff view between weeks · 24.5 Personal notes

## Cat 25 — Failure-mode coverage

25.1 AI returns malformed JSON · 25.2 Sheet header rename · 25.3 Anthropic 529 mid-run · 25.4 Service account expired · 25.5 Network offline mid-page

## Cat 26 — Temporal continuity

26.1 Yesterday's filtered URL works today · 26.2 Session timeout graceful · 26.3 Data-as-of "yesterday" matches what user is acting on today · 26.4 URLs stable across deploys

## Cat 27 — Trust signal density

27.1 Each KPI has formula + timestamp + n + source · 27.2 Each AI claim has citation + scope + confidence · 27.3 Each chart has methodology tooltip · 27.4 Each forecast has CI band visible

## Cat 28 — Cognitive cost per insight

28.1 Clicks-per-insight ratio per page · 28.2 Reads-per-decision count · 28.3 Synthesis-density (1 hero or 5 atomic cards?) · 28.4 Auto-expand highest-priority disclosure

---

# Part E — Discovery mode

When QA finds a bug that NO POV here would have caught, the bug surfaced
a missing POV. Don't lose it.

## The capture workflow

1. **Bug found** → trace back: which POV would've caught this in advance?
2. **If existing POV** → great. Tag it with `+1 catch`. Update list metadata at next quarterly review.
3. **If no existing POV**:
   1. Name the new POV (subject-verb-object: "X has Y property" or "every Z does W")
   2. Identify which of the 12 meta-lenses it belongs to
   3. Apply it to 2-3 OTHER surfaces (different pages, different components). Does it generate other findings?
   4. **If yes** (it generalizes) → add to Tier 2 with `🆕` tag + first-catch evidence
   5. **If no** (one-off) → log to [`LIVE_CHECK_DISCOVERIES.md`](./LIVE_CHECK_DISCOVERIES.md), don't promote yet
4. **Quarterly review**: discoveries that generalized in 3+ checks → promote to Tier 2. Discoveries that stayed one-off after 3 reviews → archive.

## Why this matters

The list shouldn't be a frozen artifact. The first 2 password-gated checks
generated 9 entirely new POVs that weren't on my v1 list. The same will
happen on every check going forward. Discovery mode is how the list stays
useful.

Same discipline as `LEARNINGS.md` (capture pattern, generalize, document) —
this is its sibling for the QA pass itself.

---

# Part F — Maintenance

- **Tier 1 review**: every quarter, look at which Tier 1 POVs DIDN'T fire in
  the last 3 months. If a POV hasn't caught anything in 3 quarters, demote
  to Tier 2. Tier 1 must stay tight (target: ≤ 12 items).
- **Tier 2 review**: every quarter, promote `🆕` discoveries that generalized.
  Demote speculative POVs that haven't fired in 6 months to Tier 3.
- **Tier 3 review**: annual prune. Categories that haven't been walked in
  a year get archived (still in git history).
- **Meta-lens review**: only update when a discovery doesn't fit any
  existing meta-lens. New meta-lenses are rare events.

This is a living document. Don't treat the count as fixed.
