"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

const PRESETS = [
  { key: "7d", label: "Last 7d" },
  { key: "30d", label: "Last 30d" },
  { key: "90d", label: "Last 90d" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

export default function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get("range") || "30d";
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [start, setStart] = useState(sp.get("start") || "");
  const [end, setEnd] = useState(sp.get("end") || "");

  function setPreset(key: string) {
    const params = new URLSearchParams();
    params.set("range", key);
    router.push(`${pathname}?${params.toString()}`);
    setShowCustom(false);
  }

  function applyCustom() {
    if (!start || !end) return;
    const params = new URLSearchParams();
    params.set("range", "custom");
    params.set("start", start);
    params.set("end", end);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => setPreset(p.key)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            current === p.key
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          current === "custom"
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        Custom
      </button>
      {showCustom && (
        <div className="flex items-center gap-1.5 ml-2">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-slate-400"
          />
          <button
            onClick={applyCustom}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-brand-cyan text-white hover:bg-cyan-600"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
