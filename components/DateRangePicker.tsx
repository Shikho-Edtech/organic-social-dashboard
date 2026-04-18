"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";

const PRESETS: { key: string; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "mtd", label: "Month to date" },
  { key: "ytd", label: "Year to date" },
  { key: "all", label: "All time" },
];

function labelFor(range: string, customStart?: string | null, customEnd?: string | null): string {
  if (range === "custom" && customStart && customEnd) return `${customStart} → ${customEnd}`;
  const preset = PRESETS.find((p) => p.key === range);
  return preset?.label || "Last 30 days";
}

export default function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get("range") || "30d";
  const initialStart = sp.get("start") || "";
  const initialEnd = sp.get("end") || "";

  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function setPreset(key: string) {
    const params = new URLSearchParams();
    params.set("range", key);
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  function applyCustom() {
    if (!start || !end) return;
    const params = new URLSearchParams();
    params.set("range", "custom");
    params.set("start", start);
    params.set("end", end);
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  const displayLabel = labelFor(current, initialStart, initialEnd);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <span className="font-medium">{displayLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="py-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  current === p.key
                    ? "bg-brand-shikho-indigo/5 text-brand-shikho-indigo font-semibold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {current === p.key && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                  <span className={current === p.key ? "" : "ml-[18px]"}>{p.label}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Custom range</div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="flex-1 px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-brand-shikho-indigo"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="flex-1 px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-brand-shikho-indigo"
              />
            </div>
            <button
              onClick={applyCustom}
              disabled={!start || !end}
              className="mt-2 w-full px-3 py-1.5 rounded-md text-xs font-semibold bg-brand-shikho-indigo text-white hover:bg-brand-shikho-blue disabled:bg-slate-300 disabled:text-slate-500 transition-colors"
            >
              Apply custom range
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
