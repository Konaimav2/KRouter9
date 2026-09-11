// V3: atomic per-API-key credit/quota enforcement (prepaid model).
//
// Design: the estimated cost/tokens are CHARGED to the key atomically BEFORE
// dispatch (`usageCost`/`usageTokens` incremented inside a DB transaction). On
// completion, usageRepo reports the real usage and the estimate is reconciled
// (refunded or topped up). Because the charge happens before the upstream call,
// there is no window in which a request consumes provider work while holding no
// budget — concurrent requests, long streams, and non-chat modalities all pay.
//
// If the process crashes between reserve and reconcile the estimate stays
// charged: fail-closed (never free usage). An in-process pending map tracks what
// to refund; a restart simply forgets refunds, which only ever overcharges.
//
// 0 / unset limit = unlimited.

import { getAdapter } from "./db/driver.js";

const DEFAULT_EST_COST = 0.01;
const DEFAULT_EST_TOKENS = 4096;

// apiKey string -> { keyId, chargedCost, chargedTokens }
const pending = new Map();

function posNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Atomically check remaining budget and PREPAY an estimate.
 * @returns {{ ok: true, reservation: {reserveCost:number,reserveTokens:number} } | { ok: false, status:number, message:string }}
 */
export async function reserveBudget(keyRow, { estCost = DEFAULT_EST_COST, estTokens = DEFAULT_EST_TOKENS, apiKey = null } = {}) {
  if (!keyRow?.id) return { ok: true, reservation: { reserveCost: 0, reserveTokens: 0 } };
  const cost = posNum(estCost) || DEFAULT_EST_COST;
  const tokens = Math.floor(posNum(estTokens) || DEFAULT_EST_TOKENS);
  const db = await getAdapter();
  let out = { ok: true, reservation: { reserveCost: 0, reserveTokens: 0 } };

  db.transaction(() => {
    const row = db.get(
      `SELECT id, creditLimit, quotaLimit, usageCost, usageTokens FROM apiKeys WHERE id = ?`,
      [keyRow.id]
    );
    if (!row) return;
    const usedCost = Number(row.usageCost) || 0;
    const usedTokens = Number(row.usageTokens) || 0;
    const cl = posNum(row.creditLimit);
    const ql = Math.floor(posNum(row.quotaLimit));

    if (cl > 0 && usedCost + cost > cl) {
      out = { ok: false, status: 402, message: `API key credit exhausted (limit ${cl})` };
      return;
    }
    if (ql > 0 && usedTokens + tokens > ql) {
      out = { ok: false, status: 429, message: `API key token quota exhausted (limit ${ql})` };
      return;
    }
    // Prepay only the dimensions that are limited.
    const reserveCost = cl > 0 ? cost : 0;
    const reserveTokens = ql > 0 ? tokens : 0;
    db.run(
      `UPDATE apiKeys SET usageCost = COALESCE(usageCost,0) + ?, usageTokens = COALESCE(usageTokens,0) + ? WHERE id = ?`,
      [reserveCost, reserveTokens, keyRow.id]
    );
    out = { ok: true, reservation: { reserveCost, reserveTokens } };
  });

  if (out.ok && apiKey && (out.reservation.reserveCost > 0 || out.reservation.reserveTokens > 0)) {
    pending.set(String(apiKey), {
      keyId: keyRow.id,
      chargedCost: out.reservation.reserveCost,
      chargedTokens: out.reservation.reserveTokens,
    });
  }
  return out;
}

/**
 * Settle usage for a key at completion. This is the SINGLE charging point:
 *  - if a prepaid estimate is pending: refund it, then add the real usage;
 *  - otherwise: add the real usage directly (legacy/other endpoints).
 * Called by usageRepo for every recorded request, so chat + embeddings + any
 * future endpoint converge on one path.
 */
export async function settleUsageForKey(apiKey, { actualCost = 0, actualTokens = 0 } = {}) {
  if (!apiKey) return;
  const key = String(apiKey);
  const held = pending.get(key);
  pending.delete(key);
  const db = await getAdapter();
  db.transaction(() => {
    const row = db.get(`SELECT id, usageCost, usageTokens FROM apiKeys WHERE key = ?`, [key]);
    if (!row) return;
    const refundCost = held ? held.chargedCost : 0;
    const refundTokens = held ? held.chargedTokens : 0;
    const nextCost = Math.max(0, (Number(row.usageCost) || 0) - refundCost + (Number(actualCost) || 0));
    const nextTokens = Math.max(0, (Number(row.usageTokens) || 0) - refundTokens + (Number(actualTokens) || 0));
    db.run(`UPDATE apiKeys SET usageCost = ?, usageTokens = ? WHERE id = ?`, [nextCost, nextTokens, row.id]);
  });
}

/**
 * Sync variant for in-transaction callers (usageRepo). Returns the refund that
 * was held for this key (0 if none) so the caller can compute the final charge
 * inside its own transaction. Also clears the pending entry.
 */
export function consumePendingReservation(apiKey) {
  const key = apiKey != null ? String(apiKey) : null;
  if (!key) return { refundCost: 0, refundTokens: 0 };
  const held = pending.get(key);
  if (!held) return { refundCost: 0, refundTokens: 0 };
  pending.delete(key);
  return { refundCost: held.chargedCost, refundTokens: held.chargedTokens };
}

/** Back-compat alias. Prepaid model: keep the estimate when no actual is known. */
export async function releaseBudget(keyRow, reservation = {}) {
  void keyRow; void reservation;
}

/**
 * Shared gate for non-chat billable endpoints. PREPAYS the estimate before
 * running `fn`. Endpoints that report real usage (embeddings via usageRepo)
 * reconcile through consumePendingReservation; endpoints with no usage signal
 * keep the estimate charged, so they can never be free.
 */
export async function withKeyBudget(request, apiKey, fn, { estCost, estTokens } = {}) {
  if (!apiKey) return fn();
  let keyRow = null;
  try {
    const { getApiKeyByKey } = await import("@/lib/localDb");
    keyRow = await getApiKeyByKey(apiKey);
  } catch { keyRow = null; }

  const cl = posNum(keyRow?.creditLimit);
  const ql = Math.floor(posNum(keyRow?.quotaLimit));
  if (!keyRow || (cl <= 0 && ql <= 0)) return fn();

  const res = await reserveBudget(keyRow, { estCost, estTokens, apiKey });
  if (!res.ok) {
    const { errorResponse } = await import("open-sse/utils/error.js");
    return errorResponse(res.status, res.message);
  }
  return fn();
}
