// Direct helper for GET /api/providers/client — global quota sorting (F12-API).
//
// Quota/reset SOURCE: getUsageForProvider — the same per-account source the
// quota UI calls via GET /api/usage/[connectionId]. Only the normalization is
// local, and it mirrors the UI helpers in ProviderLimits/utils.js exactly:
//   earliest reset <-> sortVisibleConnections getEarliestResetTime
//   remaining      <-> getConnectionQuotaRemaining (first quota row .remaining)
//   label          <-> getConnectionLabel
// Unknown/missing quota (fetch failure, { message } payload, no quotas,
// invalid resetAt) has no valid reset: it ranks behind every valid reset.
// Within null-reset rows the null-reset rule applies (see nullResetRank):
// rows that still show quota first, then null-reset zero/depleted last.
// For remaining sorts the UI's plain-subtraction semantics apply
// (see compareRemainingQuota).
//
// Per-account fetches are fail-open (never reject) and TTL-cached (45s,
// mirrors settings quotaCacheTtlMs) with in-flight dedup so paginating a
// globally sorted set does not hammer upstream quota endpoints.

import { getUsageForProvider } from "open-sse/services/usage.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";

export const QUOTA_SORT_EXPIRING = "expiring";
export const QUOTA_SORT_NAME = "name";
export const QUOTA_SORT_REMAINING_ASC = "remaining-asc";
export const QUOTA_SORT_REMAINING_DESC = "remaining-desc";

// Server-side quotaCacheTtlMs default (settingsRepo quotaCacheTtlMs: 45000).
const SNAPSHOT_TTL_MS = 45_000;

const snapshotCache = new Map(); // connectionId -> { snapshot, fetchedAt }
const inflight = new Map(); // connectionId -> Promise<snapshot>

export function clearQuotaSnapshotCache() {
  snapshotCache.clear();
  inflight.clear();
}

export function isQuotaSort(sort) {
  return sort === QUOTA_SORT_EXPIRING
    || sort === QUOTA_SORT_REMAINING_ASC
    || sort === QUOTA_SORT_REMAINING_DESC;
}

export function isNameSort(sort) {
  return sort === QUOTA_SORT_NAME;
}

function toMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// Earliest valid quota reset timestamp (ms) across all quota rows, or null
// when missing/invalid — mirrors the UI's getEarliestResetTime (+Inf fallback).
export function earliestResetMs(usage) {
  const quotas = usage?.quotas && typeof usage.quotas === "object"
    ? Object.values(usage.quotas)
    : [];
  let min = null;
  for (const quota of quotas) {
    if (!quota || typeof quota !== "object" || quota.resetAt == null) continue;
    const ms = toMs(quota.resetAt);
    if (ms !== null && (min === null || ms < min)) min = ms;
  }
  return min;
}

// Mirrors the UI's getConnectionQuotaRemaining: first quota row's .remaining,
// +Inf when absent — the UI treats `remaining` as the remaining signal and
// does not derive percentages here.
export function remainingOf(usage) {
  const quotas = usage?.quotas && typeof usage.quotas === "object"
    ? Object.values(usage.quotas)
    : [];
  const first = quotas[0];
  return first && typeof first.remaining === "number" && Number.isFinite(first.remaining)
    ? first.remaining
    : Number.POSITIVE_INFINITY;
}

// Mirrors the UI's getConnectionLabel (null fallback collapsed for sorting).
export function connectionLabel(connection) {
  return connection?.name?.trim()
    || connection?.email?.trim()
    || connection?.displayName?.trim()
    || "";
}

function tieBreak(a, b) {
  return (a.provider || "").localeCompare(b.provider || "")
    || connectionLabel(a).localeCompare(connectionLabel(b))
    || String(a.id || "").localeCompare(String(b.id || ""));
}

function compareByName(a, b) {
  return connectionLabel(a).localeCompare(connectionLabel(b))
    || (a.provider || "").localeCompare(b.provider || "")
    || String(a.id || "").localeCompare(String(b.id || ""));
}

// Null-reset rule for the expiring sort: rows with no valid reset rank
// behind every valid reset; within null-reset rows the ones that still
// show quota come first (including `total:0`, which reads "no quota",
// not depleted), with null-reset zero/depleted rows last.
export function nullResetRank(usage) {
  const quotas = usage?.quotas && typeof usage.quotas === "object"
    ? Object.values(usage.quotas)
    : [];
  // Unknown (fetch failure, no rows): still sorts last, as before.
  if (quotas.length === 0) return 1;
  const first = quotas[0];
  // `total:0` reads "no quota", not depleted — ranks with quota-showing rows.
  if (first && typeof first === "object" && first.total === 0) return 0;
  const remaining = remainingOf(usage);
  return remaining > 0 ? 0 : 1;
}

function compareByExpiring(a, b) {
  const ra = earliestResetMs(a.snapshot);
  const rb = earliestResetMs(b.snapshot);
  if (ra === null && rb === null) {
    const rankDiff = nullResetRank(a.snapshot) - nullResetRank(b.snapshot);
    if (rankDiff !== 0) return rankDiff;
    return tieBreak(a.connection, b.connection);
  }
  if (ra === null) return 1;
  if (rb === null) return -1;
  if (ra !== rb) return ra - rb;
  return tieBreak(a.connection, b.connection);
}

function compareRemainingQuota(a, b, direction) {
  const xa = remainingOf(a.snapshot);
  const xb = remainingOf(b.snapshot);
  const diff = direction === "asc" ? xa - xb : xb - xa;
  // NaN happens only when both sides are unknown (+Inf - +Inf); fall through
  // to the tie-break. ±Inf otherwise preserves the UI's subtraction order.
  if (!Number.isNaN(diff) && diff !== 0) return diff;
  return tieBreak(a.connection, b.connection);
}

// Fail-open per-account fetch: same proxy resolution as GET /api/usage/[connectionId]
// (strictProxy=false so quota falls back to direct), no credential refresh and no
// DB writes — a failure just means "unknown quota, sorts last".
async function fetchQuotaSnapshot(connection) {
  try {
    let proxyConfig = null;
    try {
      proxyConfig = await resolveConnectionProxyConfig(connection.providerSpecificData);
    } catch {
      proxyConfig = null;
    }
    const proxyOptions = {
      connectionProxyEnabled: proxyConfig?.connectionProxyEnabled === true,
      connectionProxyUrl: proxyConfig?.connectionProxyUrl || "",
      connectionNoProxy: proxyConfig?.connectionNoProxy || "",
      vercelRelayUrl: proxyConfig?.vercelRelayUrl || "",
      strictProxy: false,
    };
    const usage = await getUsageForProvider(connection, proxyOptions);
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
    if (!usage.quotas || typeof usage.quotas !== "object") return null;
    return usage;
  } catch {
    return null;
  }
}

function getCachedSnapshot(connection) {
  const now = Date.now();
  const cached = snapshotCache.get(connection.id);
  if (cached && now - cached.fetchedAt < SNAPSHOT_TTL_MS) {
    return Promise.resolve(cached.snapshot);
  }
  if (inflight.has(connection.id)) return inflight.get(connection.id);
  const pending = (async () => {
    try {
      const snapshot = await fetchQuotaSnapshot(connection);
      snapshotCache.set(connection.id, { snapshot, fetchedAt: Date.now() });
      return snapshot;
    } finally {
      inflight.delete(connection.id);
    }
  })();
  inflight.set(connection.id, pending);
  return pending;
}

// Sort the COMPLETE filtered set by quota; caller paginates AFTER this.
// `name` is a non-quota sort (no snapshot fetch); the route handles it,
// but sortConnectionsByQuota accepts it so callers can route uniformly.
export function sortConnectionsAlpha(connections) {
  return [...(connections || [])].sort(compareByName);
}

export async function sortConnectionsByQuota(connections, sort) {
  if (sort === QUOTA_SORT_NAME) return sortConnectionsAlpha(connections);
  const rows = await Promise.all(
    (connections || []).map(async (connection) => ({
      connection,
      snapshot: await getCachedSnapshot(connection),
    })),
  );
  const compare = sort === QUOTA_SORT_REMAINING_ASC
    ? (a, b) => compareRemainingQuota(a, b, "asc")
    : sort === QUOTA_SORT_REMAINING_DESC
      ? (a, b) => compareRemainingQuota(a, b, "desc")
      : compareByExpiring;
  rows.sort(compare);
  return rows.map((row) => row.connection);
}
