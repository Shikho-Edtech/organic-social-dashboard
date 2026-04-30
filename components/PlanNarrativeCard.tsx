// PLN-07: "This Week's Plan" summary card — reads a single Plan_Narrative
// row written by the pipeline (PLN-06) so the plan page gets the
// week-level narrative arc, aggregate forecast, and risk/contingency
// counts without re-aggregating slots on every render.
//
// Empty-safe: when the pipeline hasn't populated Plan_Narrative yet
// (first run, or a week where the calendar stage fell back to native),
// the parent should pass `narrative={null}` and we render a muted
// placeholder instead of a crash.
//
// Mobile: card stacks vertically at <sm, becomes a side-by-side layout
// at sm+ where the storyline column takes the wider share. All big
// numbers use break-words + responsive text sizes per the mobile rules.

import type { PlanNarrative } from "@/lib/sheets";
import { Card } from "@/components/Card";

type Props = {
  narrative: PlanNarrative | null;
  /** Sprint P7 v4.4 (2026-04-30): which week scope the parent is rendering.
   *  Drives the card title so Last-Week / Next-Week views don't read
   *  "This Week's Plan" misleadingly. Defaults to "this" for back-compat. */
  scope?: "this" | "last" | "next";
};

const SCOPE_TITLE: Record<NonNullable<Props["scope"]>, string> = {
  this: "This Week's Plan",
  last: "Last Week's Plan",
  next: "Next Week's Plan",
};

export default function PlanNarrativeCard({ narrative, scope = "this" }: Props) {
  const title = SCOPE_TITLE[scope];

  if (!narrative) {
    return (
      <Card className="mb-4 border-l-4 border-l-brand-shikho-indigo">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
          <p className="text-sm text-ink-muted">
            No narrative arc has been written yet. The next weekly pipeline
            run (PLN-06) will populate the week-level summary here — the
            per-day slot cards below remain the source of truth in the
            meantime.
          </p>
        </div>
      </Card>
    );
  }

  const { storyline } = narrative;

  // Sprint P6: stripped the 4-stat grid (forecast, hypotheses, risk
  // flags, contingencies) + priors-row footer + hypothesis-ID pill.
  // Users saw them as clutter — the storyline paragraph alone answers
  // "what is the plan betting on this week?" The stripped fields
  // remain in Plan_Narrative for future programmatic use.
  return (
    <Card className="mb-4 border-l-4 border-l-brand-shikho-indigo">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
        {storyline ? (
          <p className="text-sm text-ink-primary leading-relaxed break-words">
            {storyline}
          </p>
        ) : (
          <p className="text-sm text-ink-muted italic">
            Narrative storyline missing — calendar may have been generated
            with an older prompt version.
          </p>
        )}
      </div>
    </Card>
  );
}
