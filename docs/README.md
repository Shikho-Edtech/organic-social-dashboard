# docs/ — index

Everything here is documentation. No code, no build artifacts. The root
`README.md` is the deploy guide. This folder is the engineering brain.

## What to read, in order

**If you're starting fresh and want to understand the system:**

1. **[WORKFLOW.md](WORKFLOW.md)** — how the dashboard currently runs. Runtime
   graph, routes, data sources. Describes the world as it is today.
2. **[PROJECT_ATLAS.md](PROJECT_ATLAS.md)** — structural map. Target repo
   layout, Google Sheets message bus (17 tabs), stage summary, history
   narrative. Describes the world as it will be after migration.
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** — the full/aspirational spec. 6
   stages, run identity, Summary integrity, pluggable AI, 11-step migration
   plan. This is the long-form "if we ever need every piece" version.
4. **[ROADMAP.md](ROADMAP.md)** — what we're actually doing. Lean plan: 3
   ordered steps over 2-3 weeks, what's deferred and why. **This is the
   source of truth for current execution.**
5. **[DESIGN_BRIEF.md](DESIGN_BRIEF.md)** — visual + UX spec. 13 components,
   4 banner states, AI-optional empty states, mobile rules. Hand this to
   Claude Design when UI work starts.

**If you're implementing:**

- **[ROADMAP.md](ROADMAP.md)** — what ships next
- **[PROVIDER_SWITCHING.md](PROVIDER_SWITCHING.md)** — how per-stage AI
  provider selection works (env var contract)
- **[DESIGN_HANDOFF.md](DESIGN_HANDOFF.md)** — when and what to send to
  Claude Design, so UI work doesn't block on design

**If you're looking for ideas:**

- **[BACKLOG.md](BACKLOG.md)** — Phase 2/3 improvements, approved vs
  rejected. Explicit non-goals are at the bottom so they don't resurface.

## Root-level docs

These stay at the repo root by convention:

- **`../CLAUDE.md`** — project rules Claude Code picks up automatically
  (mobile checklist, QA gate, staleness banner requirement)
- **`../CHANGELOG.md`** — what shipped, one line per commit
- **`../DECISIONS.md`** — tradeoffs + rationale worth remembering
- **`../LEARNINGS.md`** — gotchas + wrong turns, reread before similar work

## Archive

- **[archive/MASTER_PLAN.md](archive/MASTER_PLAN.md)** — the 2026-04-18
  end-to-end assessment that kicked off this architecture. Superseded by
  ARCHITECTURE.md + ROADMAP.md but kept for context.
- **[archive/DESIGN-AUDIT.html](archive/DESIGN-AUDIT.html)** + **[archive/DESIGN-ROADMAP.html](archive/DESIGN-ROADMAP.html)** — older design artifacts from the
  initial visual polish pass. Superseded by DESIGN_BRIEF.md.

## Companion repo

The pipeline that writes to the Google Sheet lives separately at
[`../../facebook-pipeline/`](../../facebook-pipeline/) (sibling folder).
It mirrors this doc structure:

- [`../../facebook-pipeline/docs/README.md`](../../facebook-pipeline/docs/README.md) — index
- [`../../facebook-pipeline/docs/ROADMAP.md`](../../facebook-pipeline/docs/ROADMAP.md) — pipeline-side view of the lean 3-step plan
- [`../../facebook-pipeline/docs/WORKFLOW.md`](../../facebook-pipeline/docs/WORKFLOW.md) — pipeline runtime graph
- [`../../facebook-pipeline/docs/SETUP.md`](../../facebook-pipeline/docs/SETUP.md) — one-time install
- [`../../facebook-pipeline/docs/IMPROVEMENTS.md`](../../facebook-pipeline/docs/IMPROVEMENTS.md) — long-form decisions log

`ARCHITECTURE.md` here is the unified spec across both repos;
`ROADMAP.md` here is the unified execution plan. The pipeline repo's
`ROADMAP.md` is the same three steps zoomed into the pipeline-side
file changes.
