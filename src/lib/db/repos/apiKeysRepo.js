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

export async function createApiKey(name, machineId) {
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
  };
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
    [apiKey.id, apiKey.key, apiKey.name, apiKey.machineId, 1, apiKey.createdAt]
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
  const row = db.get(`SELECT isActive FROM apiKeys WHERE key = ?`, [key]);
  if (!row) return false;
  return row.isActive === 1 || row.isActive === true;
}
