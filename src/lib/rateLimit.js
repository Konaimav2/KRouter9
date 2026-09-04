// Rate limiter ported from srouter (seaavey/SRouter, MIT)
// Fixed-window per API-key + client address. rate_limit = req/min, 0 = unlimited.
const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;
const windows = new Map();

export function checkRateLimit(keyId, clientAddr, limit) {
  if (!keyId || !limit || limit <= 0) return { ok: true };
  const now = Date.now();
  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [k, e] of windows) if (e.resetAt <= now) windows.delete(k);
  }
  const wk = `${keyId}:${clientAddr || "unknown"}`;
  const entry = windows.get(wk);
  if (!entry || entry.resetAt <= now) {
    windows.set(wk, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)), limit };
  }
  return { ok: true };
}

export function resetRateLimits(keyId) {
  if (keyId) { for (const k of [...windows.keys()]) if (k.startsWith(keyId + ":")) windows.delete(k); }
  else windows.clear();
}
