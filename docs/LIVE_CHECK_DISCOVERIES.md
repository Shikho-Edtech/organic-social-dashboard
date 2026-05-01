# Live-Check Discoveries

**Append-only log of new POVs discovered during real QA work.**

Sibling to [`LIVE_CHECK_POVS.md`](./LIVE_CHECK_POVS.md). When a bug
surfaces during a live check that no existing POV would have caught,
log the new POV here. Quarterly review promotes the ones that generalize
into the master list.

---

## Why this exists

The first 2 password-gated checks (Pass 1 = bug-hunt, Pass 2 =
information-quality) caught 25 fixes. The 9 most-impactful ones came
from POVs that weren't on my initial list — I had to discover the lens
*after* finding the bug.

That pattern will repeat. Discovery mode is how the master list stays
useful instead of frozen.

Same discipline as [`LEARNINGS.md`](../LEARNINGS.md) — capture pattern,
test for generalization, promote if it earns the slot.

---

## How to log a discovery

When you find a bug during a live check and tracing back to
`LIVE_CHECK_POVS.md` reveals no existing POV would have caught it,
append a new entry below using the template. Don't try to be clever
with naming — subject-verb-object is enough:
- "X has Y property"
- "every Z does W"
- "Y is consistent across X"

Discoveries are pending until tested for generalization (apply to 2-3
other surfaces). Promotion or archival happens at quarterly review.

---

## Entry template

```markdown
## YYYY-MM-DD — <POV name in plain English>

**Meta-lens:** <one of the 12 from POVs.md, or propose a new one>

**Bug that surfaced this POV:**
<what was found, in 1-2 sentences>

**Commit / fix reference:**
<git SHA of the fix, or "no fix yet">

**Generalization test:**
Applied to:
- <surface 1> — <yes / no / partially — what was found>
- <surface 2> — <yes / no / partially>
- <surface 3> — <yes / no / partially>

**Promotion status:** <pending | promoted to Tier 2 on YYYY-MM-DD | archived on YYYY-MM-DD>

**Master-list mapping:**
<which existing POV is closest? "null" if genuinely novel>

---
```

---

## Quarterly review cadence

Every 3 months:

1. **Promotion sweep** — any pending discovery that has generalized in
   3+ different bug catches → promote to Tier 2 with the `🆕` tag.
2. **Archival sweep** — any pending discovery that hasn't generalized
   after 3 quarterly reviews → archive in place (mark as archived,
   don't delete; git history preserves the lesson).
3. **Demotion sweep** — Tier 1 POVs that haven't caught anything in
   3 quarters → demote to Tier 2. Tier 1 must stay tight (≤ 12 items).
4. **Meta-lens review** — if a discovery genuinely doesn't fit any
   existing meta-lens, propose a new one. Updates rare; the 12 should
   be stable.

---

## Discoveries

*(Log new entries below this line, newest first)*

## 2026-05-01 — Plan→Outcomes loop closure (matcher reads non-existent field)

**Meta-lens:** 4 (code-vs-copy alignment) + 9 (failure-mode coverage)

**Bug that surfaced this POV:**
The user asked: "why are we not detecting what was posted vs the plan
and populating Outcomes?" Investigation found the matcher in
`facebook-pipeline/src/sheets.py` line 3291 read `_p.get("slot_index")`
from each post — a field that doesn't exist on Facebook posts. So the
actuals-by-slot dict was always empty, every Outcome row defaulted to
"no-data" / "pending", and the loop never closed.

Two QA passes (Pass 1 bug-hunt and Pass 2 information-quality) both
walked the Outcomes page and saw "29 of 29 pending" — but interpreted
it as "this is for future weeks, makes sense." Neither pass connected
the broken matcher to the all-pending state because we didn't ask
"are these pending because actuals don't exist YET, or because the
matcher gave up?"

**Commit / fix reference:**
`1896515` (pipeline) — added `_build_outcome_actuals(calendar, posts,
classifications)` that joins by (date, format, pillar) with time_bdt
proximity tiebreak. Effective on next cron.

**Generalization test:**

Applied the underlying POV — "every aggregate output that depends on
a join must verify the join keys actually exist on both sides" — to:

- **Plan slot → its row in Outcomes** (the original bug). YES caught.
- **Diagnosis source_post_ids → actual posts.** Spot-checked 3 cited
  posts in the latest run; permalinks resolve correctly. Join key
  works, no bug here.
- **Strategy hypothesis_id → Calendar slot hypothesis_id.** Spot-
  checked: every slot's `h1` etc references a strategy hypothesis. Join
  works.
- **Brand_comms_calendar campaign → Diagnosis verdict.** Latest run's
  narrative cites "School Blitz campaigns" (matches brand comms sheet
  "School Blitz + Ambassador" entry for May). Join works at the
  prose level, but no formal id-based join.

The bug class is "join on a key that doesn't exist on one side." It
generalizes — any time we extract dimensions across data sources and
expect them to match, the keys must be guaranteed to exist on both.

**Promotion status:** **promoted to Tier 1 immediately.** The bug is
P0 (loop entirely broken), the POV is cheap to apply (read each
matcher's `dict[k]` reference, verify k exists in source), and the
class generalizes to all join-style aggregations.

Suggested addition to Tier 1 in `LIVE_CHECK_POVS.md`:

> **T1.11 — Join-key existence audit.** For every matcher / aggregator
> that joins data across sources (Plan ↔ Posts, Strategy ↔ Calendar,
> Diagnosis ↔ source_post_ids), verify the join key actually exists on
> both sides. A `dict.get("nonexistent_field")` that always returns
> None is a structurally-broken loop.

**Master-list mapping:**
Closest existing POV was Tier 3 18.1 (Plan slot → Outcomes once graded
loop closure) — speculative. The actual POV needed is one level deeper:
not "does the loop close," but "does the matcher's join key exist?"
That deeper question generalizes to every join in the codebase, not
just Plan↔Outcomes. Promoting as T1.11.

---
