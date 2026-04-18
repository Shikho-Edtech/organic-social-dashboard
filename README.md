# Shikho Organic Social Dashboard

Interactive analytics dashboard for Shikho's organic social content. Reads
live from the Google Sheet populated by the weekly pipeline at
[Shikho-Edtech/organic-social-analytics](https://github.com/Shikho-Edtech/organic-social-analytics).

**Zero marginal cost per user interaction** — all data comes from cached Google Sheets;
no Claude API calls happen in the dashboard.

## Views

- **/** — Overview: 5 headline KPIs, reach trend, format mix, content-pillar reach, biggest movers
- **/trends** — Time-based patterns: posting volume, daily reach, week-over-week deltas
- **/engagement** — What drives interaction: format performance, hook types, engagement mix
- **/reels** — Video watch time, retention funnel, follower conversion (Bangladesh Time)
- **/timing** — Day × hour heatmap for engagement rate and reach (Bangladesh Time)
- **/strategy** — Claude's weekly diagnosis and recommended actions (staleness-aware)
- **/plan** — Next week's content calendar with hook lines and expected reach (staleness-aware)
- **/explore** — Filter-first workbench: sticky filters, paginated top posts, slice-and-dice charts

## Deploy to Vercel (5 minutes)

### 1. Generate an auth secret

```bash
# Linux/Mac:
openssl rand -hex 32

# Windows PowerShell:
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

### 2. Import to Vercel

1. Go to https://vercel.com/new
2. Import this repository
3. Framework auto-detects as Next.js
4. Leave Root Directory as default (the whole repo is the dashboard)

### 3. Add environment variables

| Name | Value |
|---|---|
| `GOOGLE_SHEETS_CREDS_JSON` | Same service account JSON the pipeline uses |
| `GOOGLE_SPREADSHEET_ID` | Spreadsheet ID from the URL |
| `DASHBOARD_PASSWORD` | Password your team will use to sign in |
| `AUTH_SECRET` | The 64-char hex string from step 1 |

### 4. Click Deploy

Build takes ~2 minutes. You'll get a URL like `organic-social-dashboard.vercel.app`.

### 5. Sign in

Visit the URL → enter password → you're in.

## Data source

Reads these tabs from the Google Sheet:
- `Raw_Posts` + `Classifications` (merged by Post ID)
- `Page_Daily`
- `Raw_Video`
- `Weekly_Analysis` (latest row)
- `Content_Calendar`

Refreshes every 5 minutes (Next.js revalidate).

## Local dev

```bash
npm install
cp .env.example .env.local  # fill in values
npm run dev
```

Visit http://localhost:3000

## Cost

**$0/month.** Vercel free tier + Google Sheets API (free) + no Claude calls from the dashboard.

## Pipeline

This is the read-only UI. The Claude-powered weekly pipeline that writes to
the Google Sheet lives at
[Shikho-Edtech/organic-social-analytics](https://github.com/Shikho-Edtech/organic-social-analytics).
