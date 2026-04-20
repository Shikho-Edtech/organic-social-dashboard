# DESIGN_HANDOFF

When to send the design brief to Claude Design, what to send, and how to
unblock parallel work so design turnaround isn't on the critical path.

## When

**At the start of [ROADMAP](ROADMAP.md) step 3, not before.**

Rationale:

- Step 1 (prompt overhaul) — pipeline only, no UI. Design unneeded.
- Step 2 (LLM abstraction) — backend refactor with byte-identical
  output. Design unneeded.
- **Step 3 (native classifier + AI-disabled mode)** — first UI surface
  area: consolidated StalenessBanner, AI-disabled empty states,
  possible IA shifts. Design needed.

Sending earlier burns a design cycle on a problem we haven't written
yet. Sending later blocks step 3 implementation.

**Concrete trigger:** the end-of-week-2 checkpoint. Step 2 is shipping
or shipped. Kick off design while you start step 3 backend work
(classifier + measurement script — pure Python, no UI).

## What to send (the packet)

1. **[DESIGN_BRIEF.md](DESIGN_BRIEF.md)** — source of truth. Design
   does not redefine scope; it resolves the visual questions inside the
   brief. Read §4 (banner states), §5 (AI-optional UX), §11 (13
   components) before anything else.

2. **Current screenshots at 360 / 768 / 1280px** for:
   - `/` (Overview)
   - `/strategy` (with stale artifact)
   - `/plan` (with stale artifact)
   - `/reels`
   - `/timing`

   Capture these against production Vercel. A small deck or Figma
   frame is fine — raw PNGs also work.

3. **The four banner states, described** — one page, plain English:
   - `ok` — artifact fresh, no banner (or muted "up to date")
   - `warn` — artifact >7 days old, amber tone
   - `crit` — artifact >14 days old or failed, red tone
   - `ai-disabled` — no artifact because AI was off for this run

   Tell design: "these four states must feel like **one** component,
   not four. A reader who saw the warn state yesterday should
   recognize the ai-disabled state today as the same family."

4. **AI-disabled page states** — Strategy and Plan when there is
   literally no artifact. Empty-state copy is in DESIGN_BRIEF §5. Ask
   design to visualize it.

5. **Brand lock**:
   - Inter font, existing Tailwind palette (see `tailwind.config.ts`)
   - Dark-on-light, no dark mode toggle in scope
   - No emoji
   - Mobile-first per `../CLAUDE.md` — 360px is the floor

6. **Explicit non-asks**:
   - Do not redesign navigation structure beyond the IA already in the
     brief
   - Do not propose new pages or new metrics
   - Do not propose `RunPicker` UI — deferred in
     [ROADMAP.md](ROADMAP.md)

## What to ask for back

- Figma (or equivalent) frames for:
  - 4 banner states, each at 360 + 1280
  - Strategy page AI-disabled empty state, 360 + 1280
  - Plan page AI-disabled empty state, 360 + 1280
- A short annotated summary of any decisions design made (tone scale,
  icon choices, spacing) so they land in
  [DECISIONS.md](../DECISIONS.md) when implemented.

## What to push back on

If design comes back with:

- **New pages or new KPIs** — reject. Brief is the contract.
- **"We should redesign the nav"** — reject unless they point to a
  specific brief item it unlocks.
- **Dark mode, skeuomorphism, animated transitions** — reject as
  scope expansion.
- **Proposals that assume a Run_Ledger or RunPicker** — reject; both
  deferred per roadmap.

Design is resolving visual ambiguity inside a frozen scope. Not
expanding it.

## Timeline

| Week | You | Design |
|---|---|---|
| 1 | Step 1 ships | — |
| 2 | Step 2 ships. End-of-week: send packet | — |
| 3 | Step 3 backend (classifier + measurement) | Design cycle 1 (first Figma) |
| 4 | Step 3 UI implementation against Figma | Design cycle 2 (revisions) |

If design cycle 1 slips, step 4 still works — just implement the
step-3 backend without the UI polish and flip it on in a follow-up
commit when Figma lands.

## Related

- Scope + component list: [DESIGN_BRIEF.md](DESIGN_BRIEF.md)
- Mobile rules that bind any design output: [../CLAUDE.md](../CLAUDE.md)
- QA gate that catches design regressions post-implementation:
  [../CLAUDE.md](../CLAUDE.md) "Pre-commit QA gate"
