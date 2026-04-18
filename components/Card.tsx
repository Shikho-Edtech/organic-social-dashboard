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
  // The left border colour alone communicates kind (cyan=observed / indigo=
  // AI-classified / violet=derived). The old right-aligned text badge
  // ("Meta data" / "AI-classified" / "Derived") duplicated that same info in
  // a second visual channel, which was redundant on desktop and fought with
  // the sample-size badge for space on mobile. Kind is now encoded in border
  // colour + `data-kind` (for screen readers / debugging). The InfoTooltip
  // definition still explains the provenance in plain English.
  const kindBorder =
    kind === "observed" ? "border-l-4 border-l-cyan-500"
    : kind === "ai"     ? "border-l-4 border-l-indigo-500"
    : kind === "derived"? "border-l-4 border-l-violet-500"
    : "";
  return (
    <Card className={`${kindBorder} ${className}`}>
      <div className="mb-4" data-kind={kind}>
        {/* Title row is `flex-wrap` so the sample-size badge falls to a second
            line on narrow cards instead of squeezing the title off the right
            edge. `min-w-0` + `break-words` on the title handles very long
            titles gracefully. */}
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-slate-900 min-w-0 break-words">{title}</h3>
          {definition && <InfoTooltip text={definition} />}
          {sampleSize && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded translate-y-[2px] break-words">
              {sampleSize}
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
