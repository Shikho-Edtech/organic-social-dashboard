# ARCHITECTURE.md — 6-Stage Modular Workflow

Authoritative spec for how the Shikho organic-social system is organised
after the Apr-2026 rethink. Supersedes the implicit 5-stage pipeline
design in `facebook-pipeline/WORKFLOW.md`. Nothing here is built yet —
this is the plan the repo is refactored toward.

**Driving rule:** every stage is a standalone, independently runnable,
independently scheduled function. The dashboard renders useful analytics
even when every AI stage is disabled. Every row the dashboard reads is
traceable to the exact run that produced it.

Last revised: 2026-04-20 (gap-closure pass).

---

## 1. Design principles

1. **Stage independence.** Each stage is its own entry point, its own
   CLI, its own config surface, its own log. A stage reads artefacts
   written by prior stages; it does not import or call them.
   Substitutable at the workflow boundary, not the function boundary.

2. **AI-optional by construction.** Stages 1, 2, 4, 5 run without any AI
   provider configured. Stages 3 and 6 are additive. The dashboard
   renders useful analytics on the native-only outputs; AI stages
   augment but are never load-bearing for the analytical pages.

3. **Pluggable AI providers.** No stage imports a provider SDK directly.
   AI calls go through an `LLMClient` abstraction with per-provider
   adapters AND per-provider prompt templates. Provider + model + key
   are selected per stage via env vars.

4. **Google Sheets is the message bus — but with a ledger.** Every
   stage writes output to a dedicated tab with a dedicated schema and a
   dedicated status row in `Analysis_Log`. Every write is gated by the
   `Run_Ledger` mutex (§3). No cross-stage in-memory handoff.

5. **Run identity is global.** Every workflow run has one `run_id`. It
   propagates through every stage, every `Analysis_Log` row, and every
   `Summary_*` row the stages write. The dashboard asks for "the latest
   fully-successful run_id" and reads a consistent cohort of data.

6. **Idempotency + replayability.** Re-running the same stage against
   the same inputs produces identical outputs (fixed seeds,
   deterministic ordering, content-addressable hashes on source data).

7. **The dashboard is a pure reader.** Stages 1–4 write summary tabs;
   stage 5 reads them. Heavy stats live in Python, not TypeScript.

---

## 2. The six stages

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Google Sheets (message bus)                      │
│   Run_Ledger + Analysis_Log govern ordering, identity, cost          │
└─────────────────────────────────────────────────────────────────────┘
    ▲          ▲          ▲          ▲          ▲         ▲
    │          │          │          │          │         │
┌───┴───┐┌────┴────┐┌────┴────┐┌────┴────┐┌────┴────┐┌────┴────┐
│1 Extr.││2 Native ││3 AI Aug.││4 Analyse││5 Dashbrd││6 Strategy│
│native ││classify ││ pluggab.││ native  ││ reader  ││pluggable│
└───────┘└─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
     │        │          │          │           │          │
     ▼        ▼          ▼          ▼           ▼          ▼
  Raw_*   Classifi-   Classifi-  Summary_*  (serves)    Weekly_
          cations     cations                           Analysis,
          (native)    (ai-*)                            Content_
                                                        Calendar
```

### Stage 1 — Data Extraction (native)

- **Purpose:** Pull raw Facebook Graph data into Sheets.
- **Entry point:** `facebook-pipeline/stages/extract.py`
- **CLI:** `python -m stages.extract --since YYYY-MM-DD --until YYYY-MM-DD`
- **Dependencies:** `requests`, `gspread`. No AI libs, no pandas.
- **Inputs:** `FB_PAGE_ID`, `FB_PAGE_TOKEN`, `GOOGLE_SHEETS_CREDS_JSON`,
  `GOOGLE_SPREADSHEET_ID`, `RUN_ID` (injected by workflow or CLI flag).
- **Outputs:** `Raw_Posts`, `Raw_Video`, `Page_Daily`. Every new row
  tagged with `run_id` + `ingested_at`.
- **Ledger:** Writes `Run_Ledger` start + finish rows. Stage refuses to
  start if another stage-1 row is open with `status = running` younger
  than 1h (concurrent-run guard).
- **Failure mode:** Exits non-zero; Analysis_Log row
  `extract_status = failed` with error summary. Downstream stages see
  dependency staleness (§3.3) and decide fail/warn per config.

### Stage 2 — Native Classification (no AI)

- **Purpose:** Rule-based classifier populating a baseline subset of
  `Classifications` so every dashboard analytical page works without AI.
- **Entry point:** `facebook-pipeline/stages/classify_native.py`
- **CLI:** `python -m stages.classify_native [--rebuild-all]`
- **Quality contract:** Bound by the native-classifier accuracy floor
  in §7. Stage emits a self-test on every run; if the most recent
  measurement falls below floor, stage logs `quality_warning` in
  Analysis_Log but still runs (floor is monitored, not enforced).
- **Fields populated** (always written, never left blank):
  `content_pillar`, `funnel_stage`, `caption_tone`, `language`,
  `has_cta`, `cta_type`, `spotlight_type`, `spotlight_name`, `format`,
  `classifier_engine = "native-v<n>"`, `prompt_version = "native-v<n>"`,
  `classifier_confidence = 0.5`.
- **Fields deliberately left blank:** `hook_type`, `visual_style`,
  `primary_audience` (when caption is ambiguous). These are AI-only
  fields — stage 3 fills them.
- **Ledger + identity:** Every row tagged with
  `classifier_run_id = <run_id>`, `source_hash = sha256(caption + type
  + is_reel)`. Re-running produces identical output when inputs
  unchanged.

### Stage 3 — AI Classification Augmentation (pluggable AI)

- **Purpose:** Overwrite or enrich rows where the native classifier
  was low-confidence or couldn't populate AI-only fields.
- **Entry point:** `facebook-pipeline/stages/classify_ai.py`
- **CLI:**
  `python -m stages.classify_ai [--since N_DAYS] [--provider anthropic]
   [--model claude-haiku-4-5] [--min-confidence 0.8]`
- **Target rows:** Any row where `classifier_engine` starts with
  `native-` OR `prompt_version` is stale OR AI-only fields are blank.
  Rows with non-empty `manual_override` are skipped entirely.
- **Cache key:** `(post_id, classifier_engine, prompt_version)`.
  Changing provider, model, or prompt version forces re-classification.
- **Writes:** Updates `Classifications` rows in place.
  `classifier_engine = "ai-<provider>-<model>"`,
  `prompt_version = "v2.3"` (or successor), `classifier_confidence` as
  self-reported, adds `classifier_run_id` + `provider` + `model` +
  `input_tokens` + `output_tokens` + `cost_usd`.
- **Ledger:** Writes start + finish rows to `Run_Ledger`.
- **Skippable:** Stage 4 and Stage 5 continue to work on native labels
  when stage 3 never runs.

### Stage 4 — Native Analytics (no AI)

- **Purpose:** Compute every aggregation, statistical summary, ranking,
  decomposition, and anomaly flag. Write to `Summary_*` tabs.
- **Entry point:** `facebook-pipeline/stages/analyse.py`
- **CLI:**
  `python -m stages.analyse [--range 7|14|30|60|90|180] [--all-ranges]`
- **Dependencies:** `pandas`, `numpy`, `scipy`, `statsmodels`, `ruptures`,
  `sklearn` (IsolationForest), `lifelines`. Zero AI libs.
- **Determinism:** All random-seeded algorithms (IsolationForest)
  use `random_state = int(run_id[-8:], 16) % 2**31`. Every groupby has
  an explicit sort. Re-running against frozen inputs produces
  byte-identical Summary rows.
- **Integrity columns on every Summary_* row** (§4):
  `run_id`, `computed_at`, `source_hash`, `engine_version`, `row_range`.
- **Computes** (authoritative list lives next to the code):
  - Reach-weighted ER, 95% CI lower bound (today's `lib/stats.ts`
    rules, now in Python).
  - Empirical-Bayes shrinkage of per-pillar / per-format means toward
    the global mean.
  - Exponential temporal decay with 30-day half-life on reach weights.
  - Geometric mean on reach (heavy-tailed distribution).
  - Virality coefficient (`shares / reach`), discussion quality
    (`comments / reactions`), sentiment polarity
    (`(love + wow) / max(1, sad + angry)`), CTR proxy (`clicks / reach`).
  - Timing grid (day × hour, reach-weighted ER + reliability n).
  - Reel retention curves (Kaplan-Meier).
  - Trend: MSTL seasonal decomposition, IsolationForest anomaly flags,
    ruptures change-point detection on follower net change.
- **Outputs:** `Summary_Overview`, `Summary_Pillar`, `Summary_Format`,
  `Summary_Spotlight`, `Summary_Timing`, `Summary_Reels`,
  `Summary_Trends`, `Summary_RedFlags`. Retention policy: last 4
  `run_id`s kept per tab, older pruned (§8).
- **Ledger:** Writes start + finish rows.
- **Dependency contract:** Refuses to run if the latest
  `extract_status = success` is older than 25h (configurable via
  `ANALYSE_MAX_EXTRACT_AGE_H`). This prevents stage 4 from computing
  on yesterday's extract.

### Stage 5 — Dashboard (TypeScript, reader-only)

- **Purpose:** Present the analytics. No computation beyond formatting,
  filtering, and client-side interactivity.
- **Reads:** `Summary_*` tabs first (for every analytical page),
  `Raw_Posts` + `Classifications` only for the Explore workbench and
  Post drill-down (Phase 3A).
- **Run-cohort read:** Dashboard reads `Analysis_Log` first, picks the
  latest `run_id` where `analyse_status = success`, then reads only
  `Summary_*` rows tagged with that `run_id`. Guarantees the page is
  internally consistent.
- **What the dashboard no longer does:** `groupStats`, `summarize`,
  `tCritical95`. `lib/aggregate.ts` + `lib/stats.ts` become thin
  formatter wrappers; the math lives in Python.
- **AI-optional mode:** Strategy and Plan pages render an "AI stage
  disabled" empty state (§9) when no recent `Weekly_Analysis` /
  `Content_Calendar` row exists. Every other page is unaffected.
- **StalenessBanner:** single banner per page, one severity (worst of
  the dependency chain), tap-to-expand for per-stage detail (§9).

### Stage 6 — AI Strategy + Plan (pluggable AI, two sub-stages)

- **6a Diagnose:** `stages/diagnose.py` → `Weekly_Analysis`.
- **6b Calendar:** `stages/calendar.py` → `Content_Calendar`.
- **Reads:** `Summary_*` tabs (NOT raw data) so diagnosis sees the
  exact numbers the dashboard shows. The hardcoded timing baseline at
  `classify.py:738-742` is replaced by reading `Summary_Timing`.
- **Prompt improvements (from Backlog 2D, now architecture-level):**
  top-5 per bucket (pillar / format / hook / spotlight-type),
  bottom-3 per bucket, computed timing baseline, few-shot examples.
- **Provider-specific prompts:** Each stage ships with one prompt
  template per supported provider (§5). Salvage logic
  (`_salvage_partial_calendar`) has a per-provider variant.
- **Outputs:** `Weekly_Analysis` / `Content_Calendar` rows tagged with
  `run_id`, `provider`, `model`, `input_tokens`, `output_tokens`,
  `cost_usd`.
- **Skippable:** Dashboard hides Strategy / Plan when neither has a
  successful row for the latest run.

---

## 3. Run identity + ledger

The two global invariants that make stage independence safe.

### 3.1 `run_id`

- Format: ULID (26 chars, sortable, timestamp-prefixed). Example
  `01HXYZ12345ABCDEF67890GHIJK`.
- Generated once per workflow run (`daily.yml` or `weekly.yml`) as the
  first step. Passed to every stage via `RUN_ID` env var.
- For ad-hoc manual runs (`python -m stages.extract`), the stage
  generates its own `run_id` if `RUN_ID` is unset.
- Every `Analysis_Log` row carries `run_id`.
- Every write to `Raw_Posts`, `Raw_Video`, `Page_Daily`, `Classifications`,
  and every `Summary_*` tab carries `run_id` as a column.

### 3.2 `Run_Ledger` tab (new)

Poor-man's mutex. Prevents two concurrent workflow runs from writing
the same tab.

| Column | Type | Notes |
|---|---|---|
| `run_id` | string | ULID |
| `stage` | string | `extract` / `classify_native` / `classify_ai` / `analyse` / `diagnose` / `calendar` |
| `status` | string | `running` / `success` / `failed` / `aborted` |
| `started_at` | ISO | BDT |
| `finished_at` | ISO | empty while running |
| `worker` | string | GitHub Action run URL or `local:<hostname>` |
| `notes` | string | free-form; error summary on failure |

**Write semantics:**
- Stage start: appends a row with `status=running`, `started_at=now`.
- Stage finish: updates its own row to `success` / `failed` with
  `finished_at` + `notes`.
- Stage start refusal: if there's already an open (`running`) row for
  the same `stage` younger than 1h, the stage exits with code 2 and
  logs `aborted` to the ledger. 1h is long enough for any stage today,
  short enough that a crashed worker doesn't block the next cron.
- Ledger retention: last 200 rows; older rows archived to
  `Run_Ledger_Archive` monthly.

### 3.3 Dependency freshness check

Each stage has a declared dependency in code:

```python
# stages/analyse.py
DEPENDS_ON = ["extract", "classify_native"]
MAX_DEPENDENCY_AGE_H = 25
```

On start, the stage reads `Run_Ledger`, finds the most recent
`success` row for each dependency, checks age. Too old → stage exits
with code 3 (distinct from ledger refusal). `MAX_DEPENDENCY_AGE_H` is
env-overridable so manual/debug runs can ignore it.

---

## 4. Summary_* integrity contract

Every row in every `Summary_*` tab carries these columns. Dashboard
refuses to render rows missing them; Sheets migration scripts must
backfill or drop pre-contract rows.

| Column | Purpose |
|---|---|
| `run_id` | The run that produced this row. Dashboard reads one run_id at a time. |
| `computed_at` | BDT ISO timestamp. Shown in StalenessBanner. |
| `source_hash` | SHA-256 of the input slice (see below). Dashboard warns if it doesn't match the live Raw_Posts hash for the same slice. |
| `engine_version` | Short git SHA of the pipeline repo at compute time. Proves which code produced the row. |
| `row_range` | e.g. `7d`, `90d`. Which range window this row summarises. |
| `n_posts` | Number of posts the row aggregates over (already a thing, formalised here). |

**`source_hash` computation:** Stage 4 computes the hash over a
canonical serialisation of the filtered input for that row
(sorted `(post_id, reach, interactions, classification_engine)` tuples).
When Raw_Posts or Classifications change within the same run, the
hash changes, the dashboard sees a mismatch, and the banner upgrades to
`warn`.

**Why this matters:** Today's dashboard math is in TS and runs against
live reads of Raw_Posts. After refactor, there's an extra indirection
(`Summary_*`), and the failure mode "the summary was computed against
yesterday's data, but today's dashboard reads them together" is new.
The integrity columns make that visible instead of silent.

---

## 5. Pluggable AI abstraction

### 5.1 Two-layer abstraction

```
stage code
   │  calls llm.complete(prompt_key="classify-v2.3", inputs={...})
   ▼
LLMClient (provider-agnostic)
   │  resolves prompt template for current provider
   │  formats request per provider SDK
   │  parses response per provider (JSON mode, tool calls, etc.)
   │  applies per-provider salvage logic
   ▼
Provider adapter (anthropic | openai | google | mistral | ...)
```

The stage never knows which provider is active. The adapter never
knows which stage is calling.

### 5.2 `LLMClient` interface

```python
# facebook-pipeline/src/llm/client.py
class LLMResponse(TypedDict):
    text: str
    parsed: dict | list | None   # JSON already parsed when response_format=json
    input_tokens: int
    output_tokens: int
    cost_usd: float
    provider: str
    model: str
    stop_reason: str

class LLMClient(Protocol):
    def complete(
        self,
        *,
        prompt_key: str,            # "classify-v2.3" / "diagnose-v1" / "calendar-v1"
        inputs: dict,               # values substituted into the template
        max_tokens: int,
        stream: bool = False,
        response_format: Literal["text", "json"] = "text",
        temperature: float = 0.3,
    ) -> LLMResponse:
        ...
```

### 5.3 Prompt template system

The key piece the prior draft missed. Strings don't port between
providers; templates do.

```
src/llm/prompts/
├── __init__.py              — registry: prompt_key → {provider → PromptTemplate}
├── classify_v2_3/
│   ├── anthropic.py         — XML-structured, Claude tolerance for long system
│   ├── openai.py            — JSON mode flag, no XML, markdown structure
│   ├── google.py            — Gemini structured output schema
│   └── shared_rules.py      — language-agnostic constants (pillar list, etc.)
├── diagnose_v1/
└── calendar_v1/
```

Each `PromptTemplate` has:

```python
class PromptTemplate:
    def render(self, inputs: dict) -> RenderedPrompt:
        """Returns {system, user, response_schema?, salvage_fn}."""
        ...
```

Migration of an existing prompt to a new provider = adding a new file
in the prompt_key directory. Old providers continue to work.

### 5.4 Per-provider salvage

`_salvage_partial_calendar` stays, but moves into
`prompts/calendar_v1/anthropic.py` as the `salvage_fn`. OpenAI's JSON
mode can fail differently (truncated object, not unterminated string);
`prompts/calendar_v1/openai.py` ships its own salvage. The client calls
whichever salvage is registered for the active provider.

### 5.5 Provider adapters (lazy imports)

```
src/llm/providers/
├── anthropic_provider.py    — import anthropic only on first use
├── openai_provider.py       — same, openai
├── google_provider.py       — same, google.genai
└── mistral_provider.py      — same
```

`get_provider(name)` does the import inside a try/except with a clear
error — running only on Anthropic does not require installing `openai`.

### 5.6 Per-stage configuration

```
# Stage 3 (AI classification)
AI_CLASSIFY_PROVIDER=anthropic
AI_CLASSIFY_MODEL=claude-haiku-4-5-20251001
AI_CLASSIFY_KEY=sk-ant-…
AI_CLASSIFY_MAX_TOKENS=4096

# Stage 6a
AI_DIAGNOSE_PROVIDER=openai
AI_DIAGNOSE_MODEL=gpt-4o-mini
AI_DIAGNOSE_KEY=sk-…
AI_DIAGNOSE_MAX_TOKENS=8000

# Stage 6b
AI_CALENDAR_PROVIDER=google
AI_CALENDAR_MODEL=gemini-2.0-flash-exp
AI_CALENDAR_KEY=AI…
AI_CALENDAR_MAX_TOKENS=24000

# Global default fallback (used when per-stage unset)
AI_DEFAULT_PROVIDER=anthropic
AI_DEFAULT_KEY=sk-ant-…
```

Unset required env vars for a scheduled AI stage → stage marks itself
`skipped` with a reason. Other stages proceed.

### 5.7 Shared retry

`_call_with_retry` moves to `llm/client.py`. Each adapter maps native
exceptions to `LLMRetryable` / `LLMFatal`. Retry schedule
(2 s → 8 s → 30 s) unchanged.

---

## 6. Orchestration — two workflows, not six

The prior draft proposed six workflow files. Trade: independence at
the workflow level sounds clean but multiplies the cron surface and
removes ordering guarantees. Consolidated to two + one manual.

### 6.1 `.github/workflows/daily.yml`

Runs every day at 03:00 UTC.

```yaml
jobs:
  run:
    steps:
      - generate-run-id          # sets RUN_ID for downstream steps
      - python -m stages.extract
      - python -m stages.classify_native
      - python -m stages.analyse
```

Each step propagates exit code. Downstream step runs only on prior
success (GitHub Actions default). Per-stage fallback handled inside
the stage — stage-native retries are for transient issues; cross-stage
failures simply stop the chain.

### 6.2 `.github/workflows/weekly.yml`

Runs every Monday at 04:00 UTC.

```yaml
jobs:
  run:
    steps:
      - generate-run-id
      - python -m stages.extract
      - python -m stages.classify_native
      - python -m stages.classify_ai     # continue-on-error
      - python -m stages.analyse
      - python -m stages.diagnose        # continue-on-error
      - python -m stages.calendar        # continue-on-error
```

AI stages marked `continue-on-error` so a credit outage on stage 3
doesn't kill the analytics chain. Dashboard surfaces which stages
succeeded via the StalenessBanner.

### 6.3 `.github/workflows/stage-manual.yml`

`workflow_dispatch` with inputs:

```yaml
inputs:
  stage: {type: choice, options: [extract, classify_native, classify_ai, analyse, diagnose, calendar]}
  run_id: {type: string, default: ""}      # reuse an existing run_id or blank for fresh
  args: {type: string, default: ""}         # forwarded to CLI
```

For debugging, replays, ad-hoc runs. No scheduled cron.

### 6.4 `.github/workflows/weekly-no-ai.yml`

Same as `weekly.yml` but omits stages 3, 6a, 6b. First-class path for
cost-saving sprints or credit outages lasting more than a week.

---

## 7. Native classifier quality contract

AI-optional only matters if stage 2 produces non-trivial labels.

### 7.1 Accuracy floor (measured, not asserted)

On the current 90-day corpus, native-v1 must agree with the AI labels
(the current `v2.3` classifier) at:

| Field | Floor | Rationale |
|---|---|---|
| `language` | 95% | Script detection is near-deterministic. |
| `content_pillar` | 75% | Keyword overlap between pillars; this is the hardest. |
| `funnel_stage` | 80% | Three options, rules are tractable. |
| `caption_tone` | 70% | Tone is genuinely judgment; accept lower. |
| `has_cta` | 90% | Phrase detection. |
| `cta_type` | 80% | Bucketed phrase lookup. |
| `spotlight_type` | 85% | Known name list does most of the work. |
| `spotlight_name` | 85% | Same. |
| `format` | 100% | Derived from Raw_Posts, not classification. |

Fields explicitly excluded (AI-only, left blank by stage 2):
`hook_type`, `visual_style`, `primary_audience`.

### 7.2 Measurement harness (ship before the classifier)

`facebook-pipeline/stages/measure_native_quality.py` — runs native-v1
against the current corpus, compares against the most recent AI labels
per post, emits a report:

```
Field                    Agreement   Floor   Pass/Fail   N
content_pillar           0.782       0.75    PASS        847
funnel_stage             0.814       0.80    PASS        847
caption_tone             0.661       0.70    FAIL        847
...
Summary:  8/9 PASS · FAIL on caption_tone
```

CI job runs this on every push touching `classify_native.py`. A
regression below floor is a PR-blocking failure.

### 7.3 Build order

1. Ship the measurement harness against the current v2.3 AI labels.
2. Ship `classify_native.py` iteratively, field-by-field, until every
   field clears its floor. If a field can't clear floor after two
   attempts, drop it from the stage-2 contract (leave blank) and
   document the exclusion.
3. Only then wire stage-2 into the daily workflow.

**Why strict:** without this, "AI-optional" is a word, not a property.
The analytical pages will look populated but the pillar/format
aggregates will be wrong enough to invalidate the strategy they drive.

---

## 8. Cost + key observability

### 8.1 `Analysis_Log` schema extension

| Column (new) | Populated by |
|---|---|
| `run_id` | every stage |
| `extract_status` | stage 1 |
| `classify_native_status` | stage 2 |
| `classify_native_quality_pass` | stage 2 self-test bool |
| `classify_ai_status` | stage 3 |
| `classify_ai_provider` / `_model` | stage 3 |
| `classify_ai_input_tokens` / `_output_tokens` / `_cost_usd` | stage 3 |
| `classify_ai_key_fingerprint` | stage 3 (sha256 of key first 8 chars) |
| `analyse_status` | stage 4 |
| `analyse_rows_written` | stage 4 |
| `diagnose_*` (same pattern as classify_ai) | stage 6a |
| `calendar_*` (same pattern) | stage 6b |
| `run_total_cost_usd` | rolled up by final step |

### 8.2 Per-stage cost tracking

Every AI stage emits `cost_usd = input_tokens × input_rate +
output_tokens × output_rate` with rate tables per provider / model
hardcoded in `llm/pricing.py`. Rate table is a single source of
truth; out-of-date rates are a PR-sized update.

### 8.3 Key lifecycle

- `classify_ai_key_fingerprint` = `sha256(key)[:16]`. Not the key
  itself. Proves which key was in use without leaking it.
- When the fingerprint hasn't changed in 90 days, stage logs
  `key_rotation_warning = true`. Not a hard fail — a nudge.
- On stage-start auth failure (`LLMFatal` with status 401/403), the
  ledger row captures `fail_kind = auth`. Dashboard staleness banner
  can distinguish "credit outage" from "key expired" in its copy.

---

## 9. Summary rollback + retention

### 9.1 Row-level retention

Every `Summary_*` tab keeps the last 4 `run_id`s. On stage-4 finish,
a tail step prunes rows whose `run_id` is not in the latest 4 for
that tab.

### 9.2 Dashboard read pattern

```
1. Read Analysis_Log, pick latest run_id where analyse_status=success.
2. Read Summary_* tabs filtered to that run_id.
3. If latest run is bad (e.g. source_hash mismatch flagged),
   user can manually pick the prior run_id via a range-selector
   escape hatch.
```

The 4-run window is enough to survive one corrupted overnight run
without an emergency re-run. It's small enough that tabs stay under
gspread's row ceiling.

### 9.3 Rollback procedure

"Yesterday's run wrote bad numbers." Operator action:

```
python -m stages.rollback --tab Summary_Pillar --to-run-id <prior>
```

Rollback is a metadata flip, not a re-compute — it writes a new row in
`Analysis_Log` with `analyse_rollback_target = <prior run_id>`. The
dashboard honours this by reading the target run_id instead of the
latest. Fast, reversible, auditable.

---

## 10. Dashboard AI-optional contract

### 10.1 Page × stage matrix (unchanged from prior draft)

| Page | Needs AI? | Reads |
|---|---|---|
| Overview | no | `Summary_Overview`, `Summary_RedFlags`, `Summary_Trends` |
| Content | no | `Summary_Pillar`, `Summary_Format`, `Summary_Spotlight` |
| Timing | no | `Summary_Timing` |
| Reels | no | `Summary_Reels`, `Raw_Video` |
| Trends | no | `Summary_Trends`, `Page_Daily` |
| Explore | no | `Raw_Posts`, `Classifications` (any engine) |
| Strategy | **yes** (stage 6a) | `Weekly_Analysis` |
| Plan | **yes** (stage 6b) | `Content_Calendar` |

### 10.2 Consolidated StalenessBanner

Single banner per page. Severity = worst of the dependency chain.
Copy lead = the most important signal. Tap-to-expand for per-stage
breakdown.

Examples:

```
Overview page, all stages fresh:
┌───────────────────────────────────────────────────┐
│  ✓ Data refreshed 3 hours ago  ·  Analytics run   │
│    01HXYZ…                       (tap for detail) │
└───────────────────────────────────────────────────┘

Strategy page, stage 6a stale 9 days:
┌───────────────────────────────────────────────────┐
│  ⚠ AI strategy is 9 days old — weekly pipeline    │
│    last succeeded Apr 11. Credit outage suspected │
│    (stage 6a failed 3 runs). Tap for detail.      │
└───────────────────────────────────────────────────┘

Any page, source_hash mismatch:
┌───────────────────────────────────────────────────┐
│  ✗ Data inconsistency detected — summary was      │
│    computed against a prior extract. Rerun        │
│    weekly pipeline or roll back to run 01HXWZ…    │
└───────────────────────────────────────────────────┘
```

Expanded detail lists every stage the page depends on, age, provider
(if AI), and cost of the last successful run.

### 10.3 AI-disabled empty state

When stage 6a or 6b has no recent successful row (ever, or more than
30 days):

```
┌──────────────────────────────────────────────────┐
│  AI strategy is not running                       │
│                                                   │
│  This page needs the AI diagnosis stage. Every    │
│  other page still works on the native pipeline.   │
│                                                   │
│  To enable: set AI_DIAGNOSE_PROVIDER, _MODEL,     │
│  _KEY in the pipeline repo's GitHub secrets and   │
│  trigger the weekly workflow.                     │
│                                                   │
│  Last successful run: 47 days ago                 │
│    [View cached version] [Open ARCHITECTURE.md]   │
└──────────────────────────────────────────────────┘
```

Not an error page. An intentional disabled state with an action.

---

## 11. Migration — expanded, with gates

Each step has a **gate**: don't advance until it passes.

1. **Introduce `llm/client.py` + Anthropic adapter + prompt template
   system.** Port one prompt (classify v2.3) to the new system for
   Anthropic only. Gate: weekly run diff between old and new paths
   is byte-identical on classifier output.

2. **Port the other two AI functions (`diagnose`, `calendar`) to
   `LLMClient`.** Still Anthropic-only. Gate: weekly run matches
   prior run to within expected LLM variance.

3. **Ship the native classifier quality harness.** Not the classifier
   yet — just the measurement script running against v2.3 AI labels.
   Gate: harness produces a report for the current 90-day corpus.

4. **Ship `stages/classify_native.py` iteratively.** One field per
   PR, each with a passing harness run. Gate: floor passes for every
   non-excluded field.

5. **Introduce `Run_Ledger` + `run_id` propagation.** Backfill
   `run_id` on existing tabs with a synthetic historical id. Gate:
   two back-to-back manual runs refuse to overlap.

6. **Create `stages/analyse.py` and `Summary_*` tabs.** Populate
   with dashboard still reading old way. Gate: Summary_Pillar rows
   match current `lib/aggregate.ts` output for the same range.

7. **Flip the dashboard to read `Summary_*`.** `lib/aggregate.ts`
   shrinks to a formatter. Gate: QA-pass on every page at 360/768/
   1280 px; no visible numeric regression.

8. **Split stage 6 into `diagnose.py` + `calendar.py`.** Fold in the
   Backlog 2D prompt overhaul (top-5 per bucket, bottom-3, computed
   timing). Gate: one successful weekly run produces richer output
   than the prior single prompt.

9. **Add OpenAI + Gemini adapters + prompt templates.** Run one
   weekly cycle on each. Gate: diagnosis + calendar produce usable
   output on non-Anthropic providers.

10. **Ship AI-optional empty states** and consolidated
    StalenessBanner. Gate: visual QA on a deliberately-disabled AI
    stage.

11. **Ship `weekly-no-ai.yml`.** Gate: one end-to-end run with no AI
    env vars set produces a fully-populated dashboard across every
    non-AI page.

Each step: its own commit, seven-perspective QA gate, CHANGELOG +
DECISIONS + LEARNINGS updates.

---

## 12. What this architecture does not do

Listed so they don't resurface:

- **No microservices.** Stages are Python scripts + one Next.js app.
  Independence is at the workflow level, not runtime.
- **No stage-to-stage direct calls.** Sheets + Run_Ledger is the bus.
- **No on-the-fly AI from the dashboard.**
- **No multi-tenant anything.** Single page, single Shikho account.
- **No paid/organic split.** Organic only.
- **No notification layer** (Slack / email).
- **No CSV export.**
- **No real-time recompute on filter change** — Explore workbench
  continues to filter in-browser over raw data; other pages are
  summary-backed and range-switched.
- **No per-user dashboards** or saved views.

---

## 13. Open decisions (for the first session after this spec)

1. Retention count (4 runs kept per Summary tab) — keep or widen?
2. `MAX_DEPENDENCY_AGE_H = 25` default — keep or loosen for manual
   runs?
3. Native classifier floors — accept the table above or negotiate per
   field after running the harness once?
4. Key rotation warning at 90 days — signal only, or block the run?
5. Which single non-Anthropic provider to productionise first? Default
   recommendation: OpenAI (best structured-output support, closest
   prompt semantics to Anthropic).

Everything else in this doc is committed.
