// A shared empty-state component for chart slots so filtered-out / no-data
// panels don't each hand-roll their own "flex items-center justify-center
// h-48" markup. Keeps copy tone consistent and contrast accessible.
//
// Height defaults to 200px so two empty cards side-by-side still align
// visually with sibling cards that have actual charts. Callers can override
// via `height` if they want to match a specific BarChart height.
type Props = {
  /** Top-line message. Keep it short — this is the "what" of the empty state. */
  message: string;
  /** Optional secondary copy. Usually "try X / widen Y" guidance. */
  hint?: string;
  height?: number;
};

export default function EmptyChart({ message, hint, height = 200 }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center px-6"
      style={{ minHeight: height }}
      role="status"
    >
      {/* Neutral icon — a dashed square suggests "nothing plotted here"
          without leaning on emojis or trying to imply a specific failure mode. */}
      <div className="w-10 h-10 rounded-lg border-2 border-dashed border-slate-300 mb-3" aria-hidden="true" />
      <div className="text-sm font-medium text-slate-700">{message}</div>
      {hint && <p className="text-xs text-slate-500 mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}
