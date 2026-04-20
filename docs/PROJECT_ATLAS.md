# PROJECT_ATLAS.md

Structural, algorithmic, and historical map of the Shikho organic-social
system. Single source of truth for *what exists, where it lives, why it's
shaped this way, and how it evolved*. Companion to:

- `ARCHITECTURE.md` — authoritative forward spec (6-stage modular,
  pluggable AI, AI-optional dashboard, run identity, integrity).
- `DESIGN_BRIEF.md` — visual / IA handoff for Claude Designer.
- `MASTER_PLAN.md` — phased roadmap (partly superseded by
  `ARCHITECTURE.md`; backlog items still valid).
- `BACKLOG.md` — open items, explicit non-goals.

Last consolidated: 2026-04-20 (gap-closure pass).

---

## 0. At a glance

Two repos, one Google Sheet, one Vercel surface. Single analyst
(Shahriar) checking from mobile on Monday 10:00 BDT.

```
┌────────────────────────────┐      ┌────────────────────────────┐
│ facebook-pipeline (Py)     │──→   │ Google Sheets (message bus)│
│ 2 workflows + 1 manual     │      │ Raw_*, Classifications,    │
│ daily.yml     (no-AI chain)│      │ Summary_*  (stage 4 owned) │
│ weekly.yml    (full chain) │      │ Weekly_Analysis,           │
│ stage-manual.yml (ad-hoc)  │      │ Content_Calendar,          │
│                            │      │ Analysis_Log, Run_Ledger   │
│ stages/                    │      └────────────┬───────────────┘
│  extract · classify_native │                   │ gspread read
│  classify_ai · analyse     │                   ▼
│  diagnose · calendar       │      ┌────────────────────────────┐
│                            │      │ organic-social-dashboard   │
│  all runs share one run_id │      │ Next.js 14 · stage 5       │
│  via Run_Ledger mutex      │      │ reader-only, AI-optional   │
└──────┬─────────────────────┘      │ Vercel sin1, HMAC auth     │
       │                            └────────────────────────────┘
       │ Facebook Graph v21.0
       │ Pluggable AI (stages 3/6)
       ▼
  Facebook Page 1294156690762734
```

**Current state:** a monolithic 5-stage pipeline in
`facebook-pipeline/main.py` (Fetch → Classify → Diagnose → Calendar →
Sheets). The dashboard does stats in TypeScript. AI calls are
Anthropic-hardcoded. Run identity + Summary_* integrity do not exist.

**Target state** (this doc tracks the *target*):
- Six independently-runnable stages behind `python -m stages.<name>`.
- `Summary_*` tabs as the dashboard's primary read surface.
- `run_id` + `Run_Ledger` mutex + dependency freshness checks.
- Pluggable AI via `LLMClient` + per-provider prompt templates.
- Per-stage cost + provider tracking in `Analysis_Log`.
- Per-stage retention (last 4 runs) with rollback command.

Exactly how these land is specified in `ARCHITECTURE.md` §3–§9. This
doc is the map of where each of those lives when done.

---

## 1. Repo topology

### 1.1 organic-social-dashboard (this repo) — stage 5

**Stack:** Next.js 14 App Router · TypeScript · Tailwind 3.4 · Recharts
· Inter font · Vercel (`sin1`). Force-dynamic rendering,
`revalidate = 300`.

**Routes (target IA):**

| Route | Target IA | AI-required? |
|---|---|---|
| `/` Overview | Overview | no |
| `/engagement` | Content | no |
| `/trends` | Trends (folds into Overview/Content) | no |
| `/timing` | Timing | no |
| `/reels` | Reels | no |
| `/explore` | Explore (workbench) | no |
| `/strategy` | Strategy | **yes — stage 6a** |
| `/plan` | Plan | **yes — stage 6b** |

**Library layer (`lib/`) — after refactor:**

- `sheets.ts` — read every tab, normalise schema drift, compute
  consolidated staleness (worst of dependency chain), enforce
  source_hash match.
- `aggregate.ts` — shrinks to a formatter. Math leaves TS.
- `stats.ts` — deleted. Stats live in Python (stage 4) with the TS
  originals kept in git history as a reference only.
- `colors.ts` — canonical pillar / format / spotlight palette.
- `daterange.ts` — `Math.floor`-centralised range math.
- `auth.ts` · `middleware.ts` — HMAC-SHA256 signed cookie, 30-day
  expiry.
- `run.ts` (new) — reads `Analysis_Log`, picks the latest `run_id`
  where `analyse_status = success`, exposes it to page components so
  every `Summary_*` read filters to the same cohort.

**Components:** PageHeader, StalenessBanner (consolidated, tap-to-
expand), BarChart, LineChart, AreaChart, Heatmap, Donut, InfoTooltip,
Nav, ExploreClient, RangeSelector, `AIDisabledState` (new), `RunPicker`
(new, the rollback escape hatch in the range selector).

**Deploy:** GitHub push → Vercel build. No CI in this repo.

### 1.2 facebook-pipeline — stages 1 / 2 / 3 / 4 / 6

**Stack:** Python 3.12 · `requests` · `gspread` · `pandas`, `numpy`,
`scipy`, `statsmodels`, `ruptures`, `sklearn`, `lifelines` (stage 4) ·
pluggable AI SDKs (stage 3, 6a, 6b — lazy imports).

**Entry points (target):** one script per stage under
`facebook-pipeline/stages/`. No `main.py` orchestrator — workflow YAMLs
chain the stages. Every stage:

1. Resolves `RUN_ID` from env or self-generates.
2. Writes `Run_Ledger` start row; exits with code 2 if mutex blocked.
3. Reads dependency freshness via `Run_Ledger`; exits with code 3 if
   too stale.
4. Does its work.
5. Writes `Run_Ledger` finish row + `Analysis_Log` row with status,
   counts, tokens/cost (if AI), provider/model (if AI), key
   fingerprint (if AI).

**Shared libs under `src/`:**

- `config.py` — BDT_TZ, enums (12 pillars, 3 funnels, 7 tones, 6
  formats), exam calendar loader, model ID defaults.
- `llm/client.py` — `LLMClient` interface, retry wrapper.
- `llm/providers/{anthropic,openai,google,mistral}_provider.py` —
  lazy-imported adapters.
- `llm/prompts/<prompt_key>/<provider>.py` — prompt templates per
  (prompt_key, provider) pair.
- `llm/pricing.py` — per-model input/output rates; single source of
  cost truth.
- `ledger.py` — `Run_Ledger` read/write + dependency-freshness check.
- `integrity.py` — `source_hash`, engine_version, `computed_at`
  helpers used by every writer.
- `sheets.py` — `_merge_write`, `_safe_cell` (40 000-char cap),
  `upsert_row_by_key`. Gains `write_summary_row` helper that
  enforces the integrity contract.

**GitHub workflows (target):**

- `daily.yml` — 03:00 UTC. extract → classify_native → analyse.
- `weekly.yml` — Mon 04:00 UTC. extract → classify_native →
  classify_ai → analyse → diagnose → calendar. AI stages
  `continue-on-error`.
- `weekly-no-ai.yml` — same chain without AI stages; first-class path
  for credit outages.
- `stage-manual.yml` — `workflow_dispatch` for any single stage with
  optional `run_id` + free-form `args`.
- `backfill-bdt.yml` — one-shot migration, retained.

**Secrets:** `FB_PAGE_ID`, `FB_PAGE_TOKEN`,
`GOOGLE_SHEETS_CREDS_JSON`, `GOOGLE_SPREADSHEET_ID`,
`AI_CLASSIFY_*`, `AI_DIAGNOSE_*`, `AI_CALENDAR_*`, `AI_DEFAULT_*`.
Old `ANTHROPIC_API_KEY` becomes `AI_DEFAULT_KEY` during migration.

---

## 2. Google Sheets — the message bus

One workbook (`GOOGLE_SPREADSHEET_ID`).

### 2.1 Today's tabs

| Tab | Writer | Cols | Read by |
|---|---|---|---|
| `Raw_Posts` | stage 1 | 20 | everything |
| `Raw_Video` | stage 1 | 18 | dashboard, stage 4, stage 6a |
| `Page_Daily` | stage 1 | 13 | dashboard, stage 4, stage 6a |
| `Classifications` | stages 2 + 3 | 16 (→ 22 post-refactor) | dashboard, stage 4, stage 6a/b |
| `Weekly_Analysis` | stage 6a | 11 (→ 16) | `/strategy` |
| `Content_Calendar` | stage 6b | 18 (→ 23) | `/plan` |
| `Analysis_Log` | every stage | 6 (→ ~28) | dashboard staleness, audit |

### 2.2 New tabs

| Tab | Writer | Purpose | Read by |
|---|---|---|---|
| `Run_Ledger` | every stage | Mutex + dependency freshness | every stage |
| `Run_Ledger_Archive` | monthly prune job | Historical ledger rows | audit |
| `Summary_Overview` | stage 4 | Headline KPIs + WoW deltas per range | Overview |
| `Summary_Pillar` | stage 4 | Pillar × range rollups (EB-shrunk) | Content |
| `Summary_Format` | stage 4 | Format × range rollups | Content |
| `Summary_Spotlight` | stage 4 | (spotlight_type, name) × range | Content, Strategy input |
| `Summary_Timing` | stage 4 | Day × hour × range grid | Timing |
| `Summary_Reels` | stage 4 | Per-reel cohort + retention JSON | Reels |
| `Summary_Trends` | stage 4 | Daily series with MSTL + change points | Trends / Overview |
| `Summary_RedFlags` | stage 4 | Anomalies with severity + detail | Overview, Strategy |

### 2.3 Contract columns on every Summary_* tab

Enforced by `integrity.py` on write:

| Column | Source | Dashboard use |
|---|---|---|
| `run_id` | env | Filter. Dashboard reads one run_id at a time. |
| `computed_at` | `datetime.now(BDT_TZ)` | Banner copy. |
| `source_hash` | sha256 of input slice | Mismatch → `warn` severity. |
| `engine_version` | git sha (short) | Audit. |
| `row_range` | stage arg | Filter by range picker. |
| `n_posts` | aggregation n | Reliability label. |

### 2.4 Classifications schema extension

New columns on `Classifications` (stage 2/3):

- `classifier_run_id`
- `classifier_engine` (`native-v<n>` or `ai-<provider>-<model>`)
- `source_hash`
- `provider` (blank for native)
- `model` (blank for native)
- `input_tokens` / `output_tokens` / `cost_usd` (blank for native)

Cache key becomes `(post_id, classifier_engine, prompt_version)`.
Migration detail in `ARCHITECTURE.md` §11.

### 2.5 Analysis_Log schema extension

Per `ARCHITECTURE.md` §8. Adds `run_id`, per-stage
status/provider/model/tokens/cost/key_fingerprint,
`classify_native_quality_pass`, `analyse_rollback_target`,
`run_total_cost_usd`.

---

## 3. The six stages (summary — detail in `ARCHITECTURE.md` §2)

```
1 Extract          → Raw_Posts · Raw_Video · Page_Daily     (native, daily)
2 Classify native  → Classifications (engine=native-v<n>)    (native, daily)
3 Classify AI      → Classifications (engine=ai-<prov>-<m>)  (AI, weekly)
4 Analyse          → Summary_* (integrity-contract rows)     (native, daily)
5 Dashboard        — Next.js, reads one run_id of Summary_*
6a Diagnose        → Weekly_Analysis                         (AI, weekly)
6b Calendar        → Content_Calendar                        (AI, weekly)
```

- **AI-off workflow** (1 + 2 + 4 only) = fully functional dashboard
  minus Strategy + Plan.
- **Per-stage dependency** declared in code: `analyse.DEPENDS_ON =
  ["extract", "classify_native"]` with `MAX_DEPENDENCY_AGE_H = 25`.
- **Mutex:** `Run_Ledger` refuses concurrent runs of the same stage.
- **Quality floor:** Stage 2 ships with a measurement harness that
  blocks the refactor from advancing until the floors in
  `ARCHITECTURE.md` §7 pass.

---

## 4. Algorithms — authoritative list

### 4.1 Statistical primitives (stage 4, Python)

Moved from `lib/stats.ts`:

- 95% CI lower bound of the mean (student-t for df < 60, normal
  approximation at 1.96 for df ≥ 60).
- `best_by_lower_bound` — rank by CI lower bound, tie-break on mean,
  fall back to highest mean when every candidate has n < 2.
- Adaptive min-n per range: 7d → 3, 14d → 5, 30d → 10, 60d → 15,
  90d → 20, 180d → 30, > 180d → 50.
- Reliability label: `n=1 not reliable`, `<5 low`, `<10 medium`,
  `≥10 high`.

### 4.2 New stage-4 computations

- **Empirical-Bayes shrinkage** toward global mean; shrinkage factor
  `n / (n + κ)`, κ tuned per dimension. Raw mean still emitted for
  display; shrunk mean drives ranking.
- **Exponential temporal decay** with 30-day half-life on reach
  weights.
- **Geometric mean** on reach (log → mean → exp).
- **MSTL decomposition** on daily follower net change.
- **IsolationForest** for post-level anomaly flags (random_state
  derived from `run_id` for determinism).
- **Ruptures** change-point detection on follower growth.
- **Kaplan-Meier** retention curves on reel watch-time buckets.
- **Virality coefficient** (`shares / reach`), **discussion quality**
  (`comments / reactions`), **sentiment polarity**
  (`(love + wow) / max(1, sad + angry)`), **CTR proxy**
  (`clicks / reach`).
- **Cadence gap** — time between posts × each post's reach.
- **Format × hour interaction** — reach-weighted ER per (format, hour).

### 4.3 Timing / date handling

- `BDT_TZ = UTC+6`, no DST.
- Pipeline writes `Created Time (BDT)` with `+06:00` suffix (Day 2G).
- Dashboard's `bdt()` takes the clean read path when suffix present,
  legacy `setHours(+6)` for pre-Day-2G rows.
- `startOfWeekBDT` uses Monday-start weeks.

### 4.4 Classifier cache keys

- Before refactor: `(post_id, prompt_version)`.
- After refactor: `(post_id, classifier_engine, prompt_version)`.
  Provider or model change → cache miss. Native and AI caches are
  independent.

### 4.5 Idempotency / determinism rules

- All random-seeded algorithms use a seed derived from `run_id`.
- Every `groupby` / `sort_values` has an explicit column list.
- `source_hash` computed over a canonically-serialised input slice.
- Two back-to-back stage-4 runs against frozen inputs produce
  byte-identical `Summary_*` rows.

---

## 5. Operational contracts

### 5.1 Failure semantics

| Stage | On failure | Downstream impact |
|---|---|---|
| 1 Extract | ledger=failed; job stops (daily) | stage 2+ skipped by workflow |
| 2 Native classify | ledger=failed or quality_warning | stage 3 may still run; stage 4 dependency check flags staleness |
| 3 AI classify | fallback to stage-2 labels; status=fallback | stage 4 runs on stage-2 labels; banner notes 3 skipped |
| 4 Analyse | ledger=failed; Summary_* untouched | dashboard reads prior run_id's Summary_* |
| 6a Diagnose | fallback to prior Weekly_Analysis; status=fallback | Strategy page banners the age |
| 6b Calendar | `_salvage_partial_calendar` → partial, else fallback | Plan page banners the age |

All fallbacks set explicit `*_status` in `Analysis_Log`. Consolidated
StalenessBanner picks the worst severity and reports it.

### 5.2 Retry policy (shared)

- Retryable: 429, 5xx, connection errors, timeouts.
- Fatal: 401, 403, 400, 404, 422. Auth errors additionally mark
  `fail_kind = auth` so the banner can distinguish credit outage from
  key expiry.
- Schedule: 2 s → 8 s → 30 s. SDK-level retries disabled.

### 5.3 Per-stage AI provider selection

Env-var driven per stage (`AI_<STAGE>_PROVIDER`, `_MODEL`, `_KEY`,
`_MAX_TOKENS`) with fallback to `AI_DEFAULT_*`. Missing required env
vars for a scheduled AI stage → `skipped` with reason. Other stages
unaffected.

### 5.4 Rollback

`python -m stages.rollback --tab <name> --to-run-id <id>` writes an
`analyse_rollback_target` row in `Analysis_Log`. Dashboard honours it
by reading the target `run_id` instead of the latest. Metadata flip
only, no recompute.

---

## 6. History — the narrative

Full narrative lives in `facebook-pipeline/IMPROVEMENTS.md` (pipeline
evolution) and this repo's `CHANGELOG.md` + `DECISIONS.md` +
`LEARNINGS.md`. Short summary:

- **A1–A5** baseline: 5-stage monolith, Opus model, ~$1.60/run.
- **C1–C5** cost cut to ~$0.15–0.20/run via Haiku 4.5 on classification,
  Sonnet 4.6 on diagnosis + calendar.
- **Day 2A–2F** schema evolution: spotlight split, format dropped,
  prompt v2.3 enum lockdown + app-as-subject rule, confidence field.
- **Day 2G** BDT column shift.
- **Day 2H** calendar output cap 12k → 16k.
- **Day 2I** daily-refresh workflow.
- **Day 2J** 40 000-char `_safe_cell` cap under Sheets 50 000 hard max.
- **Day 2K** `_salvage_partial_calendar`; 24k cap.
- **Day 2L** schema-tolerant merge (name-based `col_map`).
- **Day 2M** streaming for calendar.
- **Day 2O** explicit retry + per-artifact `Analysis_Log` status.
- **Dashboard Batches 1–3** WCAG, palette, heatmap, Explore
  workbench, page template, aria-describedby.
- **Data-integrity audit** caught `|| 1` ER guard (Day 2U → honest
  zero).

The gap-closure pass (this revision, Apr-2026) adds: run identity,
`Run_Ledger` mutex, `Summary_*` integrity contract, prompt templates
per provider, native classifier quality floor + measurement harness,
cost observability, key-fingerprint tracking, consolidated
StalenessBanner, row-level retention + rollback.

---

## 7. What's next

Per `ARCHITECTURE.md` §11 (migration sequencing), 11 gated steps:

1. `llm/client.py` + Anthropic adapter + prompt template system.
2. Port `diagnose` + `calendar` onto `LLMClient`.
3. Ship native-classifier quality measurement harness.
4. Ship `classify_native.py` iteratively, field-by-field.
5. Introduce `Run_Ledger` + `run_id` propagation.
6. `stages/analyse.py` + Summary_* tabs (dashboard still on old path).
7. Flip dashboard to Summary_* reads.
8. Split stage 6 into diagnose + calendar; fold in Phase 2D prompt
   overhaul.
9. OpenAI + Gemini adapters + prompt templates.
10. AI-optional empty states + consolidated StalenessBanner.
11. `weekly-no-ai.yml` first-class.

Each commit: seven-perspective QA gate, CHANGELOG / DECISIONS /
LEARNINGS entries.
