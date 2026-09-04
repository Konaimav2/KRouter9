// KRouter9 session affinity — pin a conversation to the same account/connection
// across requests so multi-turn context stays on one upstream account.
// Keyed by: client API key + first user message hash (stable conversation id).
// TTL default 30m. Fail-open: any error → null (normal account selection).
import { createHash } from "node:crypto";

const _map = new Map(); // convId -> { connectionId, provider, expiresAt }

export function conversationId(apiKey, messages) {
  try {
    const firstUser = (Array.isArray(messages) ? messages : []).find(m => m?.role === "user");
    const text = typeof firstUser?.content === "string"
      ? firstUser.content
      : JSON.stringify(firstUser?.content || "").slice(0, 4000);
    return createHash("sha256").update(`${apiKey || "nokey"}::${text.slice(0, 2000)}`).digest("hex").slice(0, 24);
  } catch { return null; }
}

export function getAffinity(convId) {
  try {
    if (!convId) return null;
    const hit = _map.get(convId);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) { _map.delete(convId); return null; }
    return hit;
  } catch { return null; }
}

export function setAffinity(convId, connectionId, provider, ttlMs = 30 * 60 * 1000) {
  try {
    if (!convId || !connectionId) return;
    // cap size
    if (_map.size > 5000) {
      const oldest = _map.keys().next().value;
      _map.delete(oldest);
    }
    _map.set(convId, { connectionId, provider, expiresAt: Date.now() + ttlMs });
  } catch { /* fail-open */ }
}

export function clearAffinity(convId) { if (convId) _map.delete(convId); }
export function affinitySize() { return _map.size; }
