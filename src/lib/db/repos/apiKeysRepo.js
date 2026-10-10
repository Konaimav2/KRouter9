import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function rowToKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    machineId: row.machineId,
    isActive: row.isActive === 1 || row.isActive === true,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt ?? null,
    rpmLimit: row.rpmLimit ?? 0,
    tpmLimit: row.tpmLimit ?? 0,
    modelPolicy: row.modelPolicy || "off",
    allowedModels: row.allowedModels ?? null,
    blockedModels: row.blockedModels ?? null,
    // Credit/quota accounting (ported from srouter). 0 = unlimited.
    creditLimit: row.creditLimit ?? 0,
    usageCost: row.usageCost ?? 0,
    usageTokens: row.usageTokens ?? 0,
    quotaLimit: row.quotaLimit ?? 0,
    rateLimit: row.rateLimit ?? 0,
  };
}

export function rowToKeyPublic(row) {
  return sanitizeApiKeyRow(rowToKey(row));
}

// Server-side mask for gateway key strings. List/detail responses carry
// maskedKey only; the raw secret leaves the server solely through the
// guarded single-record reveal endpoint (or one-time create/rotate reads).
export function maskGatewayKey(key) {
  if (!key || typeof key !== "string") return "";
  if (key.length <= 10) return "????????";
  return `${key.slice(0, 6)}${"•".repeat(Math.max(4, key.length - 10))}${key.slice(-4)}`;
}

// Strip the raw `key` secret, keep all metadata, attach server mask.
export function sanitizeApiKeyRow(row) {
  if (!row) return null;
  const { key, ...meta } = row;
  return { ...meta, maskedKey: maskGatewayKey(key) };
}

export async function getApiKeys() {
  const db = await getAdapter();
  const rows = db.all(`SELECT * FROM apiKeys ORDER BY createdAt ASC`);
  return rows.map(rowToKey);
}

export async function getApiKeyById(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  return rowToKey(row);
}

export async function getApiKeyByKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE key = ?`, [key]);
  return rowToKey(row);
}

export function normalizeApiKeyExpiry(expiresAt) {
  if (expiresAt === undefined || expiresAt === null) return null;
  if (typeof expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt)) {
    throw new Error("expiresAt must be a future ISO datetime with a timezone");
  }
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error("expiresAt must be a future ISO datetime with a timezone");
  }
  return new Date(expiry).toISOString();
}

export async function createApiKey(name, machineId, expiresAt = null) {
  const normalizedExpiry = normalizeApiKeyExpiry(expiresAt);
  if (!machineId) throw new Error("machineId is required");
  const db = await getAdapter();
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);
  const apiKey = {
    id: uuidv4(),
    name,
    key: result.key,
    machineId,
    isActive: true,
    createdAt: new Date().toISOString(),
    expiresAt: normalizedExpiry,
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt, expiresAt) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt, apiKey.expiresAt]
  );
  return { ...apiKey, rpmLimit: 0, tpmLimit: 0, modelPolicy: "off", allowedModels: null, blockedModels: null, creditLimit: 0, usageCost: 0, usageTokens: 0, quotaLimit: 0, rateLimit: 0 };
}

const MANAGEABLE_FIELDS = ["name", "machineId", "isActive", "rpmLimit", "tpmLimit", "modelPolicy", "allowedModels", "blockedModels", "creditLimit", "quotaLimit"];

function normalizeModelList(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "string") return v;
  return null;
}

export async function updateApiKey(id, data) {
  const db = await getAdapter();
  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
    if (!row) return;
    const patch = {};
    for (const f of MANAGEABLE_FIELDS) {
      if (data[f] !== undefined) patch[f] = data[f];
    }
    if (patch.allowedModels !== undefined) patch.allowedModels = normalizeModelList(patch.allowedModels);
    if (patch.blockedModels !== undefined) patch.blockedModels = normalizeModelList(patch.blockedModels);
    if (patch.modelPolicy !== undefined && !["off", "whitelist", "blacklist"].includes(patch.modelPolicy)) {
      patch.modelPolicy = "off";
    }
    if (patch.rpmLimit !== undefined) patch.rpmLimit = Math.max(0, Number(patch.rpmLimit) || 0);
    if (patch.tpmLimit !== undefined) patch.tpmLimit = Math.max(0, Number(patch.tpmLimit) || 0);
    if (patch.creditLimit !== undefined) patch.creditLimit = Math.max(0, Number(patch.creditLimit) || 0);
    if (patch.quotaLimit !== undefined) patch.quotaLimit = Math.max(0, Math.floor(Number(patch.quotaLimit) || 0));
    const merged = { ...rowToKey(row), ...patch };
    db.run(
      `UPDATE apiKeys SET name = ?, machineId = ?, isActive = ?, rpmLimit = ?, tpmLimit = ?, modelPolicy = ?, allowedModels = ?, blockedModels = ?, creditLimit = ?, quotaLimit = ? WHERE id = ?`,
      [merged.name, merged.machineId, merged.isActive ? 1 : 0, merged.rpmLimit || 0, merged.tpmLimit || 0, merged.modelPolicy || "off", merged.allowedModels, merged.blockedModels, merged.creditLimit || 0, merged.quotaLimit || 0, id]
    );
    result = merged;
  });
  return result;
}

// Rotate: issue a fresh key string for the same id (old string dies immediately).
export async function rotateApiKey(id) {
  const db = await getAdapter();
  const row = db.get(`SELECT * FROM apiKeys WHERE id = ?`, [id]);
  if (!row) return null;
  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const machineId = row.machineId || "rotated";
  const { key } = generateApiKeyWithMachine(machineId);
  db.run(`UPDATE apiKeys SET key = ? WHERE id = ?`, [key, id]);
  return rowToKey({ ...row, key });
}

export async function deleteApiKey(id) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM apiKeys WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

export async function validateApiKey(key) {
  const db = await getAdapter();
  const row = db.get(`SELECT isActive, expiresAt FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  if (row.expiresAt !== null && row.expiresAt !== undefined) {
    const expiry = typeof row.expiresAt === "string" ? Date.parse(row.expiresAt) : NaN;
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  }
  return row.isActive === 1 || row.isActive === true;
}
