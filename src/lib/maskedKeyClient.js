// Client-safe masked-key helpers (no secrets, no node imports).
//
// GET /api/keys returns masked rows only (id/name/maskedKey/isActive — never
// raw). Consumers must select by ID, display the masked value, and resolve
// ONLY the chosen credential through the guarded single-record reveal
// endpoint. Raw secrets are never read from list payloads.

export async function revealKeyById(id, fetchImpl = fetch) {
  if (!id) throw new Error("No API key selected");
  const res = await fetchImpl(`/api/keys/${encodeURIComponent(id)}/reveal?confirm=true`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Carry the HTTP status (and Retry-After) so callers can tell the reveal
    // limiter (429) apart from auth or not-found failures. Never the key.
    const err = new Error(data.error || "Failed to reveal API key");
    err.status = res.status;
    const retryAfter = Number(res.headers?.get?.("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfter = retryAfter;
    throw err;
  }
  if (!data.key) throw new Error("Reveal returned no key");
  return data.key;
}

export function pickDefaultKeyId(keys) {
  const list = Array.isArray(keys) ? keys : [];
  return list.find((k) => k && k.isActive !== false && k.id)?.id ?? null;
}

export function labelForMaskedKey(k) {
  if (!k) return "masked";
  return `${k.name || k.id} (${k.maskedKey || "masked"})`;
}

// True while Run/Start/Copy must stay disabled: a masked list exists but no
// raw credential has been resolved yet (still resolving, or reveal failed).
// Empty/missing list means manual entry — nothing to resolve, not blocked —
// but ONLY once the initial list load has settled: while the list is still
// loading (or its load failed), emptiness is unknown, so gate closed.
// Extra fields (loading / keysError) are optional so existing callers that
// pass only { keys, rawKey, resolving, error } keep their behavior.
export function isKeyActionBlocked({ keys, rawKey, resolving, error, loading, keysError }) {
  const list = Array.isArray(keys) ? keys : [];
  if (loading) return true;
  if (keysError) return true;
  if (resolving) return true;
  if (error) return true;
  if (list.length === 0) return false;
  return !rawKey;
}

// Gate for Run/Start/Copy under the reveal-on-click model (ui-fix Wave B).
// It deliberately never looks at rawKey, resolving or the reveal error: the
// raw key is resolved lazily at click time, so the reveal limiter (429) can
// never disable the action. Only an unsettled or failed key LIST, or a
// non-empty list with nothing selected, blocks. An empty settled list means
// manual entry / keyless mode, which the caller decides.
export function isRunBlocked({ keys, selectedId, loading, keysError } = {}) {
  const list = Array.isArray(keys) ? keys : [];
  if (loading) return true;
  if (keysError) return true;
  if (list.length > 0 && !selectedId) return true;
  return false;
}

// How long a resolved key may stay cached after its reveal. Matches the
// 30s reveal display window (REVEAL_AUTO_HIDE_MS in useOnDemandKey).
export const ON_DEMAND_KEY_TTL_MS = 30000;

// On-demand single-key resolver. Concurrent requests for the same id share
// one in-flight reveal; a resolved key stays cached only for `ttlMs` (the
// display window) and only inside this closure (never in rendered state). A
// different id, clear(), expiry, or a failed reveal drops the cached value,
// so a retry after a 429 really asks the server again.
export function createOnDemandKey(fetchImpl, { ttlMs = ON_DEMAND_KEY_TTL_MS } = {}) {
  let cachedId = null;
  let cached = null;
  let expiry = null;
  const drop = () => {
    if (expiry) {
      clearTimeout(expiry);
      expiry = null;
    }
    cachedId = null;
    cached = null;
  };
  return {
    get(id) {
      if (!id) return Promise.reject(new Error("No API key selected"));
      if (cached && cachedId === id) return cached;
      drop();
      cachedId = id;
      const pending = revealKeyById(id, fetchImpl || ((...args) => fetch(...args)));
      cached = pending;
      pending.then(
        () => {
          if (cached !== pending) return;
          expiry = setTimeout(() => {
            expiry = null;
            if (cached === pending) { cached = null; cachedId = null; }
          }, ttlMs);
        },
        () => {
          if (cached === pending) { cached = null; cachedId = null; }
        },
      );
      return pending;
    },
    clear: drop,
  };
}

// Human-readable reveal failure. A 429 names the limiter and tells the user
// to retry; it never implies the page itself is broken.
export function describeRevealError(err) {
  if (err?.status === 429) {
    const wait = err.retryAfter ? ` in about ${err.retryAfter}s` : " in a moment";
    return `Key reveal limit reached (HTTP 429). The page still works; press Retry${wait}.`;
  }
  return err?.message || "Failed to reveal API key";
}

// Placeholder shown in curl/config text in place of a stored key.
export function maskedKeyToken(k) {
  return k?.maskedKey || "YOUR_KEY";
}
