# Shikho v1.0 brand system — the only palette allowed in this repo

This is the source of truth. Every UI commit (dashboard pages, pipeline
HTML report, master decks) must conform. Deviations are build-blockers,
not stylistic preferences.

The spec comes from the Shikho v1.0 brand guideline (March 2026). This
file captures how the spec lands **in code** — token names, forbidden
patterns, where each hue applies.

---

## 1. The four core hues

Every chart, pill, KPI, and accent leads with one of these. No other
colour family is brand-approved.

| Role | Hex | Tailwind token(s) | Where it appears |
|---|---|---|---|
| **Indigo** (primary) | `#304090` | `brand-shikho-indigo`, `shikho-indigo-600` | Primary CTAs, KPI values, default bar/line charts, focus ring |
| **Magenta** (energy) | `#C02080` | `brand-shikho-pink`, `shikho-magenta-500` | Reel format, engagement cards, derived-chart kind border |
| **Sunrise** (warmth) | `#E0A010` | `brand-shikho-orange`, `shikho-sunrise-500` | Carousel format, AI-chart kind accents, top-of-funnel |
| **Coral** (alert) | `#E03050` | `brand-shikho-coral`, `shikho-coral-500` | Negative deltas, bottom-of-funnel, error states |

Each hue has a full 50→900 scale in `tailwind.config.ts` — use those for
tints/shades; don't invent ad-hoc hexes.

## 2. Neutrals

Ink scale on Canvas + Paper. **No `slate-*`, no `gray-*`, no `zinc-*`.**

| Role | Hex | Tailwind token |
|---|---|---|
| Canvas (page bg) | `#F4F5FA` | `bg-brand-canvas` |
| Paper (card bg) | `#FFFFFF` | `bg-ink-paper` |
| Hairline | `#E6E8F0` | `border-ink-100` |
| Muted text | `#6E7389` | `text-ink-muted` |
| Secondary text | `#4A506A` | `text-ink-secondary` |
| Primary text | `#20253B` | `text-ink-primary` |
| Heading (charcoal) | `#111A3F` | `text-shikho-indigo-900` |

Dark-surface counterparts (pipeline report, master decks):

| Role | Hex |
|---|---|
| ink.900 body | `#0A0C18` |
| ink.800 panel | `#121526` |
| ink.700 elevated | `#1A2558` |
| ink.600 border | `#243172` |
| Primary text | `#DCE0F3` |
| Secondary text | `#9098AE` |
| Muted text | `#6E7389` |

## 3. Typography

**Poppins** for display + English body. **Hind Siliguri** for Bangla.
JetBrains Mono for inline code/metadata. **Inter is banned** — it was
the old default and must not reappear.

```css
font-family: "Poppins", "Hind Siliguri", -apple-system, BlinkMacSystemFont,
             "Segoe UI", Roboto, sans-serif;
```

Tailwind tokens: `font-sans`, `font-display`, `font-bangla`. All resolve
to the stack above.

## 4. Shape + shadow + motion tokens

| Token | Value | Use |
|---|---|---|
| `rounded-xs` | 4px | inline chips |
| `rounded-sm` | 8px | inputs, small buttons |
| `rounded-md` | 12px | tooltips, small cards |
| `rounded-lg` | 16px | buttons |
| `rounded-xl` | 20px | large buttons, KPI cards |
| `rounded-2xl` | 28px | hero cards |
| `shadow-xs` → `shadow-xl` | ambient | all cards |
| `shadow-indigo-lift` | primary CTA | Sign-in, "Run diagnosis" |
| `shadow-magenta-lift` | accent CTA | reel-specific CTAs only |
| `duration-fast` | 140ms | hover states |
| `duration-base` | 220ms | card lifts, page transitions |
| `duration-slow` | 420ms | modals, drawers |
| `ease-shikho-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | default easing |

## 5. Forbidden patterns — automated audit checks for these

The brand audit script greps for these. Any hit = violation.

### Banned tokens
- `text-slate-*`, `bg-slate-*`, `border-slate-*` — use `text-ink-*`, `bg-ink-*`, `border-ink-*`
- `text-gray-*`, `bg-gray-*`, `border-gray-*`
- `text-zinc-*`, `bg-zinc-*`, `border-zinc-*`

### Banned hex values (the old Tailwind dark palette)
`#0b1120`, `#111827`, `#0f172a`, `#1f2937`, `#334155`, `#475569`,
`#64748b`, `#94a3b8`, `#cbd5e1`, `#e2e8f0`, `#e5e7eb`, `#f1f5f9`,
`#f8fafc` — remap to ink-* or shikho-indigo-* equivalents.

### Banned fonts
- `"Inter"` in any `font-family` declaration → use `"Poppins", "Hind Siliguri", …`
- Generic `system-ui` as first-stop → Poppins must come first

### Banned chart colour defaults
- Recharts default colour strings (none of our charts should omit an explicit colour)
- `#06b6d4` (cyan-500), `#8b5cf6` (violet-500), `#f97316` (orange-500) — these were
  mid-refactor compromises; use Shikho core hues instead

## 6. The rollout rule (for future palette shifts)

If the brand system ever updates (v1.1, v2.0), follow the pattern that
worked for v1.0:

1. **Remap hex, keep token names.** `tailwind.config.ts` is the only
   file that changes for 90% of the palette update. Don't rename
   `brand-shikho-indigo` to `brand-indigo` — that's a rename churn
   with no visual delta.
2. **Each surface has its own `:root`.** The pipeline Python report
   and the master HTML decks each carry their own `:root` block. Walk
   each one, swap the vars + font, ripgrep for `rgba\(` tuples that
   bypass the vars, remap those too.
3. **Run `npm run brand:audit` before commit.** If the audit finds
   stale tokens, fix before shipping — never land a commit that
   introduces new banned patterns.

## 7. What's covered by this spec

- Dashboard routes (`organic-social-dashboard/app/**`)
- Shared components (`organic-social-dashboard/components/**`)
- Pipeline Chart.js HTML report (`facebook-pipeline/src/report.py`)
- Master decks (`START_HERE.html`, `facebook-pipeline/docs/*.html`)

## 8. What's NOT covered

- `node_modules/`, `.next/`, build artifacts
- Markdown files (these don't render UI)
- Python logic outside `report.py` — logic doesn't have a palette
- Third-party embeds (Vercel admin, Google Sheets iframes) — we don't
  control their chrome
