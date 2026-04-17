"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PALETTE = ["#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#3b82f6", "#14b8a6", "#ef4444"];

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
          contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
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
            return <span className="text-xs text-slate-600">{value}<span className="text-slate-400">{share}</span></span>;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
