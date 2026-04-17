# Dashboard Workflow

How this dashboard actually runs, what it reads, and how it stays in sync
with the upstream pipeline. `README.md` is the deploy guide. `CHANGELOG.md`
is the week-over-week change log.

## What this dashboard is

A read-only Next.js 14 App Router app that renders Shikho's Facebook
organic-social analytics. Every number shown comes from a Google Sheet
populated by the weekly pipeline at
[Shikho-Edtech/organic-social-analytics](https://github.com/Shikho-Edtech/organic-social-analytics).
Zero Claude calls happen here. Zero writes happen here. It's a viewer.

## Runtime graph

```
                       Pipeline (separate repo, weekly cron)
                                       │
                                       ▼
                                Google Sheet (7 tabs)
                                       │
                                       │  service-account read
                                       ▼
                      Next.js server component (RSC)
                                       │
                                       ▼
                 lib/sheets.ts → lib/aggregate.ts → page.tsx
                                       │
                                       ▼
                          Client charts (Recharts)
                                       │
                                       ▼
                                    Browser
```

On every request the Server Component hits `lib/sheets.ts`, which hits
Google Sheets via the service account. Results are cached for 5 minutes
(Next.js `revalidate`) so a team of 10 poking around doesn't hammer the
Sheets API.

## Routes

| Path | Purpose | Primary data |
|---|---|---|
| `/` | This Week overview — verdict, KPIs, red flags, top performers, reach trend | `Weekly_Analysis` latest row + derived post stats |
| `/plan` | Next week's content calendar | `Content_Calendar` tab |
| `/trends` | Reach, engagement, follower trend lines over time | `Page_Daily` + aggregated `Raw_Posts` |
| `/engagement` | Reaction mix, comment patterns, by format | `Raw_Posts` + `Classifications` |
| `/timing` | Best hours, best days, BDT normalized | `Raw_Posts.created_time` |
| `/strategy` | Pillar × format × audience winners, hook-type lift | `Classifications` + perf metrics |
| `/explore` | Filter on any dimension, group by any dimension, interactive chart + table | All merged post data |
| `/login` | Password gate (AUTH_SECRET HMAC cookie) | — |
| `/api/auth/*` | Login handler and logout | — |
| `/api/data` | Cached JSON refresh endpoint | All tabs |

The dashboard used to describe `/playbook` in the README — that view was
folded into `/strategy` during the Day 1F UX redesign (commit `6d5ad66`).

## Data flow: `lib/sheets.ts`

One module, one responsibility per exported function. Each reads a tab
with `sheets.spreadsheets.values.get({ range: "TabName!A:Z" })` and
converts the 2D array to an array of plain objects via `rowsToObjects()`.

| Function | Tab(s) read | Output type |
|---|---|---|
| `getPosts()` | `Raw_Posts` + `Classifications` | `Post[]` (joined by Post ID) |
| `getDailyMetrics()` | `Page_Daily` | `DailyMetric[]` |
| `getVideoMetrics()` | `Raw_Video` | `VideoMetric[]` |
| `getDiagnosis()` | `Weekly_Analysis` | `Diagnosis` (latest row) |
| `getCalendar()` | `Content_Calendar` | `CalendarSlot[]` |

### The `getPosts()` join

This is the one place where a schema drift between pipeline and dashboard
would bite. `Raw_Posts` is indexed by Post ID. `Classifications` is
indexed by Post ID. We do an in-memory left-join (every Raw_Posts row
survives, even if its classification is missing).

The merge picks fields from both sides:

- From `Raw_Posts`: `created_time, type, message, reactions, comments,
  shares, media_views, unique_views, clicks, reactions-by-emoji, is_reel`.
- From `Classifications`: `content_pillar, funnel_stage, caption_tone,
  language, has_cta, cta_type, exam_relevance, hook_type, visual_style,
  primary_audience, spotlight_type, spotlight_name,
  classifier_confidence, prompt_version, manual_override`.
- Derived: `format` — computed from `c["Format"]` if present (legacy
  rows), else `"Reel"` when `is_reel`, else `Type.titlecase()`. Day 2E.4
  dropped Format from Classifications; this fallback is how post-2E.4
  rows still get a display format.

### The calendar read path

`getCalendar()` reads `Content_Calendar` row by row. Each row has both
the legacy `Featured Entity` column and the v2 `Spotlight Type` /
`Spotlight Name` columns (Day 2E.2 widened the writer to 18 cols). The
plan page prefers `spotlight_name`, appends `(spotlight_type)` when
present, and falls back to `featured_entity` when the row is from a
pre-v2 calendar. Same defensive pattern as `getPosts()` — newer rows
have richer fields, older rows still render.

## Aggregation (`lib/aggregate.ts`)

All derived numbers — engagement rates, pillar distributions, "top
performers" lists, WoW deltas — live in `lib/aggregate.ts` and take the
raw typed arrays from `lib/sheets.ts` as input. Keeping aggregation out
of the page files means every page that needs "avg engagement rate per
pillar" calls the same function and gets the same answer.

Engagement rate formula is a single source of truth here, documented in
the `DataFooter` component shown on every authenticated page.

## Caching

Next.js `revalidate` is set per-route. Most pages use 300 s (5 min).
Team of 10 refreshing views every 30 s caps at 12 Sheets reads per page
per hour, well under any quota.

Cache keys are per-tab-per-process. A Vercel serverless invocation that
already read `Raw_Posts` in the last 5 min will serve the cached copy.
Cross-invocation cache is implicit via the 5-minute window.

## Authentication

Minimal password gate, not user accounts:

1. `middleware.ts` runs on every non-`/login`, non-`/api/auth` route.
2. It verifies an HMAC-signed cookie (`auth-token`) using Web Crypto API
   (no Node-only libs — has to work on Vercel Edge).
3. Missing or invalid cookie → redirect to `/login`.
4. `/login` POSTs password to `/api/auth/login`. If it matches
   `DASHBOARD_PASSWORD`, the server mints an HMAC cookie using
   `AUTH_SECRET` and sets it. 30-day expiry.
5. `/api/auth/logout` clears the cookie.

This is intentionally simple. No DB, no session store, no user roles.
If the team outgrows it, we'll move to NextAuth. Not worth the weight
at 5 - 10 users.

## Environment variables

Runtime config, all set in Vercel project settings:

| Name | Purpose |
|---|---|
| `GOOGLE_SHEETS_CREDS_JSON` | Same service account JSON the pipeline uses (read-only scope is fine here) |
| `GOOGLE_SPREADSHEET_ID` | ID from the spreadsheet URL |
| `DASHBOARD_PASSWORD` | Team login password |
| `AUTH_SECRET` | 64-char hex for HMAC signing |

Local dev reads from `.env.local` (gitignored). `.env.example` is the
template.

## Pipeline contract

The dashboard reads exactly these tabs with exactly these columns:

| Tab | Columns the dashboard reads | Notes |
|---|---|---|
| `Raw_Posts` | Post ID, Created Time, Type, Message, Reactions, Comments, Shares, Media Views, Unique Views, Clicks, emoji reactions, Is Reel | 19 cols total |
| `Classifications` | Post ID, Content Pillar, Funnel Stage, Caption Tone, Language, Has CTA, CTA Type, Exam Relevance, Hook Type, Visual Style, Primary Audience, Spotlight Type, Spotlight Name, Classifier Confidence, Prompt Version, Manual Override | 16 cols post Day 2E.4 |
| `Page_Daily` | Date, follower counts, view counts, reaction totals | 13 cols |
| `Raw_Video` | Post ID, Is Reel, Total Views, Avg Watch Time, Reel-specific metrics, Retention Data | 18 cols |
| `Weekly_Analysis` | latest row only: Headline, Posts This Week, Avg Engagement, what_happened, performers, watch_outs, Full Diagnosis | 11 cols |
| `Content_Calendar` | Day, Date, Time (BDT), Format, Pillar, Featured Entity, Spotlight Type, Spotlight Name, Hook Line, Key Message, Visual Direction, CTA, Funnel Stage, Language, Audience, Rationale, Expected Reach, Success Metric | 18 cols post Day 2E.2 |

**Whenever the pipeline changes a column name or order**, the dashboard
needs a matching change in `lib/sheets.ts` (reader) and potentially
`lib/types.ts` (shape). See the pipeline's `WORKFLOW.md` for schema
migration semantics on the writer side — the `_merge_write` schema-
mismatch fallback is what lets both sides move forward without a manual
tab clear.

## Deploy and update

- **Deploy** — Vercel auto-builds on every push to `main`. ~2 min build.
- **Rollback** — Vercel dashboard → Deployments → pick an older success
  → "Promote to Production". Zero-downtime.
- **Schema changes** — land them in the pipeline first, let one weekly
  run populate the Sheet with the new columns, then push the matching
  dashboard change. The dashboard's defensive `c["NewCol"] || fallback`
  pattern means the two sides don't have to land atomically.

## Fixer-script pattern

Behavior-changing edits to `lib/sheets.ts`, `lib/types.ts`,
`lib/aggregate.ts`, and page files are landed via deterministic
fixer scripts one directory up
(`D:/Shahriar/Claude/Shikho/apply_day2*.py`). Same pattern as the
pipeline:

- Verbatim-string replacements with an `APPLIED_MARKER` idempotency check.
- `.bak` files written before every change
  (e.g. `sheets.ts.d2e4.bak`).
- `--dry-run` previews byte-delta without writing.
- `--revert` restores from the `.bak`.

Backups follow the pattern `<filename>.d<day><letter>.bak` and are
gitignored.

## Cost

**$0/month** at current scale. Vercel free tier (well under 100 GB-hours
bandwidth/month for a 10-person team). Google Sheets API is free.
No Claude calls from the dashboard.
