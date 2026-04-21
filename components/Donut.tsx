"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

// Shikho v1.0 palette — four core hues up front (indigo, magenta, sunrise,
// coral) so single- and two-slice charts land on brand identity without any
// override. Secondary tones are 500/700 variants of the same families.
const PALETTE = [
  "#304090", // shikho-indigo-600 (core)
  "#C02080", // shikho-magenta-500 (core)
  "#E0A010", // shikho-sunrise-500 (core)
  "#E03050", // shikho-coral-500 (core)
  "#3F4FA2", // indigo-500
  "#A11A6D", // magenta-600
  "#1A8E78", // brand teal
  "#243172", // indigo-700
];

type FormatSpec = "number" | "percent" | "percent1";

type Props = {
  data: { label: string; value: number }[];
  height?: number;
  valueFormat?: FormatSpec;
  /** Name of the metric in the tooltip (e.g. "Posts", "Reactions"). */
  metricName?: string;
  /** If true, show each slice value as "X (Y%)" in tooltip and append % to legend. Default true. */
  showPercent?: boolean;
};

function makeFormatter(spec?: FormatSpec): (v: number) => string {
  if (spec === "percent") return (v) => v + "%";
  if (spec === "percent1") return (v) => v.toFixed(1) + "%";
  return (v) => v.toLocaleString();
}

export default function Donut({ data, height = 220, valueFormat, metricName, showPercent = true }: Props) {
  const fmt = makeFormatter(valueFormat);
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const tooltipFormatter = (v: number): [string, string] => {
    if (showPercent && total > 0) return [`${fmt(v)} (${pct(v).toFixed(1)}% of total)`, metricName || "Value"];
    return [fmt(v), metricName || "Value"];
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: "white", border: "1px solid #E6E8F0", borderRadius: "12px", fontSize: "12px", boxShadow: "0 6px 14px rgba(16,22,54,0.08)" }}
          formatter={tooltipFormatter}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          formatter={(value: string) => {
            const entry = data.find((d) => d.label === value);
            const share = entry && total > 0 ? ` · ${pct(entry.value).toFixed(1)}%` : "";
            return <span className="text-xs text-slate-600">{value}<span className="text-slate-500">{share}</span></span>;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
