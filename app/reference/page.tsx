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
// W5 + W6 content pass (2026-05-02): concrete Bangla caption examples added
// for every Hook Type, Caption Tone, Spotlight Type, and Language so operators
// can pattern-match the classifier's call against actual openers. Definitions
// restructured to {term, key, def} — bold "key" line surfaces the headline-
// grade idea (scannable), smaller "def" carries the longer explanation. Cold-
// read test: a new operator can scan the keys-only column and understand 80%
// of the dashboard's vocabulary without reading the long defs.
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

const SPOTLIGHT_TYPE_EXAMPLES: Record<string, string> = {
  Teacher: "A reel of Abdullah Bhaiya solving a physics MCQ on camera.",
  Product: "A walkthrough of Shikho AI's doubt-clearing feature.",
  Program: "Promo for the SSC '26 Master Course batch opening.",
  Brand: "A generic 'Why Shikho' brand-warmth post with no specific face/feature.",
  Campaign: "Pohela Boishakh Quiz Series — 7 themed posts under one campaign tag.",
  None: "Generic study tip with no person, product, or program attached.",
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

// W5: concrete caption-line examples for each hook type. Italic ex.
// rendered under each list item so operators can pattern-match the
// classifier's call against actual openers they've seen.
const HOOK_TYPE_EXAMPLES: Record<string, string> = {
  Question: "তুমি কি জানো SSC-তে কোন chapter সবচেয়ে বেশি আসে?",
  Stat: "৯৩% শিক্ষার্থী এই ভুলটা করে।",
  Announcement: "নতুন HSC '26 ব্যাচ শুরু হচ্ছে রোববার থেকে।",
  Story: "একদিন আমার এক ছাত্র এসে বললো…",
  Problem: "Maths-এ ভয় লাগে? তুমি একা না।",
  Curiosity: "এই trick জানলে আর কখনো ভুলবে না।",
  Direct: "এখনই enroll করো — শেষ ২৪ ঘন্টা।",
  None: "(no opener pattern; just dives into the content)",
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

const TONE_EXAMPLES: Record<string, string> = {
  Educational: "চলো আজ শিখি কিভাবে এই অংকটা সমাধান করতে হয়।",
  Urgent: "মাত্র আজ রাত ১২টা পর্যন্ত — মিস করো না।",
  Conversational: "আরে ভাই, এটা তো আমিও জানতাম না!",
  Promotional: "আজই আমাদের HSC মাস্টার কোর্সে enroll করো।",
  Inspirational: "তুমি পারবে — শুধু একটু বেশি চেষ্টা চাই।",
  Informational: "SSC '26 routine প্রকাশিত হয়েছে।",
  Humorous: "MCQ পরীক্ষায় ৫টা বাকি থাকতে যেই অবস্থা… 😅",
  Emotional: "মা যখন বললেন, 'তুই পারবি বাবা'…",
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

const LANGUAGE_EXAMPLES: Record<string, string> = {
  Bangla: "তুমি কি জানো এই trick-টা?",
  English: "The 5 most common SSC physics mistakes.",
  Mixed: "SSC '26 batch-এ enroll করার last day আজ — don't miss it!",
  Banglish: "Tumi ki janoo SSC-tey kon chapter sobcheye beshi ashe?",
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
    valueExamples?: Record<string, string>;
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
      valueExamples: HOOK_TYPE_EXAMPLES,
      accent: "from-brand-shikho-magenta to-brand-shikho-coral",
    },
    {
      title: "Spotlight Types",
      description: "What the post features. Strategy stage's teacher_rotation array uses these to balance creator visibility week to week.",
      values: spotlightTypes,
      valueDescriptions: SPOTLIGHT_TYPE_DESCRIPTIONS,
      valueExamples: SPOTLIGHT_TYPE_EXAMPLES,
      accent: "from-brand-amber to-brand-shikho-coral",
    },
    {
      title: "Caption Tone",
      description: "Caption voice / register (matches the caption_tone classifier field). Lower-cardinality dimension; useful for cross-format pattern detection.",
      values: tones,
      valueDescriptions: TONE_DESCRIPTIONS,
      valueExamples: TONE_EXAMPLES,
      accent: "from-brand-cyan to-brand-green",
    },
  ];

  // W4: build grouped audience structure from live data.
  // Live-check follow-up (2026-05-03): the live data carries labels like
  // "HSC students", "SSC students", "Junior (6-10)" — close to the
  // canonical AUDIENCE_GROUPS members ("HSC", "SSC", "Junior") but with
  // suffixes and parenthetical detail. Strict equality dropped them all
  // into "Other". Fix: substring-aware match — a live value belongs to a
  // group if any group member appears as a whole word inside it (or
  // exact-equal). Word-boundary regex keeps "SSC" from accidentally
  // matching anything containing the letters s-s-c. Falls back to
  // exact-equal for short labels (3 chars) where boundary noise is low.
  const audienceMatchesMember = (live: string, member: string): boolean => {
    const l = live.trim().toLowerCase();
    const m = member.trim().toLowerCase();
    if (!l || !m) return false;
    if (l === m) return true;
    // Word-boundary substring match. RegExp escape since members include
    // characters like "(" / ")" / hyphens.
    const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(live);
  };
  const audienceGroupsLive = AUDIENCE_GROUPS.map((g) => ({
    ...g,
    presentMembers: audiences.filter((a) => g.members.some((m) => audienceMatchesMember(a, m))),
  })).filter((g) => g.presentMembers.length > 0);
  // "Other" = anything that didn't land in any group.
  const claimedAudiences = new Set(
    audienceGroupsLive.flatMap((g) => g.presentMembers.map((a) => a.toLowerCase())),
  );
  const otherAudiences = audiences.filter((a) => !claimedAudiences.has(a.toLowerCase()));

  // W6: each definition gets a 1-line "key" (the headline-grade idea, scannable)
  // + a compact "def" (the longer explanation). Renders as bold key on top,
  // smaller def below — operators scanning the page can read just the keys.
  const definitions: { term: string; key: string; def: string }[] = [
    {
      term: "Week (Mon-Sun BDT)",
      key: "Every per-week tab is anchored to its running Monday in Bangladesh time.",
      def: "'Week of Apr 27' covers Apr 27 (Monday) through May 3 (Sunday). The Bangladesh team's working schedule means Sunday is a working day; Friday + Saturday are the weekend.",
    },
    {
      term: "Reach (unique reach)",
      key: "Distinct people who saw the post — the dashboard's primary scoring metric.",
      def: "Facebook insights' post_total_media_view_unique field. Different from media_views (total impressions including re-views) and from views (Reels-specific).",
    },
    {
      term: "Engagement Rate",
      key: "(Reactions + Comments + Shares) ÷ Reach, per post.",
      def: "Captures interaction density without bias toward larger-audience posts. Currently shown on Diagnosis verdict (~2.43% typical).",
    },
    {
      term: "Quality Engagement (candidate)",
      key: "Shares × 2 + Comments × 1, summed weekly — the high-intent subset of engagement.",
      def: "Excludes reactions because they're a low-effort reach proxy. Shares double-weighted because each share = unpaid distribution + algorithm reward. CANDIDATE north-star; being trialed alongside reach for 4 to 8 weeks before a canonical anchor decision.",
    },
    {
      term: "Interactions",
      key: "Reactions + Comments + Shares summed — dominated by reactions, behaves as a reach proxy.",
      def: "Reactions are ~80-90% of total. That's why we don't use this as the candidate north-star: Quality Engagement is the high-intent subset that strips reactions out.",
    },
    {
      term: "Hypothesis (h0 / h1 / h2 …)",
      key: "The weekly bets the strategy stage emits — what we're testing this week.",
      def: "h1 = primary strategic hypothesis (always set). h2+ = experiments to run. h0 = status-quo / null hypothesis. Each slot in the plan ties to a hypothesis_id; the chip on Plan/Outcomes/Diagnosis surfaces the actual statement on hover.",
    },
    {
      term: "Forecast band (CI)",
      key: "The 80% confidence interval for unique reach, stamped on every plan slot.",
      def: "Computed from Priors_Pillar × Priors_Format × Priors_AcademicSeason at plan time. Immutable once stamped. Outcome scoring compares actual reach against this band.",
    },
    {
      term: "Verdicts",
      key: "Hit / Exceeded / Missed / No-data / Preliminary — what happened vs the forecast band.",
      def: "Hit = actual landed inside the band. Exceeded = actual > band high. Missed = actual < band low. No-data = no matched post yet (forward-looking week or matcher couldn't join). Preliminary = post <7 days old; reach hasn't fully decayed; verdict shown but excluded from Calibration_Log.",
    },
    {
      term: "\"Scored on reach\" warning",
      key: "Appears on Outcomes when the slot targeted something other than reach (e.g. follows).",
      def: "The deterministic verdict still scores reach because that's the only dimension we have 90-day priors for. The chip tells you the slot's intent isn't being measured directly.",
    },
    {
      term: "\"Week-level fallback\" on source posts",
      key: "Diagnosis citation falls back to the week's top + under performers when a finding lacks specific post IDs.",
      def: "Appears on Key Findings and Watch-outs. Distinct from a precise per-finding citation; tells operators the link is inferred, not exact.",
    },
    {
      term: "Calibration",
      key: "How well the forecast bands actually contain reality — target is 80%.",
      def: "Target: 80% of slots should land inside the 80% CI. Drift below 70% over 4 weeks = priors are over-confident. Drift above 90% = bands too wide (calibrated but un-sharp).",
    },
    {
      term: "Hit Rate",
      key: "(Hit + Exceeded) ÷ (Hit + Exceeded + Missed) — excludes No-data and Preliminary.",
      def: "Shown on Outcomes rollup. Different from Calibration (which counts only Hit, not Exceeded).",
    },
    {
      term: "Mid-week vs End-of-week diagnosis",
      key: "Pipeline runs diagnosis twice per week — Thursday preliminary + Monday canonical.",
      def: "Mid-week (Thursday morning) writes engine='ai-midweek' on Mon-Wed data → labeled 'Preliminary, mid-week' on Diagnosis This Week. End-of-week (Monday morning) writes engine='ai' on the completed Mon-Sun → the canonical retrospective.",
    },
    {
      term: "\"Past-week immutability\"",
      key: "Once a Monday rolls over, that week's Plan + Outcomes are frozen.",
      def: "Pipeline writer refuses to overwrite past weeks unless force_regenerate=true is explicitly set. Preserves the contract Outcomes scores against.",
    },
    {
      term: "System Suggestions",
      key: "Auto-derived advisory suggestions, never auto-applied — the human decides each one.",
      def: "Written to System_Suggestions tab each weekly run (calibration drift, hypothesis retire, pillar over/underperform). The strategy prompt reads them as advisory context only. The team / human decides whether to follow each suggestion.",
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
            <div key={i} className="bg-ink-paper border border-ink-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-base ease-shikho-out overflow-hidden">
              {/* Color-coded header bar — uses each section's canonical
                  gradient. Operator can scan the page color-first and
                  navigate to the dimension they care about without reading
                  every title. */}
              <div className={`bg-gradient-to-r ${sec.accent} px-5 py-3 text-white`}>
                <h3 className="text-base font-semibold leading-tight">{sec.title}</h3>
                <p className="text-[11px] text-white/85 leading-snug mt-0.5">{sec.description}</p>
              </div>
              <div className="p-5">
                {sec.values.length === 0 ? (
                  <p className="text-xs text-ink-muted italic">No values found in current data.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {sec.values.map((v) => (
                      <li key={v} className="text-sm leading-snug">
                        <div>
                          <span className="font-medium text-ink-primary">{v}</span>
                          {sec.valueDescriptions?.[v] && (
                            <span className="ml-1.5 text-xs text-ink-muted">· {sec.valueDescriptions[v]}</span>
                          )}
                        </div>
                        {sec.valueExamples?.[v] && (
                          <div className="mt-0.5 text-[11px] text-ink-secondary italic leading-snug pl-2 border-l-2 border-ink-100">
                            e.g. {sec.valueExamples[v]}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 pt-2 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-muted">
                  {sec.values.length} distinct value{sec.values.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          ))}

          {/* Audiences — nested grouped (Students > Junior/SSC/HSC/Admission,
              Parents, Teachers, General). Sunrise gradient header to set it
              apart from the indigo/cyan/magenta core dimensions. */}
          <div className="bg-ink-paper border border-ink-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-base ease-shikho-out overflow-hidden">
            <div className="bg-gradient-to-r from-brand-shikho-indigo to-brand-cyan px-5 py-3 text-white">
              <h3 className="text-base font-semibold leading-tight">Audiences</h3>
              <p className="text-[11px] text-white/85 leading-snug mt-0.5">
                Primary target cohort the post is written for. Drives audience-segmented analysis.
              </p>
            </div>
            <div className="p-5">
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
                      <ul className="space-y-1 pl-3 border-l-2 border-shikho-indigo-100">
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
                      <ul className="space-y-1 pl-3 border-l-2 border-ink-100">
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
              <div className="mt-3 pt-2 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-muted">
                {audiences.length} distinct value{audiences.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          {/* Languages — inline pills (compact horizontal). Coral gradient. */}
          <div className="bg-ink-paper border border-ink-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-base ease-shikho-out overflow-hidden">
            <div className="bg-gradient-to-r from-brand-shikho-coral to-brand-shikho-magenta px-5 py-3 text-white">
              <h3 className="text-base font-semibold leading-tight">Languages</h3>
              <p className="text-[11px] text-white/85 leading-snug mt-0.5">
                Caption primary language. Affects audience reach (Bangla content reaches a different cohort than English).
              </p>
            </div>
            <div className="p-5">
              {languages.length === 0 ? (
                <p className="text-xs text-ink-muted italic">No values found in current data.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {languages.map((l) => (
                      <span
                        key={l}
                        className="inline-flex items-center text-xs font-semibold bg-gradient-to-r from-shikho-magenta-50 to-shikho-coral-50 text-brand-shikho-magenta border border-shikho-magenta-100 rounded-md px-2.5 py-1 shadow-xs"
                        title={LANGUAGE_DESCRIPTIONS[l] || undefined}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                  {languages.some((l) => LANGUAGE_DESCRIPTIONS[l] || LANGUAGE_EXAMPLES[l]) && (
                    <ul className="space-y-1 pt-1">
                      {languages
                        .filter((l) => LANGUAGE_DESCRIPTIONS[l] || LANGUAGE_EXAMPLES[l])
                        .map((l) => (
                          <li key={l} className="leading-snug">
                            <div className="text-[11px] text-ink-muted">
                              <span className="font-medium text-ink-secondary">{l}</span>
                              {LANGUAGE_DESCRIPTIONS[l] && <span className="ml-1.5">· {LANGUAGE_DESCRIPTIONS[l]}</span>}
                            </div>
                            {LANGUAGE_EXAMPLES[l] && (
                              <div className="mt-0.5 text-[11px] text-ink-secondary italic leading-snug pl-2 border-l-2 border-shikho-magenta-100">
                                e.g. {LANGUAGE_EXAMPLES[l]}
                              </div>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-muted">
                {languages.length} distinct value{languages.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          {/* Spotlight Names — separate full-width card, dedup'd live. */}
          <div className="md:col-span-2 bg-ink-paper border border-ink-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-base ease-shikho-out overflow-hidden">
            <div className="bg-gradient-to-r from-brand-amber to-brand-shikho-coral px-5 py-3 text-white">
              <h3 className="text-base font-semibold leading-tight">
                Spotlight Names
                <span className="ml-1.5 text-[10px] uppercase text-white/80 font-semibold">deduplicated</span>
              </h3>
              <p className="text-[11px] text-white/85 leading-snug mt-0.5">
                Distinct creator / product / campaign names tagged across all posts. Spotlight Type ↑ defines the kind; Spotlight Name is the specific instance.
              </p>
            </div>
            <div className="p-5">
              {spotlightNames.length === 0 ? (
                <p className="text-xs text-ink-muted italic">No spotlight names in current data.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {spotlightNames.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center text-[11px] font-medium bg-gradient-to-r from-amber-50 to-shikho-coral-50 text-brand-shikho-coral border border-shikho-coral-100 rounded-md px-2 py-1"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-2 border-t border-ink-100 text-[10px] uppercase tracking-wider text-ink-muted">
                {spotlightNames.length} distinct
              </div>
            </div>
          </div>
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
          {definitions.map((d, i) => {
            // Subject-aware accent: terms grouped into 4 visual families so the
            // grid scans by topic instead of as 15 identical cards. Reach/QE/
            // Engagement use indigo+magenta (the metric family); Verdict/Hit
            // Rate/Calibration use teal+cyan (the scoring family); Forecast/
            // Hypothesis/Past-week use sunrise (the strategy family); System
            // Suggestions/Mid-week use coral (the operational family).
            const accentClass =
              /(reach|engagement|quality engagement|interactions|metric)/i.test(d.term)
                ? "border-l-brand-shikho-magenta"
                : /(verdict|hit rate|calibration|score|prelim)/i.test(d.term)
                  ? "border-l-brand-teal"
                  : /(forecast|hypothesis|past-week|week|fallback)/i.test(d.term)
                    ? "border-l-brand-amber"
                    : "border-l-brand-shikho-coral";
            return (
              <Card key={i} className={`border-l-4 ${accentClass}`}>
                <h3 className="text-sm font-semibold text-ink-primary mb-1">{d.term}</h3>
                <p className="text-xs font-medium text-ink-secondary leading-snug mb-1.5">{d.key}</p>
                <p className="text-[11px] text-ink-muted leading-relaxed">{d.def}</p>
              </Card>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-[11px] text-ink-muted leading-relaxed">
        Taxonomy values are pulled live from your current data. Renames or new categories surface here automatically as they appear in posts. Definitions are versioned in <code className="text-[10px] px-1 py-0.5 rounded bg-ink-50">app/reference/page.tsx</code>; update there when terminology changes.
      </p>
    </div>
  );
}
