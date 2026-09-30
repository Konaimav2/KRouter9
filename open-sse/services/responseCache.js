/**
 * Own response cache (W14) — exact-match cache for providers without a cache
 * option, cutting token spend on repeated identical requests.
 *
 * Conservative by design:
 * - Non-streaming completions only; tools present → skip (dynamic).
 * - Key binds provider + model + canonical params + caller identity: cached rows
 *   never cross users/keys (TIPS §19: identity in the key).
 * - Only 2xx complete responses are stored; failures never populate.
 * - Hits still record zero-token usage rows so analytics stay honest.
 * - Storage is the existing `kv` table (scope `responseCache`), no migration.
 */

import { createHash } from "node:crypto";

export const RESPONSE_CACHE_SCOPE = "responseCache";
export const DEFAULT_RESPONSE_CACHE_TTL_MS = 60 * 60 * 1000;
export const RESPONSE_CACHE_MAX_ROWS = 1000;

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

/**
 * Canonical cache key: sha256 hex over provider, model, stable params, identity.
 * Params exclude volatile fields (stream flag handled by isCacheableRequest).
 */
export async function buildCacheKey({ provider, model, body, apiKeyId }) {
  const params = {
    messages: body?.messages ?? null,
    temperature: body?.temperature ?? null,
    top_p: body?.top_p ?? null,
    max_tokens: body?.max_tokens ?? body?.max_output_tokens ?? null,
    reasoning_effort: body?.reasoning_effort ?? null,
    thinking: body?.thinking ?? null,
    response_format: body?.response_format ?? null,
  };
  const canonical = stableStringify({
    provider: provider || "",
    model: model || "",
    params,
    identity: apiKeyId || "nokey",
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Whether a request is cache-eligible. Returns { ok, reason }.
 */
export function isCacheableRequest({ body }) {
  if (!body || typeof body !== "object") return { ok: false, reason: "no-body" };
  if (body.stream === true) return { ok: false, reason: "streaming" };
  if (Array.isArray(body.tools) && body.tools.length > 0) return { ok: false, reason: "tools" };
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { ok: false, reason: "no-messages" };
  return { ok: true };
}

export function isCacheEntryLive(entry, now = Date.now()) {
  return !!entry && Number.isFinite(entry.expiresAt) && entry.expiresAt > now;
}

/** Drop expired entries (pure; caller persists the survivors). */
export function pruneCacheEntries(entries, now = Date.now()) {
  return (Array.isArray(entries) ? entries : []).filter((e) => isCacheEntryLive(e, now));
}
