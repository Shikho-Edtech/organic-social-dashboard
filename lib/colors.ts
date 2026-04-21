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
//
// Shikho design system v1.0 — all hues here are pulled from the four core
// scales (indigo / magenta / sunrise / coral) plus one emerald (success)
// and one teal (quiet informational). Legacy arbitrary Tailwind hex values
// were removed in the brand-rollout pass so charts + pills reinforce the
// brand palette instead of fighting it.

// Fallback palette — when a value isn't in the canonical map we hash it
// into this ordered list. Sequence is chosen so adjacent values on a
// typical sort (alphabetic, frequency) are visually distinct.
const FALLBACK_PALETTE = [
  "#304090", // shikho-indigo-600 (core)
  "#C02080", // shikho-magenta-500 (core)
  "#E0A010", // shikho-sunrise-500 (core)
  "#E03050", // shikho-coral-500 (core)
  "#3F4FA2", // indigo-500
  "#A11A6D", // magenta-600
  "#B7820A", // sunrise-600
  "#10b981", // emerald-500 (success / positive tone)
];

// FORMAT_COLORS are aligned to Plan page's format pills so "Reel" is the
// same colour on Plan, Engagement charts, and any future cross-page
// callout. All four Shikho core hues are used so the pill grid reads as
// the Shikho rainbow when all formats are present.
export const FORMAT_COLORS: Record<string, string> = {
  Reel:     "#C02080", // magenta-500 — Shikho's "motion" wing
  Photo:    "#304090", // indigo-600 — quiet, dependable
  Carousel: "#E0A010", // sunrise-500 — scrollable warmth
  Video:    "#A11A6D", // magenta-600 — heavier than reel, same family
  Link:     "#1A8E78", // brand.teal — informational, off-core
  Status:   "#6E7389", // ink-400 — neutral text post
};

export const HOOK_COLORS: Record<string, string> = {
  Question:     "#10b981", // emerald — invitation, open
  Stat:         "#304090", // indigo-600 — analytical, authoritative
  Celebration:  "#C02080", // magenta-500 — energetic
  Story:        "#8C3FA8", // magenta-leaning purple — narrative
  "How-to":     "#E0A010", // sunrise-500 — practical, instructional
  Announcement: "#3F4FA2", // indigo-500 — cool, informational
  Testimonial:  "#1A8E78", // teal — social-proof warmth
  Promise:      "#243172", // indigo-700 — commitment, weight
};

export const SPOTLIGHT_COLORS: Record<string, string> = {
  Teacher:  "#8C3FA8", // magenta-purple — human-centric
  Product:  "#3F4FA2", // indigo-500 — offering, service
  Program:  "#304090", // indigo-600 — structured, curricular
  Campaign: "#C02080", // magenta-500 — promotional energy
  Event:    "#E0A010", // sunrise-500 — moment-in-time
};

export const FUNNEL_COLORS: Record<string, string> = {
  TOFU: "#E0A010", // sunrise-500 — top, awareness, warmth of first touch
  MOFU: "#304090", // indigo-600 — middle, consideration, depth
  BOFU: "#C02080", // magenta-500 — bottom, conversion, urgency
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
// Empty / "Unknown" / "None" → ink-400 (Shikho neutral).
export function canonicalColor(field: ColorField, value: string | undefined | null): string {
  if (!value) return "#6E7389";
  const v = value.trim();
  if (!v || v === "Unknown" || v === "None" || v === "—") return "#6E7389";

  let map: Record<string, string> | null = null;
  if (field === "format") map = FORMAT_COLORS;
  else if (field === "hook") map = HOOK_COLORS;
  else if (field === "spotlight") map = SPOTLIGHT_COLORS;
  else if (field === "funnel") map = FUNNEL_COLORS;

  if (map && map[v]) return map[v];
  return FALLBACK_PALETTE[hashIndex(v, FALLBACK_PALETTE.length)];
}
