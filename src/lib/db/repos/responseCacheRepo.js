import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import {
  RESPONSE_CACHE_SCOPE,
  RESPONSE_CACHE_MAX_ROWS,
  isCacheEntryLive,
} from "../../../../open-sse/services/responseCache.js";

/**
 * kv-backed storage for the own response cache (W14).
 * Values: { expiresAt, status, bodyText, headers, usage }.
 * Secrets never stored (responses only); keys are sha256 hashes.
 */
export async function getResponseCacheEntry(key) {
  try {
    const db = await getAdapter();
    const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [RESPONSE_CACHE_SCOPE, key]);
    if (!row) return null;
    const entry = parseJson(row.value, null);
    if (!isCacheEntryLive(entry)) {
      try {
        db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [RESPONSE_CACHE_SCOPE, key]);
      } catch {}
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export async function setResponseCacheEntry(key, entry) {
  try {
    const db = await getAdapter();
    db.run(`INSERT OR REPLACE INTO kv(scope, key, value) VALUES(?, ?, ?)`, [
      RESPONSE_CACHE_SCOPE,
      key,
      stringifyJson(entry),
    ]);
    const count = db.get(`SELECT COUNT(*) AS n FROM kv WHERE scope = ?`, [RESPONSE_CACHE_SCOPE])?.n || 0;
    if (count > RESPONSE_CACHE_MAX_ROWS) {
      db.run(
        `DELETE FROM kv WHERE scope = ? AND key NOT IN (SELECT key FROM kv WHERE scope = ? ORDER BY rowid DESC LIMIT ?)`,
        [RESPONSE_CACHE_SCOPE, RESPONSE_CACHE_SCOPE, RESPONSE_CACHE_MAX_ROWS]
      );
    }
  } catch {
    // cache must never break requests.
  }
}

export async function deleteResponseCacheEntry(key) {
  try {
    const db = await getAdapter();
    db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [RESPONSE_CACHE_SCOPE, key]);
  } catch {}
}
