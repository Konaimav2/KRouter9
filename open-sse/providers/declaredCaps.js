// Operator-declared model capabilities, read from the kv `customModels` scope.
//
// The dashboard lets an operator tick capabilities (vision, reasoning, ...) on a
// model they added by hand; that declaration is persisted on the model record.
// Both the /v1/models listing and the request-path modality strip need it, and
// the request path runs on every chat completion — so this module caches the
// whole scope in memory and only re-reads when the cache is invalidated or TTLs
// out.
//
// Resolve by provider + exact model id. Bare-id lookup would leak one provider's
// declarations into another provider offering the same model id.

import { getCustomModels } from "../../src/lib/db/repos/aliasRepo.js";
import { getProviderNodes } from "../../src/lib/db/repos/nodesRepo.js";
import { ALIAS_TO_ID, getProviderAlias } from "../../src/shared/constants/providers.js";
import { DEFAULT_CAPABILITIES } from "./capabilities.js";

/** How long a resolved snapshot stays fresh, in ms. */
const TTL_MS = 30_000;

/** @type {Map<string, object>} provider/modelId -> declared caps */
let cache = new Map();
let cacheAt = 0;
let inflight = null;
let generation = 0;

// Shared metadata extraction for runtime, dashboard, and public model listings.
// Numeric strings are accepted only in legacy stored records, never by POST.
export function getCustomModelDeclarations(record) {
  const declared = {};
  const stored = record?.caps;
  if (stored && typeof stored === "object") {
    for (const key of Object.keys(DEFAULT_CAPABILITIES)) {
      if (Object.prototype.hasOwnProperty.call(stored, key) && stored[key] !== undefined) declared[key] = stored[key];
    }
  }
  for (const [key, legacy] of [["contextWindow", "context_length"], ["maxOutput", "max_completion_tokens"]]) {
    const raw = record?.[key] || record?.[legacy];
    const value = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(value) && value > 0) declared[key] = value;
    else if (!Number.isFinite(declared[key]) || declared[key] <= 0) delete declared[key];
  }
  return Object.keys(declared).length ? declared : null;
}

async function load(loadGeneration) {
  const models = await getCustomModels();
  // Node routes arrive with their id, while custom records use the UI prefix.
  // Never fall back to a bare model id if node metadata is unavailable.
  let nodes = [];
  try { nodes = await getProviderNodes(); } catch { /* Alias-scoped lookup remains available. */ }
  const next = new Map();
  for (const record of models) {
    const id = String(record?.id ?? "").trim();
    const provider = String(record?.providerAlias ?? "").trim();
    const declared = getCustomModelDeclarations(record);
    if (!id || !provider || !declared) continue;
    // Preserve the existing LLM preference if typed records share a routed id.
    const node = nodes.find((entry) => entry.id === provider || entry.prefix === provider);
    for (const alias of new Set([provider, ALIAS_TO_ID[provider], getProviderAlias(provider), node?.id, node?.prefix].filter(Boolean))) {
      const key = `${alias}/${id}`;
      if (!next.has(key) || (record.kind || record.type || "llm") === "llm") next.set(key, declared);
    }
  }
  // A write may invalidate while either repository read is still in flight.
  if (loadGeneration === generation) {
    cache = next;
    cacheAt = Date.now();
  }
}

/** Drop the cache so the next read reflects a fresh write. */
export function invalidateDeclaredModelCaps() {
  generation += 1;
  cache = new Map();
  cacheAt = 0;
  inflight = null;
}

/**
 * Declared capabilities for one model, or undefined when the operator declared none.
 *
 * @param {string} provider - provider alias or id
 * @param {string} model - bare model id, or "alias/id"
 * @returns {Promise<object|undefined>} the declared caps block, if any
 */
export async function getDeclaredModelCaps(provider, model) {
  const alias = typeof provider === "string" ? provider.trim() : "";
  const id = typeof model === "string" ? model.trim() : "";
  if (!alias || !id) return undefined;

  const fresh = Date.now() - cacheAt < TTL_MS;
  if (!fresh) {
    // Collapse concurrent misses into one query.
    if (!inflight) {
      const pending = load(generation).finally(() => {
        // An older, detached load must not clear a newer generation's miss.
        if (inflight === pending) inflight = null;
      });
      inflight = pending;
    }
    try {
      await inflight;
    } catch {
      // A read failure must not break the request: fall through to the
      // static-table guess rather than surfacing an error here.
      return undefined;
    }
  }

  // Try an exact nested id first; strip only the caller's provider prefix.
  return cache.get(`${alias}/${id}`)
    || (id.startsWith(`${alias}/`) ? cache.get(id) : undefined);
}
