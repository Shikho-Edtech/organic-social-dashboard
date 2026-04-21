// Stage-0 item 9 (Apr 2026): canonical entity dictionary — dashboard side.
//
// Mirror of `facebook-pipeline/src/entities.py`. The pipeline canonicalizes
// spotlight_name at write-time, but historical rows written before this
// landed are NOT canonicalized yet — this module canonicalizes at read-time
// so "Top entity" aggregations on the dashboard show one row per entity
// even during the migration window.
//
// Keep in sync with the Python module. When you add a new teacher/product/
// campaign, edit BOTH files in the same commit. They're not generated from
// a shared source because the project has no build step that could do so
// cheaply, and the list is short enough that manual sync is fine.

const CANONICAL_ALIASES: Record<string, string[]> = {
  // TEACHERS
  "Hironmoy Bhaiya - Bangla": [
    "hironmoy bhaiya", "hironmoy bhai", "hironmoy sir", "hironmoy",
    "হিরন্ময় ভাইয়া", "হিরন্ময় ভাই",
  ],
  "Naeem Bhaiya - Math": [
    "naeem bhaiya", "naeem bhai", "naeem sir", "naeem",
    "নাঈম ভাইয়া", "নাঈম ভাই",
  ],
  "Arnab Bhaiya": [
    "arnab bhai", "arnab sir", "arnab",
    "অর্ণব ভাইয়া", "অর্ণব ভাই",
  ],
  "Tasfikal Sami Bhaiya - English": [
    "tasfikal sami bhaiya", "tasfikal sami", "sami bhaiya", "sami bhai",
    "তাসফিকাল সামি ভাইয়া", "সামি ভাইয়া",
  ],

  // PRODUCTS
  "Shikho AI": [
    "shikho ai", "shikhoai", "shikho-ai", "শিক্ষো এআই", "shikho a.i.",
  ],
  "Shikho App": [
    "shikho app", "the shikho app", "shikho application",
    "শিক্ষো অ্যাপ", "শিক্ষো অ্যাপ্লিকেশন",
  ],
  "Shikho Premium": [
    "shikho premium", "premium", "শিক্ষো প্রিমিয়াম",
  ],
  "FutureBook": [
    "futurebook", "future book", "future-book", "ফিউচারবুক",
  ],
  "Rescue Revision": [
    "rescue revision", "rescue-revision", "rescue",
    "রেসকিউ রিভিশন", "রেসকিউ",
  ],
  "Super Suggestion": [
    "super suggestion", "super suggestions", "সুপার সাজেশন",
  ],
  "Admission Program": [
    "admission program", "admission course", "admission prep",
    "pre-dhaka admission", "pre-dhaka", "pre dhaka",
    "du admission", "du admission prep", "varsity admission",
    "unit admission",
    "অ্যাডমিশন প্রোগ্রাম", "অ্যাডমিশন কোর্স",
  ],
  "School Program": [
    "school program", "school-program", "স্কুল প্রোগ্রাম",
  ],

  // CAMPAIGNS
  "Eid Salami": [
    "eid salami", "eid salamee", "eid-salami", "ঈদ সালামি",
  ],
  "Pohela Boishakh": [
    "pohela boishakh", "pohela boishak", "pahela baishakh",
    "পহেলা বৈশাখ", "নববর্ষ",
  ],

  // PROGRAMS
  "Shikho Ambassador Program": [
    "shikho ambassador", "ambassador program", "shikho ambassadors",
    "শিক্ষো অ্যাম্বাসাডর",
  ],
  "Shikho Scholarship Program": [
    "shikho scholarship", "scholarship program", "shikho scholarships",
    "শিক্ষো স্কলারশিপ", "স্কলারশিপ প্রোগ্রাম",
  ],
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Build the flat alias -> canonical index at module load.
const ALIAS_INDEX: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(CANONICAL_ALIASES)) {
    out[norm(canonical)] = canonical;
    for (const a of aliases) out[norm(a)] = canonical;
  }
  return out;
})();

/**
 * Return the canonical entity name for `name`, or `name` unchanged if no
 * alias match. Mirrors the contract of `src/entities.py::canonicalize`.
 */
export function canonicalizeEntity(name: string | null | undefined): string {
  if (!name) return "";
  const key = norm(name);
  if (!key) return name;
  return ALIAS_INDEX[key] ?? name;
}
