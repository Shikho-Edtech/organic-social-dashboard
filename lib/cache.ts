// Read-side resilience layer (2026-05-03 incident follow-up).
//
// Background: the 2026-05-02 production incident wiped Content_Calendar
// mid-write because the pipeline's _atomic_replace_tab pattern wasn't
// in place yet. The dashboard's server components read from Sheets on
// every (ISR-cached) request — when the sheet was empty / partial, the
// pages 500'd via app/error.tsx. From the user's perspective, every
// transient blip looks like a hard outage.
//
// This module adds a "last-known-good" fallback layer:
//   - withLastGood(key, fetch, isEmpty?) caches the most recent
//     successful read in a module-level Map. On fetch failure, OR on
//     fetch returning empty data when the cache holds non-empty, it
//     returns the cached value AND marks the read as stale.
//   - isStaleNow() / getStaleReasons() let pages render a soft
//     "data may be refreshing" banner instead of crashing.
//
// Trade-offs (honest):
//   - Module-level state lives in a single Vercel serverless function
//     instance. Cold starts reset the cache. That's fine — the FIRST
//     successful read after a cold start populates the cache and
//     subsequent failures fall back to it.
//   - recentStales is also module-level, so concurrent requests in the
//     same function instance share the staleness flag. A flag set by
//     one request can leak into a second concurrent request's render.
//     In practice that's benign — a banner showing for one extra
//     request after the issue resolves. Better than no banner.
//   - The setTimeout-based stale-clear may not fire in serverless
//     contexts (function frozen between requests). The size check at
//     read time is the actual gate; setTimeout is a best-effort cleanup.

const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24h
// Banner-flag TTL. Was 5 min; that was too eager — false-positive
// "DATA REFRESHING" lingered on pages that had a single legitimately-
// empty week-specific read (e.g. a week with no diagnosis row). 60s
// matches the Sheets per-minute quota window: a real outage clears
// itself within one ISR refresh cycle, but a one-off empty doesn't
// haunt the page for 5 minutes.
const STALE_FLAG_TTL_MS = 60 * 1000; // 60 sec

// Module-level cache of (key → last-known-good payload + timestamp).
const cache = new Map<string, { data: unknown; ts: number }>();

// Set of keys whose most recent withLastGood call returned a fallback
// (cached) value. Pages can call isStaleNow() to decide whether to
// render the banner.
const recentStales = new Map<string, { reason: string; ts: number }>();

/**
 * Wrap a read function with last-known-good fallback.
 *
 * On fresh fetch success → cache the result, return it, mark non-stale.
 * On fresh fetch failure → if cache has the key (within MAX_CACHE_AGE_MS),
 *                         return cached value, mark stale, log reason.
 *                         Otherwise: return `coldFallback` if provided,
 *                         else re-throw the original error so the page's
 *                         error.tsx still fires.
 * On fresh fetch returning "empty" (per caller's predicate) when cache
 *   has a non-empty version → return cached. This catches the case where
 *   Sheets reads succeed at the API level but the data is genuinely
 *   empty (e.g., a tab was wiped and not yet repopulated).
 *
 * `coldFallback` (added 2026-05-03 incident #2): the "no cache + fetch
 * fails" case is the COLD-START failure mode. Without this, every cold
 * Vercel function instance that hits a Sheets transient takes down the
 * page. Pass a sensible default value (null, [], "unknown", etc.) for
 * readers whose consumers gracefully handle "no data". For data-bearing
 * reads where there's nothing useful to render without them (e.g.
 * getPosts), omit it — re-throwing is correct so error.tsx fires.
 */
export async function withLastGood<T>(
  key: string,
  fetcher: () => Promise<T>,
  isEmpty?: (data: T) => boolean,
  opts?: { coldFallback?: T },
): Promise<T> {
  let data: T;
  try {
    data = await fetcher();
  } catch (err) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < MAX_CACHE_AGE_MS) {
      const msg = err instanceof Error ? err.message : String(err);
      markStale(key, `fetch failed: ${msg.slice(0, 200)}`);
      // eslint-disable-next-line no-console
      console.warn(`[cache] using last-good for ${key} (${msg.slice(0, 200)})`);
      return cached.data as T;
    }
    // No cache. If caller declared a cold-fallback (the "I have a sensible
    // default" pattern), return it AND mark stale so any banner can fire.
    // Otherwise re-throw so error.tsx renders.
    if (opts && "coldFallback" in opts) {
      const msg = err instanceof Error ? err.message : String(err);
      markStale(key, `cold-start fetch failed: ${msg.slice(0, 200)}`);
      // eslint-disable-next-line no-console
      console.warn(`[cache] cold-start fail on ${key}; using coldFallback (${msg.slice(0, 200)})`);
      return opts.coldFallback as T;
    }
    throw err;
  }

  // Fresh data is in hand. If the caller declared a "this is empty"
  // predicate AND the fresh data is empty BUT we have a populated
  // cached version, prefer the cache. This catches transient sheet
  // wipes / mid-write reads that succeed at the API level but return
  // nothing useful.
  //
  // IMPORTANT: this fallback is SILENT — we DON'T call markStale().
  // Empty-fresh-vs-cached is ambiguous (could be a wipe, could be a
  // legitimate "no data for this week"). False-positive banners on
  // legitimately-empty week-specific reads are worse than silent
  // recovery from a transient wipe. Only fetcher-throw triggers the
  // banner — that's the case we're certain about.
  if (isEmpty && isEmpty(data)) {
    const cached = cache.get(key);
    if (cached && !isEmpty(cached.data as T)) {
      // eslint-disable-next-line no-console
      console.warn(`[cache] fresh read of ${key} returned empty; using cached (silent)`);
      return cached.data as T;
    }
  }

  // Either non-empty fresh data, or fresh-empty with no better cache.
  // Either way, persist to cache and clear staleness for this key.
  cache.set(key, { data, ts: Date.now() });
  recentStales.delete(key);
  return data;
}

function markStale(key: string, reason: string) {
  recentStales.set(key, { reason, ts: Date.now() });
  // Best-effort cleanup. Serverless function freezing may delay this;
  // isStaleNow() also filters by TTL so a missed timeout is harmless.
  setTimeout(() => {
    const cur = recentStales.get(key);
    if (cur && Date.now() - cur.ts >= STALE_FLAG_TTL_MS) {
      recentStales.delete(key);
    }
  }, STALE_FLAG_TTL_MS).unref?.();
}

/**
 * Has any read in the last STALE_FLAG_TTL_MS fallen back to cache?
 * Pages call this to decide whether to render the StaleDataBanner.
 */
export function isStaleNow(): boolean {
  const cutoff = Date.now() - STALE_FLAG_TTL_MS;
  for (const [, v] of recentStales) {
    if (v.ts >= cutoff) return true;
  }
  return false;
}

/**
 * Get a human-readable list of recent stale reads + reasons.
 * Used by the banner to surface what's lagging.
 */
export function getStaleReasons(): { key: string; reason: string; ageMs: number }[] {
  const now = Date.now();
  const cutoff = now - STALE_FLAG_TTL_MS;
  const out: { key: string; reason: string; ageMs: number }[] = [];
  for (const [key, v] of recentStales) {
    if (v.ts >= cutoff) {
      out.push({ key, reason: v.reason, ageMs: now - v.ts });
    }
  }
  return out;
}

/** Test hook — clears all cache + staleness state. Not used in prod. */
export function _clearCacheForTests() {
  cache.clear();
  recentStales.clear();
}
