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
  if (!res.ok) throw new Error(data.error || "Failed to reveal API key");
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
