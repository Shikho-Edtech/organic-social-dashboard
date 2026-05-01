// Sprint P7 v4.16 (2026-05-02): canonical hypothesis chip component.
//
// Globalizes the H1/H2/H0 chip pattern that previously lived inline on
// Plan / Outcomes / Diagnosis / PlanNarrativeCard. Every render of an
// hypothesis_id (e.g. "h1", "h2", "h0") goes through this component so
// the visual treatment + tooltip behavior stays uniform across the
// dashboard. Adding a new page that surfaces hypothesis_ids? Use this
// component — don't roll an inline span.
//
// Tooltip resolution:
//   1. If `map[id]` has the actual hypothesis statement, the tooltip
//      shows "H1: <statement>".
//   2. If `map[id]` is missing (older week pre-v4.11 migration, or h0
//      status-quo), the tooltip explains "not yet resolved" so the user
//      knows the chip is alive but the data isn't ready.
//
// Visual: 10px bold uppercase letter, indigo tint background, rounded
// pill, cursor:help. Matches the four other surfaces it replaces.

import type { CSSProperties } from "react";

type HypothesisChipProps = {
  /** The hypothesis identifier — usually "h0" / "h1" / "h2" / "h3". */
  id: string;
  /** Map of hypothesis_id → statement, from Plan_Narrative.hypotheses_map
   *  for the active week. Pass an empty object {} when unavailable. */
  map: Record<string, string>;
  /** Optional className extension for layout fine-tuning. */
  className?: string;
  /** Optional inline style override. */
  style?: CSSProperties;
};

export default function HypothesisChip({
  id,
  map,
  className = "",
  style,
}: HypothesisChipProps) {
  if (!id) return null;
  const text = map?.[id];
  const upper = id.toUpperCase();
  const tip = text
    ? `${upper}: ${text}`
    : `${upper} — hypothesis statement not yet resolved (older week or status-quo). Run the next weekly pipeline to populate.`;
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-brand-shikho-indigo/10 text-brand-shikho-indigo rounded px-1.5 py-0.5 cursor-help ${className}`}
      style={style}
      title={tip}
      aria-label={tip}
    >
      {id}
    </span>
  );
}
