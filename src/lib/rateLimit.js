// Rate limiter ported from srouter (seaavey/SRouter, MIT)
// Fixed-window per API-key + client address. rate_limit = req/min, 0 = unlimited.
const WINDOW_MS = 60_000;
const TPM_WINDOW_MS = 60_000;
const windows = new Map();
const tpmWindows = new Map();

// Read the cap dynamically so a Settings change (mirrored to env) applies
// without a restart.
function maxTrackedKeys() {
  const n = Number(process.env.RATE_LIMIT_MAP_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10_000;
}

// P3: evict expired entries, and if still over cap, evict oldest (insertion
// order) so an attacker rotating live keys cannot grow the map unbounded.
function enforceCap(map, now) {
  const cap = maxTrackedKeys();
  if (map.size <= cap) return;
  for (const [k, e] of map) if (e.resetAt <= now) map.delete(k);
  if (map.size > cap) {
    const over = map.size - cap;
    let removed = 0;
    for (const k of map.keys()) {
      map.delete(k);
      if (++removed >= over) break;
    }
  }
}

export function checkRateLimit(keyId, clientAddr, limit) {
  if (!keyId || !limit || limit <= 0) return { ok: true };
  const now = Date.now();
  const wk = `${keyId}:${clientAddr || "unknown"}`;
  const entry = windows.get(wk);
  if (!entry || entry.resetAt <= now) {
    windows.set(wk, { count: 1, resetAt: now + WINDOW_MS });
    enforceCap(windows, now);
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

// KRouter9 (0.5.77): per-key TPM limiter — fixed 60s window of estimated
// tokens. 0/unset = unlimited. Call AFTER the request's token usage is known
// (or pre-check with the request's estimated input tokens).
export function checkTpmLimit(keyId, tokens, limit) {
  if (!keyId || !limit || limit <= 0) return { ok: true };
  const now = Date.now();
  const n = Number(tokens) || 0;
  const entry = tpmWindows.get(keyId);
  if (!entry || entry.resetAt <= now) {
    tpmWindows.set(keyId, { used: n, resetAt: now + TPM_WINDOW_MS });
    enforceCap(tpmWindows, now);
    return n > limit
      ? { ok: false, retryAfterSec: Math.ceil(TPM_WINDOW_MS / 1000), limit }
      : { ok: true };
  }
  if (entry.used + n > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)), limit };
  }
  entry.used += n;
  return { ok: true };
}

export function resetTpmLimits(keyId) {
  if (keyId) tpmWindows.delete(keyId);
  else tpmWindows.clear();
}
