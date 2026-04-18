// Skeleton shell shown during Server Component data fetches (getPosts,
// getLatestDiagnosis, getRunStatus, getCalendar, etc.). Next.js App Router
// streams this until the async page renders. Matches the common page shape:
// header → KPI grid → chart block(s).
//
// Why this exists: without a loading boundary, navigating between pages
// showed the previous page's content with no visible state, then snapped
// into the new page after the sheet fetch resolved. Users on slower
// connections couldn't tell if their tap registered.
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* PageHeader skeleton */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="h-7 w-48 rounded bg-slate-200" />
          <div className="mt-2 h-4 w-64 max-w-full rounded bg-slate-200/70" />
        </div>
        <div className="flex flex-col items-end gap-2 self-end sm:self-auto">
          <div className="h-8 w-40 rounded-lg bg-slate-200" />
          <div className="h-3 w-28 rounded bg-slate-200/70" />
        </div>
      </div>

      {/* KPI strip skeleton (5-up on desktop, 2-up on mobile) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white border border-slate-200 p-5">
            <div className="h-2.5 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-24 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-16 rounded bg-slate-200/70" />
          </div>
        ))}
      </div>

      {/* Chart block skeletons */}
      <div className="grid lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white border border-slate-200 p-6">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-56 max-w-full rounded bg-slate-200/70" />
            <div className="mt-5 h-48 rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
