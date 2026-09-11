import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { NODE_TIMEOUT_MIN_MS, NODE_TIMEOUT_MAX_MS } from "open-sse/config/runtimeConfig.js";

function rowToNode(row) {
  if (!row) return null;
  const extra = parseJson(row.data, {});
  // V9: sanitize legacy/imported rows on read so pre-fix data cannot inject
  // reserved auth/host headers or an unbounded timeout at use time.
  if (extra.customHeaders !== undefined) extra.customHeaders = cleanHeaders(extra.customHeaders);
  if (extra.timeoutMs !== undefined) extra.timeoutMs = toIntOrUndef(extra.timeoutMs);
  return {
    ...extra,
    id: row.id,
    type: row.type,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nodeToRow(n) {
  const { id, type, name, createdAt, updatedAt, ...rest } = n;
  return {
    id,
    type: type ?? null,
    name: name ?? null,
    data: stringifyJson(rest),
    createdAt,
    updatedAt,
  };
}

function upsert(db, n) {
  const r = nodeToRow(n);
  db.run(
    `INSERT INTO providerNodes(id, type, name, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type=excluded.type, name=excluded.name, data=excluded.data, updatedAt=excluded.updatedAt`,
    [r.id, r.type, r.name, r.data, r.createdAt, r.updatedAt]
  );
}

export async function getProviderNodes(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.type) { where.push("type = ?"); params.push(filter.type); }
  const sql = `SELECT * FROM providerNodes${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  return db.all(sql, params).map(rowToNode);
}

export async function getProviderNodeById(id) {
  const db = await getAdapter();
  return rowToNode(db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]));
}

function toIntOrUndef(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return clampTimeout(n);
}

function clampTimeout(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.max(n, NODE_TIMEOUT_MIN_MS), NODE_TIMEOUT_MAX_MS);
}

// V9: sanitize custom headers at the persistence boundary. Lowercases names,
// rejects invalid token names / CR-LF values, drops reserved auth/host headers,
// caps count and value length. Mirrors src/shared/utils/nodeHeaders.js.
const HEADER_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;
const MAX_HEADERS = 50;
const MAX_VALUE_LEN = 8192;
const RESERVED_HEADERS = new Set([
  "authorization", "cookie", "set-cookie", "host", "content-length",
  "content-type", "x-api-key", "api-key", "x-goog-api-key",
]);

function cleanHeaders(h) {
  if (!h || typeof h !== "object" || Array.isArray(h)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (Object.keys(out).length >= MAX_HEADERS) break;
    const name = String(k).trim().toLowerCase();
    const val = v == null ? "" : String(v).trim();
    if (!name || !val) continue;
    if (!HEADER_TOKEN_RE.test(name)) continue;
    if (/[\r\n]/.test(val)) continue;
    if (RESERVED_HEADERS.has(name)) continue;
    out[name] = val.slice(0, MAX_VALUE_LEN);
  }
  return Object.keys(out).length ? out : undefined;
}

export async function createProviderNode(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const node = {
    id: data.id || uuidv4(),
    type: data.type,
    name: data.name,
    prefix: data.prefix,
    apiType: data.apiType,
    baseUrl: data.baseUrl,
    ...(typeof data.userAgent === "string" && data.userAgent.trim() ? { userAgent: data.userAgent.trim() } : {}),
    ...(toIntOrUndef(data.timeoutMs) ? { timeoutMs: toIntOrUndef(data.timeoutMs) } : {}),
    ...(cleanHeaders(data.customHeaders) ? { customHeaders: cleanHeaders(data.customHeaders) } : {}),
    createdAt: now,
    updatedAt: now,
  };
  upsert(db, node);
  return node;
}

export async function updateProviderNode(id, data) {
  const db = await getAdapter();
  let result = null;
  const patch = { ...data };
  // Clamp timeout at the single write boundary so every caller (route, import,
  // direct repo use) is bounded.
  if (patch.timeoutMs !== undefined) patch.timeoutMs = toIntOrUndef(patch.timeoutMs);
  // Sanitize headers at the same boundary.
  if (patch.customHeaders !== undefined) patch.customHeaders = cleanHeaders(patch.customHeaders);
  db.transaction(() => {
    const row = db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToNode(row), ...patch, updatedAt: new Date().toISOString() };
    if (merged.timeoutMs !== undefined) merged.timeoutMs = toIntOrUndef(merged.timeoutMs);
    upsert(db, merged);
    result = merged;
  });
  return result;
}

export async function deleteProviderNode(id) {
  const db = await getAdapter();
  let removed = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]);
    if (!row) return;
    removed = rowToNode(row);
    db.run(`DELETE FROM providerNodes WHERE id = ?`, [id]);
  });
  return removed;
}
