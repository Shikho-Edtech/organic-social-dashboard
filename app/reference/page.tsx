// Sprint P7 v4.18 W2 Tue (2026-05-02): Reference / glossary page.
//
// Lives at /reference. Operators land here when they encounter a value
// or term they don't recognize ("what does spotlight_type=brand mean?",
// "is shares the same as quality engagement?", "what counts as a week?").
// All taxonomies are derived live from Classifications + Content_Calendar
// so renames + new categories surface automatically.
//
// Two columns of content:
//  1. TAXONOMIES — every dimension's distinct values, with descriptions
//     where applicable (Pillars, Formats, Hook Types, Spotlight Types,
//     Caption Tone, Audiences, Funnel Stages, Languages, Spotlight Names dedup'd).
//  2. DEFINITIONS — what a week is, how reach is measured, what
//     Quality Engagement means, what each verdict state signals, what
//     "scored on reach" / "preliminary" / "week-level fallback" mean.
//
// W4 layout pass (2026-05-02): "Tones" → "Caption Tone" (matches caption_tone
// classifier field), Languages render as inline pills (compact horizontal),
// Audiences nested under Students/Parents/Teachers/General groups, list
// spacing tightened to reduce cross-card height variance.
//
// Pure server component, ISR with 5-min cache.

import { getPosts } from "@/lib/sheets";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/Card";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const PILLAR_DESCRIPTIONS: Record<string, string> = {
  "Live Class / Exam Prep": "Reactive teacher-led content tied to active exam windows. Highest reach pillar at Shikho; serves SSC/HSC/board-prep urgency.",
  "Study Tips & Hacks": "Generic study technique content. Mid-funnel; works as connective layer between exam-urgency content and product promo.",
  "Quiz / Challenge": "Interactive prompts (MCQ challenges, fill-in-the-blank). High-engagement, high-virality pillar; strong on shares.",
  "Product / Program Promo": "Direct course / program promotion. BOFU; drives conversion but high doses cause audience fatigue.",
  "Promotional Offer": "Time-bound discounts, batch openings, scholarship deadlines. BOFU urgency.",
  "App Feature": "App functionality showcase (Shikho AI, doubt-clearing, etc.). MOFU/BOFU; drives installs.",
  "Cultural / Seasonal": "Pohela Boishakh, Eid, Independence Day, etc. TOFU brand-warmth content.",
  "Student Success": "Student stories, success cases, top scorer features. Brand trust + aspiration.",
  "Brand": "Pure brand awareness (no specific course/product). TOFU.",
  "Parent Engagement": "Content addressed to parents (decision-makers). Niche but high-conversion.",
  "Testimonial / Story": "Long-form student or teacher narrative. Trust signal.",
  "Platform Update": "Product launches, new features, version notes.",
};

const FORMAT_DESCRIPTIONS: Record<string, string> = {
  Reel: "Short-form vertical video (≤90s). Highest reach format on Facebook today; algorithm-rewarded.",
  Video: "Long-form video (≥90s). Lower reach than Reels but higher watch-time per viewer.",
  Photo: "Single-image post. Stable reach floor; cheap to produce; works for promo + announcement.",
  Carousel: "Multi-image swipeable post. Best for step-by-step content (study guides, MCQ explainers).",
  Status: "Text-only post. Rarely used.",
  Link: "Link share. Rarely used.",
};

const FUNNEL_STAGE_DESCRIPTIONS: Record<string, string> = {
  TOFU: "Top of funnel: acquisition, brand awareness, broad reach. Goal: get the post in front of new audience.",
  MOFU: "Middle of funnel: engagement, education, trust. Goal: deepen relationship with audience already aware of Shikho.",
  BOFU: "Bottom of funnel: conversion, install, enrollment. Goal: drive specific action.",
};

const SPOTLIGHT_TYPE_DESCRIPTIONS: Record<string, string> = {
  Teacher: "Featured human teacher (e.g. Abdullah Bhaiya, Diba Apu).",
  Product: "Specific app feature or course.",
  Program: "Branded program or batch (e.g. SSC '26 Master Course).",
  Brand: "Generic Shikho brand spotlight, no specific human/product.",
  Campaign: "Time-bound marketing campaign (e.g. Pohela Boishakh Quiz Series).",
  None: "No explicit spotlight; generic content.",
};

const HOOK_TYPE_DESCRIPTIONS: Record<string, string> = {
  Question: "Opens with a question to pull viewer attention.",
  Stat: "Opens with a number/statistic ('100+ MCQs', '83% of students…').",
  Announcement: "Opens with news/launch ('New batch starts', 'Today only').",
  Story: "Opens with a narrative scene.",
  Problem: "Opens with a pain point the audience has.",
  Curiosity: "Opens with a tease or cliffhanger.",
  Direct: "Direct CTA from line one.",
  None: "No identifiable hook pattern.",
};

const TONE_DESCRIPTIONS: Record<string, string> = {
  Educational: "Teacher-voice instructive tone.",
  Urgent: "Time-pressure / FOMO tone.",
  Conversational: "Casual peer-voice tone.",
  Promotional: "Sales-oriented tone.",
  Inspirational: "Motivational / aspirational.",
  Informational: "Neutral fact-delivery tone.",
  Humorous: "Light/funny tone.",
  Emotional: "Story-led emotional resonance.",
};

const AUDIENCE_DESCRIPTIONS: Record<string, string> = {
  SSC: "Class 9-10 students preparing for SSC board exam.",
  HSC: "Class 11-12 students preparing for HSC board exam.",
  Junior: "Class 6-8 students; pre-board cohort.",
  Admission: "University admission test prep audience.",
  General: "Cross-cohort general audience.",
  Parent: "Parent-targeted content.",
  Parents: "Parent-targeted content.",
  Teacher: "Teacher / educator audience.",
  Teachers: "Teacher / educator audience.",
};

// W4: nested audience taxonomy for the Audiences card. Drives the grouped render
// below. Order matters — Students first (most slots), then Parents/Teachers/General.
const AUDIENCE_GROUPS: { label: string; members: string[]; description?: string }[] = [
  { label: "Students", members: ["Junior", "SSC", "HSC", "Admission"], description: "Cohort-segmented student audiences." },
  { label: "Parents", members: ["Parent", "Parents"] },
  { label: "Teachers", members: ["Teacher", "Teachers"] },
  { label: "General", members: ["General"] },
];

const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  Bangla: "Caption written in Bangla.",
  English: "Caption written in English.",
  Mixed: "Caption mixes Bangla + English (transliterated or code-switched).",
  Banglish: "Bangla written in Latin script.",
};

function dedupSorted(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => (s || "").trim()).filter(Boolean))).sort();
}

export default async function ReferencePage() {
  const posts = await getPosts();

  // Pull live distinct values from classifier output
  const pillars = dedupSorted(posts.map((p) => p.content_pillar || ""));
  const formats = dedupSorted(posts.map((p) => p.format || p.type || ""));
  const hookTypes = dedupSorted(posts.map((p) => p.hook_type || ""));
  const spotlightTypes = dedupSorted(posts.map((p) => p.spotlight_type || ""));
  const spotlightNames = dedupSorted(posts.map((p) => p.spotlight_name || ""));
  const tones = dedupSorted(posts.map((p) => p.caption_tone || ""));
  const audiences = dedupSorted(posts.map((p) => p.primary_audience || ""));
  const funnelStages = dedupSorted(posts.map((p) => p.funnel_stage || ""));
  const languages = dedupSorted(posts.map((p) => p.language || p.caption_primary_language || ""));

  type Section = {
    title: string;
    description: string;
    values: string[];
    valueDescriptions?: Record<string, string>;
    accent: string;
  };

  const taxonomySections: Section[] = [
    {
      title: "Content Pillars",
      description: "The thematic categorization of every post. Every slot in Plan and every published post is tagged with one pillar. Used for strategy weighting + adherence checks.",
      values: pillars,
      valueDescriptions: PILLAR_DESCRIPTIONS,
      accent: "from-brand-shikho-indigo to-brand-shikho-magenta",
    },
    {
      title: "Formats",
      description: "Post media type. Format determines forecast band (each pillar × format pair has its own reach distribution in priors).",
      values: formats,
      valueDescriptions: FORMAT_DESCRIPTIONS,
      accent: "from-brand-cyan to-brand-shikho-indigo",
    },
    {
      title: "Funnel Stages",
      description: "Where the post sits in the marketing funnel. Plan validator enforces TOFU ≥ 20%, MOFU ≥ 30%, BOFU ≥ 20%, with TOFU/BOFU each ≤ 50%.",
      values: funnelStages,
      valueDescriptions: FUNNEL_STAGE_DESCRIPTIONS,
      accent: "from-brand-green to-brand-cyan",
    },
    {
      title: "Hook Types",
      description: "The opening pattern of the caption / first frame. Each hook tracked independently in Priors_HookType for fatigue detection. Same hook on same pillar blocked for 6 weeks; cross-pillar blocked for 2 weeks.",
      values: hookTypes,
      valueDescriptions: HOOK_TYPE_DESCRIPTIONS,
      accent: "from-brand-shikho-magenta to-brand-shikho-coral",
    },
    {
      title: "Spotlight Types",
      description: "What the post features. Strategy stage's teacher_rotation array uses these to balance creator visibility week to week.",
      values: spotlightTypes,
      valueDescriptions: SPOTLIGHT_TYPE_DESCRIPTIONS,
      accent: "from-brand-amber to-brand-shikho-coral",
    },
    {
      title: "Caption Tone",
      description: "Caption voice / register (matches the caption_tone classifier field). Lower-cardinality dimension; useful for cross-format pattern detection.",
      values: tones,
      valueDescriptions: TONE_DESCRIPTIONS,
      accent: "from-brand-cyan to-brand-green",
    },
  ];

  // W4: build grouped audience structure from live data.
  // Any audience value that doesn't match a known group becomes "Other".
  const knownAudienceMembers = new Set(AUDIENCE_GROUPS.flatMap((g) => g.members.map((m) => m.toLowerCase())));
  const audienceGroupsLive = AUDIENCE_GROUPS.map((g) => ({
    ...g,
    presentMembers: audiences.filter((a) => g.members.some((m) => m.toLowerCase() === a.toLowerCase())),
  })).filter((g) => g.presentMembers.length > 0);
  const otherAudiences = audiences.filter((a) => !knownAudienceMembers.has(a.toLowerCase()));

  const definitions: { term: string; def: string }[] = [
    {
      term: "Week (Mon-Sun BDT)",
      def: "Every per-week tab is keyed by the running Monday in Bangladesh time (BDT). 'Week of Apr 27' covers Apr 27 (Monday) through May 3 (Sunday). The Bangladesh team's working schedule means Sunday is a working day; Friday + Saturday are the weekend.",
    },
    {
      term: "Reach (unique reach)",
      def: "Distinct people who saw the post. Facebook insights' post_total_media_view_unique field. The dashboard's primary scoring metric. Different from media_views (total impressions including re-views) and from views (Reels-specific).",
    },
    {
      term: "Engagement Rate",
      def: "(Reactions + Comments + Shares) ÷ Reach. Per-post. Captures interaction density without bias toward larger-audience posts. Currently shown on Diagnosis verdict (~2.43% typical).",
    },
    {
      term: "Quality Engagement (candidate)",
      def: "Shares × 2, Comments × 1, summed weekly. Excludes reactions because they're a low-effort reach proxy. Shares double-weighted because each share = unpaid distribution and algorithm reward. CANDIDATE north-star; being trialed alongside reach for 4 to 8 weeks before a canonical anchor decision.",
    },
    {
      term: "Interactions",
      def: "Reactions, Comments, and Shares summed. Dominated by reactions (~80-90% of total) so behaves as a reach proxy. Why we don't use this as the candidate north-star: Quality Engagement is the high-intent subset.",
    },
    {
      term: "Hypothesis (h0 / h1 / h2 …)",
      def: "Weekly bets the strategy stage emits. h1 = primary strategic hypothesis (always set). h2+ = experiments to run. h0 = status-quo / null hypothesis. Each slot in the plan ties to a hypothesis_id; the chip on Plan/Outcomes/Diagnosis surfaces the actual statement on hover.",
    },
    {
      term: "Forecast band (CI)",
      def: "80% confidence interval for unique reach, computed from Priors_Pillar × Priors_Format × Priors_AcademicSeason at plan time. Stamped immutably on every slot. Outcome scoring compares actual reach against this band.",
    },
    {
      term: "Verdicts",
      def: "Hit = actual landed inside the forecast band. Exceeded = actual > band high. Missed = actual < band low. No-data = no matched post yet (forward-looking week or matcher couldn't join). Preliminary = post < 7 days old; reach hasn't fully decayed; verdict shown but excluded from Calibration_Log.",
    },
    {
      term: "\"Scored on reach\" warning",
      def: "On Outcomes Target Metric column. Appears when a slot's stated success_metric (e.g. 'Follows > 150') isn't a reach metric. The deterministic verdict still scores reach because that's the only dimension we have 90-day priors for. The chip tells you the slot's intent isn't being measured directly.",
    },
    {
      term: "\"Week-level fallback\" on source posts",
      def: "On Diagnosis Key Findings and Watch-outs. Appears when a finding doesn't carry its own source_post_ids; the page falls back to the diagnosis's top and under performers as best-available citation. Distinct from a precise per-finding citation; tells operators the link is inferred, not exact.",
    },
    {
      term: "Calibration",
      def: "How well the forecast bands actually contain reality. Target: 80% of slots should land inside the 80% CI. Drift below 70% over 4 weeks = priors are over-confident. Drift above 90% = bands too wide (calibrated but un-sharp).",
    },
    {
      term: "Hit Rate",
      def: "(Hit + Exceeded) ÷ (Hit + Exceeded + Missed). Excludes No-data and Preliminary. Shown on Outcomes rollup. Different from Calibration (which counts only Hit).",
    },
    {
      term: "Mid-week vs End-of-week diagnosis",
      def: "Pipeline runs diagnosis twice per week. Mid-week (Thursday morning) writes engine='ai-midweek' on Mon-Wed data → labeled 'Preliminary, mid-week' on Diagnosis This Week. End-of-week (Monday morning) writes engine='ai' on the completed Mon-Sun → the canonical retrospective.",
    },
    {
      term: "\"Past-week immutability\"",
      def: "Architectural rule: once a Monday rolls over, that week's Plan + Outcomes are frozen. Pipeline writer refuses to overwrite past weeks unless force_regenerate=true is explicitly set. Preserves the contract Outcomes scores against.",
    },
    {
      term: "System Suggestions",
      def: "Auto-derived prescriptions written to System_Suggestions tab each weekly run (calibration drift, hypothesis retire, pillar over/underperform). NEVER auto-applied; strategy prompt reads them as advisory context. The team / human decides whether to follow each suggestion.",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Reference"
        subtitle="Definitions and taxonomies"
        dateLabel="Glossary · live from current data"
        showPicker={false}
      />

      {/* TAXONOMIES — live from data */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-shikho-indigo to-brand-shikho-magenta text-white flex items-center justify-center shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-ink-primary">Taxonomies</h2>
          <span className="text-[11px] text-ink-muted uppercase tracking-wider">live values from your data</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {taxonomySections.map((sec, i) => (
            <Card key={i} className="border-l-4 border-l-brand-shikho-indigo">
              <h3 className="text-base font-semibold text-ink-primary mb-1">{sec.title}</h3>
              <p className="text-xs text-ink-muted leading-relaxed mb-2.5">{sec.description}</p>
              {sec.values.length === 0 ? (
                <p className="text-xs text-ink-muted italic">No values found in current data.</p>
              ) : (
                <ul className="space-y-1">
                  {sec.values.map((v) => (
                    <li key={v} className="text-sm leading-snug">
                      <span className="font-medium text-ink-primary">{v}</span>
                      {sec.valueDescriptions?.[v] && (
                        <span className="ml-1.5 text-xs text-ink-muted">· {sec.valueDescriptions[v]}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2.5 pt-2 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-muted">
                {sec.values.length} distinct value{sec.values.length === 1 ? "" : "s"}
              </div>
            </Card>
          ))}

          {/* W4: Audiences — nested grouped (Students > Junior/SSC/HSC/Admission, Parents, Teachers, General) */}
          <Card className="border-l-4 border-l-brand-shikho-indigo">
            <h3 className="text-base font-semibold text-ink-primary mb-1">Audiences</h3>
            <p className="text-xs text-ink-muted leading-relaxed mb-2.5">
              Primary target cohort the post is written for. Drives audience-segmented analysis (Tier 3 in the algorithm audit roadmap).
            </p>
            {audiences.length === 0 ? (
              <p className="text-xs text-ink-muted italic">No values found in current data.</p>
            ) : (
              <div className="space-y-2.5">
                {audienceGroupsLive.map((g) => (
                  <div key={g.label}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-shikho-indigo mb-1">
                      {g.label}
                      <span className="ml-1.5 text-[10px] font-normal text-ink-muted normal-case tracking-normal">
                        ({g.presentMembers.length})
                      </span>
                    </div>
                    <ul className="space-y-1 pl-3 border-l border-ink-100">
                      {g.presentMembers.map((m) => (
                        <li key={m} className="text-sm leading-snug">
                          <span className="font-medium text-ink-primary">{m}</span>
                          {AUDIENCE_DESCRIPTIONS[m] && (
                            <span className="ml-1.5 text-xs text-ink-muted">· {AUDIENCE_DESCRIPTIONS[m]}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {otherAudiences.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">Other</div>
                    <ul className="space-y-1 pl-3 border-l border-ink-100">
                      {otherAudiences.map((a) => (
                        <li key={a} className="text-sm leading-snug">
                          <span className="font-medium text-ink-primary">{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="mt-2.5 pt-2 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-muted">
              {audiences.length} distinct value{audiences.length === 1 ? "" : "s"}
            </div>
          </Card>

          {/* W4: Languages — inline pills (compact horizontal) */}
          <Card className="border-l-4 border-l-brand-shikho-indigo">
            <h3 className="text-base font-semibold text-ink-primary mb-1">Languages</h3>
            <p className="text-xs text-ink-muted leading-relaxed mb-2.5">
              Caption primary language. Affects audience reach (Bangla content reaches different cohort than English).
            </p>
            {languages.length === 0 ? (
              <p className="text-xs text-ink-muted italic">No values found in current data.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {languages.map((l) => (
                    <span
                      key={l}
                      className="inline-flex items-center text-xs font-medium bg-shikho-indigo-50 text-brand-shikho-indigo rounded-md px-2 py-1"
                      title={LANGUAGE_DESCRIPTIONS[l] || undefined}
                    >
                      {l}
                    </span>
                  ))}
                </div>
                {languages.some((l) => LANGUAGE_DESCRIPTIONS[l]) && (
                  <ul className="space-y-0.5 pt-1">
                    {languages
                      .filter((l) => LANGUAGE_DESCRIPTIONS[l])
                      .map((l) => (
                        <li key={l} className="text-[11px] text-ink-muted leading-snug">
                          <span className="font-medium text-ink-secondary">{l}</span>
                          <span className="ml-1.5">· {LANGUAGE_DESCRIPTIONS[l]}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-2.5 pt-2 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-muted">
              {languages.length} distinct value{languages.length === 1 ? "" : "s"}
            </div>
          </Card>

          {/* Spotlight Names — separate card, dedup'd live */}
          <Card className="md:col-span-2 border-l-4 border-l-brand-shikho-coral">
            <h3 className="text-base font-semibold text-ink-primary mb-1">Spotlight Names <span className="ml-1 text-[10px] uppercase text-ink-muted font-semibold">deduplicated</span></h3>
            <p className="text-xs text-ink-muted leading-relaxed mb-3">
              Distinct creator / product / campaign names tagged across all posts. Spotlight Type ↑ defines the kind; Spotlight Name is the specific instance. Strategy&apos;s teacher_rotation references these.
            </p>
            {spotlightNames.length === 0 ? (
              <p className="text-xs text-ink-muted italic">No spotlight names in current data.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {spotlightNames.map((n) => (
                  <span key={n} className="inline-flex items-center text-[11px] font-medium bg-shikho-indigo-50 text-brand-shikho-indigo rounded-md px-2 py-1">
                    {n}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 pt-2 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-muted">
              {spotlightNames.length} distinct
            </div>
          </Card>
        </div>
      </div>

      {/* DEFINITIONS */}
      <div>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-shikho-indigo text-white flex items-center justify-center shadow-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-ink-primary">Definitions</h2>
          <span className="text-[11px] text-ink-muted uppercase tracking-wider">how the dashboard counts things</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {definitions.map((d, i) => (
            <Card key={i} className="">
              <h3 className="text-sm font-semibold text-ink-primary mb-1">{d.term}</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">{d.def}</p>
            </Card>
          ))}
        </div>
      </div>

      <p className="mt-6 text-[11px] text-ink-muted leading-relaxed">
        Taxonomy values are pulled live from your current data. Renames or new categories surface here automatically as they appear in posts. Definitions are versioned in <code className="text-[10px] px-1 py-0.5 rounded bg-ink-50">app/reference/page.tsx</code>; update there when terminology changes.
      </p>
    </div>
  );
}
