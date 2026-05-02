import DateRangePicker from "./DateRangePicker";

type Props = {
  title: string;
  subtitle?: string;
  dateLabel: string;
  showPicker?: boolean;
  /**
   * ISO timestamp of the last actual pipeline run (from Analysis_Log.Run Date).
   * When provided, the header shows "Last Meta fetch" with this value instead
   * of the render time. This answers the user question "how fresh is the
   * Facebook data I'm looking at?" — render time was misleading because
   * Next.js could re-render a stale server component long after the last
   * real scrape. The pipeline's run timestamp is the honest answer.
   *
   * Pass `runStatus.last_run_at` from `lib/sheets.getRunStatus()`.
   * If omitted, falls back to render time with the "Rendered" label so it's
   * still clear to the reader what they're looking at.
   */
  lastScrapedAt?: string;
  /**
   * R1 (2026-05-02): tighter header for Pulse + Weekly bucket pages.
   * Smaller title, smaller margin-bottom, picker meta inlined onto one
   * line instead of stacking. Saves ~40-60px of vertical chrome per page
   * (significant on mobile where total viewport is ~640px). Today +
   * Reference + Login keep the spacious version because they're focus
   * landing pages.
   */
  compact?: boolean;
};

function formatBDT(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export default function PageHeader({ title, subtitle, dateLabel, showPicker = true, lastScrapedAt, compact = false }: Props) {
  // Prefer the pipeline's last run timestamp (when Facebook was actually
  // scraped) over render time. Render time only tells the user when Next.js
  // last built this HTML — it has no bearing on data freshness when the
  // pipeline is on a weekly cadence. If caller doesn't pass `lastScrapedAt`,
  // fall back to render time with an honest label.
  const scrapedLabel = lastScrapedAt ? formatBDT(lastScrapedAt) : "";
  const renderedLabel = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  // R1: compact mode shrinks title + reduces margin-bottom + inlines the
  // picker meta onto a single line. Spacious mode keeps the original
  // h1/sm-text/3-line stack for landing pages.
  const wrapperMargin = compact ? "mb-3 sm:mb-4" : "mb-6";
  const titleSize = compact ? "text-xl sm:text-2xl" : "text-2xl";
  const subtitleSize = compact ? "text-xs sm:text-sm" : "text-sm";

  // Compact dateLabel + scrapedLabel render: one line with " · " separator.
  const dataAsOfText = scrapedLabel ? `Data as of ${scrapedLabel} BDT` : `Data as of ${renderedLabel} BDT`;
  const compactMeta = (
    <div className="text-[11px] text-slate-500 leading-snug text-right">
      <span>{dateLabel}</span>
      <span className="mx-1.5 text-ink-muted/60">·</span>
      <span>{dataAsOfText}</span>
    </div>
  );
  const spaciousMeta = (
    <>
      <div className="text-xs text-slate-500">{dateLabel}</div>
      <div className="text-[11px] text-slate-500">
        {scrapedLabel
          ? <>Data as of: <span className="font-medium">{scrapedLabel} BDT</span></>
          : <>Data as of {renderedLabel} BDT</>}
      </div>
    </>
  );

  return (
    <div className={wrapperMargin}>
      {/* Mobile: title stacks above picker, picker self-aligns to the right.
          sm+: original side-by-side layout with picker at the far right.
          Previously used `flex-wrap` which made the picker drift to the LEFT
          when it wrapped to its own line — so each page had a different
          apparent alignment depending on title length. */}
      <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"} sm:flex-row sm:items-start sm:justify-between sm:gap-4`}>
        <div className="min-w-0">
          <h1 className={`${titleSize} font-bold text-slate-900`}>{title}</h1>
          {subtitle && <p className={`${subtitleSize} text-slate-500 ${compact ? "mt-0.5" : "mt-1"}`}>{subtitle}</p>}
        </div>
        {showPicker ? (
          <div className={`flex flex-col items-end ${compact ? "gap-1" : "gap-2"} self-end sm:self-auto`}>
            <DateRangePicker />
            {compact ? compactMeta : spaciousMeta}
          </div>
        ) : (
          <div className={`flex flex-col items-end ${compact ? "gap-0" : "gap-1"} self-end sm:self-auto`}>
            {compact ? compactMeta : spaciousMeta}
          </div>
        )}
      </div>
    </div>
  );
}
