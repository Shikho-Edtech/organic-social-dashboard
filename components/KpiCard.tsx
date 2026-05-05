import { Card } from "./Card";

type Props = {
  label: string;
  value: string | number;
  delta?: number;
  sublabel?: string;
  /** Sprint P7 v4.7 (2026-04-30, P2.19): plain-English explainer shown on
   *  hover/tap of the label. Useful for KPIs whose math isn't obvious
   *  (e.g. reach-weighted ER vs naive average ER). */
  labelTooltip?: string;
  /**
   * 2026-05-05: optional override for the colored delta string. When
   * present, replaces the default "+X.X%" formatting. Color is still
   * driven by the SIGN of `delta`. Useful for stock-style KPIs (e.g.
   * Followers) where the signal is a signed COUNT ("+38 net"), not a
   * percent change. Pass `delta` for sign + color and `deltaLabel` for
   * the rendered text.
   */
  deltaLabel?: string;
};

export default function KpiCard({ label, value, delta, sublabel, labelTooltip, deltaLabel }: Props) {
  // Shikho v1.0: emerald-500 for positive (brand-green preserved), coral-500
  // for negative (brand-red now maps to Shikho coral).
  const deltaColor = delta === undefined
    ? ""
    : delta > 0 ? "text-brand-green"
    : delta < 0 ? "text-brand-shikho-coral"
    : "text-ink-secondary";
  const deltaText = deltaLabel !== undefined
    ? deltaLabel
    : delta !== undefined ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%` : null;
  // Subtle paper → indigo-50 gradient grounds the KPI in the Shikho palette
  // without competing with the chart cards. Indigo tint is the brand's
  // signature "cool foundation" that the big number reads cleanly against.
  return (
    <Card className="!p-5 !bg-gradient-to-br from-ink-paper to-shikho-indigo-50/40">
      <div
        className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-secondary ${labelTooltip ? "cursor-help underline decoration-dotted decoration-ink-200 underline-offset-2 inline-block" : ""}`}
        title={labelTooltip}
      >
        {label}
      </div>
      {/* text-2xl on mobile so 7-digit numbers don't overflow a 2-col grid.
          sm+ bumps to text-3xl. `break-words` is belt-and-braces for string
          values (e.g. "1,234,567" or short labels). */}
      <div className="text-2xl sm:text-3xl font-bold text-shikho-indigo-900 mt-2 break-words leading-tight tabular-nums tracking-tight">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 min-h-[18px] text-xs break-words">
        {deltaText && <span className={`${deltaColor} font-semibold`}>{deltaText}</span>}
        {sublabel && <span className="text-ink-muted ml-1.5">{sublabel}</span>}
      </div>
    </Card>
  );
}
