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

## 2026-05-01 — Vocabulary mismatch on join keys (Plan↔Posts format strings)

**Meta-lens:** 4 (code-vs-copy alignment) + 9 (failure-mode coverage)

**Bug that surfaced this POV:**
After shipping v4.10's `_build_outcome_actuals` matcher, Outcome_Log
*ran* on 28 plan slots but produced 0 matches (every row "no-data").
T1.11 (join-key existence audit) said "the field exists on both sides"
which was true — both `slot.format` and `post.type` exist. But the
*values* belong to different vocabularies:

- Plan calendar produces `Reel`/`Video`/`Photo`/`Carousel` (capitalized,
  distinguishes Reel as production guidance)
- Facebook Graph API returns `video`/`photo`/`carousel` (lowercase, no
  Reel — short-form vertical is just "video" unless `attachment.type`
  contains "reel")

Existing `_normalize_post_format` capitalized the post side but never
collapsed Reel→Video on the plan side, so 5+ Reel slots/week always
missed.

Caught only when the user ran the live dashboard and saw "all rows
pending" *again*, despite v4.10 fix. T1.11 alone wouldn't have flagged
this — it asked the wrong question (existence) instead of the deeper
one (vocabulary alignment).

**Commit / fix reference:**
v4.11 — added `_format_bucket()` collapsing both sides to a canonical
production-agnostic bucket (`video`/`photo`/`carousel`). Matcher joins
on bucket.

**Generalization test:**

Applied the underlying POV — "every join key must have aligned
*vocabularies*, not just aligned column existence" — to:

- **Pillar matching (Plan ↔ Classifications)**. Spot-checked vocab:
  both sides use exact strings like `"Live Class / Exam Prep"` (same
  case, same spelling, same separators). Aligned. ✓
- **Diagnosis source_post_ids → Raw_Posts.Post ID**. Both opaque IDs
  from same source. Aligned. ✓
- **Strategy hypothesis_id → Plan slots' hypothesis_id**. Both are
  `h0`/`h1`/`h2` short codes. Aligned. ✓

The pattern fires specifically when a join key is generated by *two
different sources* (calendar prompt vs Facebook API), each with its
own vocabulary. The format/type case is currently the only such key
in the system, but the failure mode is structural — likely to recur
when new join keys land.

**Promotion status:** **promoted to Tier 1 immediately.** Same P0
class as T1.11, complementary to it (T1.11 = "key exists on both
sides", T1.12 = "values agree on both sides").

Suggested addition to Tier 1 in `LIVE_CHECK_POVS.md`:

> **T1.12 — Join-key vocabulary alignment.** For every join, verify
> the value vocabularies align across sources, not just the column
> name. Especially when one side is AI-generated (calendar prompt,
> classifier output) and the other is API-sourced (Graph API, Sheets
> manual entry) — these are independent vocabularies that drift.
> Sample 3 actual values from each side; if cardinality / case /
> spelling diverges, the join silently fails on those values.

**Master-list mapping:**
T1.11 was "does the matcher's join key exist?" — this discovery is
"do the values use the same vocabulary?" Different question, same
join-keypath. Pairs naturally with T1.11 as a two-step audit.

---

## 2026-05-01 — Silent cross-week fallback masks empty-state data

**Meta-lens:** 5 (time-window honesty) + 12 (cognitive cost per insight)

**Bug that surfaced this POV:**
User reported "this week / last week / next week all show the same
plan." Inspection found Content_Calendar contained ONLY one week's
slots (the most recent run's output), and the Plan page had a silent
fallback: when `getCalendarByWeekStarting(targetWeek)` returned empty,
the page rendered `getCalendar()` (latest, regardless of week) instead.
A small "fallback" banner *did* explain this, but it sat below the
slot grid most users never scrolled to — and the slot dates being
visibly wrong (showing next week's dates when "Last Week" was
selected) wasn't enough to dispel the illusion.

The fallback was added in good faith ("don't show an empty page") but
created a worse failure mode: silent misinformation that propagated
into Outcomes (people thinking they could measure last week's plan
when they were actually looking at next week's).

**Commit / fix reference:**
v4.11 — fallback removed entirely. Each week now stands alone; empty
state is explicit and explains *why* (running week not yet locked /
last week pre-archive / next week awaiting cron).

**Generalization test:**

Applied the underlying POV — "a graceful fallback that returns
*different-shape* data is worse than an empty state" — to:

- **Strategy page → archived runs**. Already does this correctly:
  shows "archive not found" message instead of falling back to live.
  Aligned. ✓
- **Diagnosis page → mid-week vs end-of-week preference**. Already
  honest: when neither row exists, returns null and the page renders
  empty. ✓
- **Outcomes page → no actuals yet**. Already honest: "verdict =
  no-data" is explicitly different from "verdict = miss".
- **Engagement / Reels / Trends → no posts in window**. All correctly
  render "no posts" rather than falling back to a wider window.

So the Plan page was the only fallback-happy surface. Generalization
is "look for any fallback that returns different time-window or
different-shape data — it's almost always wrong."

**Promotion status:** **promoted to Tier 1.**

Suggested addition to Tier 1:

> **T1.13 — No-fallback for time-windowed reads.** Pages that take a
> time-scope (week, day, run-id) must fail honestly when the requested
> scope has no data. A fallback that returns *the latest* / *any
> available* / *whichever has data* will silently mislead the user
> into thinking they're looking at their requested view. Empty state
> with explanation is always better.

**Master-list mapping:**
Closest existing was Tier 2 6.x (graceful degradation) — that POV
covers "what happens when AI fails / data is missing" but assumes
the fallback is honest. This is the deeper variant: even when the
fallback runs cleanly, if it returns the *wrong shape* of data, it's
a bug.

---
