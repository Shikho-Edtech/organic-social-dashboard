// Minimal academic-calendar mirror for the dashboard (SEA-01..05 surface).
//
// Single source of truth on the pipeline side lives in
// `facebook-pipeline/config/exams.yaml` (hard-coded fallback when the
// Knowledge team's external academic-calendar Google Sheet is
// unreachable). The full ~300-event calendar stays pipeline-side; the
// dashboard only needs the macro "next exam" + "current season" signal.
//
// Sprint P7 v4.9 (2026-04-30): updated against academic_calendar source-
// of-truth. Previous values were stale (HSC=2026-05-01 off by ~2 months;
// actual=2026-07-02). Sync rule: when the Knowledge team's sheet is
// updated, update both this file AND `facebook-pipeline/config/exams.yaml`
// in the same commit. The audit POV T1.9 in
// `docs/LIVE_CHECK_POVS.md` enforces the cross-check at every QA pass.
//
// Sprint P7 v4.9 also added `endDate` to support "currently active"
// rendering — when the exam window has already started but isn't over,
// the banner reads "active, ends in N days" rather than skipping to the
// next future exam.
//
// Shape note: dates are ISO "YYYY-MM-DD". Local Asia/Dhaka rendering is
// applied at display time (an exam date has no wall-clock — it's a
// calendar date — so timezone conversion is a no-op).

export type Exam = {
  name: string;          // display name, e.g. "HSC 2026"
  audience: string;      // "HSC" | "SSC" | admission cohort
  date: string;          // ISO "YYYY-MM-DD" — theoretical window start
  endDate?: string;      // ISO "YYYY-MM-DD" — theoretical window end
};

// Keep in sync with facebook-pipeline/config/exams.yaml.
// Theoretical exam windows only (most relevant for student stress
// + audience engagement). Practical / admission live pipeline-side.
export const EXAMS: Exam[] = [
  { name: "SSC 2026", audience: "SSC", date: "2026-04-21", endDate: "2026-05-20" },
  { name: "HSC 2026", audience: "HSC", date: "2026-07-02", endDate: "2026-08-08" },
];

// Season-bucket logic. Mirrors the pipeline's `classify_season_bucket`
// without the admission-activity branch — the dashboard only has exam
// data. Returns "exam" when within the pipeline's 14-day AMEND window
// of an exam start, OR when an exam is currently active. Else "regular".
export type SeasonBucket = "exam" | "regular";

const EXAM_PROXIMITY_DAYS = 14; // matches pipeline AMEND threshold

export function parseExamDate(iso: string): Date | null {
  // ISO dates without a time component are parsed as UTC midnight by
  // Date(); for "days until" math that's fine — we truncate the
  // reference date to UTC midnight too (see daysUntilExam).
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function daysUntilExam(exam: Exam, now: Date = new Date()): number {
  const ex = parseExamDate(exam.date);
  if (!ex) return Infinity;
  const nowMid = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const examMid = ex.getTime();
  return Math.ceil((examMid - nowMid) / (1000 * 60 * 60 * 24));
}

/**
 * Sprint P7 v4.9: also computes days until exam END, not just start.
 * Used to detect "currently active" exams (started but not ended).
 * Returns Infinity if no endDate or invalid.
 */
export function daysUntilExamEnd(exam: Exam, now: Date = new Date()): number {
  if (!exam.endDate) return Infinity;
  const ex = parseExamDate(exam.endDate);
  if (!ex) return Infinity;
  const nowMid = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.ceil((ex.getTime() - nowMid) / (1000 * 60 * 60 * 24));
}

/**
 * Whether `now` falls within `[exam.date, exam.endDate]` inclusive.
 * Use this to render "active, ends in N days" instead of "in N days"
 * when the exam window has already opened.
 */
export function isExamActive(exam: Exam, now: Date = new Date()): boolean {
  const startDays = daysUntilExam(exam, now);
  const endDays = daysUntilExamEnd(exam, now);
  return startDays <= 0 && endDays >= 0;
}

/**
 * Sprint P7 v4.9: return the most relevant exam — currently-active
 * exams take priority, then upcoming exams (sorted by proximity).
 * Returns null when every known exam is in the past — caller should
 * treat that as "no active exam context" and hide the strip.
 */
export function nextExam(now: Date = new Date()): Exam | null {
  // Pass 1: any exam currently active wins immediately.
  for (const e of EXAMS) {
    if (isExamActive(e, now)) return e;
  }
  // Pass 2: soonest upcoming exam.
  let best: Exam | null = null;
  let bestDays = Infinity;
  for (const e of EXAMS) {
    const d = daysUntilExam(e, now);
    if (d > 0 && d < bestDays) {
      best = e;
      bestDays = d;
    }
  }
  return best;
}

/**
 * Current season classification. "exam" when:
 *   - any exam is currently active (window opened, not yet closed), OR
 *   - any upcoming exam is within the 14-day AMEND window
 * "regular" otherwise. Matches pipeline's scorer threshold so
 * /outcomes' exam-confounded verdicts use the same definition.
 */
export function currentSeason(now: Date = new Date()): SeasonBucket {
  const next = nextExam(now);
  if (!next) return "regular";
  if (isExamActive(next, now)) return "exam";
  const days = daysUntilExam(next, now);
  return days >= 0 && days <= EXAM_PROXIMITY_DAYS ? "exam" : "regular";
}
