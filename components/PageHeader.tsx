import DateRangePicker from "./DateRangePicker";

type Props = {
  title: string;
  subtitle?: string;
  dateLabel: string;
  showPicker?: boolean;
};

export default function PageHeader({ title, subtitle, dateLabel, showPicker = true }: Props) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {showPicker && (
          <div className="flex flex-col items-end gap-2">
            <DateRangePicker />
            <div className="text-xs text-slate-500">{dateLabel}</div>
          </div>
        )}
      </div>
    </div>
  );
}
