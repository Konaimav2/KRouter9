// Shared pure helpers for Usage & Analytics (U3b: F09 columns + F10 per-key).
// Plain JS, no JSX, no node imports: safe for API routes, client components,
// and vitest. Mirrors the masking rules in src/lib/db/repos/usageRepo.js
// (maskApiKey: first 8 chars + "***"; short keys: first char + "***") and the
// email censor used by the usage dashboard components. NEVER emits raw keys.

import { redactSensitiveText } from "@/lib/proxyMask.js";

export const LOCAL_KEY_LABEL = "Local (No API Key)";
export const UNKNOWN_KEY_LABEL = "Unknown key";
export const ERROR_EXCERPT_MAX = 160;

/** Mask a raw API key reference. Returns null for missing/non-string input. */
export function maskKeyRef(key) {
  if (!key || typeof key !== "string") return null;
  if (key.length <= 8) return key.charAt(0) + "***";
  return key.slice(0, 8) + "***";
}

/** Censor an account/key display value when it looks like an email address. */
export function maskAccount(value) {
  const text = String(value || "").trim();
  const at = text.indexOf("@");
  if (at <= 0 || at === text.length - 1) return text;
  const domain = text.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const suffix = dot > 0 ? domain.slice(dot) : "";
  return `${text[0]}***@${domainName[0]}***${suffix}`;
}

function toNumericCode(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Numeric status code for a request-detail row, fail-open.
 * Chain: explicit fields first, then the stored (pre-redaction) response blob.
 */
export function statusCodeOf(detail) {
  if (!detail || typeof detail !== "object") return null;
  return (
    toNumericCode(detail.statusCode) ??
    toNumericCode(detail.httpStatus) ??
    toNumericCode(detail.errorCode) ??
    toNumericCode(detail.response?.status) ??
    null
  );
}

/** Single-line, length-clamped excerpt of an error value. Null when absent. */
export function errorExcerptOf(value, max = ERROR_EXCERPT_MAX) {
  if (value === null || value === undefined) return null;
  const msg = typeof value === "string" ? value : value?.message;
  if (typeof msg !== "string") return null;
  const oneLine = redactSensitiveText(msg).replace(/[\r\n]+/g, " ").trim().slice(0, max);
  return oneLine.length ? oneLine : null;
}

/** Error excerpt for a request-detail row, fail-open. */
export function errorOf(detail) {
  if (!detail || typeof detail !== "object") return null;
  return (
    errorExcerptOf(detail.error) ??
    errorExcerptOf(detail.response?.error) ??
    errorExcerptOf(detail.message) ??
    null
  );
}

/** Server-side only: raw key -> { name, id }. NEVER serialized to clients. */
export function buildKeyMap(apiKeys) {
  const map = {};
  for (const k of apiKeys || []) {
    if (k && typeof k.key === "string") map[k.key] = { name: k.name || null, id: k.id || null };
  }
  return map;
}

/**
 * Masked key identity for a request-detail row. NEVER returns the raw key.
 * Prefers an already-masked stored identity (persisted by requestDetailsRepo,
 * so the raw key never needs to sit in the blob); otherwise derives from a
 * raw apiKey + server-side keyMap. Unknown/absent keys fall back to the local
 * label (old rows predate key plumbing, so fail-open is the common case).
 */
export function keyIdentityOf(detail, keyMap = {}) {
  const storedMasked = typeof detail?.apiKeyMasked === "string" ? detail.apiKeyMasked : null;
  const storedName = typeof detail?.keyName === "string" ? detail.keyName : null;
  if (storedMasked || storedName) {
    return { apiKeyMasked: storedMasked, keyName: storedName || storedMasked || LOCAL_KEY_LABEL };
  }
  const raw = detail?.apiKey;
  if (!raw || typeof raw !== "string" || raw === "local-no-key") {
    return { apiKeyMasked: null, keyName: LOCAL_KEY_LABEL };
  }
  const masked = maskKeyRef(raw);
  const name = (keyMap && keyMap[raw]?.name) || masked;
  return { apiKeyMasked: masked, keyName: name || LOCAL_KEY_LABEL };
}

/** F09 list-row derivation: numeric code + masked key identity + error excerpt. */
export function deriveListFields(detail, keyMap = {}) {
  const d = detail && typeof detail === "object" ? detail : {};
  return {
    statusCode: statusCodeOf(d),
    ...keyIdentityOf(d, keyMap),
    errorExcerpt: errorOf(d),
  };
}

/**
 * F10: collapse model-split stats.byApiKey entries into one row per key.
 * Groups by display keyName (same semantics as the overview API-key table).
 * Metrics: requests + prompt/cached/completion/total tokens + cost.
 */
export function aggregatePerKey(byApiKey) {
  const groups = new Map();
  for (const entry of Object.values(byApiKey || {})) {
    if (!entry || typeof entry !== "object") continue;
    const name = entry.keyName || UNKNOWN_KEY_LABEL;
    if (!groups.has(name)) {
      groups.set(name, {
        keyName: name,
        apiKeyMasked: entry.apiKeyMasked ?? null,
        providers: [],
        series: [],
        requests: 0,
        promptTokens: 0,
        cachedTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        lastUsed: null,
      });
    }
    const g = groups.get(name);
    g.requests += entry.requests || 0;
    if (entry.provider && !g.providers.includes(entry.provider)) g.providers.push(entry.provider);
    g.series.push({
      model: entry.rawModel || "Unknown model",
      provider: entry.provider || "Unknown provider",
      requests: entry.requests || 0,
      totalTokens: (entry.promptTokens || 0) + (entry.completionTokens || 0),
      lastUsed: entry.lastUsed || null,
    });
    g.promptTokens += entry.promptTokens || 0;
    g.cachedTokens += entry.cachedTokens || 0;
    g.completionTokens += entry.completionTokens || 0;
    g.totalTokens = g.promptTokens + g.completionTokens;
    g.cost += entry.cost || 0;
    if (!g.apiKeyMasked && entry.apiKeyMasked) g.apiKeyMasked = entry.apiKeyMasked;
    if (entry.lastUsed && (!g.lastUsed || new Date(entry.lastUsed) > new Date(g.lastUsed))) {
      g.lastUsed = entry.lastUsed;
    }
  }
  return [...groups.values()];
}

/** F10: sort per-key rows. Numeric fields numeric, lastUsed by time, else text. */
export function sortPerKeyRows(rows, sortBy = "cost", sortOrder = "desc") {
  const arr = [...(rows || [])];
  arr.sort((a, b) => {
    let left = a?.[sortBy];
    let right = b?.[sortBy];
    if (sortBy === "lastUsed") {
      left = left ? new Date(left).getTime() : 0;
      right = right ? new Date(right).getTime() : 0;
    } else if (typeof left === "string" || typeof right === "string") {
      left = String(left ?? "").toLowerCase();
      right = String(right ?? "").toLowerCase();
    } else {
      left = Number(left) || 0;
      right = Number(right) || 0;
    }
    if (left === right) return 0;
    return (left < right ? -1 : 1) * (sortOrder === "asc" ? 1 : -1);
  });
  return arr;
}
