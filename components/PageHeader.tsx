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

export default function PageHeader({ title, subtitle, dateLabel, showPicker = true, lastScrapedAt }: Props) {
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
  return (
    <div className="mb-6">
      {/* Mobile: title stacks above picker, picker self-aligns to the right.
          sm+: original side-by-side layout with picker at the far right.
          Previously used `flex-wrap` which made the picker drift to the LEFT
          when it wrapped to its own line — so each page had a different
          apparent alignment depending on title length. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {showPicker ? (
          <div className="flex flex-col items-end gap-2 self-end sm:self-auto">
            <DateRangePicker />
            <div className="text-xs text-slate-500">{dateLabel}</div>
            <div className="text-[11px] text-slate-500">
              {scrapedLabel
                ? <>Last Meta fetch: <span className="font-medium">{scrapedLabel} BDT</span></>
                : <>Rendered {renderedLabel} BDT</>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1 self-end sm:self-auto">
            <div className="text-xs text-slate-500">{dateLabel}</div>
            <div className="text-[11px] text-slate-500">
              {scrapedLabel
                ? <>Last Meta fetch: <span className="font-medium">{scrapedLabel} BDT</span></>
                : <>Rendered {renderedLabel} BDT</>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
