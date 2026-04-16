"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

type Props = {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  horizontal?: boolean;
  formatValue?: (v: number) => string;
};

const ROTATE = ["#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6", "#14b8a6", "#ef4444"];

export default function BarChartBase({ data, color, height = 220, horizontal, formatValue }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={!horizontal} horizontal={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => (formatValue ? formatValue(v) : v.toLocaleString())} />
            <YAxis type="category" dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={130} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => (formatValue ? formatValue(v) : v.toLocaleString())} />
          </>
        )}
        <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#f1f5f9" }} formatter={(v: number) => (formatValue ? formatValue(v) : v.toLocaleString())} />
        <Bar dataKey="value">
          {data.map((_, i) => <Cell key={i} fill={color || ROTATE[i % ROTATE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
