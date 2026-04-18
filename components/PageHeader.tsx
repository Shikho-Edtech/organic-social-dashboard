import DateRangePicker from "./DateRangePicker";

type Props = {
  title: string;
  subtitle?: string;
  dateLabel: string;
  showPicker?: boolean;
};

export default function PageHeader({ title, subtitle, dateLabel, showPicker = true }: Props) {
  // Pages are `force-dynamic` with `revalidate = 300`, so data is fetched at
  // most ~5 minutes before the user sees it. That's close enough to call this
  // the "data as of" timestamp rather than a render-time UI artefact. Users
  // asking "how fresh is what I'm looking at?" now have a direct answer
  // instead of inferring it from the word "Rendered".
  const dataAsOf = new Date().toLocaleString("en-GB", {
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
        {showPicker && (
          <div className="flex flex-col items-end gap-2 self-end sm:self-auto">
            <DateRangePicker />
            <div className="text-xs text-slate-500">{dateLabel}</div>
            <div className="text-[11px] text-slate-500">Data as of {dataAsOf} BDT</div>
          </div>
        )}
      </div>
    </div>
  );
}
