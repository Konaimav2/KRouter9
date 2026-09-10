// Rate limiter ported from srouter (seaavey/SRouter, MIT)
// Fixed-window per API-key + client address. rate_limit = req/min, 0 = unlimited.
const WINDOW_MS = 60_000;
const TPM_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;
const windows = new Map();
const tpmWindows = new Map();

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

// KRouter9 (0.5.77): per-key TPM limiter — fixed 60s window of estimated
// tokens. 0/unset = unlimited. Call AFTER the request's token usage is known
// (or pre-check with the request's estimated input tokens).
export function checkTpmLimit(keyId, tokens, limit) {
  if (!keyId || !limit || limit <= 0) return { ok: true };
  const now = Date.now();
  if (tpmWindows.size > MAX_TRACKED_KEYS) {
    for (const [k, e] of tpmWindows) if (e.resetAt <= now) tpmWindows.delete(k);
  }
  const n = Number(tokens) || 0;
  const entry = tpmWindows.get(keyId);
  if (!entry || entry.resetAt <= now) {
    tpmWindows.set(keyId, { used: n, resetAt: now + TPM_WINDOW_MS });
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
