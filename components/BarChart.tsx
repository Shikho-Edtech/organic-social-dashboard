"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList } from "recharts";

type FormatSpec = "number" | "percent" | "percent1";

type Props = {
  data: { label: string; value: number }[];
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

const PALETTE = ["#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6", "#14b8a6", "#ef4444", "#6366f1", "#84cc16", "#f97316", "#a78bfa"];

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

  const tooltipFormatter = (v: number): [string, string] => {
    const name = metricName || "Value";
    if (showPercent && total > 0) return [`${fmt(v)} (${pct(v).toFixed(1)}% of total)`, name];
    return [fmt(v), name];
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
              width={130}
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
          {data.map((_, i) => (
            <Cell key={i} fill={colorByIndex ? PALETTE[i % PALETTE.length] : color || "#06b6d4"} />
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
