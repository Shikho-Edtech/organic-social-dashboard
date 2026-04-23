# v5 wiring audit — 2026-04-23

Sprint P6 chunk 7 deliverable. Sample-based audit of the 167-item
QualityPlan v5 against the live repos, verifying each user-facing
item is wired writer → sheet tab → reader → UI.

## Method

- Pipeline writers: `facebook-pipeline/src/sheets.py`, `src/classify.py`,
  `src/insights/*`, `src/strategy/*`.
- Dashboard readers: `organic-social-dashboard/lib/sheets.ts`.
- UI surfaces: `organic-social-dashboard/app/*/page.tsx` and
  `organic-social-dashboard/components/`.
- Cross-repo rule: reader reads by header name, so a pipeline rename
  silently breaks the dashboard. Audit included grepping for every
  column name on both sides.

Not every item is sampled — 15–25 representative items per phase.
Internal-only items (QA scripts, validators, version floors) are
excluded from the wiring rubric by design.

## Wired end-to-end (checked)

- **PLN-01** (hypothesis_id on every slot) — writer: `sheets.py`
  (Content_Calendar "Hypothesis ID"); reader: `lib/sheets.ts:558`
  `getCalendar`; UI: `app/plan/page.tsx:347-354` (hypothesis_id pill).
- **PLN-02** (per-slot forecast CI, native bootstrap) — writer:
  Content_Calendar "Forecast Reach CI"; reader: JSON parse in
  `lib/sheets.ts`; UI: `app/plan/page.tsx:388`
  (`formatNativeCI(slot.forecast_reach_ci_native)`).
- **PLN-05** (slot-level risk_flags) — writer: Content_Calendar
  "Risk Flags"; reader: `lib/sheets.ts`; UI: `app/plan/page.tsx:415`
  (risk-count pill + expandable list).
- **PLN-06/07** (Plan_Narrative tab + card) — writer:
  `write_plan_narrative`; reader: `lib/sheets.ts:919 getPlanNarrative`;
  UI: `components/PlanNarrativeCard.tsx` in `app/plan/page.tsx:202`.
- **D-01..13** (diagnosis grounding: post_id whitelist, native
  insights pipe-in, rolling context, self-check) — writer:
  `src/insights/{findings,verdict,watchouts}.py`; reader:
  `getLatestDiagnosis` / `getDiagnosisByWeek`; UI: `/strategy`
  verdict + key findings + top / under / watch-outs.
- **C-01..14 + N1-N4** (classifier variants) — writer: `classify.py`;
  reader: posts merge in `lib/sheets.ts:75-130` (hook_type, format,
  pillar, teacher); UI: `/explore` and `/engagement` hook panels.

## Wired but orphan (writer + reader present, no UI)

- **STR-01..14** (Strategy tab: pillar_weights, format_mix,
  teacher_rotation, abandon_criteria, adherence_summary) — writer +
  reader both live. No `app/**` imports `getLatestStrategy` after the
  Sprint P6 chunk 1 rollback (see DECISIONS.md 2026-04-23). Entire
  sprint is orphaned on the UI by choice.
- **OSL-07** (Calendar Quality Score) — writer: `sheets.py:2139`
  (Strategy_Log "Calendar Quality Score"). No reader, no UI. Pipeline
  CHANGELOG explicitly notes this is a pending dashboard follow-up.
- **OSL-04** (Outcome_Log tab) — writer: `write_outcome_log`. No
  `getOutcomeLog` reader. Flagged as next task in pipeline CHANGELOG
  line 310.
- **OSL-08** (Hook_Library) — writer: `write_hook_library`. Zero
  dashboard references. Pipeline-internal by design (feeds the
  calendar + classifier prompts).
- **PL-05..09, PL-13** (Priors_Pillar / Teacher / Format / HookType /
  SlotTime / AcademicSeason) — writer: `src/priors/` + `sheets.py`.
  Lone dashboard mention is a comment at `lib/sheets.ts:289`. No
  `getPriors*` reader, no UI card. Pipeline-internal grounding is
  acceptable; the v5 COMPLETE entry implies the dashboard binding
  is a follow-up.

## Missing link (partial wiring)

- **DYN-03** (hook_fatigue_flag + hook_fatigue_reason on
  Classifications) — writer: `classify.py:216,2574`. Dashboard merges
  Classifications at `lib/sheets.ts:75-130` but the merge does NOT
  pick up `Hook Fatigue Flag` / `Hook Fatigue Reason` columns (zero
  matches for `hook_fatigue` anywhere under the dashboard). Silent
  drop. Low severity since the flag primarily feeds downstream
  prompts, but `/engagement`'s hook effectiveness chart could
  annotate fatigued hooks and currently cannot. **Fix: one-line
  reader addition.**
- **SEA-01..05** (academic_calendar.yaml active_events) — writer:
  `src/academic_calendar.py` + `config/exams.yaml`. Used server-side
  for priors bucketing and diagnosis prompts. Dashboard surfaces
  only `diagnosis.exam_alert` (one-line banner). No structured
  `active_events` list, no exam countdown, no season-bucket label.
  Partial surface. **Fix: add a "SEA context" strip to /strategy
  and /plan that renders the current season + next exam window.**
- **DYN-01** (WoW significance grounding) — validator-enforced,
  surfaces through diagnosis.headline prose. Flows through, but not
  distinguishable from v4 prose on the UI. Acceptable — the
  validator prevents ungrounded language from reaching the
  dashboard in the first place.

## Internal-only (no UI expected)

QA scripts (`scripts/qa_sprint_*`), version floors, pure validators
(`validate_plan`, `validate_wow_delta_grounding`,
`validate_pillar_allocation_adherence`), priors freshness audit,
Hook_Library prompt-injection, DYN-02/04/05 regime-shift + pillar-
allocation math. Pipeline-side grounding, never intended for UI.

## Summary

**Writer and sheet schema are ahead of the dashboard reader by the
exact deltas listed in the pipeline CHANGELOG's "Next" section.**
No broken writes, no renamed columns caught — cross-repo schema
rule is intact.

Four wiring gaps worth addressing, in priority order:

1. **DYN-03 hook fatigue flag reader** — trivial to add, unblocks
   /engagement hook-annotation work.
2. **OSL-04 Outcome_Log reader + UI** — outstanding v5 follow-up.
   Goal: render per-slot outcome verdicts on /plan or a new
   `/outcomes` page.
3. **OSL-07 Calendar Quality Score reader** — small lift, can land
   alongside the strategy re-wire if that happens.
4. **STR-01..14 dashboard surfacing** — biggest open question. The
   /strategy chunk-1 rollback removed the sprint's UI surface
   deliberately; if the team wants strategy-level signals back,
   they need a redesigned view that doesn't replay what /plan
   already shows.

## Open items tracked

- Hook fatigue reader addition (DYN-03)
- Outcome_Log reader + UI (OSL-04)
- Calendar Quality Score reader (OSL-07)
- Academic calendar UI surface (SEA-01..05)
- Strategy tab UI — product decision pending (STR-01..14)
