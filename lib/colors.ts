// Canonical per-value colors for categorical fields across the dashboard.
//
// Rationale: when a bar chart (or "Best X" KPI) displays the name of a
// category that ALSO appears on another page (Plan's reel pill, Strategy's
// funnel stage, etc.), the color of that category should be the same
// everywhere. Using a palette-index-per-bar scheme means "Reel" is
// whatever color the sort landed it at — which can flip between pages.
//
// Rule: if a value has a canonical identity color, return it. Otherwise
// fall back to a hash-based palette lookup so the SAME value always
// maps to the SAME color, even if we can't list it ahead of time
// (pillars, spotlight names, new hook types).

// Shared palette — same colors used in BarChart.tsx PALETTE so charts
// and KPIs stay visually consistent.
const FALLBACK_PALETTE = [
  "#4f46e5", // indigo
  "#ec4899", // pink
  "#f59e0b", // orange
  "#06b6d4", // cyan
  "#10b981", // green
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#14b8a6", // teal
];

// FORMAT_COLORS are aligned to Plan page's format pills (tailwind -500
// tier of the pill's hue) so "Reel" is the same colour on Plan, Engagement
// charts, and any future cross-page callout. Changing one side without
// the other breaks the cross-page recognition we're paying for.
export const FORMAT_COLORS: Record<string, string> = {
  Reel: "#ec4899",        // pink (pink-500) — Plan reel pill
  Photo: "#3b82f6",       // blue (blue-500) — Plan photo pill
  Carousel: "#f59e0b",    // amber (amber-500) — Plan carousel pill
  Video: "#a855f7",       // purple (purple-500) — Plan video pill
  Link: "#14b8a6",        // teal (teal-500) — Plan link pill
  Status: "#64748b",      // slate — Plan status pill
};

export const HOOK_COLORS: Record<string, string> = {
  Question: "#10b981",    // green — invitation, open
  Stat: "#4f46e5",        // indigo — analytical, authoritative
  Celebration: "#ec4899", // pink — energetic
  Story: "#8b5cf6",       // violet — narrative
  "How-to": "#f59e0b",    // orange — practical, instructional
  Announcement: "#06b6d4",// cyan — cool, informational
  Testimonial: "#14b8a6", // teal — social-proof warmth
  Promise: "#3b82f6",     // blue — commitment
};

export const SPOTLIGHT_COLORS: Record<string, string> = {
  Teacher: "#8b5cf6",     // violet — human-centric
  Product: "#06b6d4",     // cyan — offering, service
  Program: "#4f46e5",     // indigo — structured, curricular
  Campaign: "#ec4899",    // pink — promotional energy
  Event: "#f59e0b",       // orange — moment-in-time
};

export const FUNNEL_COLORS: Record<string, string> = {
  TOFU: "#06b6d4",        // cyan — top, awareness
  MOFU: "#4f46e5",        // indigo — middle, consideration
  BOFU: "#ec4899",        // pink — bottom, conversion
};

// Hash a string to a stable index in [0, mod). Same string in → same
// index out, across server renders. djb2-style — fast and good enough
// for palette selection (we don't need crypto-grade distribution).
function hashIndex(s: string, mod: number): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h) % mod;
}

export type ColorField = "format" | "hook" | "spotlight" | "pillar" | "funnel";

// Canonical color for a (field, value) pair.
//
// Returns the brand-canonical color if one is defined for the value,
// otherwise a deterministic palette color derived from hashing the value.
// This means "AI / Tech" pillar (not in the canonical list) always gets
// the same color, just not a handpicked one.
//
// Empty / "Unknown" / "None" → slate-500.
export function canonicalColor(field: ColorField, value: string | undefined | null): string {
  if (!value) return "#64748b";
  const v = value.trim();
  if (!v || v === "Unknown" || v === "None" || v === "—") return "#64748b";

  let map: Record<string, string> | null = null;
  if (field === "format") map = FORMAT_COLORS;
  else if (field === "hook") map = HOOK_COLORS;
  else if (field === "spotlight") map = SPOTLIGHT_COLORS;
  else if (field === "funnel") map = FUNNEL_COLORS;

  if (map && map[v]) return map[v];
  return FALLBACK_PALETTE[hashIndex(v, FALLBACK_PALETTE.length)];
}
