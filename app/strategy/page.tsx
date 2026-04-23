import { getPosts, getLatestDiagnosis, getDiagnosisByWeek, getRunStatus, computeStaleness, getStageEngine } from "@/lib/sheets";
import { filterPosts, groupStats } from "@/lib/aggregate";
import { minPostsForRange } from "@/lib/stats";
import { resolveRange, rangeDays as computeRangeDays } from "@/lib/daterange";
import PageHeader from "@/components/PageHeader";
import { Card, ChartCard } from "@/components/Card";
import BarChartBase from "@/components/BarChart";
import StalenessBanner from "@/components/StalenessBanner";
import AIDisabledEmptyState from "@/components/AIDisabledEmptyState";
import ArchivalLine from "@/components/ArchivalLine";
import AcademicContextStrip from "@/components/AcademicContextStrip";
import { STAGES } from "@/lib/stages";
import { canonicalColor } from "@/lib/colors";

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
  const segments = extractMetrics(text);
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

export default async function StrategyPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const range = resolveRange(searchParams);

  // Step 3 archival mode: `?archived=<week-ending>` switches the page into
  // read-only mode against a specific prior diagnosis row. Absent param =
  // live mode (current behaviour). Invalid key = live mode + silent fallback.
  const archivedParam = typeof searchParams.archived === "string" ? searchParams.archived : "";
  const isArchival = Boolean(archivedParam);

  const [posts, liveDiagnosis, archivedDiagnosis, runStatus, diagnosisEngine] = await Promise.all([
    getPosts(),
    isArchival ? Promise.resolve(null) : getLatestDiagnosis(),
    isArchival ? getDiagnosisByWeek(archivedParam) : Promise.resolve(null),
    getRunStatus(),
    getStageEngine("diagnosis"),
  ]);
  const diagnosis = isArchival ? archivedDiagnosis : liveDiagnosis;
  const staleness = computeStaleness("diagnosis", runStatus);
  const aiDisabled = diagnosisEngine === "native" || diagnosisEngine === "off";
  const inRange = filterPosts(posts, { start: range.start, end: range.end });

  // Funnel distribution
  // Day 2U: apply the adaptive min-n gate to the engagement bars so a
  // single BOFU post with 1 reach + 1 share can't produce a towering BOFU
  // bar. The distribution/count chart still shows everything — it's a
  // volume chart, not a rate chart, so low-n buckets are still honest.
  const rangeDays = computeRangeDays(range);
  const MIN_N_FUNNEL = minPostsForRange(rangeDays);
  const funnelStats = groupStats(inRange, "funnel_stage");
  const funnelOrder = ["TOFU", "MOFU", "BOFU"];
  // Per-bar canonical colours so TOFU is always cyan, MOFU indigo, BOFU
  // pink — matches any future funnel illustration or Plan pill.
  const funnelDist = funnelOrder.map((stage) => {
    const s = funnelStats.find((x) => x.key === stage);
    return {
      label: stage,
      value: s?.count || 0,
      color: canonicalColor("funnel", stage),
    };
  });
  const funnelEng = funnelOrder.map((stage) => {
    const s = funnelStats.find((x) => x.key === stage);
    const eligible = s && s.count >= MIN_N_FUNNEL;
    return {
      label: stage,
      value: eligible ? Number(s.avg_engagement_rate.toFixed(2)) : 0,
      color: canonicalColor("funnel", stage),
    };
  });

  const whatHappened: string[] = diagnosis?.what_happened || [];
  const topPerformers = diagnosis?.top_performers || [];
  const underperformers = diagnosis?.underperformers || [];
  const watchOuts: string[] = diagnosis?.watch_outs || [];

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
    ? new Date(diagnosis.week_ending).toLocaleDateString("en-US", { month: "short", day: "numeric" })
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
          title="Strategy"
          subtitle="Claude's diagnosis and recommended actions"
          dateLabel={`${range.label} · Funnel charts reflect native classification; AI diagnosis off`}
          lastScrapedAt={runStatus.last_run_at}
        />
        <AIDisabledEmptyState
          stage={STAGES.diagnosis}
          lastSuccessfulAt={runStatus.last_successful_diagnosis_at}
          archiveKey={runStatus.last_successful_diagnosis_at
            ? extractWeekEnding(runStatus.last_successful_diagnosis_at)
            : ""}
          noun="AI diagnosis"
          readsDescription="This page reads the weekly AI diagnosis."
        />
        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <ChartCard
            title="Funnel Distribution"
            kind="observed"
            subtitle="Posts by marketing stage"
            definition="TOFU (top-of-funnel): awareness / education. MOFU (middle): consideration / demo. BOFU (bottom): direct conversion asks. Funnel stage is assigned by the weekly classifier."
            sampleSize={`n = ${inRange.length} post${inRange.length === 1 ? "" : "s"}`}
            caption="Based on native classifier only — no AI."
          >
            <BarChartBase data={funnelDist} metricName="Posts" valueAxisLabel="Posts" categoryAxisLabel="Funnel stage" showPercent />
          </ChartCard>
          <ChartCard
            title="Funnel Engagement"
            kind="observed"
            subtitle="Avg engagement rate by stage"
            definition={`For each funnel stage: total interactions ÷ total reach across all posts in that stage. Reach-weighted. Stages with fewer than ${MIN_N_FUNNEL} posts in the period are hidden (zeroed bar).`}
            sampleSize={`min ${MIN_N_FUNNEL} posts per stage · ${rangeDays}d window`}
            caption="Which funnel stage resonates most in terms of interaction rate."
          >
            <BarChartBase data={funnelEng} valueFormat="percent" metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Funnel stage" />
          </ChartCard>
        </div>
      </div>
    );
  }

  return (
    <div className={isArchival ? "opacity-[0.97] [filter:saturate(0.9)]" : ""}>
      {isArchival ? (
        <ArchivalLine archiveDateLabel={archiveDateLabel} livePath="/strategy" />
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
        title="Strategy"
        subtitle={isArchival
          ? (archiveDateLabel
              ? `Archived diagnosis for week ending ${archiveDateLabel}`
              : "Archived diagnosis")
          : "Claude's diagnosis and recommended actions"}
        dateLabel={`${range.label} · Funnel charts filtered; verdict = ${isArchival ? "archived snapshot" : "latest weekly snapshot"}`}
        lastScrapedAt={runStatus.last_run_at}
      />

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
        <div className="mb-6 rounded-xl border border-ink-100 bg-ink-paper p-4 sm:p-5">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand-shikho-indigo text-white">
              Weekly verdict
            </span>
            <span className="text-[11px] text-ink-muted">
              {diagnosis.week_ending ? `week ending ${diagnosis.week_ending}` : "latest weekly run"}
            </span>
          </div>
          <p className="text-[15px] sm:text-base text-ink-800 leading-relaxed">
            {diagnosis.headline}
          </p>
          {diagnosis.exam_alert && (
            <div className="mt-3 flex items-start gap-2 bg-brand-shikho-coral/5 border border-brand-shikho-coral/20 rounded-md p-3">
              <span className="flex-shrink-0 mt-0.5 text-brand-shikho-coral">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
              </span>
              <div className="text-xs text-brand-shikho-coral leading-relaxed">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Calendar alert · </span>
                {diagnosis.exam_alert}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Funnel distribution */}
      <div className="grid lg:grid-cols-2 gap-4 mb-2">
        <ChartCard
          title="Funnel Distribution"
          kind="ai"
          subtitle="Posts by marketing stage"
          definition="TOFU (top-of-funnel): awareness / education. MOFU (middle): consideration / demo. BOFU (bottom): direct conversion asks. Funnel stage is assigned by the weekly classifier."
          sampleSize={`n = ${inRange.length} post${inRange.length === 1 ? "" : "s"}`}
          caption="Heavy BOFU may limit new audience growth. Healthy mix is typically ~50% TOFU, ~30% MOFU, ~20% BOFU for organic."
        >
          <BarChartBase data={funnelDist} metricName="Posts" valueAxisLabel="Posts" categoryAxisLabel="Funnel stage" showPercent />
        </ChartCard>
        <ChartCard
          title="Funnel Engagement"
          kind="ai"
          subtitle="Avg engagement rate by stage"
          definition={`For each funnel stage: total interactions ÷ total reach across all posts in that stage. Reach-weighted. Stages with fewer than ${MIN_N_FUNNEL} posts in the period are hidden (zeroed bar) so a single post can't produce a misleading spike.`}
          sampleSize={`min ${MIN_N_FUNNEL} posts per stage · ${rangeDays}d window`}
          caption="Which funnel stage resonates most in terms of interaction rate."
        >
          <BarChartBase data={funnelEng} valueFormat="percent" metricName="Engagement rate" valueAxisLabel="Engagement rate" categoryAxisLabel="Funnel stage" />
        </ChartCard>
      </div>
      {/* Sprint P6: inline explainer so users don't have to open the
          ChartCard tooltip to learn what TOFU/MOFU/BOFU mean. */}
      <div className="mb-6 text-[12px] text-ink-muted leading-relaxed px-1">
        <span className="font-semibold text-ink-700">How funnel stages are assigned:</span>{" "}
        <span className="text-brand-cyan font-semibold">TOFU</span> (top-of-funnel) covers awareness and education — explainers, free lessons, thought leadership.{" "}
        <span className="text-brand-shikho-indigo font-semibold">MOFU</span> (middle) covers consideration and social proof — demos, student stories, course highlights.{" "}
        <span className="text-brand-shikho-coral font-semibold">BOFU</span> (bottom) covers direct conversion — price, discount, enrollment deadline, last-call posts. Classification is done by the weekly AI pass on each post's hook and body.
      </div>

      {/* Key findings */}
      {whatHappened.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-cyan/15 text-brand-cyan flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">Key Findings</h3>
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">{whatHappened.length} · click any to expand</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {whatHappened.map((item, i) => {
              const { head, body } = splitHeadline(item);
              const hasDetail = Boolean(body);
              return (
                <details key={i} className="group bg-white border border-slate-200 rounded-xl hover:border-brand-cyan/40 transition-colors">
                  <summary className="list-none cursor-pointer p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-cyan/10 text-brand-cyan font-semibold text-xs flex items-center justify-center">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 font-medium leading-snug line-clamp-2 group-open:line-clamp-none">
                        <HeadlineWithMetrics text={head} metricClass="text-brand-cyan" />
                      </div>
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-500 mt-1 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-14 text-xs text-slate-600 leading-relaxed">{body}</div>
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
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-green/15 text-brand-green flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">Top Performers</h3>
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">click to expand</span>
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
              const hasDetail = Boolean(body || tp.why_it_worked || tp.replicable_elements);
              return (
                <details key={i} className="group bg-white border border-slate-200 rounded-xl border-l-4 !border-l-brand-green overflow-hidden hover:border-brand-green/40 transition-colors">
                  <summary className="list-none cursor-pointer p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-md bg-brand-green/10 text-brand-green font-bold text-xs flex items-center justify-center">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 font-medium leading-snug line-clamp-1 group-open:line-clamp-none">
                        <HeadlineWithMetrics text={head} metricClass="text-brand-green" />
                      </div>
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
                        <div className="text-xs text-slate-600 leading-relaxed pl-9">{body}</div>
                      )}
                      {tp.why_it_worked && (
                        <div className="pl-9">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Why it worked</div>
                          <div className="text-xs text-slate-600 leading-relaxed">{tp.why_it_worked}</div>
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
                            <span className="font-semibold uppercase tracking-wider text-[11px]">Replicate · </span>{tp.replicable_elements}
                          </div>
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
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-red/15 text-brand-red flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">Underperformers</h3>
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">click to expand</span>
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
              const hasDetail = Boolean(body || up.why_it_failed || up.lesson);
              return (
                <details key={i} className="group bg-white border border-slate-200 rounded-xl border-l-4 !border-l-brand-red overflow-hidden hover:border-brand-red/40 transition-colors">
                  <summary className="list-none cursor-pointer p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-md bg-brand-red/10 text-brand-red font-bold text-xs flex items-center justify-center">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 text-sm text-slate-700 font-medium leading-snug line-clamp-1 group-open:line-clamp-none">
                        <HeadlineWithMetrics text={head} metricClass="text-brand-red" />
                      </div>
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
                        <div className="text-xs text-slate-600 leading-relaxed pl-9">{body}</div>
                      )}
                      {up.why_it_failed && (
                        <div className="pl-9">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Why it missed</div>
                          <div className="text-xs text-slate-600 leading-relaxed">{up.why_it_failed}</div>
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
                            <span className="font-semibold uppercase tracking-wider text-[11px]">Lesson · </span>{up.lesson}
                          </div>
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
          <div className="flex items-center gap-2 mb-3">
            <div className="w-5 h-5 rounded-full bg-brand-amber/15 text-brand-amber flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">Watch-outs</h3>
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">{watchOuts.length} · click any to expand</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {watchOuts.map((item, i) => {
              const { head, body } = splitHeadline(item);
              const hasDetail = Boolean(body);
              return (
                <details key={i} className="group bg-amber-50/30 border border-amber-200/60 rounded-xl hover:border-amber-300/80 transition-colors">
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
                      {hasDetail && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-amber-600/60 mt-1 transition-transform group-open:rotate-180">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      )}
                    </div>
                  </summary>
                  {hasDetail && (
                    <div className="px-4 pb-4 pl-14 text-xs text-slate-600 leading-relaxed">{body}</div>
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
