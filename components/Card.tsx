import { ReactNode } from "react";

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
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-4">
        <div className="flex items-start gap-2">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {definition && (
            <span className="relative group inline-flex items-center translate-y-[3px]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 hover:text-slate-600 cursor-help">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span className="pointer-events-none absolute left-5 top-0 z-20 w-64 rounded-md bg-slate-900 text-white text-[11px] leading-snug p-2.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                {definition}
              </span>
            </span>
          )}
          {sampleSize && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded translate-y-[2px]">
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
