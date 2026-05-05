#!/usr/bin/env node
/**
 * Page-structure audit.
 *
 * 2026-05-05: ratchet against the parallel-render-path drift class. Pages
 * that have multiple top-level returns (typically empty-state branch +
 * regular branch) duplicate their chrome inline, and every surgical fix
 * to one branch silently drops something from the other. That was the
 * shape of every reactive bug shipped 2026-05-04 / 05.
 *
 * Rule: each `app/<route>/page.tsx` file's default-exported page function
 * may have AT MOST ONE top-level `return` statement. State branches must
 * live inside the body of that single return (as conditionals or sub-blocks),
 * NOT as additional top-level returns above it.
 *
 * Ratchet baseline (.page-structure-baseline.json) mirrors brand-audit's
 * convention: existing violations are grandfathered; the audit fails only
 * on REGRESSIONS (a page that previously had N top-level returns growing
 * to N+1, or a previously-clean page acquiring a second). Walk the
 * baseline DOWN with --write-baseline after consolidation passes — never
 * up.
 *
 * The audit is deliberately a regex over text, not an AST parse. The
 * page-component shape in this codebase is uniform enough that a depth-2
 * indent + "after default export" gate gives zero false positives on
 * the current pages. If future code patterns make it brittle, swap to
 * a TS parser.
 *
 * Run:
 *   npm run page:audit                      # check against baseline
 *   npm run page:audit -- --list            # show every violation, grandfathered + new
 *   npm run page:audit -- --write-baseline  # ratchet DOWN after a cleanup pass
 *
 * See:
 *   - LEARNINGS.md "Parallel render paths in a page file are a drift trap"
 *   - DECISIONS.md "Single-return page shape; structural PageShell extraction deferred"
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const BASELINE_PATH = join(repoRoot, ".page-structure-baseline.json");

const args = new Set(process.argv.slice(2));
const WRITE_BASELINE = args.has("--write-baseline");
const LIST_ALL = args.has("--list");

function listPageFiles() {
  const out = execSync("git ls-files app/", {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  return out.filter((f) => /\bpage\.tsx$/.test(f));
}

/**
 * Count top-level returns inside the default-exported page function.
 *
 * Strategy:
 *   1. Find the line that starts the default export. Accept both
 *      `export default async function Name(` and
 *      `export default function Name(`.
 *   2. Scan forward, counting `^  return\b` lines (exactly two spaces
 *      of indent), and STOP at the first `^}` line. That `^}` closes
 *      the page function body. Anything after is module-scope siblings
 *      (helper sub-components like `VerdictPill`, `Breakdown`) — those
 *      have their own returns at depth-2 indent but they're separate
 *      functions, not drift inside the page.
 *
 * Edge cases:
 *   - Pages without `export default function Name` (arrow default export
 *     etc.) are skipped with a warning. None exist today.
 *   - Multi-line return arguments count once because the regex matches
 *     only the line starting with `return`.
 *   - If the page function body itself contains a `^}` (e.g. an inline
 *     object literal closing at column 0), this would under-count. No
 *     current pages do that — they use 2+ space indent for everything
 *     inside the page body.
 */
function auditFile(absPath) {
  const src = readFileSync(absPath, "utf8");
  const lines = src.split(/\r?\n/);
  let exportLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      /^export default (?:async )?function\s+\w+\s*\(/.test(lines[i]) ||
      /^export default \(/.test(lines[i])
    ) {
      exportLine = i;
      break;
    }
  }
  if (exportLine === -1) {
    return { skipped: true, reason: "no `export default function` found" };
  }
  // Find the brace that opens the page function BODY. The export line
  // also contains parameter destructuring (`({ searchParams }: ...)`)
  // and type annotations (`: { searchParams: Record<...> }`) — those
  // nested braces are NOT the body opener, so naive counting from the
  // first `{` reaches depth 0 again at the end of the param list.
  //
  // The body opener is the `{` that follows the closing `)` of the
  // parameter list. We scan for `) {` (with optional return type
  // annotation `): Promise<...> {`) on or after the export line.
  let bodyOpenLine = -1;
  let bodyOpenCol = -1;
  for (let i = exportLine; i < lines.length; i++) {
    const m = lines[i].match(/\)\s*(?::[^={]+)?\s*\{\s*$/);
    if (m) {
      bodyOpenLine = i;
      bodyOpenCol = lines[i].lastIndexOf("{");
      break;
    }
  }
  if (bodyOpenLine === -1) {
    return { skipped: true, reason: "could not locate function body opener" };
  }
  // Bracket-balance from the body-opening brace forward to find the
  // matching close. We start with depth 1 (the body opener is consumed)
  // and stop the first time we return to depth 0.
  let depth = 1;
  let endLine = lines.length;
  outer: for (let i = bodyOpenLine; i < lines.length; i++) {
    const line = lines[i];
    // Strip line comments + string literals minimally; cheap pass that
    // avoids miscounting `}` inside strings or `// foo }`. Block
    // comments are ignored — none of our pages use multi-line block
    // comments in the body in a way that hides braces.
    const stripped = line
      .replace(/\/\/.*$/, "")
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/`(?:\\.|[^`\\])*`/g, "``");
    // For the body-opener line, only scan AFTER the body-opener column.
    const startCol = i === bodyOpenLine ? bodyOpenCol + 1 : 0;
    for (let c = startCol; c < stripped.length; c++) {
      const ch = stripped[c];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          endLine = i;
          break outer;
        }
      }
    }
  }
  const returnLines = [];
  for (let i = exportLine + 1; i < endLine; i++) {
    if (/^  return\b/.test(lines[i])) {
      returnLines.push(i + 1);
    }
  }
  return { skipped: false, returnLines };
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    const data = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    return data.counts || {};
  } catch {
    return {};
  }
}

function writeBaseline(counts) {
  const sortedKeys = Object.keys(counts).sort();
  const sorted = {};
  for (const k of sortedKeys) sorted[k] = counts[k];
  const payload = {
    note:
      "Per-file count of top-level returns in app/<route>/page.tsx. " +
      "Audit fails when a file's count grows OR when a new file enters " +
      "with count > 1. Walk this DOWN with --write-baseline after " +
      "consolidation passes; never up.",
    counts: sorted,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n");
}

function main() {
  const files = listPageFiles();
  const counts = {};
  let skipped = 0;
  for (const rel of files) {
    const abs = resolve(repoRoot, rel);
    const result = auditFile(abs);
    if (result.skipped) {
      skipped += 1;
      console.warn(`page-audit: skipped ${rel} (${result.reason})`);
      continue;
    }
    counts[rel] = result.returnLines.length;
    if (LIST_ALL && result.returnLines.length > 0) {
      console.log(`  ${rel}: ${result.returnLines.length} top-level return(s) at lines ${result.returnLines.join(", ")}`);
    }
  }

  if (WRITE_BASELINE) {
    writeBaseline(counts);
    const totalAbove1 = Object.values(counts).filter((n) => n > 1).length;
    console.log(
      `page-audit: baseline written. ${files.length} files, ${totalAbove1} grandfathered with >1 return.`,
    );
    return;
  }

  const baseline = loadBaseline();
  const regressions = [];
  for (const [file, count] of Object.entries(counts)) {
    const allowed = baseline[file] ?? 1;
    if (count > allowed) {
      regressions.push({ file, count, allowed });
    }
  }
  if (regressions.length > 0) {
    console.error(
      `page-audit: ${regressions.length} regression(s) — top-level returns grew beyond baseline:\n`,
    );
    for (const r of regressions) {
      console.error(`  ${r.file}: now ${r.count}, baseline allowed ${r.allowed}`);
    }
    console.error(
      `\nPages should have ONE top-level return. State branches go INSIDE`,
    );
    console.error(
      `the return body. See LEARNINGS.md "Parallel render paths in a page`,
    );
    console.error(`file are a drift trap" for the why.\n`);
    console.error(
      `If this regression is intentional and you are consolidating, run:`,
    );
    console.error(`    npm run page:audit -- --write-baseline\n`);
    process.exit(1);
  }
  const totalAbove1 = Object.values(counts).filter((n) => n > 1).length;
  const baselineAbove1 = Object.values(baseline).filter((n) => n > 1).length;
  console.log(
    `page-audit: no regressions (${files.length} pages, ${totalAbove1} with >1 return, baseline ${baselineAbove1})${
      skipped > 0 ? `, ${skipped} skipped` : ""
    }`,
  );
}

main();
