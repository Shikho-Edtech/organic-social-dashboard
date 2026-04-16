type Props = {
  label: string;
  value: string | number;
  delta?: number; // percent
  tone?: "cyan" | "green" | "orange" | "pink" | "purple" | "red" | "blue" | "teal";
};

const toneClass: Record<string, string> = {
  cyan: "text-accent-cyan",
  green: "text-accent-green",
  orange: "text-accent-orange",
  pink: "text-accent-pink",
  purple: "text-accent-purple",
  red: "text-accent-red",
  blue: "text-accent-blue",
  teal: "text-accent-teal",
};

export default function KpiCard({ label, value, delta, tone = "cyan" }: Props) {
  const deltaText = delta !== undefined ? (delta >= 0 ? "+" : "") + delta.toFixed(1) + "%" : null;
  const deltaColor = delta === undefined ? "" : delta > 0 ? "text-accent-green" : delta < 0 ? "text-accent-red" : "text-slate-500";
  return (
    <div className="bg-ink-800 rounded-lg p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass[tone]}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {deltaText && (
        <div className={`text-xs mt-1 ${deltaColor}`}>
          {deltaText} <span className="text-slate-500">vs previous period</span>
        </div>
      )}
    </div>
  );
}
