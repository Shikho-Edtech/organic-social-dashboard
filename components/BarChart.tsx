"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from "recharts";
import type { CompositeBreakdownEntry } from "./CompositeExplainer";

type FormatSpec = "number" | "percent" | "percent1";

type Props = {
  data: { label: string; value: number; meta?: number; muted?: boolean; color?: string }[];
  color?: string;
  height?: number;
  horizontal?: boolean;
  valueFormat?: FormatSpec;
  colorByIndex?: boolean;
  /** Name of the metric being plotted (e.g. "Reach", "Engagement Rate"). Used in tooltip instead of "value". */
  metricName?: string;
  /** Axis label for the value axis (Y for vertical, X for horizontal) */
  valueAxisLabel?: string;
  /** Axis label for the category axis (X for vertical, Y for horizontal) */
  categoryAxisLabel?: string;
  /** If true, show each bar as a percentage share of total alongside the raw value */
  showPercent?: boolean;
  /** Sprint P7 v4 (2026-04-29): when set, the chart is in composite-rank
   *  mode — the bar value is a 0..100 composite score, and the tooltip
   *  shows the per-metric percentile + weight breakdown that produced it.
   *  Map keys are bar labels; absent labels fall back to the default tooltip. */
  compositeBreakdown?: Record<string, CompositeBreakdownEntry[]>;
};

// Shikho v1.0 palette. Lead with the four core hues (indigo, magenta,
// sunrise, coral) so 2-4 bar charts read as the Shikho identity without
// any `color={}` override. Secondary tones are 500/700 variants of the
// same families so the chart stays on-brand even with many categories.
const PALETTE = [
  "#304090", // shikho-indigo-600 (core)
  "#C02080", // shikho-magenta-500 (core)
  "#E0A010", // shikho-sunrise-500 (core)
  "#E03050", // shikho-coral-500 (core)
  "#3F4FA2", // indigo-500
  "#A11A6D", // magenta-600
  "#B7820A", // sunrise-600
  "#1A8E78", // brand teal (informational)
  "#8C3FA8", // magenta-purple
  "#243172", // indigo-700 (deep)
  "#10b981", // emerald (success)
  "#6E7389", // ink-400 (neutral filler)
];

function makeFormatter(spec?: FormatSpec): (v: number) => string {
  if (spec === "percent") return (v) => v + "%";
  if (spec === "percent1") return (v) => v.toFixed(1) + "%";
  return (v) => v.toLocaleString();
}

export default function BarChartBase({
  data,
  color,
  height = 240,
  horizontal,
  valueFormat,
  colorByIndex,
  metricName,
  valueAxisLabel,
  categoryAxisLabel,
  showPercent,
  compositeBreakdown,
}: Props) {
  const fmt = makeFormatter(valueFormat);
  const total = showPercent ? data.reduce((s, d) => s + (d.value || 0), 0) : 0;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const isCompositeMode = compositeBreakdown !== undefined;

  // Dynamic YAxis width for horizontal bars. Previously hardcoded to 130,
  // which burned 44% of a 375px phone's drawing area even when labels were
  // short (e.g. TOFU/MOFU/BOFU). Compute from actual longest label: ~6.5px
  // per char at 11px sans-serif + 12px padding, clamped 60–140. Long pillar
  // names like "Study Tips & Exam Prep" still get the full 130ish they had
  // before; short-label charts reclaim pixels for bars on mobile.
  const longestLabel = data.reduce(
    (max, d) => Math.max(max, (d.label || "").length),
    0
  );
  const yAxisWidth = Math.min(140, Math.max(60, Math.round(longestLabel * 6.5) + 12));

  const tooltipFormatter = (v: number, _name: string, entry: any): [string, string] => {
    const name = metricName || "Value";
    const meta = entry?.payload?.meta;
    const suffix = typeof meta === "number" ? ` · n=${meta}` : "";
    if (showPercent && total > 0) return [`${fmt(v)} (${pct(v).toFixed(1)}% of total)${suffix}`, name];
    return [`${fmt(v)}${suffix}`, name];
  };

  // Label shown at the end of each bar when showPercent is on
  const pctLabel = (v: number) => (v > 0 ? `${pct(v).toFixed(0)}%` : "");

  // Reasonable margins — leave room for axis labels when present
  const margin = horizontal
    ? { top: 5, right: showPercent ? 60 : 20, left: categoryAxisLabel ? 20 : 0, bottom: valueAxisLabel ? 25 : 5 }
    : { top: showPercent ? 20 : 5, right: 10, left: valueAxisLabel ? 15 : 0, bottom: categoryAxisLabel ? 20 : 5 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6E8F0" vertical={!horizontal} horizontal={horizontal} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tickFormatter={fmt}
              label={
                valueAxisLabel
                  ? { value: valueAxisLabel, position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "#4A506A", fontWeight: 500 } }
                  : undefined
              }
            />
            <YAxis
              type="category"
              dataKey="label"
              axisLine={false}
              tickLine={false}
              // Dynamic width: sized to the longest label in this chart's data,
              // clamped 60–140. Mobile charts with short labels (TOFU/MOFU/BOFU)
              // reclaim ~40px of drawing area; desktop charts with long pillar
              // names ("Study Tips & Exam Prep") still get the ~130 they need.
              width={yAxisWidth}
              tick={{ fontSize: 11, fill: "#333A50" }}
              label={
                categoryAxisLabel
                  ? { value: categoryAxisLabel, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#4A506A", fontWeight: 500, textAnchor: "middle" } }
                  : undefined
              }
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#333A50" }}
              label={
                categoryAxisLabel
                  ? { value: categoryAxisLabel, position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "#4A506A", fontWeight: 500 } }
                  : undefined
              }
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={fmt}
              width={55}
              tick={{ fontSize: 11, fill: "#333A50" }}
              label={
                valueAxisLabel
                  ? { value: valueAxisLabel, angle: -90, position: "insideLeft", offset: 5, style: { fontSize: 11, fill: "#4A506A", fontWeight: 500, textAnchor: "middle" } }
                  : undefined
              }
            />
          </>
        )}
        {isCompositeMode ? (
          // Sprint P7 v4 (2026-04-29): composite-mode tooltip renders a
          // per-metric percentile + weight breakdown. Recharts passes the
          // hovered datum's payload via the `content` render prop.
          <Tooltip
            cursor={{ fill: "rgba(48,64,144,0.06)" }}
            content={({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; value: number } }> }) => {
              if (!active || !payload || payload.length === 0) return null;
              const datum = payload[0].payload;
              const breakdown = compositeBreakdown![datum.label];
              if (!breakdown || breakdown.length === 0) {
                return (
                  <div style={{ backgroundColor: "white", border: "1px solid #E6E8F0", borderRadius: "12px", boxShadow: "0 6px 14px rgba(16,22,54,0.08)", padding: "8px 12px", fontSize: "12px" }}>
                    <div style={{ fontWeight: 600 }}>{datum.label}</div>
                    <div style={{ color: "#4A506A" }}>{Math.round(datum.value)} composite</div>
                  </div>
                );
              }
              return (
                <div style={{ backgroundColor: "#0E1330", border: "1px solid #1A2558", borderRadius: "10px", boxShadow: "0 6px 14px rgba(16,22,54,0.18)", padding: "10px 12px", fontSize: "12px", color: "#DCE0F3", minWidth: "240px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #1A2558" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#A4ACD0" }}>
                      {datum.label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", fontVariantNumeric: "tabular-nums" }}>
                      {Math.round(datum.value)}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {breakdown.map((b: CompositeBreakdownEntry) => {
                      const contribution = (b.percentile * b.weight) / 100;
                      return (
                        <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#DCE0F3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {b.name}
                          </span>
                          <span style={{ fontSize: 11, color: "#A4ACD0", fontVariantNumeric: "tabular-nums" }}>
                            {b.raw && <span style={{ opacity: 0.75 }}>{b.raw} · </span>}
                            p{Math.round(b.percentile)}
                          </span>
                          <span style={{ fontSize: 10, color: "#7A86B8", fontVariantNumeric: "tabular-nums", width: 36, textAlign: "right" }}>
                            × {Math.round(b.weight)}%
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums", width: 32, textAlign: "right" }}>
                            {contribution.toFixed(0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #1A2558", fontSize: 10, color: "#7A86B8" }}>
                    p<span>N</span> = percentile rank. Σ contributions = composite.
                  </div>
                </div>
              );
            }}
          />
        ) : (
          <Tooltip
            contentStyle={{ backgroundColor: "white", border: "1px solid #E6E8F0", borderRadius: "12px", boxShadow: "0 6px 14px rgba(16,22,54,0.08)", fontSize: "12px" }}
            formatter={tooltipFormatter}
            cursor={{ fill: "rgba(48,64,144,0.06)" }}
          />
        )}
        {/*
          maxBarSize caps each bar at ~56px so a 1-bar chart doesn't fill the
          entire plot width (prior pass had no cap and a single pillar bar
          stretched the full ~900px container — read as "mandatory data" when
          it was just "only one category passed the reliability gate").
          Recharts still shrinks the bar below the cap when many categories
          share the axis, so multi-bar charts are unaffected.
        */}
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={
                d.muted
                  ? "#C8CCD9"
                  : d.color ||
                    (colorByIndex ? PALETTE[i % PALETTE.length] : color || "#304090")
              }
            />
          ))}
          {showPercent && (
            <LabelList
              dataKey="value"
              position={horizontal ? "right" : "top"}
              formatter={pctLabel}
              style={{ fontSize: 10, fill: "#4A506A", fontWeight: 600 }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
