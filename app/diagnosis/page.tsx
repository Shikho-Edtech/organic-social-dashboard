import { getPosts, getLatestDiagnosis, getDiagnosisByWeek, getDiagnosisByWeekPreferred, getRunStatus, computeStaleness, getStageEngine, getPlanNarrative } from "@/lib/sheets";
import { totalReach, totalQualityEngagement, totalShares, totalComments, wowDelta, formatWowDelta, deltaColorClass } from "@/lib/qualityEngagement";
import { bdt as bdtParse, dateStr as dateIso } from "@/lib/aggregate";
import WeekSelector, { computeWeekEndings, weekRange } from "@/components/WeekSelector";
// Sprint P7 v4.18 (2026-05-02): RegenerateThisWeekButton removed from
// dashboard surfaces. Operator-side regeneration belongs in the SaaS
// admin layer, not in a shared user dashboard. Returns when the
// multi-tenant rollout adds access controls.
import { filterPosts } from "@/lib/aggregate";
import { resolveRange } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import StalenessBanner from "@/components/StalenessBanner";
import AIDisabledEmptyState from "@/components/AIDisabledEmptyState";
import ArchivalLine from "@/components/ArchivalLine";
import AcademicContextStrip from "@/components/AcademicContextStrip";
import PostReference from "@/components/PostReference";
import { STAGES } from "@/lib/stages";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Day 2T: full user-perspective rethink.
//
// Mental model on landing: "what happened this week, and what do I do
// about it?" Users should skim in seconds, then dig only where something
// catches their eye. Previous passes still showed 2-3 stacked text
// blocks per card — bold headlines, then body paragraphs, then boxed
// callouts. Too much reading upfront.
//
// This version: every card collapsed by default with ONE visible line
// (line-clamp-1 on the headline). Click to reveal structure — labeled
// sub-sections, colored metric accents, callouts. Typography softened:
// headlines are text-slate-700 font-medium at rest, never font-semibold.
// Numbers inside headlines get pulled out into coloured inline pills so
// the eye lands on the signal, not the prose.

// Extract the first meaningful unit from a long sentence. Prefer the
// first clause (ends with ";"), then the first sentence (ends with ".")
// capped at ~80 chars, then fall back to a word-boundary cut.
function splitHeadline(text: string): { head: string; body: string } {
  if (!text) return { head: "", body: "" };
  const t = text.trim();
  // Semicolon takes precedence — it's usually the summary + evidence split.
  const semi = t.indexOf("; ");
  if (semi !== -1 && semi <= 120) {
    return { head: t.slice(0, semi).trim(), body: t.slice(semi + 2).trim() };
  }
  // First period, but only if short enough to be a real headline.
  const period = t.search(/\.\s+/);
  if (period !== -1 && period <= 100) {
    return { head: t.slice(0, period + 1).trim(), body: t.slice(period + 2).trim() };
  }
  // Too long — cut at a word boundary near 80 chars.
  if (t.length > 90) {
    const cut = t.slice(0, 80);
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 40) {
      return { head: t.slice(0, lastSpace).trim() + "…", body: t.trim() };
    }
  }
  return { head: t, body: "" };
}

// Pull numeric/percent/currency tokens out of a headline so they can be
// rendered as coloured inline pills. Returns segments in order.
type Segment = { kind: "text" | "metric"; value: string };
function extractMetrics(text: string): Segment[] {
  if (!text) return [];
  // Match percentages, multipliers (2.3x), integers with units (1,200 reach),
  // or bare numbers > 9.
  const regex = /(\d+(?:[.,]\d+)*%|\d+(?:\.\d+)?x|\d{2,}(?:[.,]\d+)*)/gi;
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", value: text.slice(last, m.index) });
    }
    segments.push({ kind: "metric", value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", value: text.slice(last) });
  return segments.length ? segments : [{ kind: "text", value: text }];
}

// Step 3: map a "Last Successful Diagnosis At" ISO timestamp to the
// corresponding Weekly_Analysis row's `Week Ending` key. Pragmatic rule:
// the weekly pipeline fires on Mondays and writes a row whose Week Ending
// is the preceding Sunday (YYYY-MM-DD). We walk back from the success
// timestamp to the nearest Sunday. This only needs to be approximate — the
// `getDiagnosisByWeek` lookup then does an exact-match find against the
// actual row values, and falls back cleanly when it doesn't match.
function extractWeekEnding(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dow = d.getUTCDay(); // 0=Sun
  const back = dow === 0 ? 0 : dow;
  const sunday = new Date(d.getTime() - back * 86400000);
  return sunday.toISOString().slice(0, 10);
}

function HeadlineWithMetrics({ text, metricClass }: { text: string; metricClass: string }) {
  // Sprint P7 v4.14b: capitalize first letter of headline before extraction
  // so "the pillar suffered..." renders as "The pillar suffered..." while
  // metric segmentation still highlights "53.0%" / "p=0.25" inline.
  const polished = text ? (
    /^[a-z]/.test(text.trim())
      ? text.trim().charAt(0).toUpperCase() + text.trim().slice(1)
      : text.trim()
  ) : "";
  const segments = extractMetrics(polished);
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "metric" ? (
          <span key={i} className={`font-semibold ${metricClass}`}>{s.value}</span>
        ) : (
          <span key={i}>{s.value}</span>
        )
      )}
    </>
  );
}

// Bucket P6F (2026-04-28): what_happened + watch_outs item normalizer.
// Cross-repo data shape evolution — three shapes exist in the wild:
//   1. legacy AI path: list[str]                                    ("Live Class reach plummeted...")
//   2. new AI path:    list[{text, source_post_ids}]                (post-prompt-v1.7)
//   3. native path:    list[{detail | summary | text, source_post_ids, ...}]
// All three normalize to {text, source_post_ids} with backward-compat
// fallbacks. When source_post_ids[0] resolves in postById, the strategy
// page renders an iconOnly PostReference next to the headline.
type NormalizedFinding = { text: string; source_post_ids: string[] };

// Sprint P7 v4.14b (2026-05-02): polishCopy fixes the most common AI
// prose hygiene issues: lowercase first letter ("the pillar suffered the
// largest..." → "The pillar suffered the largest..."), missing terminal
// punctuation ("the format secured an 8,732.6 mean reach" → "...mean
// reach."), and stray double-spaces. This is a UI band-aid; the real
// fix is a stricter copy contract in the diagnosis prompt. Applied on
// every diagnosis-body render path so all 4 box types (Key Findings,
// Top, Under, Watch-outs) get the same treatment uniformly.
function polishCopy(s: string): string {
  if (!s) return "";
  let out = s.replace(/\s+/g, " ").trim();
  if (!out) return "";
  // Capitalize first letter (skip if already uppercase, number, or non-alpha)
  if (/^[a-z]/.test(out)) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  // Append period if missing terminal punctuation
  if (!/[.!?…]$/.test(out)) {
    out = out + ".";
  }
  return out;
}

function normalizeFinding(item: any): NormalizedFinding {
  if (typeof item === "string") {
    return { text: item, source_post_ids: [] };
  }
  if (item && typeof item === "object") {
    // Field priority: text (new AI prompt) > detail (native watchouts)
    // > summary (native legacy what_happened) > best-effort string coerce.
    const text =
      (typeof item.text === "string" && item.text) ||
      (typeof item.detail === "string" && item.detail) ||
      (typeof item.summary === "string" && item.summary) ||
      "";
    const ids = Array.isArray(item.source_post_ids)
      ? item.source_post_ids.filter((x: any) => typeof x === "string" && x).slice(0, 5)
      : [];
    return { text, source_post_ids: ids };
  }
  return { text: "", source_post_ids: [] };
}

export default async function DiagnosisPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);

  // Sprint P7 Phase 2 (2026-04-28): week selector wires up two views:
  //   - This week → midweek-preferred row for the running week (mid-week
  //     diagnosis runs Thursday morning; before then, "This week" falls
  //     back to a placeholder card encouraging the user to wait/check
  //     "Last week").
  //   - Last week → end-of-week row for the just-finished Mon-Sun
  //     (this is the "Weekly verdict" people are used to).
  // ?week=this | last | YYYY-MM-DD. Default = "this".
  const weekParam = typeof searchParams.week === "string" ? searchParams.week : "";
  const { this_: thisWeekEnding, last: lastWeekEnding } = computeWeekEndings();
  const isThisWeekView = !weekParam || weekParam === "this" || weekParam === thisWeekEnding;
  const isLastWeekView = weekParam === "last" || weekParam === lastWeekEnding;
  const targetWeek = isThisWeekView ? thisWeekEnding : isLastWeekView ? lastWeekEnding : weekParam;

  // Step 3 archival mode: `?archived=<week-ending>` switches the page into
  // read-only mode against a specific prior diagnosis row. Absent param =
  // live mode (current behaviour). Invalid key = live mode + silent fallback.
  const archivedParam = typeof searchParams.archived === "string" ? searchParams.archived : "";
  const isArchival = Boolean(archivedParam);

  // Sprint P7 Phase 2: when a week selector value is present, fetch the
  // preferred row for that week (mid-week-preferred for "This week",
  // end-of-week-preferred for "Last week"). Falls back to the latest
  // row when nothing matches the target week (e.g. before mid-week
  // cron has run on a Tuesday).
  const weekScopedDiagnosisP =
    isArchival || !targetWeek
      ? Promise.resolve(null as Awaited<ReturnType<typeof getDiagnosisByWeekPreferred>>)
      : getDiagnosisByWeekPreferred(
          targetWeek,
          isThisWeekView ? "midweek" : "full",
        );

  const [posts, liveDiagnosis, archivedDiagnosis, weekDiagnosis, runStatus, diagnosisEngine, planNarrative] = await Promise.all([
    getPosts(),
    isArchival ? Promise.resolve(null) : getLatestDiagnosis(),
    isArchival ? getDiagnosisByWeek(archivedParam) : Promise.resolve(null),
    weekScopedDiagnosisP,
    getRunStatus(),
    getStageEngine("diagnosis"),
    // Sprint P7 v4.13 (2026-05-01): pull the active week's hypotheses map
    // so the diagnosis page can surface the H1/H2 chips beside the verdict.
    // Same scope as the diagnosis row → tooltip statement matches the week
    // being diagnosed.
    !isArchival && targetWeek ? getPlanNarrative(targetWeek) : Promise.resolve(null),
  ]);
  // Diagnosis row priority: archival → week-scoped (when selector active)
  // → latest. weekDiagnosis is null when isArchival is true OR no row
  // exists for the target week. The "no This-week mid-week row yet"
  // case (Tuesday morning, mid-week cron hasn't fired) renders an
  // appropriate placeholder via the existing empty-state path.
  const diagnosis = isArchival
    ? archivedDiagnosis
    : (weekDiagnosis || (isThisWeekView ? null : liveDiagnosis));
  const staleness = computeStaleness("diagnosis", runStatus);
  const aiDisabled = diagnosisEngine === "native" || diagnosisEngine === "off";
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Funnel distribution / engagement charts moved to /engagement (Sprint P6
  // user feedback: Strategy should focus on the weekly verdict + performers,
  // not volume/rate bars that fit better alongside the other Engagement
  // breakdowns).

  // Post lookup — lets us surface PostReference (caption + permalink popover)
  // next to each top / under performer when the diagnosis carries source
  // post IDs. Falls through cleanly when findings.py emitted without the
  // source_post_ids field on a given row.
  const postById = new Map<string, { message?: string; permalink_url?: string }>();
  for (const p of posts) {
    postById.set(p.id, { message: p.message, permalink_url: p.permalink_url });
  }

  // Normalize what_happened + watch_outs to a uniform shape so the render
  // path works against legacy list[str] rows AND new list[{text,
  // source_post_ids}] rows once the pipeline ships its v1.7 prompt.
  const whatHappened: NormalizedFinding[] = (diagnosis?.what_happened || []).map(normalizeFinding);
  const topPerformers = diagnosis?.top_performers || [];
  const underperformers = diagnosis?.underperformers || [];
  const watchOuts: NormalizedFinding[] = (diagnosis?.watch_outs || []).map(normalizeFinding);

  // Sprint P7 v4.14b (2026-05-02): consistent source-post-references
  // across all boxes. Some AI-emitted findings carry source_post_ids,
  // others don't — user feedback was "this same philosophy was not
  // applied to all boxes." Build a diagnosis-level fallback set: take
  // the top-N posts that the diagnosis cited via top_performers /
  // underperformers, and use those as the fallback for any item with
  // empty source_post_ids. Ensures every box has at least one
  // hyperlinkable post even when the AI's per-finding citation is
  // missing. The fallback is ordered by relevance so the closest-tied
  // post comes first.
  const fallbackSourcePostIds: string[] = (() => {
    const ids = new Set<string>();
    const collect = (item: any) => {
      if (Array.isArray(item?.source_post_ids)) {
        for (const id of item.source_post_ids) {
          if (typeof id === "string" && id) ids.add(id);
        }
      }
      if (typeof item?.post_id === "string" && item.post_id) ids.add(item.post_id);
    };
    topPerformers.slice(0, 3).forEach(collect);
    underperformers.slice(0, 3).forEach(collect);
    return Array.from(ids).slice(0, 3);
  })();
  const resolveSourcePosts = (own: string[]): string[] => {
    if (own && own.length > 0) return own;
    return fallbackSourcePostIds;
  };

  const verdictSplit = splitHeadline(diagnosis?.headline || "");

  // Archival vs live copy: the page header subtitle + banner suppression.
  // When viewing an archive, the banner is replaced by the persistent slate
  // ArchivalLine — it's a read-only snapshot, the live-freshness banner
  // would be misleading here.
  //
  // archiveDateLabel is "" when we don't have a resolvable week-ending (e.g.
  // user passed `?archived=true` without a date key, or the archive row isn't
  // in Weekly_Analysis yet). Empty string is the explicit signal for callers
  // to render the no-date variant of the copy — never leak the raw param
  // (which produced "week ending true" in the earlier build).
  const archiveDateLabel = isArchival && diagnosis?.week_ending
    ? weekRange(diagnosis.week_ending)
    : "";

  // When the AI diagnosis stage is deliberately off AND we're NOT in archival
  // read mode, the primary view is the empty-state card. The regular
  // diagnosis blocks (verdict, key findings, top/under, watch-outs) are
  // suppressed; only the funnel charts render beneath — they read native
  // classifier data that's always fresh.
  if (aiDisabled && !isArchival) {
    return (
      <div>
        <StalenessBanner
          info={staleness}
          artifact="diagnosis"
          runStatus={runStatus}
          aiDisabled
          hasData={!!diagnosis}
        />
        <AcademicContextStrip />
        <PageHeader
          title="Diagnosis"
          subtitle="Claude's diagnosis and recommended actions"
          dateLabel={`${range.label} · AI diagnosis off`}
          lastScrapedAt={runStatus.last_run_at}
        />
        <AIDisabledEmptyState
          stage={STAGES.diagnosis}
          lastSuccessfulAt={runStatus.last_successful_diagnosis_at}
          archiveKey={runStatus.last_successful_diagnosis_at
            ? extractWeekEnding(runStatus.last_successful_diagnosis_at)
            : ""}
          noun="AI diagnosis"
          readsDescription="This page reads the weekly AI diagnosis. Funnel-stage distribution + engagement charts have moved to /engagement."
        />
      </div>
    );
  }

  return (
    <div className={isArchival ? "opacity-[0.97] [filter:saturate(0.9)]" : ""}>
      {isArchival ? (
        <ArchivalLine archiveDateLabel={archiveDateLabel} livePath="/diagnosis" />
      ) : (
        <StalenessBanner
          info={staleness}
          artifact="diagnosis"
          runStatus={runStatus}
          hasData={!!diagnosis}
        />
      )}
      <AcademicContextStrip />
      <PageHeader
        title="Diagnosis"
        subtitle={isArchival
          ? (archiveDateLabel
              ? `Archived diagnosis for week ending ${archiveDateLabel}`
              : "Archived diagnosis")
          : (isThisWeekView
              ? "This week's diagnosis (mid-week, refreshes Thursday)"
              : "Last week's verdict")}
        dateLabel={`${range.label} · ${isArchival ? "archived snapshot" : (isThisWeekView ? "this week" : "last week")}`}
        lastScrapedAt={runStatus.last_run_at}
      />

      {/* Sprint P7 Phase 2: week selector for Diagnosis. Hidden in
          archival mode — that path uses the older ArchivalLine UI. */}
      {!isArchival && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
          <WeekSelector
            basePath="/diagnosis"
            current={weekParam}
            choices={["this", "last"]}
            preserve={searchParams}
          />
          {/* RegenerateThisWeekButton removed in v4.18 — admin-only. */}
        </div>
      )}

      {/* Sprint P7 Phase 2: "Preliminary, mid-week (Thu)" pill on
          this-week views when the diagnosis row was generated by the
          mid-week cron. Tells the user this is partial-week data. */}
      {!isArchival && isThisWeekView && diagnosis?.engine === "ai-midweek" && (
        <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-amber/10 border border-brand-amber/30 text-brand-amber text-xs font-semibold">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Preliminary, mid-week (Thu)
          {diagnosis.generated_at && (
            <span className="text-brand-amber/70 font-normal">
              · {new Date(diagnosis.generated_at).toLocaleString("en-US", {
                timeZone: "Asia/Dhaka",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })} BDT
            </span>
          )}
        </div>
      )}

      {/* Sprint P7 Phase 2: empty state for "This week" view before the
          mid-week cron runs (Mon-Wed mornings). Tells the user to come
          back Thursday or check Last week. */}
      {!isArchival && isThisWeekView && !diagnosis && (
        <div className="mb-6 rounded-xl border border-ink-100 bg-ink-paper p-6 sm:p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-shikho-indigo-50 text-brand-shikho-indigo mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <h3 className="text-base font-semibold text-ink-primary mb-1.5">
            This week&apos;s diagnosis runs Thursday morning
          </h3>
          <p className="text-sm text-ink-muted leading-relaxed max-w-md mx-auto">
            The mid-week diagnosis cron fires Thursday at 10:00 BDT, covering
            Mon–Wed of this running week. Until then, switch to{" "}
            <span className="font-semibold">Last week</span> for the most recent
            completed verdict.
          </p>
        </div>
      )}

      {/* Sprint P6: Weekly verdict — clean readable statement.
          Previous version used a splitHeadline helper that chopped the
          verdict on the first ";" or "." and hid the body behind a
          disclosure. The result: users saw a bold, incomplete line and
          had to click to read the rest. That was design posturing over
          readability.
          New version: one paragraph, no splitting, calendar alert
          rendered inline below if present. Eyebrow pill retained so the
          section is still identifiable. */}
      {diagnosis?.headline && (
        <div className="mb-6 relative overflow-hidden rounded-xl border border-shikho-indigo-100 bg-gradient-to-br from-shikho-indigo-50/40 via-ink-paper to-ink-paper p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
          {/* Sprint P7 v4.14 (2026-05-01): visual polish — gradient band on
              left edge frames the verdict as the page's "lead headline."
              No data changes; pure presentation. */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-brand-shikho-indigo via-brand-shikho-magenta to-brand-shikho-coral" aria-hidden="true"></div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand-shikho-indigo text-white shadow-sm">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              Weekly verdict
            </span>
            <span className="text-[11px] text-ink-muted font-medium">
              {diagnosis.week_ending ? `Mon–Sun BDT · ${weekRange(diagnosis.week_ending)}` : "latest weekly run"}
            </span>
            {/* Sprint P7 v4.13 (2026-05-01): hypothesis chips for the
                diagnosed week. Tooltip on each chip surfaces the actual
                statement that the week was pursuing — pulled from
                Plan_Narrative.hypotheses_map for the same Mon-anchor.
                Empty list when this week predates the v4.11 migration. */}
            {(() => {
              const ids = (planNarrative?.hypothesis_list || "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const map = planNarrative?.hypotheses_map || {};
              if (ids.length === 0) return null;
              return (
                <div className="flex items-center gap-1 flex-wrap">
                  {ids.map((id) => {
                    const text = map[id];
                    const tip = text
                      ? `${id.toUpperCase()}: ${text}`
                      : `${id.toUpperCase()} — hypothesis statement not yet resolved (older week or status-quo).`;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-brand-shikho-indigo/10 text-brand-shikho-indigo rounded px-1.5 py-0.5 cursor-help"
                        title={tip}
                      >
                        {id}
                      </span>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <p className="text-[16px] sm:text-[17px] text-ink-primary leading-relaxed font-medium">
            {diagnosis.headline}
          </p>
          {/* Sprint P7 v4.16 (2026-05-02): dual-metric strip — Reach +
              Quality Engagement displayed in parallel for the diagnosed
              week. Q2 finisher per DECISIONS 2026-05-02. Both numbers
              shown with WoW delta vs prior week (same Mon-Sun length).
              No anchor declared — Reach is the current scoring metric;
              QE is a candidate north-star. After 4-8 weeks of
              North_Star_Trace data we pick the winner. Until then the
              dashboard surfaces both honestly. */}
          {diagnosis.week_ending && (() => {
            try {
              const wkStart = new Date(`${diagnosis.week_ending}T00:00:00`);
              if (isNaN(wkStart.getTime())) return null;
              const wkEnd = new Date(wkStart);
              wkEnd.setDate(wkEnd.getDate() + 7);
              const priorStart = new Date(wkStart);
              priorStart.setDate(priorStart.getDate() - 7);
              const inWeek = (p: any) => {
                if (!p.created_time) return false;
                const d = bdtParse(p.created_time);
                return d >= wkStart && d < wkEnd;
              };
              const inPriorWeek = (p: any) => {
                if (!p.created_time) return false;
                const d = bdtParse(p.created_time);
                return d >= priorStart && d < wkStart;
              };
              const weekPosts = posts.filter(inWeek);
              const priorPosts = posts.filter(inPriorWeek);
              if (weekPosts.length === 0) return null;
              const reach = totalReach(weekPosts);
              const priorReach = totalReach(priorPosts);
              const qe = totalQualityEngagement(weekPosts);
              const priorQe = totalQualityEngagement(priorPosts);
              const reachDelta = wowDelta(reach, priorReach);
              const qeDelta = wowDelta(qe, priorQe);
              const sharesN = totalShares(weekPosts);
              const commentsN = totalComments(weekPosts);
              const fmtCompact = (n: number) => {
                if (!Number.isFinite(n) || n === 0) return "0";
                if (Math.abs(n) < 1000) return String(Math.round(n));
                if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}K`;
                return `${(n / 1_000_000).toFixed(1)}M`;
              };
              return (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-shikho-indigo-100/60">
                  <div className="rounded-md border border-ink-100 bg-ink-paper px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
                      Reach <span className="normal-case font-normal">(scoring anchor)</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-lg font-bold text-brand-shikho-indigo tabular-nums">
                        {fmtCompact(reach)}
                      </span>
                      <span className="text-[10px] text-ink-muted font-normal">unique</span>
                      <span className={`ml-auto text-[11px] font-semibold ${deltaColorClass(reachDelta)}`}>
                        {formatWowDelta(reachDelta)} WoW
                      </span>
                    </div>
                  </div>
                  <div className="rounded-md border border-shikho-indigo-100 bg-gradient-to-br from-shikho-indigo-50/30 to-ink-paper px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
                      Quality Engagement <span className="normal-case font-normal">candidate</span>
                    </div>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-lg font-bold text-brand-shikho-magenta tabular-nums">
                        {fmtCompact(qe)}
                      </span>
                      <span className="text-[10px] text-ink-muted font-normal">{sharesN}s + {commentsN}c</span>
                      <span className={`ml-auto text-[11px] font-semibold ${deltaColorClass(qeDelta)}`}>
                        {formatWowDelta(qeDelta)} WoW
                      </span>
                    </div>
                  </div>
                </div>
              );
            } catch {
              return null;
            }
          })()}
          {/* Quick-stat strip: posts + avg engagement at a glance */}
          {(diagnosis.posts_this_week || diagnosis.avg_engagement) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 border-t border-shikho-indigo-100/60">
              {diagnosis.posts_this_week ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-brand-shikho-indigo tabular-nums">{diagnosis.posts_this_week}</span>
                  <span className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold">posts</span>
                </div>
              ) : null}
              {diagnosis.avg_engagement ? (() => {
                // The pipeline can write avg_engagement in EITHER form:
                //   - decimal fraction: 0.0243 (= 2.43%)
                //   - already-percentage: 2.43 (= 2.43%)
                // Detect: anything ≤ 1 we treat as a fraction; anything > 1
                //   we treat as already-percentage. Then clamp to ≤ 100
                //   because a 243% engagement rate is nonsense — produced by
                //   the pipeline writing 2.43 and the dashboard multiplying
                //   by 100 again. This guard makes the display honest until
                //   we standardize the wire format.
                const raw = Number(diagnosis.avg_engagement);
                const pct = raw <= 1 ? raw * 100 : raw;
                const safe = Math.min(pct, 100);
                return (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-brand-shikho-magenta tabular-nums">
                      {safe.toFixed(2)}%
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-ink-muted font-semibold">avg engagement</span>
                  </div>
                );
              })() : null}
              {diagnosis.engine && (
                <div className="ml-auto text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
                  Engine · {diagnosis.engine}
                </div>
              )}
            </div>
          )}
          {/* Sprint P7 v4.7 (2026-04-30, P2.23): Calendar Alert visual
              tone now adapts to the diagnosis engine. End-of-week (Monday)
              verdict gets the original coral box (definitive). Mid-week
              (Thursday) verdict gets an amber box (preliminary) so the
              visual matches the "Preliminary, mid-week" pill above and
              doesn't overstate certainty on partial-week data. */}
          {diagnosis.exam_alert && (() => {
            const isMidweek = diagnosis.engine === "ai-midweek";
            const wrapClass = isMidweek
              ? "mt-3 flex items-start gap-2 bg-brand-amber/5 border border-brand-amber/30 rounded-md p-3"
              : "mt-3 flex items-start gap-2 bg-brand-shikho-coral/5 border border-brand-shikho-coral/20 rounded-md p-3";
            const iconClass = isMidweek
              ? "flex-shrink-0 mt-0.5 text-brand-amber"
              : "flex-shrink-0 mt-0.5 text-brand-shikho-coral";
            const textClass = isMidweek
              ? "text-xs text-brand-amber leading-relaxed"
              : "text-xs text-brand-shikho-coral leading-relaxed";
            return (
              <div className={wrapClass}>
                <span className={iconClass}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </span>
                <div className={textClass}>
                  <span className="font-semibold uppercase tracking-wider text-[11px]">
                    Calendar alert{isMidweek ? " (mid-week, preliminary)" : ""} ·{" "}
                  </span>
                  {diagnosis.exam_alert}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Funnel distribution / engagement charts moved to /engagement
          (Sprint P6 user feedback — Strategy focuses on the AI verdict
          + performer lists; funnel mix lives with the other engagement
          breakdowns). */}

      {/* Key findings */}
      {whatHappened.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-shikho-indigo text-white flex items-center justify-center shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-ink-primary">Key Findings</h3>
            <span className="inline-flex items-center text-[11px] font-bold text-brand-cyan bg-brand-cyan/10 px-2 py-0.5 rounded-full">
              {whatHappened.length}
            </span>
            <span className="text-[11px] text-ink-muted uppercase tracking-wider hidden sm:inline">click any to expand</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {whatHappened.map((item, i) => {
              const { head, body } = splitHeadline(item.text);
              // Sprint P7 v4.14b: consistent source-post references —
              // when the finding has no own ids, use diagnosis-level
              // fallback so every box has hyperlinkable posts.
              const effectiveSourceIds = resolveSourcePosts(item.source_post_ids);
              const primarySrc = effectiveSourceIds.length > 0
                ? postById.get(effectiveSourceIds[0])
                : undefined;
              const hasDetail = Boolean(body);
              // Sprint P7 v4.7 (2026-04-30, P1.7): auto-expand the first
              // (highest-priority) Key Finding so the user sees one
              // actionable detail above the fold without clicking. Pass
              // 2 audit caught that 4 collapsed Key Findings + 1 Top
              // Performer + 1 Underperformer + 2 Watch-outs = 8 cards
              // to expand. Auto-expanding #1 cuts the click cost while
              // keeping the rest collapsed for scanability.
              return (
                <details key={i} open={i === 0} className="group bg-ink-paper border border-ink-100 rounded-xl shadow-sm hover:shadow-md hover:border-brand-cyan/50 hover:-translate-y-0.5 transition-all duration-200">
                  <summary className="list-none cursor-pointer p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-brand-cyan/15 to-brand-cyan/5 text-brand-cyan font-bold text-xs flex items-center justify-center ring-1 ring-brand-cyan/20">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 font-medium leading-snug line-clamp-2 group-open:line-clamp-none">
                        <HeadlineWithMetrics text={head} metricClass="text-brand-cyan" />
                      </div>
                      {primarySrc && (
                        <PostReference
                          iconOnly
                          caption={primarySrc.message || ""}
                          permalinkUrl={primarySrc.permalink_url}
                          iconLabel="View finding source post on Facebook"
                          className="flex-shrink-0 mt-0.5"
                        />
                      )}
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-500 mt-1 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-14 text-xs text-slate-600 leading-relaxed">{polishCopy(body)}</div>
                  )}
                  {effectiveSourceIds.length > 0 && (
                    <div className="px-4 pb-4 pl-14">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                        Source posts ({effectiveSourceIds.length})
                        {item.source_post_ids.length === 0 && (
                          <span className="ml-1 normal-case text-ink-muted/70 font-normal">· week-level fallback</span>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {effectiveSourceIds.map((pid) => {
                          const p = postById.get(pid);
                          if (!p) return null;
                          return (
                            <li key={pid} className="text-xs text-ink-secondary">
                              <PostReference caption={p.message || ""} permalinkUrl={p.permalink_url} maxChars={80} />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </div>
      )}

      {/* Top / Under performers */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {/* Top */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-green to-emerald-600 text-white flex items-center justify-center shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-ink-primary">Top Performers</h3>
            {topPerformers.length > 0 && (
              <span className="inline-flex items-center text-[11px] font-bold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded-full">
                {Math.min(topPerformers.length, 3)}
              </span>
            )}
          </div>
          <div className="space-y-2.5">
            {topPerformers.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl text-center py-6">
                <p className="text-sm text-slate-500">No data yet. Will populate after next weekly pipeline run.</p>
              </div>
            )}
            {topPerformers.slice(0, 3).map((tp: any, i: number) => {
              const full = tp.metric_highlight || "";
              const { head, body } = splitHeadline(full);
              // AI path emits `post_id` (singular string); native path emits
              // `source_post_ids` (array). Coerce both into a single string[].
              // P6F 2026-04-28: this fallback was the missing link — without
              // it AI-generated top performers had no clickable affordance
              // because the dashboard only checked source_post_ids.
              const sourceIds: string[] = Array.isArray(tp.source_post_ids) && tp.source_post_ids.length
                ? tp.source_post_ids.slice(0, 5)
                : (typeof tp.post_id === "string" && tp.post_id ? [tp.post_id] : []);
              const primarySrc = sourceIds.length > 0 ? postById.get(sourceIds[0]) : undefined;
              const hasDetail = Boolean(body || tp.why_it_worked || tp.replicable_elements || sourceIds.length);
              return (
                <details key={i} className="group bg-ink-paper border border-ink-100 rounded-xl border-l-4 !border-l-brand-green shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-brand-green/50 transition-all duration-200">
                  <summary className="list-none cursor-pointer p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-brand-green/15 to-brand-green/5 text-brand-green font-bold text-xs flex items-center justify-center ring-1 ring-brand-green/20">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-ink-primary font-medium leading-snug line-clamp-1 group-open:line-clamp-none">
                        <HeadlineWithMetrics text={head} metricClass="text-brand-green" />
                      </div>
                      {primarySrc && (
                        <PostReference
                          iconOnly
                          caption={primarySrc.message || ""}
                          permalinkUrl={primarySrc.permalink_url}
                          iconLabel="View top-performer post on Facebook"
                          className="flex-shrink-0"
                        />
                      )}
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-500 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-13 space-y-3">
                      {body && (
                        <div className="text-xs text-slate-600 leading-relaxed pl-9">{polishCopy(body)}</div>
                      )}
                      {tp.why_it_worked && (
                        <div className="pl-9">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Why it worked</div>
                          <div className="text-xs text-slate-600 leading-relaxed">{polishCopy(tp.why_it_worked)}</div>
                        </div>
                      )}
                      {tp.replicable_elements && (
                        <div className="ml-9 flex gap-2 items-start bg-brand-cyan/5 border border-brand-cyan/15 rounded-md p-2.5">
                          <span className="flex-shrink-0 mt-0.5 text-brand-cyan">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 11 12 14 22 4"></polyline>
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                            </svg>
                          </span>
                          <div className="text-xs text-brand-cyan leading-relaxed">
                            <span className="font-semibold uppercase tracking-wider text-[11px]">Replicate · </span>{polishCopy(tp.replicable_elements)}
                          </div>
                        </div>
                      )}
                      {sourceIds.length > 0 && (
                        <div className="pl-9">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                            {sourceIds.length === 1 ? "Source post" : `Source posts (${sourceIds.length})`}
                          </div>
                          <ul className="space-y-1">
                            {sourceIds.map((pid) => {
                              const p = postById.get(pid);
                              if (!p) return null;
                              return (
                                <li key={pid} className="text-xs text-ink-secondary">
                                  <PostReference caption={p.message || ""} permalinkUrl={p.permalink_url} maxChars={80} />
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </div>

        {/* Under */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-red to-rose-600 text-white flex items-center justify-center shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-ink-primary">Underperformers</h3>
            {underperformers.length > 0 && (
              <span className="inline-flex items-center text-[11px] font-bold text-brand-red bg-brand-red/10 px-2 py-0.5 rounded-full">
                {Math.min(underperformers.length, 3)}
              </span>
            )}
          </div>
          <div className="space-y-2.5">
            {underperformers.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl text-center py-6">
                <p className="text-sm text-slate-500">No data yet. Will populate after next weekly pipeline run.</p>
              </div>
            )}
            {underperformers.slice(0, 3).map((up: any, i: number) => {
              const full = up.metric_highlight || "";
              const { head, body } = splitHeadline(full);
              // Same AI-vs-native shape coercion as top performers above.
              const sourceIds: string[] = Array.isArray(up.source_post_ids) && up.source_post_ids.length
                ? up.source_post_ids.slice(0, 5)
                : (typeof up.post_id === "string" && up.post_id ? [up.post_id] : []);
              const primarySrc = sourceIds.length > 0 ? postById.get(sourceIds[0]) : undefined;
              const hasDetail = Boolean(body || up.why_it_failed || up.lesson || sourceIds.length);
              return (
                <details key={i} className="group bg-ink-paper border border-ink-100 rounded-xl border-l-4 !border-l-brand-red shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-brand-red/50 transition-all duration-200">
                  <summary className="list-none cursor-pointer p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-brand-red/15 to-brand-red/5 text-brand-red font-bold text-xs flex items-center justify-center ring-1 ring-brand-red/20">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 font-medium leading-snug line-clamp-1 group-open:line-clamp-none">
                        <HeadlineWithMetrics text={head} metricClass="text-brand-red" />
                      </div>
                      {primarySrc && (
                        <PostReference
                          iconOnly
                          caption={primarySrc.message || ""}
                          permalinkUrl={primarySrc.permalink_url}
                          iconLabel="View underperformer post on Facebook"
                          className="flex-shrink-0"
                        />
                      )}
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-500 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-13 space-y-3">
                      {body && (
                        <div className="text-xs text-slate-600 leading-relaxed pl-9">{polishCopy(body)}</div>
                      )}
                      {up.why_it_failed && (
                        <div className="pl-9">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Why it missed</div>
                          <div className="text-xs text-slate-600 leading-relaxed">{polishCopy(up.why_it_failed)}</div>
                        </div>
                      )}
                      {up.lesson && (
                        <div className="ml-9 flex gap-2 items-start bg-brand-amber/5 border border-brand-amber/20 rounded-md p-2.5">
                          <span className="flex-shrink-0 mt-0.5 text-brand-amber">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="12" y1="16" x2="12" y2="12"></line>
                              <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                          </span>
                          <div className="text-xs text-brand-amber leading-relaxed">
                            <span className="font-semibold uppercase tracking-wider text-[11px]">Lesson · </span>{polishCopy(up.lesson)}
                          </div>
                        </div>
                      )}
                      {sourceIds.length > 0 && (
                        <div className="pl-9">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                            {sourceIds.length === 1 ? "Source post" : `Source posts (${sourceIds.length})`}
                          </div>
                          <ul className="space-y-1">
                            {sourceIds.map((pid) => {
                              const p = postById.get(pid);
                              if (!p) return null;
                              return (
                                <li key={pid} className="text-xs text-ink-secondary">
                                  <PostReference caption={p.message || ""} permalinkUrl={p.permalink_url} maxChars={80} />
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </div>
      </div>

      {/* Watch-outs */}
      {watchOuts.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-amber to-amber-600 text-white flex items-center justify-center shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-ink-primary">Watch-outs</h3>
            <span className="inline-flex items-center text-[11px] font-bold text-brand-amber bg-brand-amber/10 px-2 py-0.5 rounded-full">
              {watchOuts.length}
            </span>
            <span className="text-[11px] text-ink-muted uppercase tracking-wider hidden sm:inline">click any to expand</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {watchOuts.map((item, i) => {
              const { head, body } = splitHeadline(item.text);
              const effectiveSourceIds = resolveSourcePosts(item.source_post_ids);
              const primarySrc = effectiveSourceIds.length > 0
                ? postById.get(effectiveSourceIds[0])
                : undefined;
              const hasDetail = Boolean(body);
              return (
                <details key={i} className="group bg-gradient-to-br from-amber-50/40 to-amber-50/10 border border-amber-200/50 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-amber-300/80 transition-all duration-200">
                  <summary className="list-none cursor-pointer p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-amber/15 text-brand-amber flex items-center justify-center">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="9" x2="12" y2="13"></line>
                          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 font-medium leading-snug line-clamp-2 group-open:line-clamp-none">
                        <HeadlineWithMetrics text={head} metricClass="text-brand-amber" />
                      </div>
                      {primarySrc && (
                        <PostReference
                          iconOnly
                          caption={primarySrc.message || ""}
                          permalinkUrl={primarySrc.permalink_url}
                          iconLabel="View watch-out source post on Facebook"
                          className="flex-shrink-0 mt-0.5"
                        />
                      )}
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-amber-600/60 mt-1 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-14 text-xs text-slate-600 leading-relaxed">{polishCopy(body)}</div>
                  )}
                  {effectiveSourceIds.length > 0 && (
                    <div className="px-4 pb-4 pl-14">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">
                        Source posts ({effectiveSourceIds.length})
                        {item.source_post_ids.length === 0 && (
                          <span className="ml-1 normal-case text-ink-muted/70 font-normal">· week-level fallback</span>
                        )}
                      </div>
                      <ul className="space-y-1">
                        {effectiveSourceIds.map((pid) => {
                          const p = postById.get(pid);
                          if (!p) return null;
                          return (
                            <li key={pid} className="text-xs text-ink-secondary">
                              <PostReference caption={p.message || ""} permalinkUrl={p.permalink_url} maxChars={80} />
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
