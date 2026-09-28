// Fixed-window rate limiter for the single-record proxy reveal endpoint.
// Keyed by caller IP (derived via getClientIp, same as the login limiter).
// Separate from the API-key RPM limiter in rateLimit.js: this guards a
// dashboard-authenticated secret readout, not upstream inference traffic.
const WINDOW_MS = 60_000;
const LIMIT = 10;
const MAX_BUCKETS = 5000;

const buckets = new Map(); // ip -> { count, resetAt }

function enforceCap(now) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [k, e] of buckets) {
    if (e.resetAt <= now) buckets.delete(k);
  }
  if (buckets.size > MAX_BUCKETS) {
    const over = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (++removed >= over) break;
    }
  }
}

export const REVEAL_RATE_LIMIT = LIMIT;
export const REVEAL_RATE_WINDOW_MS = WINDOW_MS;

export function checkRevealRateLimit(key) {
  const now = Date.now();
  const k = String(key || "unknown");
  const entry = buckets.get(k);
  if (!entry || entry.resetAt <= now) {
    buckets.set(k, { count: 1, resetAt: now + WINDOW_MS });
    enforceCap(now);
    return { ok: true };
  }
  entry.count += 1;
  if (entry.count > LIMIT) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      limit: LIMIT,
    };
  }
  return { ok: true };
}

export function resetRevealRateLimits() {
  buckets.clear();
}
