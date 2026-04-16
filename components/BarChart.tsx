"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

type Props = {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  horizontal?: boolean;
  formatValue?: (v: number) => string;
  colorByIndex?: boolean;
};

const PALETTE = ["#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6", "#14b8a6", "#ef4444", "#6366f1", "#84cc16", "#f97316", "#a78bfa"];

export default function BarChartBase({ data, color, height = 240, horizontal, formatValue, colorByIndex }: Props) {
  const fmt = formatValue || ((v: number) => v.toLocaleString());
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={!horizontal} horizontal={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={fmt} />
            <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={130} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} width={50} />
          </>
        )}
        <Tooltip
          contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
          formatter={(v: number) => fmt(v)}
          cursor={{ fill: "#f8fafc" }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={colorByIndex ? PALETTE[i % PALETTE.length] : color || "#06b6d4"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
