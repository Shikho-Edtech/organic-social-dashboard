"use client";

// Step 3: four-state staleness banner with an inline per-stage detail panel.
//
// Replaces the prior three-state banner (ok returned null; warn/crit only).
// The new design (docs/design/Cycle 1 - Banner and Empty States.html) ships
// four distinct surfaces:
//   - ok         : white card + emerald checkmark + "refreshed N ago"
//   - warn       : amber border/fill + triangle + "N days old"
//   - crit       : red border/fill + circle-exclaim + "last succeeded N days ago"
//   - ai-disabled: slate border/fill + indigo minus-circle + "off this run"
//
// The banner is a <button aria-expanded>, not a <details>, so the expanded
// detail panel can render a dense table on desktop and stacked cards on
// mobile — the same data shape at both breakpoints. Tap anywhere on the row
// toggles. Entire row stays ≥ 44px tall per project mobile checklist.
//
// The `ai-disabled` variant reads as a product state, not a failure state:
// slate + indigo accent, no exclamation. Pages that carry this variant
// should ALSO render `AIDisabledEmptyState` below the banner in place of
// their AI-backed content (/strategy's diagnosis block, /plan's calendar).

import { useState, useCallback } from "react";
import type { StalenessInfo, RunStatus, ArtifactStatus } from "@/lib/sheets";
import { STAGES, STAGE_ORDER, type StageId } from "@/lib/stages";

type BannerMode = "ok" | "warn" | "crit" | "ai-disabled";

export default function StalenessBanner({
  info,
  artifact,
  runStatus,
  aiDisabled = false,
  hasData = true,
}: {
  /** Staleness computed for THIS page's primary AI artifact. */
  info: StalenessInfo;
  /** Which page-backing stage this banner represents. */
  artifact: "diagnosis" | "calendar";
  /**
   * Full run status. Needed so the expanded detail panel can list every
   * pipeline stage, not just the one backing this page. Optional: when
   * omitted, the detail panel renders a single-row fallback.
   */
  runStatus?: RunStatus;
  /**
   * When true, the banner switches to the "ai-disabled" slate/indigo surface
   * regardless of age — the operator deliberately ran the pipeline with the
   * AI stage off (or on native). The page should render AIDisabledEmptyState
   * below this banner.
   */
  aiDisabled?: boolean;
  /**
   * True when the page actually has something to render. When false + severity
   * is ok (shouldn't happen in practice) we still render the banner so the
   * user sees "refreshed" context instead of nothing. When false + crit +
   * days_since === -1, copy shifts to "no successful run recorded yet".
   */
  hasData?: boolean;
}) {
  const mode: BannerMode = aiDisabled
    ? "ai-disabled"
    : info.severity === "ok"
    ? "ok"
    : info.severity;

  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  const stageDef = artifact === "diagnosis" ? STAGES.diagnosis : STAGES.calendar;
  const nounUpper = stageDef.noun.charAt(0).toUpperCase() + stageDef.noun.slice(1);

  const ago = formatAgo(info.last_successful_at);
  const shortSuccess = formatShortDate(info.last_successful_at);

  // Headline + body copy per mode. Matches the design's Cycle 1 copy exactly.
  const { title, subtitle } = copyForMode(mode, info, nounUpper, ago, shortSuccess, hasData);

  return (
    <div className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={bannerButtonCls(mode, open)}
      >
        <span aria-hidden className={iconWrapCls(mode)}>
          {iconForMode(mode)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-tight text-sm">{title}</span>
          {subtitle && (
            <span className="block mt-0.5 text-[12px] leading-snug opacity-90">
              {subtitle}
            </span>
          )}
        </span>
        <svg
          aria-hidden
          className={`flex-shrink-0 mt-1 transition-transform ${open ? "rotate-180" : ""} ${chevronCls(mode)}`}
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="status"
          aria-live="polite"
          className={panelCls(mode)}
        >
          <DetailPanel runStatus={runStatus} info={info} artifact={artifact} />
        </div>
      )}
    </div>
  );
}

// ─── Detail panel ───

function DetailPanel({
  runStatus,
  info,
  artifact,
}: {
  runStatus?: RunStatus;
  info: StalenessInfo;
  artifact: "diagnosis" | "calendar";
}) {
  const runLabel = runStatus?.last_run_at
    ? formatShortDateTime(runStatus.last_run_at)
    : "—";
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">
        Pipeline stages{runStatus?.last_run_at ? ` · run ${runLabel} BDT` : ""}
      </div>

      {/* Mobile: stacked cards */}
      <ul className="space-y-2 md:hidden">
        {STAGE_ORDER.map((id) => (
          <StageCard key={id} id={id} runStatus={runStatus} info={info} artifact={artifact} />
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <th className="py-1.5 pr-4 font-semibold">Stage</th>
              <th className="py-1.5 pr-4 font-semibold">Status</th>
              <th className="py-1.5 pr-4 font-semibold">Last ran</th>
              <th className="py-1.5 text-right font-semibold">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {STAGE_ORDER.map((id) => (
              <StageRow key={id} id={id} runStatus={runStatus} info={info} artifact={artifact} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
        Native stages run every weekly pipeline; AI stages require credits on
        the configured provider. If an AI stage falls back, the dashboard
        reuses the previous successful artifact and shows this banner.
      </div>
    </div>
  );
}

function StageCard({
  id,
  runStatus,
  info,
  artifact,
}: {
  id: StageId;
  runStatus?: RunStatus;
  info: StalenessInfo;
  artifact: "diagnosis" | "calendar";
}) {
  const { status, lastAt, age } = resolveStage(id, runStatus, info, artifact);
  const def = STAGES[id];
  return (
    <li className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2">
      <StatusPill status={status} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-slate-900 truncate">{def.label}</div>
        <div className="text-[11px] text-slate-500 truncate">
          {lastAt ? formatShortDateTime(lastAt) : "—"}
        </div>
      </div>
      <div className={`text-[11px] font-semibold tabular-nums ${ageColor(status, age)}`}>
        {age}
      </div>
    </li>
  );
}

function StageRow({
  id,
  runStatus,
  info,
  artifact,
}: {
  id: StageId;
  runStatus?: RunStatus;
  info: StalenessInfo;
  artifact: "diagnosis" | "calendar";
}) {
  const { status, lastAt, age } = resolveStage(id, runStatus, info, artifact);
  const def = STAGES[id];
  return (
    <tr>
      <td className="py-2 pr-4 font-medium text-slate-900">{def.label}</td>
      <td className="py-2 pr-4"><StatusPill status={status} /></td>
      <td className="py-2 pr-4 text-slate-600">{lastAt ? formatShortDateTime(lastAt) : "—"}</td>
      <td className={`py-2 text-right tabular-nums font-medium ${ageColor(status, age)}`}>{age}</td>
    </tr>
  );
}

function resolveStage(
  id: StageId,
  runStatus: RunStatus | undefined,
  info: StalenessInfo,
  artifact: "diagnosis" | "calendar",
): { status: ArtifactStatus; lastAt: string; age: string } {
  const def = STAGES[id];
  // If this row IS the banner's artifact and no runStatus was passed, we
  // still have enough data from `info` to fill the row honestly.
  if (!runStatus) {
    if (id === artifact) {
      return {
        status: info.last_status,
        lastAt: info.last_successful_at,
        age: formatAge(info.last_successful_at),
      };
    }
    return { status: "unknown", lastAt: "", age: "—" };
  }
  const status = def.readStatus ? def.readStatus(runStatus) : "unknown";
  const lastAt = def.readLastSuccessful ? def.readLastSuccessful(runStatus) : "";
  return { status, lastAt, age: formatAge(lastAt) };
}

// ─── Severity pill ───

function StatusPill({ status }: { status: ArtifactStatus }) {
  const map: Record<ArtifactStatus, { cls: string; label: string }> = {
    success:  { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "ok" },
    fallback: { cls: "bg-amber-50 text-amber-700 ring-amber-200",       label: "warn · fallback" },
    skipped:  { cls: "bg-slate-100 text-slate-700 ring-slate-200",      label: "off" },
    failed:   { cls: "bg-red-50 text-red-700 ring-red-200",             label: "failed" },
    "n/a":    { cls: "bg-slate-50 text-slate-500 ring-slate-200",       label: "n/a" },
    unknown:  { cls: "bg-slate-50 text-slate-500 ring-slate-200",       label: "—" },
  };
  const { cls, label } = map[status];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5 ring-1 ${cls}`}>
      {label}
    </span>
  );
}

// ─── Mode helpers ───

function bannerButtonCls(mode: BannerMode, open: boolean): string {
  const base = "w-full text-left flex items-start gap-2.5 px-3 py-2.5 sm:px-3.5 text-sm transition-colors min-h-[44px]";
  const open_ = open ? "rounded-t-md border-b-transparent" : "rounded-md";
  switch (mode) {
    case "ok":
      return `${base} ${open_} border border-slate-200 bg-white hover:bg-slate-50 text-slate-700`;
    case "warn":
      return `${base} ${open_} border border-amber-300 bg-amber-50 hover:bg-amber-100/60 text-amber-900`;
    case "crit":
      return `${base} ${open_} border border-red-300 bg-red-50 hover:bg-red-100/60 text-red-900`;
    case "ai-disabled":
      return `${base} ${open_} border border-slate-300 bg-slate-100 hover:bg-slate-200/70 text-slate-800`;
  }
}

function iconWrapCls(mode: BannerMode): string {
  const base = "flex-shrink-0 mt-0.5";
  switch (mode) {
    case "ok":          return `${base} text-emerald-600`;
    case "warn":        return `${base} text-amber-700`;
    case "crit":        return `${base} text-red-700`;
    case "ai-disabled": return `${base} text-brand-shikho-indigo`;
  }
}

function chevronCls(mode: BannerMode): string {
  switch (mode) {
    case "ok":          return "text-slate-400";
    case "warn":        return "text-amber-700/70";
    case "crit":        return "text-red-700/70";
    case "ai-disabled": return "text-slate-500";
  }
}

function panelCls(mode: BannerMode): string {
  const base = "rounded-b-md border border-t-slate-200 px-3 py-3 sm:px-3.5 sm:py-3.5";
  switch (mode) {
    case "ok":          return `${base} border-slate-200 bg-white`;
    case "warn":        return `${base} border-x-amber-300 border-b-amber-300 bg-amber-50/60`;
    case "crit":        return `${base} border-x-red-300 border-b-red-300 bg-red-50/60`;
    case "ai-disabled": return `${base} border-x-slate-300 border-b-slate-300 bg-slate-100/70`;
  }
}

function iconForMode(mode: BannerMode) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (mode) {
    case "ok":
      return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
    case "warn":
      return <svg {...common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case "crit":
      return <svg {...common}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case "ai-disabled":
      return <svg {...common}><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>;
  }
}

function copyForMode(
  mode: BannerMode,
  info: StalenessInfo,
  noun: string,
  ago: string,
  shortSuccess: string,
  hasData: boolean,
): { title: string; subtitle: string } {
  const n = noun; // "AI diagnosis" | "AI calendar"
  switch (mode) {
    case "ok":
      return {
        title: `${n} refreshed ${ago}`,
        subtitle: "",
      };
    case "warn":
      return {
        title: `${n} is ${info.days_since} day${info.days_since === 1 ? "" : "s"} old`,
        subtitle: info.last_status === "fallback"
          ? `Last succeeded ${shortSuccess} · last run fell back to cached data`
          : `Last succeeded ${shortSuccess} · next weekly run should refresh it`,
      };
    case "crit":
      if (info.days_since < 0 || !hasData) {
        return {
          title: `${n} has never succeeded`,
          subtitle: "Run the weekly pipeline to populate this view",
        };
      }
      return {
        title: `${n} last succeeded ${info.days_since} days ago`,
        subtitle: `The analysis below is archival. Tap for detail`,
      };
    case "ai-disabled":
      return {
        title: `${n} is off this run`,
        subtitle: `Native pipeline is still fresh${ago ? ` (${ago})` : ""}`,
      };
  }
}

// ─── Format helpers ───

function formatShortDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatShortDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function formatAgo(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function formatAge(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const hrs = Math.floor((Date.now() - d.getTime()) / 3600000);
  if (hrs < 1) return "<1h";
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function ageColor(status: ArtifactStatus, age: string): string {
  if (status === "fallback") return "text-amber-800";
  if (status === "failed")   return "text-red-800";
  if (status === "skipped" || status === "unknown" || age === "—") return "text-slate-500";
  return "text-slate-700";
}
