#!/usr/bin/env -S npx tsx
/**
 * Admin-only weekly calibration check.
 *
 * 2026-05-05: removed the calibration KPI card from /outcomes (content-team
 * dashboard, admin-grade metric). This script reproduces the same view in
 * the terminal so the admin can run it weekly without a UI surface. Same
 * code path the page used (computeCalibrationFromOutcomes +
 * computePreliminaryCalibration + summarizeCalibration), so no math drift.
 *
 * Run:
 *   npm run calibration              # default: full report
 *
 * Reads .env.local for sheet credentials (same as `next dev`).
 *
 * What this answers:
 *   - "Did our 80% CI actually contain 80%?" — the rolling-N-week hit rate
 *   - The gap between FINAL (aged ≥7 days) and PRELIMINARY (<7 days)
 *     verdicts, which is where the forecast layer's planning-time honesty
 *     actually lives
 *   - When to graduate to Tier 2 algorithm work per
 *     docs/PLAN_ALGORITHM_AUDIT.md §1.1
 */

import { readFileSync } from "node:fs";
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
} catch (e) {
  console.warn(`(no .env.local found: ${(e as Error).message})`);
}

import {
  getOutcomeLog,
  getCalibrationLog,
  computeCalibrationFromOutcomes,
  computePreliminaryCalibration,
  mergeCalibrationSources,
  summarizeCalibration,
} from "../lib/sheets.js";

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function num(n: number | null, digits = 4): string {
  if (n === null) return "—";
  return n.toFixed(digits);
}

async function main() {
  const [outcomes, frozen] = await Promise.all([
    getOutcomeLog(),
    getCalibrationLog(),
  ]);
  const live = computeCalibrationFromOutcomes(outcomes);
  const merged = mergeCalibrationSources(live, frozen);
  const prelimEntries = computePreliminaryCalibration(outcomes);

  console.log(`\n═══ calibration check · ${new Date().toISOString().slice(0, 10)} ═══`);
  console.log(`outcome rows: ${outcomes.length}`);
  console.log(`live weeks computed: ${live.length} · frozen weeks: ${frozen.length} · merged: ${merged.length}\n`);

  // Per-week breakdown — final vs preliminary side by side
  console.log(`per-week breakdown (newest → oldest):`);
  console.log(
    `week         final (h/e/m = inside_CI%)               preliminary (h/e/m = inside_CI%)`,
  );
  console.log(`─`.repeat(96));
  const allWeeks = Array.from(
    new Set([
      ...live.map((e) => e.week_ending),
      ...prelimEntries.map((e) => e.week_ending),
      ...frozen.map((e) => e.week_ending),
    ]),
  )
    .sort()
    .reverse();
  for (const wk of allWeeks) {
    const f = live.find((e) => e.week_ending === wk);
    const p = prelimEntries.find((e) => e.week_ending === wk);
    const finalStr = f
      ? `${f.hits}/${f.exceeded}/${f.missed} = ${pct(f.hit_rate_inside_ci)}`
      : `(no final verdicts yet)`;
    const prelimStr = p
      ? `${p.hits}/${p.exceeded}/${p.missed} = ${pct(p.hit_rate_inside_ci)}`
      : `(no prelim verdicts)`;
    console.log(`  ${wk}   ${finalStr.padEnd(40)}  ${prelimStr}`);
  }

  // Rolling 4-week summaries
  const sFinal = summarizeCalibration(merged, 4);
  const sPrelim = summarizeCalibration(prelimEntries, 4);
  console.log(`\n═══ rolling 4-week summary ═══`);
  console.log(`                       FINAL (aged ≥7d)      PRELIMINARY (<7d)`);
  console.log(`weeks measured:        ${String(sFinal.weeks_measured).padEnd(22)} ${sPrelim.weeks_measured}`);
  console.log(`avg hit rate inside CI: ${pct(sFinal.avg_hit_rate_inside_ci).padEnd(22)} ${pct(sPrelim.avg_hit_rate_inside_ci)}`);
  console.log(`avg calibration error:  ${num(sFinal.avg_calibration_error).padEnd(22)} ${num(sPrelim.avg_calibration_error)}`);
  console.log(`latest week:            ${(sFinal.latest_week || "—").padEnd(22)} ${sPrelim.latest_week || "—"}`);
  console.log(`latest hit rate:        ${pct(sFinal.latest_hit_rate_inside_ci).padEnd(22)} ${pct(sPrelim.latest_hit_rate_inside_ci)}`);
  console.log(`status:                 ${(sFinal.status || "—").padEnd(22)} ${sPrelim.status || "—"}`);

  // Gap analysis — the actual signal
  if (
    sFinal.avg_hit_rate_inside_ci !== null &&
    sPrelim.avg_hit_rate_inside_ci !== null
  ) {
    const gap = (sFinal.avg_hit_rate_inside_ci - sPrelim.avg_hit_rate_inside_ci) * 100;
    console.log(`\ngap (final - prelim): ${gap.toFixed(1)}pp`);
  }

  // Interpretation + Tier 2 readiness
  console.log(`\n═══ interpretation ═══`);
  if (sFinal.avg_hit_rate_inside_ci === null) {
    console.log(`  no calibratable weeks yet — wait for next Monday's verdicts to mature`);
    return;
  }
  const target = 0.80;
  const gap = sFinal.avg_hit_rate_inside_ci - target;
  if (Math.abs(gap) < 0.05) {
    console.log(`  bands ROUGHLY CALIBRATED on aged verdicts (within 5pp of 80%)`);
    if (sFinal.weeks_measured >= 4) {
      console.log(`  ≥4 weeks of data → green light for Tier 2 work per PLAN_ALGORITHM_AUDIT.md §1.1`);
    } else {
      console.log(`  only ${sFinal.weeks_measured} week(s) of data — wait for ≥4 before declaring Tier 2 ready`);
    }
  } else if (sFinal.avg_hit_rate_inside_ci < 0.50) {
    console.log(`  bands SEVERELY MIS-CALIBRATED (live ${pct(sFinal.avg_hit_rate_inside_ci)} vs target 80%)`);
    console.log(`  → forecast layer is theatrical; tighten priors or add day-N before any Tier 2 work`);
  } else if (sFinal.avg_hit_rate_inside_ci < 0.65) {
    console.log(`  bands DRIFTING (live ${pct(sFinal.avg_hit_rate_inside_ci)} vs target 80%)`);
    console.log(`  → recalibrate; Tier 2 changes would inherit the miscalibration`);
  } else {
    console.log(`  bands NEAR TARGET but not there (live ${pct(sFinal.avg_hit_rate_inside_ci)} vs 80%)`);
    console.log(`  → 1-2 more weeks of data should clarify; Tier 2 borderline`);
  }

  // Prelim-vs-final gap callout
  if (
    sPrelim.avg_hit_rate_inside_ci !== null &&
    sFinal.avg_hit_rate_inside_ci !== null
  ) {
    const gap = sFinal.avg_hit_rate_inside_ci - sPrelim.avg_hit_rate_inside_ci;
    if (gap > 0.15) {
      console.log(`\n  PRELIM-VS-FINAL GAP is ${(gap * 100).toFixed(1)}pp (threshold 15pp).`);
      console.log(`  Bands match maturity, not planning-time. Reach catches up over 7 days,`);
      console.log(`  hiding miscalibration that's visible when the operator actually uses the band.`);
      console.log(`  Day-N priors (consuming Raw_Posts_History) will close this. ETA: 2-3 weeks of`);
      console.log(`  snapshot data, then ship compute_priors_by_age(N) on the pipeline side.`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
