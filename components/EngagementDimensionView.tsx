// Sprint P7 v4.18 R2 (2026-05-02) — feature-flagged consolidated view that
// replaces the 5-chart per-dimension stack on /engagement?layout=r2.
//
// Wireframe origin: docs/wireframes/R2_engagement_consolidation_v1.html.
// Operators only look at one dimension at a time, so 5 stacked bar charts
// burned ~1500px of mobile vertical scroll for a comparison the eye can't
// hold (when you're looking at Hook ER, you've forgotten the Format
// numbers from 800px ago). One chart with a dimension toggle puts the
// comparison on a single screen and makes "rank by dimension" the
// explicit question, not implicit chart-stacking.
//
// Server-rendered (no client state); dimension switching uses a URL
// param `?eng_dim=` so deep-links / refreshes preserve selection.
//
// Props are intentionally pre-computed by the caller:
// `series` is a Record<DimensionId, BarRow[]> where BarRow matches what
// BarChartBase already accepts. Each dimension's "best" winner is
// passed alongside as the inline KPI ("crown badge" — replaces the 5-
// card "Best X" strip from the legacy layout).

import Link from "next/link";
import BarChartBase from "@/components/BarChart";
import { ChartCard } from "@/components/Card";
import { reliabilityLabel } from "@/lib/stats";

export type DimensionId = "format" | "pillar" | "hook" | "spotlight" | "tone";

export type DimensionSeriesRow = { label: string; value: number; color: string };

export type DimensionWinner = {
  key: string;
  rate: number; // engagement-rate %
  count: number;
};

export type DimensionConfig = {
  id: DimensionId;
  label: string;
  /** Sub-tagline shown when this dim is active */
  subtitle: string;
  /** Long-form definition shown in the (i) tooltip */
  definition: string;
  /** Caption shown below the chart */
  caption: string;
  /** Singular noun used in inline copy ("hook type", "pillar") */
  noun: string;
  series: DimensionSeriesRow[];
  winner?: DimensionWinner;
  /** Min-n threshold the caller used to filter the series */
  minN: number;
  /** Whether this chart should be rendered horizontally (long labels) */
  horizontal?: boolean;
};

type Props = {
  active: DimensionId;
  /** Total post count across the range — for sampleSize chip */
  totalPosts: number;
  /** Existing query params, preserved on dim-switch links */
  searchParams: Record<string, string | string[] | undefined>;
  dimensions: DimensionConfig[];
  /** Hex color resolver for each dimension's accent */
  colorFor: (axis: DimensionId, key: string) => string;
};

function buildHref(
  searchParams: Record<string, string | string[] | undefined>,
  nextDim: DimensionId,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "eng_dim") continue;
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && v.length) params.set(k, v[0]);
  }
  params.set("eng_dim", nextDim);
  const qs = params.toString();
  return qs ? `/engagement?${qs}` : "/engagement";
}

export default function EngagementDimensionView({
  active,
  totalPosts,
  searchParams,
  dimensions,
  colorFor,
}: Props) {
  const current = dimensions.find((d) => d.id === active) ?? dimensions[0];
  if (!current) return null;
  const winner = current.winner;
  const accentColor = winner ? colorFor(current.id, winner.key) : "#304090";

  return (
    <div className="mb-6">
      {/* DIMENSION SWITCHER — pills toggle which axis the chart ranks. */}
      <nav
        aria-label="Engagement dimension"
        className="mb-3 flex flex-wrap items-center gap-1.5"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mr-1">
          Rank by:
        </span>
        {dimensions.map((d) => {
          const isActive = d.id === active;
          return (
            <Link
              key={d.id}
              href={buildHref(searchParams, d.id)}
              scroll={false}
              aria-pressed={isActive}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors duration-base ${
                isActive
                  ? "bg-brand-shikho-indigo text-white border-brand-shikho-indigo shadow-sm"
                  : "bg-ink-paper text-ink-secondary border-ink-100 hover:border-brand-shikho-indigo hover:text-brand-shikho-indigo"
              }`}
            >
              {d.label}
              <span
                className={`ml-1 text-[10px] ${
                  isActive ? "text-white/80" : "text-ink-muted"
                }`}
              >
                ({d.series.length})
              </span>
            </Link>
          );
        })}
      </nav>

      {/* INLINE KPI + CHART. The "Best X" KPI is now inline above the chart
          (replacing the 5-card strip from the legacy layout) so the eye sees
          "winner → evidence" in one card, not "winner over here, evidence
          over there." */}
      <ChartCard
        title={`${current.label} Performance`}
        kind="ai"
        subtitle={current.subtitle}
        definition={current.definition}
        sampleSize={`${current.series.length} ${current.noun}${current.series.length === 1 ? "" : "s"} · n = ${totalPosts} post${totalPosts === 1 ? "" : "s"}`}
        caption={current.caption}
      >
        {winner && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-shikho-indigo-50/40 border border-shikho-indigo-100/80">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
              Winner this period
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5">
              <span
                className="text-base font-bold leading-tight"
                style={{ color: accentColor }}
              >
                {winner.key}
              </span>
              <span className="text-xs text-ink-secondary">
                {winner.rate.toFixed(2)}% engagement rate
              </span>
              <span className="text-[11px] text-ink-muted">
                · {reliabilityLabel(winner.count)}
              </span>
            </div>
          </div>
        )}
        {current.series.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">
            Not enough posts in range to rank — needs at least {current.minN}{" "}
            post{current.minN === 1 ? "" : "s"} per {current.noun}.
          </p>
        ) : (
          <BarChartBase
            data={current.series}
            horizontal={current.horizontal}
            height={
              current.horizontal
                ? Math.max(220, current.series.length * 32)
                : undefined
            }
            valueFormat="percent"
            metricName="Engagement rate"
            valueAxisLabel="Engagement rate"
            categoryAxisLabel={current.label}
          />
        )}
      </ChartCard>
    </div>
  );
}
