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
      <div className="text-3xl font-bold text-slate-900 mt-2">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 min-h-[18px] text-xs">
        {deltaText && <span className={deltaColor}>{deltaText}</span>}
        {sublabel && <span className="text-slate-400 ml-1.5">{sublabel}</span>}
      </div>
    </Card>
  );
}
