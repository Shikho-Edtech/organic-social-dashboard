"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

// Sprint P7 v3.5 (2026-04-29): multi-line trend chart for 2+ active
// metrics on Overview/Trends. Solves the unit-mismatch problem
// (reach 10000s, engagement rate 0.X%, shares 10s) by normalizing
// each series to "% of its own max" — every line peaks at 1.0 on
// the same y-axis, so the SHAPES are comparable. Tooltip shows the
// raw values per series so the actual numbers stay accessible.
//
// Why not multiple y-axes (Recharts yAxisId): two y-axes work for 2
// series, become unreadable at 3+, and confuse the "is this trend
// up or down" read. Normalized-to-max keeps the shape comparison
// honest at any series count.

export type MultiSeries = {
  /** Stable label shown in legend + tooltip (e.g. "Reach", "Engagement Rate") */
  name: string;
  /** Brand color hex (#304090 etc) */
  color: string;
  /** Time-aligned data points; same dates across all series */
  data: { date: string; value: number }[];
  /** Original-units formatter for tooltip values */
  formatter: (v: number) => string;
};

type Props = {
  series: MultiSeries[];
  height?: number;
};

/**
 * Per-series % of max: take each series's peak value, divide every
 * point by that peak. Empty / zero-max series fall through with 0
 * everywhere (line stays at the baseline; tooltip still shows raw).
 */
function normalizeSeries(series: MultiSeries[]): {
  date: string;
  raw: Record<string, number>;
  pct: Record<string, number>;
}[] {
  // Build the union date set (all series should share dates already
  // but defend against minor gaps).
  const dateSet = new Set<string>();
  for (const s of series) {
    for (const p of s.data) dateSet.add(p.date);
  }
  const dates = Array.from(dateSet).sort();
  // Per-series max for normalization.
  const maxes: Record<string, number> = {};
  const lookups: Record<string, Map<string, number>> = {};
  for (const s of series) {
    let m = 0;
    const map = new Map<string, number>();
    for (const p of s.data) {
      map.set(p.date, p.value);
      if (p.value > m) m = p.value;
    }
    maxes[s.name] = m;
    lookups[s.name] = map;
  }
  // Build the unified rows.
  return dates.map((date) => {
    const raw: Record<string, number> = {};
    const pct: Record<string, number> = {};
    for (const s of series) {
      const v = lookups[s.name].get(date) ?? 0;
      raw[s.name] = v;
      pct[s.name] = maxes[s.name] > 0 ? v / maxes[s.name] : 0;
    }
    return { date, raw, pct };
  });
}

export default function MultiLineTrendChart({ series, height = 240 }: Props) {
  const normalized = normalizeSeries(series);
  // Recharts wants flat shape per row. Encode pct values as `pct_<name>`
  // and raw as `raw_<name>` so the tooltip can pull both.
  const chartData = normalized.map((r) => {
    const flat: Record<string, string | number> = { date: r.date };
    for (const s of series) {
      flat[`pct_${s.name}`] = r.pct[s.name];
      flat[`raw_${s.name}`] = r.raw[s.name];
    }
    return flat;
  });

  const yFormatter = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E6E8F0" vertical={false} />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#333A50" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tickFormatter={yFormatter}
          width={50}
          tick={{ fontSize: 11, fill: "#333A50" }}
          domain={[0, 1]}
          label={{
            value: "% of peak",
            angle: -90,
            position: "insideLeft",
            offset: 8,
            style: { fontSize: 11, fill: "#4A506A", fontWeight: 500, textAnchor: "middle" },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #E6E8F0",
            borderRadius: "12px",
            fontSize: "12px",
            boxShadow: "0 6px 14px rgba(16,22,54,0.08)",
            padding: "8px 12px",
          }}
          formatter={(value: number, name: string, props: { payload?: Record<string, number> }) => {
            // Recharts passes the value AS THE NORMALIZED 0-1 fraction
            // because we plotted pct_* as the dataKey. Look up the raw
            // value from the same row's payload using the name token
            // (which is "pct_<seriesName>").
            const seriesName = name.replace(/^pct_/, "");
            const rawValue = props.payload?.[`raw_${seriesName}`];
            const seriesDef = series.find((s) => s.name === seriesName);
            const rawDisplay = rawValue !== undefined && seriesDef
              ? seriesDef.formatter(rawValue)
              : "";
            return [
              `${(value * 100).toFixed(0)}% of peak  (${rawDisplay})`,
              seriesName,
            ];
          }}
        />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="line"
          iconSize={12}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(name: string) => name.replace(/^pct_/, "")}
        />
        {series.map((s) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={`pct_${s.name}`}
            name={`pct_${s.name}`}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
