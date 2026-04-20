# ROADMAP

**Last updated:** 2026-04-20
**Status:** current execution plan. Supersedes the 11-step migration in
[ARCHITECTURE.md](ARCHITECTURE.md) §11 for day-to-day work.

The full ARCHITECTURE spec is aspirational — it covers every piece we
*might* need at scale. For a single-reader, N=1 project the full build
burns 4-6 weeks before any of the current pain points (hardcoded timing
baseline, credit-outage fallback, thin prompt) get fixed. This roadmap
is the lean alternative: ship the pain-fixes first, earn the
architecture as we need it.

---

## The three steps, in order

### Step 1 — Prompt overhaul + timing fix (this week, one commit)

**Target file:** `facebook-pipeline/src/classify.py` lines 738-742 and the
weekly-prompt construction in `report.py`.

- Delete the hardcoded "Sunday 25.8K/post, 9 PM-midnight 1.73%" timing
  baseline. Replace with computed best-day-best-hour from last 60 days of
  `Raw_Posts` (port the `timingHeatmap` logic from `lib/aggregate.ts`).
- Reshape the weekly prompt per [BACKLOG.md](BACKLOG.md) §2D:
  - **Top-5 per bucket** (pillar, format, hook, spotlight-type), not
    top-5 overall
  - **Bottom-3 per bucket** as "what not to do"
  - **2-3 annotated few-shot examples** ("why this worked" / "why this
    flopped")
  - **Computed timing baseline** (from the step above)
- Zero sheet schema change. Zero dashboard change. Zero architecture
  change. Just a pipeline commit.

**Why first:** highest-leverage single change in the whole backlog.
Weekly verdict + calendar quality jumps the day this ships.

**Done when:** weekly-no-code run produces a diagnosis that references
specific underperformers + a data-driven timing recommendation.

---

### Step 2 — LLM abstraction seam (week 2, one commit)

**New files:** `facebook-pipeline/src/llm/client.py`,
`facebook-pipeline/src/llm/anthropic_adapter.py`.

- `LLMClient.from_env(stage_prefix)` reads `<STAGE>_PROVIDER`,
  `<STAGE>_MODEL`, `<STAGE>_API_KEY` — see [PROVIDER_SWITCHING.md](PROVIDER_SWITCHING.md)
  for the full env contract.
- Anthropic adapter only. No OpenAI/Gemini/Mistral yet.
- Port the three AI call sites in `classify.py` (`classify_posts_v2`,
  `generate_weekly_diagnosis`, `generate_content_calendar`) onto the
  client. Preserve the existing `_call_with_retry` backoff and
  salvage behavior.
- **Goal: byte-identical output** to current state. This is a refactor,
  not a feature. Diff the output for one run — if anything changed, the
  port is wrong.

**Why second:** installs the seam so future provider additions are a
~1 day job instead of a refactor. Costs no user-visible change.

**Done when:** a weekly run against the new code produces the same
diagnosis + calendar as the last run against the old code, and env vars
can swap model within Anthropic (e.g. Sonnet → Haiku) via config only.

---

### Step 3 — Native classifier + AI-disabled mode (week 3-4, 2-3 commits)

**New files:** `facebook-pipeline/src/classify_native.py`,
`facebook-pipeline/scripts/measure_native.py`,
`.github/workflows/weekly-no-ai.yml`.

**Dashboard changes:** consolidated `StalenessBanner` (4 states including
AI-disabled), empty-state copy on `/strategy` and `/plan` when artifacts
are missing.

- **`classify.py --engine native`**: rule-based classifier for
  `content_pillar`, `funnel_stage`, `language` only. Everything else
  stays AI.
- **Measurement script (not CI)**: runs native against the last 90 days
  of AI-labeled `Classifications` rows and prints per-field agreement.
  Iterate until the floors are hit:
  - `content_pillar` ≥ 75% agreement with AI
  - `funnel_stage` ≥ 80%
  - `language` ≥ 95%
- **`weekly-no-ai.yml`**: extract → classify (native) → analyse. No
  Strategy, no Plan. Consumes no AI credits.
- **Dashboard**: Strategy + Plan pages render an "AI disabled" empty
  state instead of a stale artifact when the run didn't produce one.
  Banner tells the reader explicitly.
- Design handoff lands in parallel at the start of this step — see
  [DESIGN_HANDOFF.md](DESIGN_HANDOFF.md).

**Why third:** unlocks operation without AI spend or when credits run
out. The measurement script is the gate — don't flip the workflow
until the floors hit.

**Done when:** a weekly-no-ai run writes `Summary_*` tabs and classified
posts without any Anthropic call, and the dashboard renders honestly
against that data (no "as of yesterday" lies).

---

## What's explicitly deferred

These are in [ARCHITECTURE.md](ARCHITECTURE.md) but **not in this
roadmap**. They get revisited only if (a) a second writer appears,
(b) you hire someone, or (c) a provider outage actually burns a week
of output.

| Deferred item | Why not now |
|---|---|
| `Run_Ledger` tab + mutex | GitHub Actions `concurrency:` field covers single-writer locking for free |
| `source_hash` + `engine_version` columns on Summary tabs | N=1 project; git history is sufficient audit |
| OpenAI / Gemini / Mistral adapters | Anthropic works; add a second provider only when Anthropic actually fails |
| 5 of 8 `Summary_*` tabs (Moving averages, Anomalies, Changepoints, Sentiment, Retention) | Add when the analysis actually needs them. Summary_Trends + Summary_RedFlags + Summary_Reels cover 90% of current use |
| `Run_Ledger_Archive` | Same rationale — no archival consumer yet |
| RunPicker UI component | No one has asked to view "last week's verdict" |
| Per-provider prompt templates + salvage functions | One provider = one template. Templatize when a second provider's output shape forces it |
| CLI rollback tooling | `git revert` + a manual sheet paste handles the 1x/year case |

## Sequencing rationale

Lowest-risk-highest-impact first. Step 1 is a pipeline-only commit that
ships user-visible value in a day. Step 2 is a refactor with zero
user-visible change — only justified because it unblocks step 3 and
future provider work. Step 3 is the first place UI design work is
needed, so design handoff starts in parallel.

If a step's "done when" criterion can't be verified, the step isn't
done. Report what shipped, not what was attempted.

## After step 3

Pick from [BACKLOG.md](BACKLOG.md) — the Phase 2 analytics improvements
(shrinkage, temporal decay, log-transform on reach) are the obvious
next targets. The post-level drill-down (§3A) is a separate track that
doesn't depend on any of this.

Revisit the deferred table above quarterly. If nothing has triggered
the (a)/(b)/(c) conditions, leave them deferred.
