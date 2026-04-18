"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from "recharts";

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
};

// Palette ordered to lead with brand: Shikho indigo + pink first so 2-3 bar
// charts land on brand colours without requiring `color={}` overrides.
// Secondary tones follow in a perceptually-distinct sequence that avoids
// adjacent hues blending into each other.
const PALETTE = ["#4f46e5", "#ec4899", "#f59e0b", "#06b6d4", "#10b981", "#8b5cf6", "#3b82f6", "#14b8a6", "#ef4444", "#84cc16", "#f97316", "#a78bfa"];

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
}: Props) {
  const fmt = makeFormatter(valueFormat);
  const total = showPercent ? data.reduce((s, d) => s + (d.value || 0), 0) : 0;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

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
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={!horizontal} horizontal={horizontal} />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tickFormatter={fmt}
              label={
                valueAxisLabel
                  ? { value: valueAxisLabel, position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "#64748b", fontWeight: 500 } }
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
              tick={{ fontSize: 11, fill: "#475569" }}
              label={
                categoryAxisLabel
                  ? { value: categoryAxisLabel, angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#64748b", fontWeight: 500, textAnchor: "middle" } }
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
              tick={{ fontSize: 11, fill: "#475569" }}
              label={
                categoryAxisLabel
                  ? { value: categoryAxisLabel, position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "#64748b", fontWeight: 500 } }
                  : undefined
              }
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={fmt}
              width={55}
              tick={{ fontSize: 11, fill: "#475569" }}
              label={
                valueAxisLabel
                  ? { value: valueAxisLabel, angle: -90, position: "insideLeft", offset: 5, style: { fontSize: 11, fill: "#64748b", fontWeight: 500, textAnchor: "middle" } }
                  : undefined
              }
            />
          </>
        )}
        <Tooltip
          contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
          formatter={tooltipFormatter}
          cursor={{ fill: "#f8fafc" }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={
                d.muted
                  ? "#cbd5e1"
                  : d.color ||
                    (colorByIndex ? PALETTE[i % PALETTE.length] : color || "#4f46e5")
              }
            />
          ))}
          {showPercent && (
            <LabelList
              dataKey="value"
              position={horizontal ? "right" : "top"}
              formatter={pctLabel}
              style={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
            />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
