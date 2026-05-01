// SEA-01..05 academic calendar UI surface (Sprint P6 audit open-item #3).
//
// Thin strip rendered above the PageHeader on /plan and /strategy. Gives
// operators the macro "are we in exam season?" signal + a countdown to the
// next known exam, without pulling the full ~300-event academic calendar
// onto the dashboard.
//
// Data source is `lib/exams.ts` — a static mirror of the pipeline's
// `facebook-pipeline/config/exams.yaml`. The 14-day proximity threshold
// matches the pipeline's AMEND scorer so /outcomes' exam-confounded
// verdicts and this strip use the same "exam" vs "regular" definition.
//
// Hidden when there's no future exam (component returns null) — we don't
// want a stale "last exam was X days ago" surface cluttering the page.

import { currentSeason, daysUntilExam, daysUntilExamEnd, isExamActive, nextExam } from "@/lib/exams";

type Tone = "exam" | "regular";

function seasonPillClasses(tone: Tone): string {
  // Shikho v1.0 tokens only. Sunrise (warmth/urgency) for exam proximity,
  // ink/indigo neutral for regular — enough contrast to read the season at
  // a glance without screaming for attention when nothing's going on.
  if (tone === "exam") {
    return "bg-shikho-sunrise-50 text-shikho-sunrise-800 ring-1 ring-shikho-sunrise-200";
  }
  return "bg-shikho-indigo-50 text-shikho-indigo-800 ring-1 ring-shikho-indigo-100";
}

function countdownWord(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

/**
 * Sprint P7 v4.9 (2026-04-30): "ends in N days" helper for exams that
 * are currently active (already started but not yet over).
 */
function endingWord(daysToEnd: number): string {
  if (daysToEnd <= 0) return "ending today";
  if (daysToEnd === 1) return "ends in 1 day";
  return `ends in ${daysToEnd} days`;
}

export default function AcademicContextStrip({
  now = new Date(),
}: {
  /** Injectable clock — defaults to real time. Tests / previews can pin a date. */
  now?: Date;
}) {
  const next = nextExam(now);
  if (!next) return null;

  // Sprint P7 v4.9: distinguish "currently active" exam from "upcoming"
  // exam. Previously we always rendered "in N days" — but if the exam
  // window had already opened (e.g. SSC theoretical Apr 21-May 20 with
  // today=Apr 30), days would be negative and `nextExam` would skip to
  // the far-future HSC. Now active exams take priority + render with
  // "active, ends in N days" framing.
  const active = isExamActive(next, now);
  const days = daysUntilExam(next, now);
  const daysToEnd = daysUntilExamEnd(next, now);
  const season = currentSeason(now);
  const tone: Tone = season === "exam" ? "exam" : "regular";

  const seasonLabel = tone === "exam" ? "Exam season" : "Regular season";
  const pillClasses = seasonPillClasses(tone);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 flex flex-col gap-2 rounded-lg border border-ink-100 bg-ink-paper px-3 py-2 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${pillClasses}`}
        >
          {seasonLabel}
        </span>
        <span className="text-ink-muted truncate">
          {active
            ? "Exam window is active — students are mid-exam, content load shifts hard toward last-minute help."
            : tone === "exam"
              ? "Within the 14-day AMEND window — expect demand to shift."
              : "No exam within the 14-day window."}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 text-ink-secondary sm:flex-shrink-0">
        <span className="text-ink-muted">{active ? "Active:" : "Next exam:"}</span>
        <span className="font-semibold text-ink-primary break-words">{next.name}</span>
        <span className="text-ink-muted">·</span>
        <span className="font-medium text-brand-shikho-indigo">
          {active ? endingWord(daysToEnd) : countdownWord(days)}
        </span>
      </div>
    </div>
  );
}
