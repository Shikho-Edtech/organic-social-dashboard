"use client";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type FormatSpec = "number" | "percent" | "percent1";

type Props = {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
  valueFormat?: FormatSpec;
  variant?: "area" | "line";
  /** Name shown in the tooltip instead of "value" (e.g. "Reach", "Engagement Rate") */
  metricName?: string;
  /** Label for the Y (value) axis */
  valueAxisLabel?: string;
  /** Label for the X (time) axis */
  xAxisLabel?: string;
};

function makeFormatter(spec?: FormatSpec): (v: number) => string {
  if (spec === "percent") return (v) => v + "%";
  if (spec === "percent1") return (v) => v.toFixed(1) + "%";
  return (v) => v.toLocaleString();
}

export default function TrendChart({
  data,
  color = "#06b6d4",
  height = 220,
  valueFormat,
  variant = "area",
  metricName,
  valueAxisLabel,
  xAxisLabel,
}: Props) {
  const fmt = makeFormatter(valueFormat);
  const gradId = `grad-${color.replace("#", "")}`;

  const tooltipFormatter = (v: number): [string, string] => [fmt(v), metricName || "Value"];

  const yAxisLabelProp = valueAxisLabel
    ? { value: valueAxisLabel, angle: -90, position: "insideLeft" as const, offset: 5, style: { fontSize: 11, fill: "#64748b", fontWeight: 500, textAnchor: "middle" as const } }
    : undefined;
  const xAxisLabelProp = xAxisLabel
    ? { value: xAxisLabel, position: "insideBottom" as const, offset: -5, style: { fontSize: 11, fill: "#64748b", fontWeight: 500 } }
    : undefined;

  const margin = { top: 5, right: 10, left: valueAxisLabel ? 15 : 0, bottom: xAxisLabel ? 20 : 5 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      {variant === "line" ? (
        <LineChart data={data} margin={margin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#475569" }} label={xAxisLabelProp} />
          <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} width={55} tick={{ fontSize: 11, fill: "#475569" }} label={yAxisLabelProp} />
          <Tooltip
            contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
            formatter={tooltipFormatter}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      ) : (
        <AreaChart data={data} margin={margin}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#475569" }} label={xAxisLabelProp} />
          <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} width={55} tick={{ fontSize: 11, fill: "#475569" }} label={yAxisLabelProp} />
          <Tooltip
            contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
            formatter={tooltipFormatter}
          />
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#${gradId})`} strokeWidth={2} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}
