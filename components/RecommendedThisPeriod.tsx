// Sprint P7 v4.18 R4 (2026-05-02) — consolidated "what + when" playbook card.
//
// Background: the dashboard had two scattered "what should I do this period"
// sections (Engagement page's "Recommended this period" 4-card grid, and
// Timing page's "Best posting window" synthesis hero). Operators had to
// bounce between two pages to compose a single weekly plan thought. R4
// merges these into one card pinned at the top of Overview (Pulse landing).
//
// Pure presentation — accepts pre-computed bests as props. The caller
// (currently Overview) computes the same group-stat ranks Engagement
// uses + the same day/hour winners Timing uses, then hands them to this
// component. Engagement and Timing keep their own detailed views (those
// pages are the deep-dive surface); Overview gets the compact synthesis.

import Link from "next/link";

export type BestStat = {
  /** Dimension value, e.g. "Reel" / "Live Class" / "Question" */
  key: string;
  /** Reach-weighted engagement rate (or rate appropriate to the dimension) */
  rate: number;
  /** How many posts contributed (sample size) */
  count: number;
};

export type BestSlot = {
  /** Day name (Monday, Tuesday, …) or hour label (e.g. "20:00") */
  label: string;
  /** Average value the rank was won on */
  value: number;
  /** "X avg reach/post" or "X.XX% avg ER" depending on metric */
  unitSuffix: string;
};

export type RecommendedThisPeriodProps = {
  /** Lead format (e.g. Reel) — drives "what kind of post" */
  bestFormat?: BestStat;
  /** Lead pillar (e.g. Live Class / Exam Prep) — drives topic */
  bestPillar?: BestStat;
  /** Best hook type (e.g. Question) */
  bestHook?: BestStat;
  /** Best spotlight type (e.g. Teacher) */
  bestSpotlight?: BestStat;
  /** Best caption tone (e.g. Educational) */
  bestTone?: BestStat;
  /** Best posting day of week (reach-leading) */
  bestDayReach?: BestSlot;
  /** Best posting hour (reach-leading) */
  bestHourReach?: BestSlot;
  /** Hex color resolver — caller passes the same canonicalColor used elsewhere */
  colorFor: (axis: "format" | "pillar" | "hook" | "spotlight" | "tone", key: string) => string;
};

export default function RecommendedThisPeriod(props: RecommendedThisPeriodProps) {
  const { bestFormat, bestPillar, bestHook, bestSpotlight, bestTone, bestDayReach, bestHourReach, colorFor } = props;

  const hasContentRec = bestFormat || bestPillar || bestHook || bestSpotlight || bestTone;
  const hasTimingRec = bestDayReach || bestHourReach;
  if (!hasContentRec && !hasTimingRec) return null;

  return (
    <section className="mb-6 rounded-2xl bg-ink-paper border border-ink-100 shadow-sm overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-ink-100 bg-gradient-to-br from-shikho-indigo-50/40 to-ink-paper">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1.5">
          <div>
            <h2 className="text-base font-semibold text-ink-primary flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-shikho-magenta">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
              </svg>
              Recommended this period
            </h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Synthesised from winning content buckets + posting windows. Treat as a hypothesis, not a guarantee.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-muted">
            {hasContentRec && (
              <Link href="/engagement" className="hover:text-brand-shikho-indigo">Engagement detail →</Link>
            )}
            {hasTimingRec && (
              <Link href="/timing" className="hover:text-brand-shikho-indigo">Timing detail →</Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 sm:p-5">
        {/* WHAT TO POST — content recommendations */}
        {bestFormat && bestPillar && (
          <RecCard
            label="Lead format × pillar"
            primary={
              <>
                <span style={{ color: colorFor("format", bestFormat.key) }}>{bestFormat.key}</span>
                <span className="text-ink-muted mx-1">·</span>
                <span style={{ color: colorFor("pillar", bestPillar.key) }}>{bestPillar.key}</span>
              </>
            }
            secondary={`${bestFormat.rate.toFixed(2)}% ER on ${bestFormat.count} ${bestFormat.key.toLowerCase()}${bestFormat.count === 1 ? "" : "s"}, ${bestPillar.rate.toFixed(2)}% on ${bestPillar.count} pillar post${bestPillar.count === 1 ? "" : "s"}. Intersection is untested.`}
            accent={colorFor("format", bestFormat.key)}
          />
        )}
        {bestHook && (
          <RecCard
            label="Opening hook"
            primary={<span style={{ color: colorFor("hook", bestHook.key) }}>{bestHook.key}</span>}
            secondary={`${bestHook.rate.toFixed(2)}% ER across ${bestHook.count} post${bestHook.count === 1 ? "" : "s"}.`}
            accent={colorFor("hook", bestHook.key)}
          />
        )}
        {bestSpotlight && (
          <RecCard
            label="Feature spotlight"
            primary={<span style={{ color: colorFor("spotlight", bestSpotlight.key) }}>{bestSpotlight.key}</span>}
            secondary={`${bestSpotlight.rate.toFixed(2)}% reach-weighted ER, ${bestSpotlight.count} post${bestSpotlight.count === 1 ? "" : "s"}.`}
            accent={colorFor("spotlight", bestSpotlight.key)}
          />
        )}
        {bestTone && (
          <RecCard
            label="Caption tone"
            primary={<span style={{ color: colorFor("tone", bestTone.key) }}>{bestTone.key}</span>}
            secondary={`${bestTone.rate.toFixed(2)}% ER across ${bestTone.count} post${bestTone.count === 1 ? "" : "s"}. Tone ≠ hook; independent variable.`}
            accent={colorFor("tone", bestTone.key)}
          />
        )}
        {/* WHEN TO POST — posting window from Timing aggregation */}
        {bestDayReach && (
          <RecCard
            label="Best day for reach"
            primary={<span className="text-brand-cyan">{bestDayReach.label}s</span>}
            secondary={`${bestDayReach.unitSuffix}.`}
            accent="#0FAEC9"
          />
        )}
        {bestHourReach && (
          <RecCard
            label="Best posting hour"
            primary={<span className="text-brand-shikho-indigo">{bestHourReach.label} BDT</span>}
            secondary={`${bestHourReach.unitSuffix}.`}
            accent="#304090"
          />
        )}
      </div>
    </section>
  );
}

/** Single recommendation tile — left-border accent + 3-line content. */
function RecCard({
  label,
  primary,
  secondary,
  accent,
}: {
  label: string;
  primary: React.ReactNode;
  secondary: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-lg border border-ink-100 bg-ink-paper p-3 transition-shadow hover:shadow-sm"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold leading-snug">{primary}</div>
      <div className="text-[11px] text-ink-muted mt-1 leading-relaxed">{secondary}</div>
    </div>
  );
}
