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
};

export default function PlanNarrativeCard({ narrative }: Props) {
  if (!narrative) {
    return (
      <Card className="mb-4 border-l-4 border-l-brand-shikho-indigo">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-ink-primary">
            This Week&apos;s Plan
          </h2>
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

  const {
    storyline, hypothesis_id, cited_priors_row, hypothesis_list,
    forecast_summary, risk_flag_count, contingency_count,
  } = narrative;

  return (
    <Card className="mb-4 border-l-4 border-l-brand-shikho-indigo">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-ink-primary">
              This Week&apos;s Plan
            </h2>
            {hypothesis_id && (
              <span
                className="text-[11px] font-semibold uppercase tracking-wider text-brand-shikho-indigo bg-brand-shikho-indigo/10 px-2 py-0.5 rounded"
                aria-label={`Hypothesis id ${hypothesis_id}`}
              >
                {hypothesis_id}
              </span>
            )}
          </div>
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryStat
            label="Forecast"
            value={forecast_summary || "n/a"}
          />
          <SummaryStat
            label="Hypotheses"
            value={hypothesis_list || "—"}
          />
          <SummaryStat
            label="Risk flags"
            value={String(risk_flag_count)}
            numeric
          />
          <SummaryStat
            label="Contingencies"
            value={String(contingency_count)}
            numeric
          />
        </div>

        {cited_priors_row && (
          <p className="text-xs text-ink-muted break-words">
            <span className="font-semibold">Priors row cited: </span>
            <code className="text-[11px] bg-ink-100/50 px-1 py-0.5 rounded">
              {cited_priors_row}
            </code>
          </p>
        )}
      </div>
    </Card>
  );
}

function SummaryStat({
  label, value, numeric,
}: {
  label: string; value: string; numeric?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span
        className={
          numeric
            ? "text-xl sm:text-2xl font-bold text-ink-primary tabular-nums leading-tight"
            : "text-xs sm:text-sm text-ink-primary break-words leading-snug"
        }
      >
        {value}
      </span>
    </div>
  );
}
