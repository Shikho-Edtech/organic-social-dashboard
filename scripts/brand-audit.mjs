#!/usr/bin/env node
/**
 * Shikho v1.0 brand audit.
 *
 * Walks the dashboard + pipeline + master HTML surfaces and reports any
 * forbidden palette pattern. Uses a ratchet baseline (.brand-audit-baseline.json)
 * so existing violations are grandfathered and the audit only FAILS on
 * regressions (new violations beyond the baseline).
 *
 * Wired into `npm run brand:audit` and listed as perspective #8 of the
 * pre-commit QA gate in CLAUDE.md.
 *
 * Usage:
 *   npm run brand:audit                  # check against baseline, exit 1 on regression
 *   npm run brand:audit -- --write-baseline   # capture current state as new baseline
 *   npm run brand:audit -- --list        # list all violations (grandfathered + new)
 *
 * Spec: organic-social-dashboard/docs/BRAND.md
 *
 * No dependencies — stdlib only.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Script lives at organic-social-dashboard/scripts/ → project root is two levels up.
const ROOT = resolve(__dirname, "..", "..");
const BASELINE_PATH = join(ROOT, "organic-social-dashboard", ".brand-audit-baseline.json");

const args = new Set(process.argv.slice(2));
const WRITE_BASELINE = args.has("--write-baseline");
const LIST_ALL = args.has("--list");

// ─── what to scan ──────────────────────────────────────────────────────────
const INCLUDE_DIRS = [
  "organic-social-dashboard/app",
  "organic-social-dashboard/components",
  "organic-social-dashboard/lib",
  "facebook-pipeline/src",
  "facebook-pipeline/docs",
];
const INCLUDE_ROOT_FILES = ["START_HERE.html"];
const SCAN_EXTS = new Set([".tsx", ".ts", ".jsx", ".js", ".css", ".html", ".py", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".cache", "__pycache__"]);

// Path-prefix skips. Dated archives are historical snapshots — freezing them
// as-is is intentional so future brand reviews can diff old against new.
const SKIP_PATH_PREFIXES = ["facebook-pipeline/docs/archive/"];

// The audit script itself + the BRAND.md spec legitimately mention banned
// patterns as documentation.
const SKIP_FILES = new Set([
  "organic-social-dashboard/scripts/brand-audit.mjs",
  "organic-social-dashboard/docs/BRAND.md",
]);

// ─── the rules ─────────────────────────────────────────────────────────────
// Each rule: { id, pattern, label, hint }. Case-insensitive where marked.
// `id` is the stable key used in the baseline JSON — don't rename.

const RULES = [
  {
    id: "slate-class",
    pattern: /\b(?:text|bg|border|ring|divide|from|to|via|placeholder|caret|accent|outline|decoration|fill|stroke|shadow)-slate-\d{2,3}\b/,
    label: "slate-* Tailwind class",
    hint: "use ink-* (ink-paper, ink-canvas, ink-100..900) or brand-shikho-* tokens",
  },
  {
    id: "gray-class",
    pattern: /\b(?:text|bg|border|ring|divide|from|to|via|placeholder|caret|accent|outline|decoration|fill|stroke|shadow)-gray-\d{2,3}\b/,
    label: "gray-* Tailwind class",
    hint: "use ink-* neutral scale",
  },
  {
    id: "zinc-class",
    pattern: /\b(?:text|bg|border|ring|divide|from|to|via|placeholder|caret|accent|outline|decoration|fill|stroke|shadow)-zinc-\d{2,3}\b/,
    label: "zinc-* Tailwind class",
    hint: "use ink-* neutral scale",
  },
  {
    id: "legacy-neutral-hex",
    pattern: /#(?:0b1120|111827|0f172a|1f2937|334155|475569|64748b|94a3b8|cbd5e1|e2e8f0|e5e7eb|f1f5f9|f8fafc)\b/i,
    label: "legacy Tailwind slate/gray hex",
    hint: "remap to Shikho ink.* or shikho-indigo-* equivalent (see docs/BRAND.md §2)",
  },
  {
    id: "non-brand-chart-hex",
    pattern: /#(?:06b6d4|8b5cf6|f97316)\b/i,
    label: "non-brand chart hex (cyan-500 / violet-500 / orange-500)",
    hint: "use Shikho core hue: #304090 / #C02080 / #E0A010 / #E03050",
  },
  {
    id: "inter-font-family",
    pattern: /font-family\s*:[^;{}\n]*["']?Inter["']?/i,
    label: 'Inter font in font-family',
    hint: 'swap for "Poppins", "Hind Siliguri", ... (see docs/BRAND.md §3)',
  },
  {
    id: "inter-google-font",
    pattern: /family=Inter(?:[&:]|$)/i,
    label: 'Inter font in Google Fonts URL',
    hint: 'use family=Poppins + family=Hind+Siliguri',
  },
];

const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

// ─── walker ────────────────────────────────────────────────────────────────

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, files);
    } else {
      const rel = relative(ROOT, full).replaceAll("\\", "/");
      if (SKIP_FILES.has(rel)) continue;
      if (SKIP_PATH_PREFIXES.some((p) => rel.startsWith(p))) continue;
      const dot = entry.lastIndexOf(".");
      const ext = dot === -1 ? "" : entry.slice(dot);
      if (SCAN_EXTS.has(ext)) files.push(full);
    }
  }
  return files;
}

// ─── scan ──────────────────────────────────────────────────────────────────

const files = [];
for (const d of INCLUDE_DIRS) walk(join(ROOT, d), files);
for (const f of INCLUDE_ROOT_FILES) {
  const full = join(ROOT, f);
  try {
    if (statSync(full).isFile()) files.push(full);
  } catch {
    /* missing root file → ignore */
  }
}

// current: { [relPath]: { [ruleId]: count } }
const current = {};
// hits: [{file, lineNo, ruleId, match}]
const hits = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      const match = rule.pattern.exec(line);
      if (match) {
        if (!current[rel]) current[rel] = {};
        current[rel][rule.id] = (current[rel][rule.id] || 0) + 1;
        hits.push({ file: rel, lineNo: i + 1, ruleId: rule.id, match: match[0] });
      }
    }
  }
}

// ─── baseline mode ─────────────────────────────────────────────────────────

if (WRITE_BASELINE) {
  const payload = {
    generated: new Date().toISOString(),
    note: "Grandfathered baseline. Audit fails only on NEW violations beyond these counts. Regenerate after a cleanup pass to ratchet the expectation down.",
    spec: "organic-social-dashboard/docs/BRAND.md",
    counts: current,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const total = Object.values(current).reduce(
    (a, f) => a + Object.values(f).reduce((x, y) => x + y, 0),
    0
  );
  console.log(`brand-audit: wrote baseline with ${total} grandfathered violation(s) across ${Object.keys(current).length} file(s)`);
  console.log(`             → ${relative(ROOT, BASELINE_PATH).replaceAll("\\", "/")}`);
  process.exit(0);
}

// ─── load baseline ─────────────────────────────────────────────────────────

let baseline = { counts: {} };
if (existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch (e) {
    console.error(`brand-audit: could not parse ${BASELINE_PATH}:`, e.message);
    process.exit(2);
  }
}

// ─── diff current against baseline ─────────────────────────────────────────

const regressions = [];       // [{file, ruleId, delta}]  (new > baseline)
const improvements = [];      // [{file, ruleId, delta}]  (baseline > new)

const allFiles = new Set([...Object.keys(current), ...Object.keys(baseline.counts || {})]);
for (const file of allFiles) {
  const cur = current[file] || {};
  const base = (baseline.counts || {})[file] || {};
  const allRules = new Set([...Object.keys(cur), ...Object.keys(base)]);
  for (const ruleId of allRules) {
    const c = cur[ruleId] || 0;
    const b = base[ruleId] || 0;
    if (c > b) regressions.push({ file, ruleId, delta: c - b, current: c, baseline: b });
    else if (c < b) improvements.push({ file, ruleId, delta: b - c, current: c, baseline: b });
  }
}

// ─── report ────────────────────────────────────────────────────────────────

const totalCurrent = hits.length;
const totalBaseline = Object.values(baseline.counts || {}).reduce(
  (a, f) => a + Object.values(f).reduce((x, y) => x + y, 0),
  0
);

if (LIST_ALL) {
  if (totalCurrent === 0) {
    console.log("brand-audit: clean — no violations in any scanned file.");
    process.exit(0);
  }
  const byFile = new Map();
  for (const h of hits) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file).push(h);
  }
  console.log(`brand-audit (--list): ${totalCurrent} violation(s) in ${byFile.size} file(s)\n`);
  for (const [file, list] of byFile) {
    console.log(`  ${file}`);
    for (const h of list) {
      const rule = RULE_BY_ID[h.ruleId];
      console.log(`    L${h.lineNo}  ${rule.label}  →  "${h.match}"`);
    }
    console.log("");
  }
  process.exit(0);
}

if (regressions.length === 0) {
  const improved = improvements.reduce((a, i) => a + i.delta, 0);
  let msg = `brand-audit: no regressions (${totalCurrent} total, baseline ${totalBaseline})`;
  if (improved > 0) {
    msg += ` — ${improved} violation(s) cleaned up since baseline`;
    msg += `. Consider: npm run brand:audit -- --write-baseline  # ratchet down.`;
  }
  console.log(msg);
  process.exit(0);
}

console.error(`brand-audit: ${regressions.length} new violation type(s) beyond baseline`);
console.error(`            (${totalCurrent} total, baseline ${totalBaseline})\n`);

const regByFile = new Map();
for (const r of regressions) {
  if (!regByFile.has(r.file)) regByFile.set(r.file, []);
  regByFile.get(r.file).push(r);
}

for (const [file, regs] of regByFile) {
  console.error(`  ${file}`);
  for (const r of regs) {
    const rule = RULE_BY_ID[r.ruleId];
    console.error(`    +${r.delta}  ${rule.label}  (was ${r.baseline}, now ${r.current})`);
    console.error(`         hint: ${rule.hint}`);
    // Show actual line numbers for the new hits
    const fileHits = hits.filter((h) => h.file === file && h.ruleId === r.ruleId);
    for (const h of fileHits.slice(0, 8)) {
      console.error(`         L${h.lineNo}  "${h.match}"`);
    }
    if (fileHits.length > 8) {
      console.error(`         … + ${fileHits.length - 8} more`);
    }
  }
  console.error("");
}

console.error(`Spec: organic-social-dashboard/docs/BRAND.md`);
console.error(`Fix regressions before commit. (Grandfathered violations don't fail — but prefer to fix on touch.)`);
console.error(`To ratchet the baseline down after cleanup: npm run brand:audit -- --write-baseline`);
process.exit(1);
