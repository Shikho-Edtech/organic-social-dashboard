// Minimal academic-calendar mirror for the dashboard (SEA-01..05 surface).
//
// Single source of truth on the pipeline side lives in
// `facebook-pipeline/config/exams.yaml` (hard-coded exam dates used as the
// fallback when the Knowledge team's external academic-calendar Google Sheet
// is unreachable). The full ~300-event calendar stays pipeline-side; the
// dashboard only needs the macro "next exam" + "current season" signal to
// give /plan + /strategy operational context.
//
// When the Knowledge team's calendar changes, update this file AND
// `facebook-pipeline/config/exams.yaml` in the same commit. The audit
// open-item "SEA-01..05 academic calendar UI surface" will graduate to a
// pipeline-persisted Academic_Context tab if / when the dashboard needs the
// richer event list — until then this static mirror is the pragmatic path.
//
// Shape note: dates are ISO "YYYY-MM-DD". Local Asia/Dhaka rendering is
// applied at display time (the exam date has no wall-clock — it's a
// calendar date — so timezone conversion is a no-op).

export type Exam = {
  name: string;          // display name, e.g. "HSC 2026"
  audience: string;      // "HSC" | "SSC" | admission cohort
  date: string;          // ISO "YYYY-MM-DD"
};

// Keep in sync with facebook-pipeline/config/exams.yaml
export const EXAMS: Exam[] = [
  { name: "HSC 2026", audience: "HSC", date: "2026-05-01" },
  { name: "SSC 2026", audience: "SSC", date: "2026-06-15" },
];

// Season-bucket logic. Mirrors the pipeline's `classify_season_bucket`
// without the admission-activity branch — the dashboard only has exam
// data, so admission detection lives pipeline-side. Returns "exam" when
// within the pipeline's 14-day AMEND window, else "regular". Operators who
// need richer buckets should read diagnosis.exam_alert for prose context.
export type SeasonBucket = "exam" | "regular";

const EXAM_PROXIMITY_DAYS = 14; // matches pipeline AMEND threshold

export function parseExamDate(iso: string): Date | null {
  // ISO dates (YYYY-MM-DD) without a time component are parsed as UTC
  // midnight by Date(); for "days until" math that's fine — we truncate
  // the reference date to UTC midnight too (see daysUntilExam).
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function daysUntilExam(exam: Exam, now: Date = new Date()): number {
  const ex = parseExamDate(exam.date);
  if (!ex) return Infinity;
  // Compare at UTC-midnight granularity so "days" is an integer count.
  const nowMid = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const examMid = ex.getTime();
  return Math.ceil((examMid - nowMid) / (1000 * 60 * 60 * 24));
}

/**
 * Returns the soonest upcoming exam (days-until >= 0). Null when every
 * known exam is in the past — the caller should treat that as "no active
 * exam context" and hide the strip.
 */
export function nextExam(now: Date = new Date()): Exam | null {
  let best: Exam | null = null;
  let bestDays = Infinity;
  for (const e of EXAMS) {
    const d = daysUntilExam(e, now);
    if (d >= 0 && d < bestDays) {
      best = e;
      bestDays = d;
    }
  }
  return best;
}

/**
 * Current season classification. "exam" when any known exam is within the
 * 14-day AMEND window; "regular" otherwise. Matches the pipeline's scorer
 * threshold so /outcomes' exam-confounded verdicts and the dashboard's
 * season pill use the same definition.
 */
export function currentSeason(now: Date = new Date()): SeasonBucket {
  const next = nextExam(now);
  if (!next) return "regular";
  const days = daysUntilExam(next, now);
  return days <= EXAM_PROXIMITY_DAYS ? "exam" : "regular";
}
