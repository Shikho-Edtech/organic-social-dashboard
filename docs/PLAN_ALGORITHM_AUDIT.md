# Plan-Algorithm Audit: Critical Multi-POV Reassessment

**Status:** Living doc. Author: 2026-05-01.
**Read this before proposing any algorithmic change.** It names which
assumptions each upgrade tier is undoing and which it's still resting on.

---

## 0. The honest baseline — what we are not

We are an **AI-prompted pattern matcher with deterministic post-processing**,
not a forecasting system. The pipeline:

1. Aggregates last 14–90 days of post performance into rollups + priors
2. Hands the rollups to an AI with a structured-output prompt
3. Validates the AI output against schema rules
4. Stamps deterministic forecast bands from marginal priors
5. Scores actuals deterministically against those bands

There is no model fit, no held-out validation, no causal inference, no
optimization objective. Every "good" choice is defensible-to-prose, not
demonstrably-better-than-baseline.

This doc names the gaps so we can close them deliberately, not pretend
they don't exist.

---

## 1. Critique by POV — what's wrong from each lens

### 1.1 Statistical / inference POV

| Issue | Why it matters | Today's silent failure |
|---|---|---|
| Priors treat dimensions as independent (`Priors_Pillar × Priors_Format × Priors_Season`) | Real reach is governed by interactions; multiplying marginals erases them | Reel × Live Class × SSC-active is scored as Reel-marginal × Live-marginal × Season-multiplier rather than its own joint distribution; we miss interaction effects worth ±30% reach |
| 80% CI is asserted, never tested | If the band is over/under-confident, every Hit/Miss verdict is biased | We don't compute "what fraction of past forecasts actually contained the actual?" — could be 50%, could be 95%, no one knows |
| Sample size per cell is tiny | (5 pillars × 4 formats × 7 days × 8 hours × ~10 spotlights) = 11,200 cells; we have ~6,000 lifetime posts → effective n per cell often <3 | "Best hour for Reel × Live Class on Tuesday" reported with high confidence from n=4 |
| No regime-change detection | Page audience composition shifts (exam season, term break, new platform algo) silently invalidate priors | Last 30 days might be a different distribution than prior 60 days; we never check |
| Observed-only sample | We see only what was posted; the counterfactual ("what if we'd posted Reel instead of Photo at 19:00") is structurally absent | Selection bias: top performers are partly an artifact of what got posted, not what would have performed |
| Multiple-comparison problem | Diagnosis explores ~20 dimensions weekly; some "X drove Y% lift" findings are false positives at 5% significance | We don't apply Bonferroni / Benjamini-Hochberg; weekly findings include noise |

### 1.2 Causal POV

| Issue | What's confounded | Today's effect on output |
|---|---|---|
| Spotlight effect is confounded with format + topic | "Abdullah Bhaiya drove 48k reach" — was it Bhaiya, the Reel format, the SSC topic, the time-of-day, or interaction? | Strategy stage credits the teacher; rotation overweights one variable |
| Posting time is confounded with format | We post Reels mostly at 19:00; we don't know if 19:00 is good or if Reels are good | "Best hour for Reels" is unidentifiable from observational data |
| Hook is confounded with everything | Top hooks are deployed on top teachers in top slots → measurement of "hook lift" is contaminated | Hook_Library top-quartile is a reach-magnitude artifact, not a hook-effect estimate |
| Audience reach is endogenous to past content | Followers acquired by past Reels overweight Reel reach next week → self-fulfilling feedback loop | We mistake recency-driven distribution skew for evidence of format superiority |
| No instrumental variable | We can't separate exam-window effect from concurrent strategic shift | "Reels won during SSC" — was it SSC or our own pivot? |

### 1.3 Decision-theoretic POV

| Issue | Why it's broken |
|---|---|
| No declared objective function | We never wrote down "the plan is good if X ≥ T." Every choice is locally justified. Without a global objective, every upgrade is a guess at what to maximize. |
| Reach vs growth vs conversion conflated | Outcomes scores reach. The team's actual goal is followers, app installs, course conversions. A reach-hit can be a conversion-miss (e.g., wrong audience). |
| No utility function over verdicts | "Hit" for a 50k-reach slot and "Hit" for a 1k-reach slot weigh equally in the rollup. Real value is non-linear in reach. |
| Cost-of-error is symmetric | "Missed by 5%" and "Missed by 50%" both score `missed`. A near-miss carries different information. |
| No exploration-vs-exploitation tradeoff | We exploit (top-quartile hooks, top teachers) without explicit exploration budget. Every untested combination stays untested forever. |

### 1.4 Identifiability POV

| Question we ask | Can today's setup actually answer it? |
|---|---|
| "Did h1 hold?" | No — h1 is too multi-claim; "Capitalize on SSC by pivoting to MCQ Reels with Abdullah" can fail in 4 ways and we don't know which |
| "Is Reel still the best format?" | No — Reels are over-deployed; the "best" label is partially confound |
| "Did the new hook work?" | No — same hook on different teacher / different time / different pillar would give different reach; we can't isolate |
| "Did the team adhere to the plan?" | Partially — adherence is measured, but "adherence to a vague plan" is gameable |
| "Are we improving week-over-week?" | No — no held-out test set, no walk-forward calibration measurement |

### 1.5 Evaluation POV

| Issue | Symptom |
|---|---|
| No held-out validation | Priors fit on the same data they predict. Looks good in-sample, no proof out-of-sample. |
| No walk-forward backtest | We don't simulate "what would the algorithm have decided 4 weeks ago?" against what actually happened. |
| No baseline comparison | Better than random posting? Better than "post same as 12 weeks ago"? Better than human gut? Don't know. |
| No leakage check | Plan stage sees diagnosis stage's findings; classifier sees pillar tags it produced last week. Subtle leakage possible. |
| Calibration ≠ sharpness tradeoff ignored | Wide forecast bands always look "calibrated" but useless. We never measure sharpness (band width relative to mean). |
| No backtest of hypothesis grammar | Hypotheses we marked "held" — would an outsider mark them held? Inter-rater reliability never measured. |

### 1.6 Adversarial / robustness POV

| Attack vector | What breaks |
|---|---|
| AI hallucinates a `cited_priors_row` that exists but doesn't support the claim | Validator passes (row exists), claim is false |
| AI cherry-picks `source_post_ids` that flatter the finding | Drill-down looks legit, statistical claim is wrong |
| Single viral post poisons priors for 13 weeks | One outlier dominates the 90-day rolling average; subsequent forecasts overshoot |
| Platform algo change (FB tweaks Reel reach) | All historical priors instantly stale; we don't detect for weeks |
| Team posts off-plan (intentional / off-system) | Outcome_Log has unmatched posts; rollup understates reach |
| Sheet schema drift (column rename) | Read-by-name protects readers but writers can silently shift content |
| Brand comms team renames a campaign | Match by string fails; brand-comms-grounded slot evaporates |

### 1.7 Behavioral / cognitive POV (AI prompt biases)

| AI behavior we should counter | Where it shows up |
|---|---|
| Recency bias | "Last week's top performer" anchors next week's strategy disproportionately |
| Confirmation bias | AI tends to find evidence that supports the previous week's hypothesis even when null |
| Narrative coherence preference | Diagnosis stitches a story even when data is noise; "what_happened" reads cleaner than reality |
| Aversion to "no change" | AI always proposes some shift; "stay the course" is rarely the recommendation even when it's right |
| Verbosity inflation | More words ≠ more signal; "Capitalize on the active SSC '26 Theoretical exam window by..." can be reduced to a 5-word claim |
| Anchor on the top of the prior list | Order-of-priors-in-prompt biases AI's pillar weighting |

### 1.8 Time-series / dynamics POV

| Issue | Today's blindspot |
|---|---|
| Reach decays over ~14 days; we score at 7 days | Pre-decay actuals understate; we mark some "missed" that would resolve "hit" 7 days later |
| Follower growth is autoregressive (today's followers depend on yesterday's content) | Independence-assumption priors miss compounding |
| Algorithm-platform feedback loop | Posting Reels gets us shown to Reel-watchers → next week's Reel reach inflates → priors say "Reels working" → we post more Reels |
| Seasonality at multiple scales | Day-of-week, week-of-month, exam cycle, academic year — we model only day-of-week explicitly |
| Trend separation | Is "follower growth slowing" a content problem or a saturation problem? Different fixes; we don't disentangle |

### 1.9 Information-theoretic POV

| Where information is being burned | Cost |
|---|---|
| AI prompt token budget allocated equally across stages | High-information stages (strategy hypothesis) get same tokens as low-information ones (visual_direction prose) |
| Priors recomputed from raw data weekly | We don't compress / fingerprint distributions; can't detect drift via cheap hash |
| Outcome_Log row per slot but no aggregated "what did this week teach us" structured signal | Next week's prompt re-derives lessons rather than reading them |
| No active learning | Slot allocation never asks "which test would resolve the most uncertainty?" — it asks "what does the strategy want?" |

### 1.10 Operational POV

| Brittleness | Real cost |
|---|---|
| AI-quota outage = whole pipeline stops | Already mitigated via native engine fallback, but native is a degraded mode, not a peer |
| Sheet API quota | Long iterations on prompt v-bumps thrash the sheet API; quota burns silently |
| Cron-only scheduling | Mid-week ad-hoc reruns require manual workflow_dispatch; non-engineers can't iterate |
| No staging environment | Prompt change tested live; bad prompt = bad week's plan |
| Single-page → can't generalize | Algorithm tuned to Shikho FB page; same prompts on a different brand = unknown behavior |

---

## 2. The deeper roadmap — beyond Tier 1-3

### Tier 1 (already named in LEARNINGS) — Calibrate the existing system

Prerequisite for everything below. Without it, we're guessing whether
later changes help.

- Calibration_Log: weekly "K of N forecasts contained the actual"
- Pre-registered numeric success metric per `experiments_to_run[]` entry
- Per-pillar/format hit-rate rolling 4-week dashboard
- Score outcomes only on posts ≥ 7 days old
- Slot count derived from page reach-per-post diminishing-returns curve
- Conditional hook freshness (per-hook decay tracking)

### Tier 2 — Model the interactions

- Joint priors `Priors_PillarFormatSeasonTeacher` where n ≥ 10; fall back to marginal otherwise
- 2 reserved A/B slots per week for paired comparisons
- Statistical power gates: every "X drove Y% lift" finding needs `effect × √n ≥ threshold` or it's labeled directional
- Regime-change KS-test recent 30 vs prior 60 days
- Counterfactual Monte Carlo: 100 plan samples → reach distribution; flag if chosen plan is below 60th percentile
- Hypothesis grammar enforcement (single-claim, falsifiable, measurable threshold)

### Tier 3 — Move from priors to models

- Bayesian online prior update (every post, not weekly batch)
- Causal model for spotlight: propensity-weighted comparison
- Multi-armed bandit slot scheduler (Thompson sampling over (pillar × format × teacher × hook-family))
- Negative-result memory: track failed hooks/spotlights with decay
- Audience-segmented priors (SSC vs HSC vs general)

### Tier 4 — Decision-theoretic foundation (the missing layer)

This is the layer that makes everything else evaluable. Pick this BEFORE
Tier 5+.

- **Define the north-star metric.** One number per week the team is
  optimizing. Candidates: 7-day-decayed reach, follower delta net of
  unfollows, app install attribution, course conversion. Pick one and
  build everything against it. Other metrics become guardrails.
- **Build a utility function.** Map (reach, engagement, follower delta,
  conversion proxy) → scalar. Even a linear weighting is a step up
  from current implicit "reach is good."
- **Define cost-of-error asymmetry.** A missed-by-50% slot loses more
  utility than a missed-by-5%. Encode this in the scorer's reward.
- **Cost-of-experiment budget.** What fraction of weekly slots are we
  willing to spend on exploration vs exploitation? Today implicit ≈ 0%;
  needs to be 10-20% to actually learn.
- **Model the team's time cost.** A plan that requires 5 hours of
  non-standard production has cost the algorithm doesn't currently see.

### Tier 5 — Causal inference + experimentation

Requires Tier 4's objective function to evaluate.

- **Pre-registered experiments.** Each week declare 1-2 hypotheses with
  pre-registered metric, pre-registered analysis, success threshold.
  Check at the end of the week against the locked criteria.
- **Propensity scoring for spotlight effect.** Estimate P(spotlight=teacher_X
  | features) from posting history; reweight outcomes to deconfound.
- **Difference-in-differences for format shifts.** When strategy
  reweights formats, compare DiD vs prior-period continuation baseline.
- **Synthetic control for major regime shifts.** When platform algo
  changes, build a synthetic counterfactual from sister pages (if
  available) or pre-shift trajectory.
- **Holdout days.** One day per week, no plan — let the team post
  organically. Gives a no-AI baseline distribution to compare against.

### Tier 6 — Proper forecasting + ML

Once we have a north star and causal estimates, replace heuristics with
proper models.

- **Hierarchical Bayesian model** for slot reach: shared global prior,
  partial pooling across (pillar, format, teacher) cells. Handles small-n
  cells gracefully via shrinkage. Output: real posterior predictive
  distribution per slot, not a multiplied-marginals approximation.
- **Gradient-boosted trees** on enriched features (post text embeddings,
  hour, day, exam proximity, brand-campaign-active, follower count at
  post time, recent-7-day-page-reach trend) → 7-day-decayed reach
  prediction. Compare to current priors-based forecast.
- **Time-series model** for follower growth (Prophet or state-space):
  separate trend, seasonality, holiday/exam effects. Tells us if growth
  decel is content or saturation.
- **Walk-forward backtest framework.** For every model change, run on
  past 12-24 weeks rolling; compare to existing pipeline + naive baselines.
- **Calibration plot** (reliability diagram) per model — sharper bands
  with same calibration = strictly better.

### Tier 7 — Adversarial + robustness hardening

Most ignored category; biggest long-term reliability lever.

- **Hallucinated-citation detector.** When AI cites `Priors_Teacher[Bhaiya] avg=12k`,
  verify the row's value matches. Reject if mismatch >5%.
- **Source-post sampling audit.** AI must cite ≥5 source posts spanning
  the claim's range; not just top 3. Compute IQR of cited posts vs cohort.
- **Outlier-resistant priors.** Switch from mean to trimmed mean (10-90%)
  or median + IQR. Prevents single-viral-post poisoning.
- **Schema fingerprint.** Every sheet read computes column-name hash;
  alert on drift.
- **Off-plan post handling.** Outcome_Log adds an "unplanned" tab for
  posts that didn't match any slot; rollup includes them as "above-plan
  reach" or "below-plan reach" instead of dropping.
- **Prompt-injection defense.** Brand comms / academic calendar are
  external Sheets — could contain instructions. Strip / sandbox before
  prompt insertion.

### Tier 8 — Generalization + transferability (long-horizon)

- **Multi-page support.** Same algorithm, second brand → tests whether
  we built a system or a brand-specific spreadsheet.
- **Cold-start protocol.** New page with <30 posts: priors are useless;
  define a bootstrap curriculum.
- **Algorithm versioning + ablation.** Every shipped change tagged with
  an algorithm version; ablation runs let us isolate its contribution.

---

## 3. The honest tradeoff matrix

For each Tier 4+ upgrade, the cost is real and partially hidden. Decide
deliberately:

| Upgrade | Engineering cost | New failure modes | Operational complexity | Worth it if … |
|---|---|---|---|---|
| Define north-star metric | 0 engineering, 1 hour debate | None | None | … always; this is free |
| Utility function | 1 day | Wrong weights frozen in | Low | … team agrees on weights for ≥4 weeks |
| Bayesian hierarchical model | 2-3 weeks | Tuning pathologies; harder to debug | Medium | … we have ≥6 months of data and ≥30 posts/week |
| Bandits | 3-4 weeks | Cold-start instability | High — needs calibrated priors first | … we have an objective function and can tolerate exploration loss |
| GBT predictor | 1-2 weeks | Black-box; harder to explain to team | Medium | … beats Bayesian baseline by ≥10% RMSE on walk-forward |
| Pre-registered experiments | 0.5 day per week, ongoing | Slows decisions; team may resent | Low — but cultural | … team values rigor over speed |
| Holdout days | 0 engineering, social cost | "Why didn't we plan Tuesday?" | Low | … team commits for ≥8 weeks |
| Multi-page support | 1-2 months | Brand-specific assumptions surface | High | … there's a second brand to serve |

---

## 4. What I'd ship in order if I had 6 months of focus

1. **Week 1:** Calibration_Log + pre-registered experiment metric (Tier 1). Pure data. No AI changes.
2. **Week 2:** Define north-star metric + 5-line utility function (Tier 4 first half). Pure spreadsheet + 2 lines of code.
3. **Weeks 3-4:** Walk-forward backtest framework (Tier 6 prerequisite). Run today's pipeline on last 12 weeks vs naive baselines. We'll discover whether we're already beating "post the same as last week."
4. **Weeks 5-6:** Conditional hook freshness + slot count from data (Tier 1 finishers). Real wins, low risk.
5. **Weeks 7-9:** Joint priors `Priors_PillarFormatSeasonTeacher` + holdout days (Tier 2 + Tier 5).
6. **Weeks 10-13:** Hierarchical Bayesian slot-reach model (Tier 6 first half). Compare to priors via walk-forward.
7. **Weeks 14-17:** Spotlight propensity scoring (Tier 5 second half). First causal estimate we can stand behind.
8. **Weeks 18-21:** GBT predictor on rich features. Decide: keep both, blend, or replace Bayesian.
9. **Weeks 22-26:** Hardening — outlier-resistant priors, hallucinated-citation detector, off-plan handling, schema fingerprints.

By month 6, we should be able to say: "Our forecast is calibrated to within
2% of nominal; our north-star metric has improved X% over an held-out
no-AI baseline on a walk-forward backtest; here are the 3 hypotheses
that earned their pre-registered success threshold this quarter."

That's *demonstrably right*, not *defensibly written*.

---

## 5. What we should stop doing

To make room for the above:

- **Stop adding prose-quality to AI outputs.** Every minute spent on
  diagnosis copy polish is a minute not spent measuring whether it's
  right.
- **Stop tuning the strategy prompt without a calibration target.** "AI
  picks better weights" is unfalsifiable until calibration is measured.
- **Stop expanding pillar / format / hook taxonomies.** Higher cardinality,
  smaller per-cell n, worse priors. Hold the schema flat until we have
  hierarchical pooling.
- **Stop conflating "the AI agreed" with "the data agreed."** The AI is
  a stochastic compressor of the prompt — its agreement is structural,
  not empirical.

---

## 6. What this doc is not

- Not a complaint that the current system is bad. It works. It produces
  weekly plans the team can execute. Every shipped fix in the v4.x
  series has been a real improvement.
- Not a proposal to scrap and rewrite. Each upgrade above is additive;
  the deterministic Outcome_Log + Plan_Narrative scaffolding is the
  asset that makes any future model evaluable.
- Not a one-engineer plan. Tier 5+ implies a part-time data scientist
  or substantial focused time. Honest scope.
- Not the final word. Reassess this doc every quarter; the POV list is
  a starting set, not exhaustive.

---

## 7. Quarterly review prompt

Every 3 months, reread this doc and answer:

1. Which tier did we ship from? Did we measure its effect?
2. Which assumption named in §1 did we close? Which is still live?
3. Did calibration improve? Did sharpness improve at the same calibration?
4. Did our north-star metric improve vs the walk-forward baseline?
5. Are there new POVs (1.11+) worth adding? Promote them to §1.

If the answer to (3) and (4) is "yes," we're getting better. If it's
"we shipped X and didn't measure," we drifted back to the baseline this
doc was written to escape.
