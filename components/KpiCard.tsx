import { Card } from "./Card";

type Props = {
  label: string;
  value: string | number;
  delta?: number;
  sublabel?: string;
};

export default function KpiCard({ label, value, delta, sublabel }: Props) {
  const deltaColor = delta === undefined ? "" : delta > 0 ? "text-brand-green" : delta < 0 ? "text-brand-red" : "text-slate-400";
  const deltaText = delta !== undefined ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : null;
  return (
    <Card className="!p-5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      {/* text-2xl on mobile so 7-digit numbers don't overflow a 2-col grid.
          sm+ bumps to text-3xl. `break-words` is belt-and-braces for string
          values (e.g. "1,234,567" or short labels). */}
      <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 break-words leading-tight">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 min-h-[18px] text-xs break-words">
        {deltaText && <span className={deltaColor}>{deltaText}</span>}
        {sublabel && <span className="text-slate-400 ml-1.5">{sublabel}</span>}
      </div>
    </Card>
  );
}
