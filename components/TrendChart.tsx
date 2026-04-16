"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Props = {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
};

export default function TrendChart({ data, color = "#06b6d4", height = 200 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.toLocaleString()} />
        <Tooltip
          contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "6px", color: "#f1f5f9" }}
          formatter={(v: number) => v.toLocaleString()}
        />
        <Area type="monotone" dataKey="value" stroke={color} fillOpacity={1} fill="url(#grad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
