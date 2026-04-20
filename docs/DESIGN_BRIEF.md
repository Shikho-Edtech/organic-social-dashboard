# DESIGN_BRIEF.md

Single-source handoff for Claude Designer to craft the next-version
design of the Shikho organic-social dashboard (stage 5 in the 6-stage
architecture — see `ARCHITECTURE.md`).

Implementation happens in one pass against whatever design comes back,
so this brief carries every constraint that matters.

Companion docs:
- `ARCHITECTURE.md` — authoritative system spec (read first).
- `PROJECT_ATLAS.md` — structural / historical map.
- `MASTER_PLAN.md` — phased roadmap (partially superseded).
- `CLAUDE.md` — mobile checklist + 7-perspective QA gate (binding).

Last updated: 2026-04-20 (gap-closure pass).

---

## 1. Mission

Give one analyst (Shahriar) a weekly answer to: **"is our organic
Facebook strategy working, and what should we do differently next
week?"** — readable on a phone in under 60 seconds, defensible in
data honesty, aligned to Shikho's brand.

**Primary reader:** Shahriar · Monday 10:00 BDT · mobile-first (360 px
floor).
**Secondary:** occasional desk review on 1280 px+.
**Not users:** team members, leadership, clients. No multi-user, no
sharing, no export.

**Architectural constraints this design must honour:**

1. **AI-optional.** Stages 1 + 2 + 4 (extract, native classification,
   native analytics) are always-on. Stages 3 + 6a + 6b (AI) are
   additive. Six of eight pages must render a useful answer with zero
   AI stages.
2. **Run identity.** Every page reads one `run_id`'s worth of
   `Summary_*` data at a time. Cross-run inconsistency is visible to
   the user, never hidden.
3. **Single consolidated banner.** Not one banner per stage. One
   banner per page with the worst severity of its dependency chain,
   tap-to-expand for detail.
4. **Rollback is visible.** If the operator rolls back to a prior
   `run_id`, the dashboard shows the current `run_id` and a "viewing
   archived run" affordance.

---

## 2. Prior design assessment — preserved

Claude Designer audited the dashboard two versions ago. Verdict:
**6.4 / 10**.

**Dimensional scores (0–10):**
- Information clarity 8.2 · Mobile 7.8 · Data honesty 9.0
- Visual system 5.2 · Brand expression 3.8
- Accessibility (AA) 4.8 · IA 5.8 · Loading 3.0

**Top strengths to preserve:**
- Adaptive min-N + reliability labels
- Canonical color mapping (`lib/colors.ts`)
- BDT bucketing + StalenessBanner pattern (now consolidated)
- Schema-tolerant sheet reads
- Mobile checklist discipline

**Top opportunities (still open):**
1. AA contrast failures (audit remaining `text-slate-400`).
2. 300–1 500 ms blank on route change (partly addressed; verify every
   route has a `loading.tsx`).
3. Zero brand expression on charts (canonical palette in
   `lib/colors.ts` — audit every chart uses it).
4. Donut for Engagement Mix obscures ranking (replace with ranked bars
   or biggest-movers panel).
5. Timing page 4 redundant bar charts (replaced with heatmap —
   preserve and extend with format × hour interaction toggle per
   Backlog 2A).

---

## 3. Target information architecture

Condensed from the current 8 routes to 6 always-on + 2 AI-gated:

| Page | What it answers | Data source | AI required |
|---|---|---|---|
| **Overview** | "Is the account healthy right now?" | `Summary_Overview` + `Summary_RedFlags` + `Summary_Trends` | no |
| **Content** | "Which pillars / formats / spotlights are winning?" | `Summary_Pillar` + `Summary_Format` + `Summary_Spotlight` | no |
| **Timing** | "When should I post?" | `Summary_Timing` | no |
| **Reels** | "Which reels drove growth, and how did retention look?" | `Summary_Reels` + `Raw_Video` | no |
| **Trends** | "How did things shift over 30 / 90 days?" | `Summary_Trends` + `Page_Daily` | no |
| **Explore** | "Let me slice this myself" | `Raw_Posts` + `Classifications` | no |
| **Strategy** | "What does the week say?" | `Weekly_Analysis` | **yes — stage 6a** |
| **Plan** | "What am I posting next week?" | `Content_Calendar` | **yes — stage 6b** |

Nav (≥ md) = horizontal tabs; below md = dropdown
(`components/Nav.tsx` pattern).

---

## 4. The consolidated StalenessBanner

**One banner per page.** Severity = worst of the stages that page
reads. Copy leads with the most important signal. Tap-to-expand shows
per-stage detail.

### 4.1 States

```
┌───────────────────────────────────────────────────┐
│  ✓ Data refreshed 3 hours ago  ·  Run 01HXYZ…    │
│    (tap for detail)                               │
└───────────────────────────────────────────────────┘

Warn (> 7 days since last success, OR most recent attempt fell back):
┌───────────────────────────────────────────────────┐
│  ⚠ AI strategy is 9 days old — weekly pipeline    │
│    last succeeded Apr 11. Credit outage suspected │
│    (stage 6a failed 3 runs). Tap for detail.      │
└───────────────────────────────────────────────────┘

Crit (> 14 days, OR source_hash mismatch, OR never ran):
┌───────────────────────────────────────────────────┐
│  ✗ Data inconsistency — summary was computed      │
│    against a prior extract. Re-run weekly or      │
│    roll back. Tap for rollback options.           │
└───────────────────────────────────────────────────┘
```

### 4.2 Expanded detail panel

Lists every stage the page reads:

| Stage | Status | Last success | Age | Provider | Cost |
|---|---|---|---|---|---|
| Extract | ✓ success | 2026-04-20 03:12 | 3h | — | — |
| Classify (native) | ✓ success | 2026-04-20 03:13 | 3h | — | — |
| Classify (AI) | ✓ success | 2026-04-15 04:17 | 5d | Anthropic / Haiku 4.5 | $0.08 |
| Analyse | ✓ success | 2026-04-20 03:15 | 3h | — | — |
| Strategy (AI) | ⚠ fallback | 2026-04-11 04:22 | 9d | Anthropic / Sonnet 4.6 | — |

Expanded panel also shows the current `run_id`, the live
`source_hash`, and a "Switch to prior run" link that opens the
`RunPicker` component.

### 4.3 Copy rules

- Lead with the worst stage, never a generic summary.
- Distinguish "credit outage" from "key expired" from "never
  configured" in the copy (data from `Analysis_Log.fail_kind`).
- Never say "data as of" alone — always pair with a stage name so the
  reader knows which part of the chain is fresh vs. stale.

---

## 5. AI-optional UX contract

When a page depends on an AI stage that has never run, or hasn't
succeeded in > 30 days:

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
│    [View archived version] [Open ARCHITECTURE.md] │
└──────────────────────────────────────────────────┘
```

This is NOT an error page. It's an intentional disabled state with an
action. Visually close to a "coming soon" card — friendly, calm, not
red. `role="status"`, `aria-live="polite"`.

---

## 6. RunPicker / rollback affordance

New component. Lives inside the RangeSelector dropdown or as a sibling
on the PageHeader controls.

**Default state:** Shows nothing (most users never rollback).

**When a source_hash mismatch is detected OR operator manually opens
it:**

```
Current: Run 01HXYZ… (2026-04-20 03:15)
         All stages ✓

Available runs (last 4):
  • 01HXYZ…  2026-04-20 03:15  ✓ complete
  • 01HXWZ…  2026-04-19 03:14  ✓ complete
  • 01HXVZ…  2026-04-18 03:13  ⚠ calendar fell back
  • 01HXUZ…  2026-04-17 03:14  ✓ complete

[Switch to 01HXWZ…]
```

Switching writes nothing to Sheets — it flips a client-side
`viewing_run_id` and reloads the page's data reads against that id.
The consolidated banner gains a persistent `"Viewing archived run —
return to latest"` affordance until the user returns.

---

## 7. Brand + visual system

Anchors (unchanged):

- **shikho-indigo #1e2a78** — primary, authority, default chart series.
- **shikho-pink #e6247d** — accent, highlights, attention.
- **shikho-orange #f79620** — warm, contrast, secondary series.
- **Type:** Inter. Tight leading on KPI values, generous on body.
- **Dark mode:** not required; dashboard is daylight-read on mobile.

Chart palette rule (from `DECISIONS.md` 2026-04-18): canonical color is
a product concept, not a chart concept. Pillars / formats / spotlights
have stable hues across every chart. Palette source of truth is
`lib/colors.ts`.

---

## 8. Mobile-first rules (binding — enforced by `CLAUDE.md`)

- **Right-edge scan** at 360 px — no text pushes past card boundary.
- **`flex-col sm:flex-row`** for side-by-side header/control layouts.
- **Popups:** `max-w-[calc(100vw-2rem)]`.
- **Big KPI values:** `text-xl sm:text-2xl break-words leading-tight`.
- **No hover-only tooltips.** Touch parity required.
- **Tables:** `overflow-x-auto` wrapper.
- **Nav:** horizontal tabs only at `md+`. Dropdown below.

Stress-test widths: 360, 375, 414, 768, 1280.

---

## 9. Accessibility (WCAG AA minimum)

- Text contrast ≥ 4.5:1. `text-slate-500` lower bound on white,
  `text-slate-700` on slate-50.
- Focus-visible rings globally. Nothing disables locally.
- Keyboard tab order header → KPI → chart → controls.
- Dynamic content has `role="status"` / `aria-live`.
- Icons with semantic meaning have `aria-label`.
- Tap targets ≥ 44 × 44 px.
- `useId` for aria-describedby.

---

## 10. Data honesty — don't let the chart lie

The spine of the project. Design iterations must not trade these away
for visual polish.

- **Min-n gating.** Every aggregate bar / cell shows `n=X` and is
  hidden below the adaptive min-n for the selected range.
- **CI-ranked selections.** "Best X" copy ranks by 95% CI lower bound,
  not raw mean.
- **Zero-reach ⇒ zero rate.** No `|| 1` div guard.
- **Staleness > silence.** Consolidated banner on every page.
- **source_hash match.** When the Summary was computed against a
  different extract than the dashboard is reading, banner goes `crit`
  and the RunPicker surfaces.
- **Reliability labels** adjacent to every KPI: `n=X · low / medium /
  high confidence`.
- **Confidence-weighted opacity** on heatmap cells (not binary).
- **Geometric mean + EB shrinkage** drive rankings. Raw means still
  shown on bars.
- **Run ID visible** on the expanded banner so an operator can cite
  it when reporting a suspicious number.

---

## 11. Core components to design

Reading order matches what a mobile-first user sees from the top of a
page.

1. **StalenessBanner (consolidated, tap-expandable)** — severity,
   one-line copy, per-stage detail panel. Slot: above `PageHeader`.
2. **RunPicker (new)** — rollback affordance. Slot: in RangeSelector
   or adjacent.
3. **PageHeader** — title, subtitle, last-scraped timestamp, range
   selector, filter chips, RunPicker slot.
4. **KPI card** — label, big value, WoW delta, reliability label,
   info-tooltip. Grid 2-up at `<sm`, 4-up at `md+`.
5. **Bar chart** — data-driven Y-axis width; canonical color; 95% CI
   whisker optional; `n` annotation.
6. **Heatmap** — day × hour (Timing); confidence-weighted opacity;
   tooltip with n and reach-weighted ER.
7. **Line / area chart** (Trends) — raw series + seasonal decomp
   optional overlay; change-point markers.
8. **Biggest movers panel** — replacement for Donut engagement mix;
   ranked list with direction arrow + absolute delta.
9. **Red flags list** — severity-coded entries from
   `Summary_RedFlags`; most recent week first.
10. **Reliability / range footer** — range picker, current min-n, count
    of posts in range.
11. **AI-disabled empty state (new)** — pattern for Strategy / Plan
    when stage 6 hasn't run.
12. **Post panel / drill-down** (Phase 3A) — slide-over; full caption,
    thumbnail, classifications, raw metrics, permalink, retention
    curve, ± 3-day timeline context.
13. **Permalink icon** (Phase 3B) — compact external-link affordance
    on every row / chart drill-down.

---

## 12. Non-goals (do not design for)

From `BACKLOG.md` explicit non-goals + architecture-specific additions:

- **Paid vs organic split.** Organic only.
- **Slack / email digest.** Deferred.
- **CSV export.** Not wanted.
- **Multi-user / sharing / permissions.** Single reader.
- **Real-time or on-the-fly AI from the dashboard.** Dashboard is a
  reader.
- **Dark mode toggle.** Daylight-read only.
- **Custom dashboards / widgets.** Fixed IA + Explore workbench.
- **Inline editing of classifications.** Manual overrides happen in
  Sheets, not the dashboard.
- **Comparing two runs side-by-side.** RunPicker swaps one for the
  other; no split-screen.

---

## 13. Deliverables expected

From Claude Designer:

- One Figma file (or equivalent) covering all 8 pages at **360 / 768 /
  1280 px**.
- Component library mapped 1:1 to §11.
- Empty-state designs for every AI-gated page (Strategy, Plan) and
  the Explore workbench (zero filter matches).
- StalenessBanner in all four states (ok, warn, crit, AI-disabled),
  plus the expanded detail panel.
- RunPicker in default + active-rollback states.
- Loading skeletons per page (not a global spinner).
- Error states distinguishable from disabled states.
- Canonical-palette check: every chart element pulls from
  `lib/colors.ts`.
- Annotations for every data-honesty fallback (min-n hidden bar,
  zero reliability label, stale banner, source_hash mismatch).

**Out of scope for the designer:** algorithmic decisions, which
metrics to expose, stage naming, pipeline wiring. Those are locked in
`ARCHITECTURE.md` and `PROJECT_ATLAS.md`.
