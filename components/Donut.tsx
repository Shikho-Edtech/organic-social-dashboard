"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PALETTE = ["#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#3b82f6", "#14b8a6", "#ef4444"];

type FormatSpec = "number" | "percent" | "percent1";

type Props = {
  data: { label: string; value: number }[];
  height?: number;
  valueFormat?: FormatSpec;
};

function makeFormatter(spec?: FormatSpec): (v: number) => string {
  if (spec === "percent") return (v) => v + "%";
  if (spec === "percent1") return (v) => v.toFixed(1) + "%";
  return (v) => v.toLocaleString();
}

export default function Donut({ data, height = 220, valueFormat }: Props) {
  const fmt = makeFormatter(valueFormat);
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
          formatter={(v: number) => fmt(v)}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          formatter={(v) => <span className="text-xs text-slate-600">{v}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
