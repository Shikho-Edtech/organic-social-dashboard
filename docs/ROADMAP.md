# ROADMAP

**Last updated:** 2026-04-28
**Status:** current execution plan. The 11-step ARCHITECTURE migration is
largely complete; day-to-day work has moved on to UX correctness and
brand-team utility (Sprint P7, below).

---

## Sprint P7 — Mon-Sun reporting reframe, locking, multi-metric ranking, mid-week diagnosis

**Why now:** brand-team review session 2026-04-28 surfaced five concrete
gaps. (1) Week semantics were inconsistent — labels said one thing, the
analysis cohort sliced another. (2) Running-week strategy + plan were
silently regenerated on every cron, breaking trust in "the plan is
fixed." (3) Every ranking on every page was hardwired to reach — brand
team needs interactions / engagement-rate / shares as first-class
ranking dimensions. (4) "Strategy" page is actually a diagnosis output;
the name was misleading. (5) A `Diagnosis · This week` view is dead
weight 4 days a week without a mid-week run, since the verdict only
generates Monday after the previous week closes.

Sprint P7 ships a reframe across all three: time semantics, plan stability,
and metric-driven ranking. Locked v1 scope below.

### Sprint P7 v1 spec (locked 2026-04-28)

#### Renames + URL migrations
- **Strategy → Diagnosis.** Page label, URL path (`/strategy` → `/diagnosis`,
  no redirect), nav entry, hero card eyebrow, sheet column references that
  surface to UI. The pipeline-side `DIAGNOSIS_PROMPT_VERSION` field already
  uses the diagnosis term; the rename is purely surface.

#### Week semantics (already partially shipped today, lock the contract)
- BDT Mon-Sun is the canonical week. `week_ending` = closing Sunday.
- Pipeline cohort (`this_week` / `previous_week` / `last_7` / `prev_7` in
  `classify.py`) and dashboard range pickers (`bdtNow()` in `lib/aggregate.ts`)
  both honor BDT Mon-Sun. Done in commits `6809e5d`, `5875145`, `e795804`.
- "This week" / "Last week" / "Next week" wording is consistent everywhere.
  Outcomes selector copy: rename "current week" → "This week".

#### Week selectors on time-bucketed pages
- **Diagnosis page**: This week · Last week (URL param `?week=YYYY-MM-DD`)
- **Plan page**: This week · Next week · Last week
- **Outcomes page**: unchanged (already has the pattern; copy update only)

#### Mid-week diagnosis run (NEW — unblocks Diagnosis "This week" view)
Without this the "This week" Diagnosis view is empty Mon-Wed, populated
Thu-Sun (via mid-week cron), refreshed Mon-Sun (via Monday end-of-week cron).

- New workflow: `.github/workflows/midweek-diagnosis.yml`
- Cron: Thursday 04:00 UTC = 10:00 BDT
- Pipeline mode: `python main.py --mode midweek` — runs fetch + classify +
  diagnosis only; **skips** strategy + calendar + plan_narrative + outcome_log
- Cohort: Mon-Wed (3 full days) + Thursday morning of running week
- Diagnosis prompt: gets a `PARTIAL_WEEK` banner so the model qualifies
  claims with "so far this week" instead of definitive end-of-week language
- Sheet write: appended to `Weekly_Analysis` as a separate row with
  `engine="ai-midweek"` for the same `week_ending`. End-of-week Monday cron
  produces a second row (`engine="ai"`) for the now-closed week.
- Dashboard: Diagnosis "This week" tab reads the latest mid-week row; shows
  a "Preliminary, mid-week (Thu)" pill + timestamp on the verdict card

#### Lock running-week artifacts (v1) + manual unlock (v2)
- **v1 (Sprint P7)**: pipeline writers for `Content_Calendar`,
  `Plan_Narrative`, `Strategy` skip overwriting an existing row whose
  `week_ending` matches the running week. Diagnosis is exempt — it gets
  refreshed by the mid-week + Monday cycle so its overwrites are intentional.
  Implementation: read existing row before write; if engine field present and
  matches expected source, skip; else write.
- **v2 (deferred)**: "Unlock & regenerate this week" button on Diagnosis +
  Plan pages. Sets a `force_regenerate` flag the next pipeline run honors.

#### Top-level multi-metric ranking selector (Flavor B — multi-select equal weight)
- Multi-select pill component: `Total Reach · Interactions · Engagement Rate · Shares`
- Equal-weight averaging when 2+ selected; single-select still works
- URL param `?metric=reach,interactions` (persistent across page nav)
- Default: `?metric=reach` (today's de-facto behavior)
- Pages with the page-level selector: **Overview · Trends · Engagement ·
  Timing · Reels · Explore** (6 pages)
- Pages WITHOUT the selector: **Diagnosis · Plan · Outcomes**
- Engagement page: also gets a box-level selector on the **Format × Hour**
  chart (independent of the page-level selector since Engagement page itself
  doesn't have one)

##### Selector propagation contract per page
| Page | Wired by selector | Untouched |
|---|---|---|
| Overview | trend chart, content pillars table, biggest-numbers / followers panel | format distribution |
| Trends | every trend chart | — |
| Engagement | (none — page-level selector absent) | — |
| Engagement / Format×Hour box | the box itself only | rest of page |
| Timing | day×hour heatmaps + summary | — |
| Reels | Top-10 lists (plays / watch time / followers gained) ranking | retention curves, reels table itself (already sortable) |
| Explore | every ranking list (top posts, etc) | — |

#### Engagement page top-row cleanup
- **Keep** top row 5 boxes: Best Format, Best Pillar, Best Hook, Best Spotlight Type, Best Tone
- **Remove** second row 4: Virality, Discussion Quality, Sentiment Polarity, Save Rate
- Move definitions of removed boxes into the methodology footer at the bottom
  of the page, as plain text (these were placeholder/awaiting-pipeline-data
  anyway and added clutter without value)

#### Terminology pass
- `ER` → `engagement rate` everywhere it appears in UI copy
- Strip `+`, `-`, em-dashes / en-dashes from labels (matches the global
  CLAUDE.md ban for professional output)
- Keep "Reels" page name — page strictly filters `is_reel=true`, the name
  is accurate and brand-team-recognizable. Revisit only when expanding to
  multi-platform short-form (IG Reels, YouTube Shorts, TikTok)

### Sprint P7 phasing

#### Phase 1 — UI cleanup + rename + Plan week selector (~3-4 days)
1. Terminology sweep across all pages (`ER` → `engagement rate`, dashes
   → words / colons)
2. Engagement page: drop 4 second-row boxes; keep top 5; methodology
   footer absorbs definitions
3. Format × Hour box-level metric selector
4. Strategy → Diagnosis full rename (label + URL + nav + sheet column
   references that surface to UI)
5. Plan page week selector (This / Next / Last week, mirroring `/outcomes`)
6. Outcomes selector copy update ("current" → "This")

**Done when:** all 6 changes deployed, brand-audit clean, mobile
checklist passes at 360/768/1280, no broken links from old `/strategy` URL.

#### Phase 2 — locking + Diagnosis week selectors + mid-week run (~1 week)
1. Pipeline `--mode midweek` flag + new Thursday cron workflow
2. Diagnosis prompt: `PARTIAL_WEEK` banner injection for mid-week mode
3. Pipeline `Weekly_Analysis` writer: append (not replace) for same
   week_ending with different engine values
4. Pipeline writers for `Strategy`, `Content_Calendar`, `Plan_Narrative`:
   skip-on-existing-running-week guard
5. Dashboard: Diagnosis week selector reading the appropriate row
   (mid-week vs end-of-week) per `engine` field
6. Dashboard: "Preliminary, mid-week (Thu)" pill on the This-week
   diagnosis card
7. Plan-vs-actual comparison enhancement (lift more from `/outcomes`
   into the per-week Plan view)

**Done when:** Thursday mid-week cron produces a fresh row;
`Diagnosis · This week` shows the mid-week verdict with the pill;
re-running Monday's cron does NOT overwrite Plan or Strategy for the
just-closed week unless the row is missing.

#### Phase 3 — multi-metric ranking selector (~1.5-2 weeks)
1. Build `<MetricSelector>` component (multi-select pills, URL-persistent)
2. Wire the selector into Overview (trend chart, pillars table, followers
   panel — NOT format distribution)
3. Wire into Trends + Timing + Reels + Explore per the propagation contract
4. Wire box-level into Engagement Format × Hour
5. Sheet/aggregator-side: helper that takes a metric set and returns a
   composite rank (averaged equal-weight)

**Done when:** changing the page-level metric selector on any of the 6
pages re-ranks every applicable list/chart on that page; URL param
`?metric=...` survives nav and reload.

### Sprint P7 v2 deferrals
- Mid-week plan slot editing UI (move/edit individual slots within a
  running week)
- Manual "Unlock & regenerate this week" button per Diagnosis / Plan
- Multi-metric weight sliders (Flavor A — composite scoring with
  user-assigned weights). Phase 3 ships equal-weight; sliders are an
  additive component change, not a refactor.

### Cross-repo lockstep contract for Sprint P7
| Change | Pipeline | Dashboard |
|---|---|---|
| Diagnosis rename | sheet column references that surface to UI (none today; `Strategy` sheet tab + `engine="ai"` value stay) | URL path `/strategy` → `/diagnosis`, label, nav entry, all internal references |
| Mid-week run | new workflow + `--mode midweek` + new `engine="ai-midweek"` value | week selector reads engine field, "Preliminary" pill |
| Locking | writer skip-on-existing-week logic | (no read-side change; the absence-of-overwrite is invisible) |
| Multi-metric | (none — pipeline already writes all 4 raw metrics per row) | full UI surface |

---

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
