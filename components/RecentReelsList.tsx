// Sprint P7 v4.18 W13 hotfix (2026-05-02) — RSC boundary fix.
//
// W13 (1485499) wrapped the Recent Reels table in <PaginatedList> with a
// render-prop function inline on the SERVER page. That violates Next.js
// 14 RSC rules: functions cannot cross the server→client boundary, and
// PaginatedList is a client component. Build was green (type-check only)
// but every request to /reels server-errored.
//
// Fix: move the rendering INSIDE this client component. PaginatedList is
// now consumed within a client context where the render-prop function
// stays on the client side. The page passes serializable `rows` data
// only — no functions, no JSX trees crossing boundaries.

"use client";

import PaginatedList from "@/components/PaginatedList";
import PostReference from "@/components/PostReference";
import { canonicalColor } from "@/lib/colors";

export type ReelTableRow = {
  id: string;
  date: string;
  captionFull: string;
  permalink: string;
  pillar: string;
  plays: number;
  replays: number;
  watch: string;
  hook3: string;
  replayRate: string;
  follows: number;
};

export default function RecentReelsList({ rows }: { rows: ReelTableRow[] }) {
  return (
    <PaginatedList items={rows} pageSize={10} ariaLabel="Recent Reels pagination">
      {({ visibleItems }) => (
        <>
          {/* Desktop / tablet table (md+). Visual polish pass:
              - zebra striping (slate-50/30 on odd rows) for scannability
              - colored pillar pill (canonicalColor) instead of pale grey text
              - darker hero column (Plays) vs dimmer supporting columns
                (Replays, Replay %) to create a clear primary→secondary hierarchy
              - Hook 3s column tinted green/amber/rose based on thresholds so
                underperforming retention reads red at a glance
              - Follows column keeps its brand-green emphasis */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100/70 text-[11px] uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Caption</th>
                  <th className="text-left px-4 py-2.5 font-semibold">Pillar</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Plays</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Replays</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Watch (s)</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Hook 3s %</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Replay %</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Follows</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((row, i) => {
                  const hookNum = parseFloat(row.hook3);
                  const hookColor =
                    hookNum >= 60
                      ? "text-emerald-600 font-semibold"
                      : hookNum < 40
                      ? "text-rose-600 font-semibold"
                      : "text-slate-700";
                  const pillarBg = canonicalColor("pillar", row.pillar);
                  return (
                    <tr
                      key={row.id + i}
                      className={`border-t border-slate-100 transition-colors hover:bg-indigo-50/30 ${
                        i % 2 === 1 ? "bg-slate-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums">{row.date}</td>
                      <td className="px-4 py-3 text-slate-800 max-w-[360px]">
                        <PostReference caption={row.captionFull} permalinkUrl={row.permalink} maxChars={60} className="max-w-full" />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                          style={{ backgroundColor: pillarBg }}
                        >
                          {row.pillar}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{row.plays.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">{row.replays.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.watch}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${hookColor}`}>{row.hook3}%</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">{row.replayRate}%</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${row.follows > 0 ? "text-brand-green" : "text-slate-400"}`}>
                        {row.follows > 0 ? `+${row.follows}` : "0"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list (below md) — matching polish: colored pillar pill,
              hook-3s retention tint, zebra striping. */}
          <ul className="md:hidden divide-y divide-slate-100">
            {visibleItems.map((row, i) => (
              <li key={row.id + i} className={`px-4 py-3 ${i % 2 === 1 ? "bg-slate-50/40" : ""}`}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                    {row.date}
                  </div>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white max-w-[60%] truncate"
                    style={{ backgroundColor: canonicalColor("pillar", row.pillar) }}
                  >
                    {row.pillar}
                  </span>
                </div>
                <div className="text-sm text-slate-800 mb-2">
                  <PostReference caption={row.captionFull} permalinkUrl={row.permalink} maxChars={90} className="w-full" />
                </div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-2 text-xs">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Plays</div>
                    <div className="text-sm font-semibold text-slate-900 tabular-nums">{row.plays.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Watch</div>
                    <div className="text-sm font-semibold text-slate-900 tabular-nums">{row.watch}s</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Follows</div>
                    <div className="text-sm font-semibold text-brand-green tabular-nums">
                      {row.follows > 0 ? `+${row.follows}` : "0"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Hook 3s</div>
                    <div
                      className={`text-sm tabular-nums font-semibold ${
                        parseFloat(row.hook3) >= 60
                          ? "text-emerald-600"
                          : parseFloat(row.hook3) < 40
                          ? "text-rose-600"
                          : "text-slate-700"
                      }`}
                    >
                      {row.hook3}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Replay %</div>
                    <div className="text-sm text-slate-700 tabular-nums">{row.replayRate}%</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Replays</div>
                    <div className="text-sm text-slate-700 tabular-nums">{row.replays.toLocaleString()}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </PaginatedList>
  );
}
