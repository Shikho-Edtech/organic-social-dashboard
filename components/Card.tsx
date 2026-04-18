import { ReactNode } from "react";
import InfoTooltip from "./InfoTooltip";

type Props = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: Props) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-6 ${className}`}>
      {children}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  caption,
  definition,
  sampleSize,
  kind,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  caption?: string;
  /** Plain-English formula / definition shown in an (i) tooltip next to the title. */
  definition?: string;
  /** Optional sample size (e.g. "n = 42 posts"). Rendered as a small muted badge next to the title. */
  sampleSize?: string;
  /** Data provenance: observed (raw Meta), ai (classifier), derived (computed). */
  kind?: "observed" | "ai" | "derived";
  children: ReactNode;
  className?: string;
}) {
  const kindBorder =
    kind === "observed" ? "border-l-4 border-l-cyan-500"
    : kind === "ai"     ? "border-l-4 border-l-indigo-500"
    : kind === "derived"? "border-l-4 border-l-violet-500"
    : "";
  return (
    <Card className={`${kindBorder} ${className}`}>
      <div className="mb-4">
        {/* Title row is `flex-wrap` so the sample-size + kind badges fall to a
            second line on narrow cards instead of squeezing the title and
            pushing content off the right edge. `min-w-0` + `break-words` on
            the title itself handles very long titles gracefully. */}
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-slate-900 min-w-0 break-words">{title}</h3>
          {definition && <InfoTooltip text={definition} />}
          {sampleSize && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded translate-y-[2px] break-words">
              {sampleSize}
            </span>
          )}
          {kind && (
            <span className={`${sampleSize ? "ml-1" : "ml-auto"} text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded translate-y-[2px] ${
              kind === "observed" ? "bg-cyan-50 text-cyan-700"
              : kind === "ai"     ? "bg-indigo-50 text-indigo-700"
              :                     "bg-violet-50 text-violet-700"
            }`}>
              {kind === "observed" ? "Meta data" : kind === "ai" ? "AI-classified" : "Derived"}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div>{children}</div>
      {caption && <p className="text-xs text-slate-500 mt-4 leading-relaxed">{caption}</p>}
    </Card>
  );
}
