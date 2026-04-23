"use client";
import { useState, useRef, useEffect } from "react";

// Day × hour heatmap. Replaces the old 2×2 bar-chart grid on Timing:
// one 7-row × 24-column panel answers "when should we post?" instead of
// the reader cross-referencing a by-slot bar chart with a by-day one.
//
// Recharts doesn't have a native heatmap; custom CSS grid is the
// cheapest path. Cells are interpolated between `minColor` and
// `maxColor` based on a normalized 0..1 value. Cells below `minN` are
// dimmed so a single-post bucket can't visually dominate the grid.
//
// Responsive: at 360px width, 14 columns leaves ~22px per cell after
// the day-label gutter. Cells use FIXED row heights (20/22/26px at
// mobile/sm/lg) instead of aspect-square because on desktop `aspect-
// square` turned each cell into a ~80px × 80px block and the full grid
// exceeded one viewport height — not scannable. Fixed heights keep the
// whole 7-row grid visible in one glance on any viewport.

export type HeatmapCell = {
  day: number;        // 0 = Sun .. 6 = Sat
  hour: number;       // 0 .. 23
  value: number;      // the metric to encode (e.g. ER%, avg reach)
  n: number;          // post count in this cell
  totalReach: number;
};

type Props = {
  cells: HeatmapCell[];
  /** Threshold: cells with fewer posts render dimmed regardless of value. */
  minN: number;
  /** Human label for the value axis, used in tooltips. */
  metricLabel: string;
  /**
   * Serializable format descriptor for the value in tooltips / aria labels.
   * Functions can't cross the RSC boundary in Next 14 production (prod throws,
   * dev silently warns). Use a string enum here and format inline.
   *  - "percent" → v.toFixed(2) + "%"
   *  - "number"  → Math.round(v).toLocaleString()
   */
  valueFormat?: "percent" | "number";
  /** Low-end color (value near 0). Defaults to indigo-50. */
  minColor?: string;
  /** High-end color (value at max). Defaults to brand indigo (indigo-600). */
  maxColor?: string;
};

function formatValue(v: number, kind: "percent" | "number"): string {
  if (!isFinite(v)) return "—";
  if (kind === "percent") return v.toFixed(2) + "%";
  return Math.round(v).toLocaleString();
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

// Parse a hex like "#4f46e5" into [r, g, b].
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

// Linear RGB interpolation. Close enough for a sequential scale at
// this contrast range; perceptual accuracy (LAB/OKLab) isn't worth the
// runtime cost for 168 cells rendered client-side.
function interpolate(t: number, a: [number, number, number], b: [number, number, number]): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

// Sprint P6: switched from 12hr "3pm"/"9am" to 24hr "15:00"/"09:00" per
// user feedback ("all time markers across the dashboard should be 24hr
// format not 12hr am/pm"). Kept as `formatHour` so call sites don't need
// a rename; the returned string is zero-padded 24hr ("HH:00").
function formatHour(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

// Sprint P6: the dashboard shows hours 10..23 only per user feedback
// ("time axis should be from 10:00am to 24:00 for bd time"). Shikho's
// posting window is daytime/evening — compressing the grid from 24 to
// 14 columns roughly doubles cell width at 360px width, which makes
// the heatmap readable without a horizontal scrollbar. Data for hours
// 0..9 is still computed (caller-side aggregation is untouched) so
// a later UI can surface it if needed; it just isn't rendered here.
const HOUR_MIN = 10;
const HOUR_MAX = 23; // inclusive (last rendered hour is 23:00, label edge "24")
const HOUR_SPAN = HOUR_MAX - HOUR_MIN + 1; // 14 columns

export default function Heatmap({
  cells,
  minN,
  metricLabel,
  valueFormat = "number",
  minColor = "#EEF0FA", // shikho-indigo-50
  maxColor = "#304090", // shikho-indigo-600 (core)
}: Props) {
  const fmt = (v: number) => formatValue(v, valueFormat);
  const [hovered, setHovered] = useState<HeatmapCell | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on Escape for keyboard users who've focused a cell and want
  // to dismiss the tooltip without tabbing away.
  useEffect(() => {
    if (!hovered) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHovered(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [hovered]);

  // Index cells by (day,hour) so we can render a dense 7×24 grid even
  // when the caller only provides non-empty cells. Empty cells render
  // as neutral slate-50 with n=0.
  const cellMap = new Map<string, HeatmapCell>();
  for (const c of cells) cellMap.set(`${c.day}-${c.hour}`, c);

  // Determine max value across ELIGIBLE cells (n >= minN). Using all
  // cells would let a single low-n outlier stretch the scale flat.
  const eligible = cells.filter((c) => c.n >= minN);
  const maxValue = eligible.reduce((m, c) => Math.max(m, c.value), 0);

  const minRgb = hexToRgb(minColor);
  const maxRgb = hexToRgb(maxColor);

  // Sprint P6: ticks every 2 hours across the 10..23 window so the
  // reader sees "10 · 12 · 14 · 16 · 18 · 20 · 22" across the header —
  // every other cell labeled, in 24hr compact form ("12", "14"). The
  // previous compact-am/pm format ("3p") is gone dashboard-wide.
  const hourTicks = [10, 12, 14, 16, 18, 20, 22];
  const compactHour = (h: number): string => h.toString();

  return (
    <div ref={rootRef} className="relative">
      {/* Grid: day-label gutter + HOUR_SPAN (14) hour columns covering
          10:00..23:00. `minmax(0, 1fr)` so cells don't overflow at
          narrow widths. */}
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `auto repeat(${HOUR_SPAN}, minmax(0, 1fr))` }}
      >
        {/* Empty corner */}
        <div />
        {/* Hour axis (top) — 24hr compact labels every 2 hours. */}
        {Array.from({ length: HOUR_SPAN }, (_, i) => {
          const h = HOUR_MIN + i;
          return (
            <div
              key={`h-${h}`}
              className="text-[10px] text-slate-400 text-center tabular-nums"
              aria-hidden="true"
            >
              {hourTicks.includes(h) ? compactHour(h) : ""}
            </div>
          );
        })}

        {/* Day rows */}
        {DAY_NAMES.map((day, d) => (
          <div key={`row-${d}`} className="contents">
            <div className="text-[11px] font-semibold text-slate-500 pr-2 flex items-center">
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{DAY_NAMES_SHORT[d]}</span>
            </div>
            {Array.from({ length: HOUR_SPAN }, (_, i) => {
              const h = HOUR_MIN + i;
              const cell = cellMap.get(`${d}-${h}`) || { day: d, hour: h, value: 0, n: 0, totalReach: 0 };
              // Render every non-zero cell at its full color mapped from
              // value, but blend toward the low-end color by an opacity
              // factor that scales with posts-in-cell — n=1 reads as a hint,
              // n>=minN reads as a full claim. Prior pass hard-cut cells
              // below minN to a flat slate, which made sparse grids look
              // almost entirely empty on reasonable posting volumes
              // (50 posts / 168 cells = 0.3 posts per cell average).
              // Zero-post cells still render almost blank so the eye can
              // distinguish "no data" from "low-confidence data".
              const hasPosts = cell.n > 0;
              const t = hasPosts && maxValue > 0 ? Math.min(1, cell.value / maxValue) : 0;
              // Confidence mix: 0.4 at n=1, 0.7 at n=minN-1, 1.0 at n>=minN.
              // Interpolated linearly so an extra post in a sparse cell
              // visibly darkens the color — continuous feedback instead of
              // a hidden/shown binary.
              const confidence = !hasPosts
                ? 0
                : cell.n >= minN
                ? 1
                : 0.4 + Math.min(1, (cell.n - 1) / Math.max(1, minN - 1)) * 0.6;
              // Pull saturation toward minColor by (1 - confidence). A
              // low-n cell still shows the metric's color direction
              // (hot vs cool) but at reduced intensity.
              const valueRgb: [number, number, number] = [
                Math.round(minRgb[0] + (maxRgb[0] - minRgb[0]) * t),
                Math.round(minRgb[1] + (maxRgb[1] - minRgb[1]) * t),
                Math.round(minRgb[2] + (maxRgb[2] - minRgb[2]) * t),
              ];
              const fadedRgb: [number, number, number] = [
                Math.round(minRgb[0] + (valueRgb[0] - minRgb[0]) * confidence),
                Math.round(minRgb[1] + (valueRgb[1] - minRgb[1]) * confidence),
                Math.round(minRgb[2] + (valueRgb[2] - minRgb[2]) * confidence),
              ];
              const color = hasPosts
                ? `rgb(${fadedRgb[0]}, ${fadedRgb[1]}, ${fadedRgb[2]})`
                : "#fafbfc"; // almost blank — no posts
              const isHover =
                hovered && hovered.day === d && hovered.hour === h;
              return (
                <button
                  key={`c-${d}-${h}`}
                  type="button"
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(cell)}
                  onBlur={() => setHovered(null)}
                  className={`h-[20px] sm:h-[22px] lg:h-[26px] min-h-[18px] w-full rounded-[2px] transition-transform ${
                    isHover ? "ring-2 ring-slate-900 scale-110 z-10 relative" : ""
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`${day} ${formatHour(h)}: ${cell.n} posts, ${fmt(cell.value)} ${metricLabel.toLowerCase()}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">Low</span>
          <div
            className="h-2 w-32 rounded-full"
            style={{ background: `linear-gradient(90deg, ${minColor}, ${maxColor})` }}
            aria-hidden="true"
          />
          <span className="text-[11px] text-slate-500">High</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            Color intensity = confidence (n≥{minN} = full, fewer = faded)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-[2px] bg-[#fafbfc] border border-slate-200" aria-hidden="true" />
            No posts
          </span>
        </div>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-20 bg-slate-900 text-white text-[11px] leading-snug rounded-md px-3 py-2 shadow-lg whitespace-nowrap"
        >
          <div className="font-semibold">
            {DAY_NAMES[hovered.day]} · {formatHour(hovered.hour)}
          </div>
          <div className="mt-0.5 text-white/80">
            {hovered.n} {hovered.n === 1 ? "post" : "posts"}
            {hovered.n > 0 && (
              <>
                {" · "}
                {fmt(hovered.value)} {metricLabel.toLowerCase()}
              </>
            )}
          </div>
          {hovered.n > 0 && hovered.n < minN && (
            <div className="mt-0.5 text-amber-300 text-[10px]">
              Below reliability threshold (n≥{minN})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
