# Backlog

Identified improvements not yet implemented. Organized by phase. Each item
records **what**, **why it matters**, and **where** the change would land.

The deliberate omissions (paid/organic split, Slack/email alerts, CSV export)
are listed at the bottom so we don't re-propose them.

---

## Phase 2 — Analytics depth

### 2A. New metrics to compute and surface

All source fields already exist in `Raw_Posts` / classification. These are
derived metrics the current views do not expose.

| Metric | Formula | Why it matters | Where to land |
|---|---|---|---|
| **Virality coefficient** | `shares / reach` | Most predictive single signal for organic growth. A post with high shares per reach is being carried by the audience, not the algorithm. | New card on Overview + per-pillar column on Engagement |
| **Discussion quality** | `comments / reactions` | Separates "liked and moved on" from "sparked conversation". Currently lumped into engagement rate — two very different content types can share an ER score. | Engagement page, per-pillar bar chart |
| **Sentiment polarity** | `(love + wow) / max(1, sad + angry)` | Data is already written. Flags pillars with high reach but negative reaction mix (a real failure mode — e.g. news content can get high engagement for bad reasons). | Overview "Biggest Movers" panel + strategy prompt input |
| **CTR proxy** | `clicks / reach` (only where `clicks > 0`) | Which posts actually drove traffic off-platform. Null for most organic posts but essential for the ones with link targets. | New column on Reels/post drill-down when available |
| **Cadence gap** | Days between consecutive posts × reach of each | Are we under-posting or over-posting? Invisible today. | New chart on Trends page |
| **Format × hour interaction** | Mean ER per (format, hour) bucket | Reels at 8pm vs carousels at 8pm behave differently. Current views slice format and hour independently so the interaction is hidden. | Timing page: second heatmap or toggle |

### 2B. Fields written by the pipeline that no view reads

| Field | Source | Proposed use |
|---|---|---|
| `caption_tone` | `classify.py` | New "Tone Performance" card on Engagement — which tones convert |
| `classifier_confidence` | `classify.py` | Down-weight low-confidence rows in rankings. Currently treated as ground truth, inflating noise |
| `manual_override` | Classifications tab | Honor editor corrections. If a human fixes a misclassified post, the system should prefer that label over the classifier output |
| `featured_entity` vs `spotlight_name` | Duplicate drift between pipeline and views | Pick one canonical field, deprecate the other, migrate existing values |

### 2C. Statistical approach improvements

Current approach (student-t 95% CI lower bound, reach-weighted ER) is solid
but naive for the data's actual shape.

- **Bayesian shrinkage toward pillar mean.** A 2-post pillar at 8% ER is
  currently treated as a peer of a 50-post pillar at 8%. Shrinking small-
  sample pillars toward the overall mean stops tiny buckets from winning
  "Best X" in short ranges.
  - Where: `lib/stats.ts` — new `shrunkMean(group, prior, weight)` helper.
  - Impact: Best-X rankings on Engagement page become more conservative
    and more honest when ranges are short.
- **Temporal decay.** A post from 90 days ago shouldn't weight the same as
  yesterday. Exponential decay with a ~30-day half-life better reflects
  current audience behavior.
  - Where: `lib/aggregate.ts` — new `weightByRecency(posts, halfLifeDays)`.
  - Impact: Moving-average trends + Best-X rankings reflect "right now"
    rather than "over the whole window".
- **Log-transform on reach.** Reach is heavy-tailed — one viral 5M-reach
  post dominates any mean for its pillar. Geometric mean (log then mean
  then exp) is the correct central tendency for heavy-tailed distributions.
  - Where: `lib/stats.ts` — new `geomMean(values)` helper, plus a
    `summarizeLogNormal` variant of `summarize`.
  - Impact: Pillar/format/hook rankings stop being skewed by single
    viral outliers.

### 2D. Prompt overhaul (biggest single-lever change)

Current weekly diagnosis + calendar prompt (`facebook-pipeline/src/report.py`)
has three gaps that limit output quality:

- **No few-shot examples.** Prompt gets only top-5 all-time winners as
  reference, no structure for what a good vs bad post looks like. Claude
  has to reinvent the format every week.
- **Top-5 all-time is too narrow.** A pillar that has a great reel and a
  great carousel can only surface the better one; the other insight is
  lost. Replace with **top-5 per bucket** (per pillar, per format, per
  hook, per spotlight-type).
- **Missing underperformer anti-patterns.** We show what worked but never
  what didn't. Claude can't learn "avoid this" without seeing the bottom
  of the distribution.
- **Hardcoded timing baseline** at `classify.py:739-742`. The prompt uses
  a fixed "best time = 7-9pm" assumption written once by a human. Should
  be replaced with the computed best-day-best-hour from the last 60 days
  of data so recommendations adapt to what's actually working.

Proposed prompt refactor:

1. Top-5 per bucket (not top-5 overall)
2. Bottom-3 per bucket as "what not to do"
3. Computed timing baseline (data-driven, not hardcoded)
4. Two or three explicit few-shot example posts with annotated
   "why this worked" / "why this flopped"

Expected impact: Generated calendar stops recommending formats, pillars,
or hooks we've proven don't work. Weekly diagnosis picks up on
underperformance patterns it currently misses.

---

## Phase 3 — New views + workflow

Only the items approved by Shahriar. Explicitly dropped items are at the
bottom of this file.

### 3A. Post-level drill-down view (**approved**)

Every chart in the dashboard aggregates away the underlying posts. There's
currently no way to click a bar, a heatmap cell, or a KPI and see "which
posts are in this number?". Every other decision flows from this.

- New route: `/posts/[id]` OR a slide-over panel keyed to `post_id`.
- Shows: full caption, thumbnail, classification, all raw metrics,
  permalink out to Facebook, retention curve (for reels), timeline
  context (posts published ±3 days).
- Entry points: click any bar in BarChart, click any cell in Heatmap,
  click any row in Reels table.
- Implementation note: requires adding `onBarClick` / `onCellClick` to
  the Recharts wrappers + a shared `PostPanel` client component.

### 3B. `permalink_url` on every reel / post row (**approved**)

The pipeline already has `permalink_url` in Raw_Posts. No view surfaces
it. Simple win — add as an icon link on every Reels table row and every
post drill-down. Opens the post on Facebook in a new tab.

- Where: `app/reels/page.tsx` (add column), post drill-down (hero link),
  Explore client table.

### 3C. A/B experiment / hypothesis log (**approved — later pipeline**)

Log hypotheses ("reels at 7pm will beat reels at 10pm") + post tags,
roll up win rate against the hypothesis. Treated as a later pipeline
addition — needs a new Google Sheet tab (`Experiments`) plus a pipeline
stage that reads the tab, resolves winning/losing posts based on tagged
metrics, and writes back a win/loss judgment.

Not blocking any other item. Record as a future milestone.

---

## Explicit NON-goals (do not re-propose)

These were discussed and rejected. Listed here so they don't resurface.

- **Paid vs organic split.** Dashboard is purely organic. No paid/boosted
  content is in scope.
- **Slack / email weekly digest.** Deferred — "later, not now". Do not
  wire up notification infrastructure at this stage.
- **CSV export on tables.** Not wanted.

---

## Sequencing proposal (for when work resumes)

Recommended order, lowest-risk-highest-impact first:

1. **Phase 2D (prompt overhaul).** One pipeline commit. Reshapes what
   Claude recommends every week. No UI changes.
2. **Phase 2C (stats improvements: shrinkage + decay + log-transform).**
   One `lib/stats.ts` commit. All rankings across every page get more
   honest automatically.
3. **Phase 2A (new metrics).** Progressive — one metric per commit,
   with the view change that exposes it.
4. **Phase 2B (unused fields).** Grouped with related 2A commits where
   relevant (e.g. `classifier_confidence` belongs with the shrinkage
   change; `caption_tone` belongs with its own new Engagement card).
5. **Phase 3A (post drill-down) + 3B (permalink).** Ship 3B first
   (one-line change), then build the drill-down panel on top.
6. **Phase 3C (experiment log).** Later pipeline milestone.

Each item should land as its own commit with the usual pre-commit QA
gate (seven-perspective self-review) and post-commit doc updates to
CHANGELOG / DECISIONS / LEARNINGS.
