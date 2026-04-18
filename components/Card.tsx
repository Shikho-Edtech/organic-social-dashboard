import { ReactNode } from "react";
import InfoTooltip from "./InfoTooltip";

type Props = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: Props) {
  // Shadow-sm is the lightest tailwind elevation; separates cards from the
  // slate-50 page background without creating the heavy-drop-shadow look
  // that reads as dated. Hover nudges the shadow up so cards feel
  // touchable on desktop — a no-op cost on touch devices.
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow transition-shadow ${className}`}
    >
      {children}
    </div>
  );
}

/** Tabular representation of the chart's underlying data, used for the
 *  "View data" disclosure. Screen-reader users and keyboard users get a
 *  first-class way to read the numbers; everyone else can open the
 *  table to sanity-check what a chart is showing. */
export type ChartDataTable = {
  columns: string[];
  rows: (string | number)[][];
};

export function ChartCard({
  title,
  subtitle,
  caption,
  definition,
  sampleSize,
  kind,
  viewData,
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
  /** Optional tabular data for the accessible "View data" disclosure.
   *  When provided, a <details>/<summary> below the chart exposes the
   *  same numbers to keyboard and screen-reader users without needing
   *  to navigate the SVG. */
  viewData?: ChartDataTable;
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
            <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded translate-y-[2px] break-words">
              {sampleSize}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div>{children}</div>
      {caption && <p className="text-xs text-slate-500 mt-4 leading-relaxed">{caption}</p>}
      {viewData && viewData.rows.length > 0 && (
        <details className="mt-4 group">
          <summary className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer select-none inline-flex items-center gap-1.5 py-1">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform group-open:rotate-90"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span>View data as table ({viewData.rows.length} rows)</span>
          </summary>
          <div className="mt-2 overflow-x-auto border border-slate-100 rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {viewData.columns.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viewData.rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    {r.map((cell, j) => (
                      <td
                        key={j}
                        className={`px-3 py-1.5 text-slate-700 ${typeof cell === "number" ? "tabular-nums text-right" : ""}`}
                      >
                        {typeof cell === "number" ? cell.toLocaleString() : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}
