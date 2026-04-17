"use client";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type FormatSpec = "number" | "percent" | "percent1";

type Props = {
  data: { date: string; value: number }[];
  color?: string;
  height?: number;
  valueFormat?: FormatSpec;
  variant?: "area" | "line";
};

function makeFormatter(spec?: FormatSpec): (v: number) => string {
  if (spec === "percent") return (v) => v + "%";
  if (spec === "percent1") return (v) => v.toFixed(1) + "%";
  return (v) => v.toLocaleString();
}

export default function TrendChart({ data, color = "#06b6d4", height = 220, valueFormat, variant = "area" }: Props) {
  const fmt = makeFormatter(valueFormat);
  const gradId = `grad-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {variant === "line" ? (
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} />
          <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} width={50} />
          <Tooltip
            contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
            formatter={(v: number) => fmt(v)}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      ) : (
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} />
          <YAxis axisLine={false} tickLine={false} tickFormatter={fmt} width={50} />
          <Tooltip
            contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
            formatter={(v: number) => fmt(v)}
          />
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#${gradId})`} strokeWidth={2} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}
