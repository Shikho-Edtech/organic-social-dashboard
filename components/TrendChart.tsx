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

/**
 * Sprint P7 v4.5 (2026-04-30): outlier-aware y-axis cap.
 *
 * QA finding #8 — when one viral day dominates, Recharts' default
 * y-axis (auto: max value) makes the rest of the line hug the baseline
 * and the chart looks empty. Real-world Shikho data has this pattern
 * regularly: a 180k-reach viral day followed by 5-15k typical days.
 *
 * Strategy: cap the y-domain at p98 of values when the max is more than
 * ~2.5× the p90 (a defensible "outlier present" heuristic). The viral
 * day still shows as a peak that clips through the top — visually
 * obvious as "this exceeds the chart" — and everything else gets
 * proportional vertical space. Recharts renders values above the cap
 * as clipped lines, but tooltip values stay accurate (the underlying
 * data isn't modified).
 *
 * When values are evenly distributed, returns undefined → Recharts
 * uses its default auto-domain. So this only fires when it would help.
 */
function computeYDomain(
  data: { value: number }[],
): [number, number | "auto"] | undefined {
  if (data.length < 5) return undefined;
  const values = data.map((d) => d.value).filter((v) => v >= 0).sort((a, b) => a - b);
  if (values.length < 5) return undefined;
  const max = values[values.length - 1];
  const p75 = values[Math.floor(values.length * 0.75)];
  const p90 = values[Math.floor(values.length * 0.9)];
  const p98 = values[Math.floor(values.length * 0.98)];
  // Sprint P7 v4.7 (2026-04-30, P2.18): loosened threshold to also catch
  // datasets with two close-together peaks. v4.5 only fired on a single
  // dominant outlier (max >= 2.5× p90); real-world Shikho data often has
  // 1-2 viral days that together still squash the rest of the line.
  // New rule: trigger if max >= 2× p75 (covers the two-peak case) AND
  // max >= 1.4× p98 (still avoids capping smooth peaks).
  if (max >= p75 * 2 && max >= p98 * 1.4) {
    const cap = Math.ceil(p98 * 1.1);
    return [0, cap];
  }
  return undefined;
}

export default function TrendChart({
  data,
  // Shikho indigo-600 — default trend line lands on brand identity.
  color = "#304090",
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
    ? { value: valueAxisLabel, angle: -90, position: "insideLeft" as const, offset: 5, style: { fontSize: 11, fill: "#4A506A", fontWeight: 500, textAnchor: "middle" as const } }
    : undefined;
  const xAxisLabelProp = xAxisLabel
    ? { value: xAxisLabel, position: "insideBottom" as const, offset: -5, style: { fontSize: 11, fill: "#4A506A", fontWeight: 500 } }
    : undefined;

  const margin = { top: 5, right: 10, left: valueAxisLabel ? 15 : 0, bottom: xAxisLabel ? 20 : 5 };

  const yDomain = computeYDomain(data);
  const yAxisDomainProp = yDomain
    ? { domain: yDomain, allowDataOverflow: true }
    : {};

  return (
    <ResponsiveContainer width="100%" height={height}>
      {variant === "line" ? (
        <LineChart data={data} margin={margin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E6E8F0" vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#333A50" }} label={xAxisLabelProp} />
          <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} width={55} tick={{ fontSize: 11, fill: "#333A50" }} label={yAxisLabelProp} {...yAxisDomainProp} />
          <Tooltip
            contentStyle={{ backgroundColor: "white", border: "1px solid #E6E8F0", borderRadius: "12px", fontSize: "12px", boxShadow: "0 6px 14px rgba(16,22,54,0.08)" }}
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
          <CartesianGrid strokeDasharray="3 3" stroke="#E6E8F0" vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#333A50" }} label={xAxisLabelProp} />
          <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} width={55} tick={{ fontSize: 11, fill: "#333A50" }} label={yAxisLabelProp} {...yAxisDomainProp} />
          <Tooltip
            contentStyle={{ backgroundColor: "white", border: "1px solid #E6E8F0", borderRadius: "12px", fontSize: "12px", boxShadow: "0 6px 14px rgba(16,22,54,0.08)" }}
            formatter={tooltipFormatter}
          />
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#${gradId})`} strokeWidth={2} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}
