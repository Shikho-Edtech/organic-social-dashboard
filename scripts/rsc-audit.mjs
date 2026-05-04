#!/usr/bin/env node
/**
 * RSC serialization audit.
 *
 * The 2026-05-04 outage (digest 3451054532) was caused by passing
 * `STAGES.diagnosis` (an object containing `readStatus` / `readLastSuccessful`
 * functions) as a prop to `<AIDisabledEmptyState>` (a "use client" component).
 * Next.js threw "Functions cannot be passed directly to Client Components"
 * on every page render that hit the aiDisabled branch. The error message
 * is hidden in production digests, so it took us two false-fix attempts
 * before reproducing in dev showed the real cause.
 *
 * This script catches that class of bug at lint time:
 *   1. Find every "use client" component file.
 *   2. Find every call site of those components in app/**.tsx.
 *   3. Extract the prop values being passed.
 *   4. Flag any prop value that imports from / references a known
 *      function-bearing object (currently: `STAGES` from `@/lib/stages`).
 *
 * Extending: add new function-bearing modules to KNOWN_FN_BEARING below
 * as they appear (anywhere a typed object combines fields with closures).
 *
 * Run: `npm run rsc:audit`
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// Known function-bearing module exports. A violation is a prop value that
// references one of these objects as a WHOLE — not as a path drilled into
// a serializable subfield.
//
// Example: `stage={STAGES.diagnosis}` is a violation (StageDef has functions).
//          `envVars={STAGES.diagnosis.envVars}` is fine (array of strings).
//
// Pattern: match the bare path with a negative lookahead for `.field`. New
// function-bearing modules go here as they appear (anywhere a typed object
// exports closures alongside data fields).
const KNOWN_FN_BEARING = [
  // STAGES.X — flagged when the FULL StageDef is passed. Drilled access
  // (STAGES.X.envVars) skips because the lookahead fails.
  /\bSTAGES\.[a-zA-Z]+(?!\.|\[)\b/,
  /\bSTAGES\[[^\]]+\](?!\.|\[)/,
];

function listClientComponents() {
  // Find all files with a "use client" directive at the top.
  const out = execSync('git grep -l "\\"use client\\"" components/ app/', {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  return out;
}

function listAppFiles() {
  return execSync('git ls-files app/', {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim().split("\n").filter((f) => /\.tsx$/.test(f));
}

function findJsxPropAssignments(src) {
  // Match JSX prop assignments `propName={expression}`. Keep it simple:
  // this is meant as a pattern grep, not a full parser. Multi-line {…}
  // bodies are handled by greedy scanning until matching `}`.
  const out = [];
  const re = /(\w+)=\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ name: m[1], value: m[2].trim(), pos: m.index });
  }
  return out;
}

function getClientComponentNames(clientFiles) {
  // For each client component file, derive the component's exported name
  // (default export's identifier OR the basename). We use this to find
  // call sites in app/**/*.tsx.
  const names = new Set();
  for (const f of clientFiles) {
    // basename without extension
    const base = f.replace(/^.*\//, "").replace(/\.[tj]sx?$/, "");
    if (base !== "index") names.add(base);
    // also pick up named exports
    const src = readFileSync(resolve(repoRoot, f), "utf8");
    for (const m of src.matchAll(/export\s+(?:default\s+)?function\s+([A-Z]\w+)/g)) {
      names.add(m[1]);
    }
    for (const m of src.matchAll(/export\s+default\s+([A-Z]\w+)/g)) {
      names.add(m[1]);
    }
  }
  return names;
}

const violations = [];

const clientFiles = listClientComponents();
const clientNames = getClientComponentNames(clientFiles);

// Walk every app/**/*.tsx looking for JSX of the form `<ClientName ... prop={...}>`
// where prop value matches a KNOWN_FN_BEARING pattern.
for (const f of listAppFiles()) {
  const src = readFileSync(resolve(repoRoot, f), "utf8");
  // Find blocks like `<ComponentName\n  prop={...}\n  ...\n  />` per component name.
  for (const name of clientNames) {
    // Match `<ComponentName ... />` or `<ComponentName ... > … </ComponentName>`.
    // We use a non-greedy block match to capture the JSX opening tag's prop list.
    const tagRe = new RegExp(`<${name}\\b([^>]*?)/?>`, "gs");
    let m;
    while ((m = tagRe.exec(src)) !== null) {
      const propBlock = m[1];
      const props = findJsxPropAssignments("<x " + propBlock + " />");
      for (const p of props) {
        for (const pat of KNOWN_FN_BEARING) {
          if (pat.test(p.value)) {
            violations.push({
              file: f,
              component: name,
              prop: p.name,
              value: p.value,
              pattern: pat.toString(),
            });
          }
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`OK  No RSC serialization violations found.`);
  console.log(`    Scanned ${clientFiles.length} client components, ${clientNames.size} named.`);
  process.exit(0);
}

console.log(`FAIL: ${violations.length} RSC serialization violation(s):\n`);
for (const v of violations) {
  console.log(`  ${v.file}`);
  console.log(`    <${v.component} ${v.prop}={${v.value}}> matches ${v.pattern}`);
  console.log(`    → ${v.component} is a "use client" component; ${v.prop}'s value contains functions.`);
  console.log(`    → Pass only the serializable subset (e.g. ${v.value}.envVars) instead of the whole object.`);
  console.log("");
}
console.log(`See LEARNINGS 2026-05-04 "RSC serialization" for the full pattern.`);
process.exit(1);
