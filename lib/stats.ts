// Day 2O: shared confidence-interval helpers for ranking.
//
// Philosophy: rank aggregations by the 95% CI lower bound of their mean,
// not the mean itself. A slot with n=1 and a viral outlier has an
// undefined / -Infinity lower bound, so it can never win a "Best X" KPI.
// A slot with n=50 and tight spread ranks by what you can actually rely on.
//
// The raw mean is still shown on bars and in tooltips — lower bound is a
// ranking-time concept, not a display-time one. Outliers stay visible in
// Top-N lists (where n=1 is the point), never in aggregates.

// Student-t critical value at alpha=0.025 (two-sided 95% CI).
// Lookup for small df, normal approximation (1.96) for df >= 60.
const T_95: Record<number, number> = {
  1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.37,
  8: 2.31, 9: 2.26, 10: 2.23, 11: 2.20, 12: 2.18, 13: 2.16, 14: 2.14,
  15: 2.13, 16: 2.12, 17: 2.11, 18: 2.10, 19: 2.09, 20: 2.09,
  25: 2.06, 30: 2.04, 40: 2.02, 60: 2.00,
};

export function tCritical95(df: number): number {
  if (df <= 0) return Infinity;
  if (df >= 60) return 1.96;
  if (T_95[df] !== undefined) return T_95[df];
  // Linear interp between nearest tabulated df values.
  const keys = Object.keys(T_95).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const lo = keys[i];
      const hi = keys[i + 1];
      const frac = (df - lo) / (hi - lo);
      return T_95[lo] * (1 - frac) + T_95[hi] * frac;
    }
  }
  return 1.96;
}

export type Summary = {
  n: number;
  sum: number;
  mean: number;
  stddev: number;
  stderr: number;
  /** 95% CI lower bound of the mean. -Infinity when n < 2 (cannot estimate). */
  lowerBound95: number;
  /** 95% CI upper bound of the mean. +Infinity when n < 2. */
  upperBound95: number;
};

/**
 * Summarize an array of numeric observations with mean + 95% CI bounds.
 *
 * Use `lowerBound95` to rank groups. Bar charts should still display `mean`
 * so the chart doesn't hide the raw signal — the CI is a ranking device.
 */
export function summarize(values: number[]): Summary {
  const n = values.length;
  if (n === 0) {
    return {
      n: 0, sum: 0, mean: 0, stddev: 0, stderr: Infinity,
      lowerBound95: -Infinity, upperBound95: Infinity,
    };
  }
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  if (n === 1) {
    // One observation: mean is defined, but variance is undefined — cannot
    // form a CI. Treat as max-uncertain so this group ranks last.
    return {
      n, sum, mean, stddev: Infinity, stderr: Infinity,
      lowerBound95: -Infinity, upperBound95: Infinity,
    };
  }
  let ss = 0;
  for (const v of values) ss += (v - mean) ** 2;
  const variance = ss / (n - 1);
  const stddev = Math.sqrt(variance);
  const stderr = stddev / Math.sqrt(n);
  const t = tCritical95(n - 1);
  return {
    n, sum, mean, stddev, stderr,
    lowerBound95: mean - t * stderr,
    upperBound95: mean + t * stderr,
  };
}

/**
 * Pick the entry with the highest lower-bound score. Ties broken by mean.
 * Falls back to the highest-mean entry only when every candidate has n<2
 * (i.e. nothing in the pool is rankable by CI).
 */
export function bestByLowerBound<T>(
  items: T[],
  getSummary: (x: T) => Summary,
): T | undefined {
  if (items.length === 0) return undefined;
  const ranked = [...items].sort((a, b) => {
    const sa = getSummary(a);
    const sb = getSummary(b);
    if (sa.lowerBound95 === sb.lowerBound95) return sb.mean - sa.mean;
    return sb.lowerBound95 - sa.lowerBound95;
  });
  // If the best candidate's lower bound is -Infinity, nothing is rankable —
  // fall back to the highest raw mean.
  const top = ranked[0];
  if (!isFinite(getSummary(top).lowerBound95)) {
    return [...items].sort((a, b) => getSummary(b).mean - getSummary(a).mean)[0];
  }
  return top;
}

/**
 * Day 2S: minimum sample size required for a category bar (timing slot,
 * day of week, etc.) to be shown at all. Scales with range length.
 *
 * Anchors from the user spec:
 *   7d  → 3
 *   14d → 5
 *   30d → 10
 *
 * Extrapolated for wider ranges so the threshold stays useful without
 * hiding everything on long windows.
 */
export function minPostsForRange(days: number): number {
  if (days <= 7)   return 3;
  if (days <= 14)  return 5;
  if (days <= 30)  return 10;
  if (days <= 60)  return 15;
  if (days <= 90)  return 20;
  if (days <= 180) return 30;
  return 50;
}

/** Short label for n-based reliability, shown next to KPI values. */
export function reliabilityLabel(n: number): string {
  if (n === 0) return "no data";
  if (n === 1) return "n=1 · not reliable";
  if (n < 5) return `n=${n} · low confidence`;
  if (n < 10) return `n=${n} · medium confidence`;
  return `n=${n} · high confidence`;
}
