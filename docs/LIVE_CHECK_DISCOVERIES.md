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

<!-- No discoveries yet. The first one comes from the next live check. -->
