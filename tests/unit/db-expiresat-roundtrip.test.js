// Wave E3 RED: exportDb/importDb must roundtrip apiKeys.expiresAt.
// An expired key must stay expired (validateApiKey false) after restore;
// legacy payloads missing expiresAt must map to null (no crash, key valid).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-e3-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("Wave E3 — expiresAt export/import roundtrip", () => {
  it("exportDb includes expiresAt on apiKeys", async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const k = await db.createApiKey("e3-future", "m-e3", future);
    const snap = await db.exportDb();
    const row = snap.apiKeys.find((x) => x.id === k.id);
    expect(row).toBeDefined();
    expect(row.expiresAt).toBe(k.expiresAt);
    await db.deleteApiKey(k.id);
  });

  it("roundtrip preserves expiry: expired stays expired after restore", async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const k = await db.createApiKey("e3-roundtrip", "m-e3", future);
    const snap = await db.exportDb();
    // Simulate time passing / expired value in the backup payload
    const past = new Date(Date.now() - 1000).toISOString();
    const payload = {
      ...snap,
      apiKeys: snap.apiKeys.map((x) => (x.id === k.id ? { ...x, expiresAt: past } : x)),
    };
    await db.importDb(payload);
    const restored = await db.getApiKeyById(k.id);
    expect(restored.expiresAt).toBe(past);
    expect(await db.validateApiKey(restored.key)).toBe(false);
    await db.deleteApiKey(k.id);
  });

  it("legacy import maps missing expiresAt to null", async () => {
    const snap = await db.exportDb();
    const legacyKey = {
      id: "e3-legacy-id",
      key: "sk-e3legacykey1234567890abcdef",
      name: "e3-legacy",
      machineId: "m-e3",
      isActive: true,
      createdAt: new Date().toISOString(),
      // no expiresAt — legacy backup shape
    };
    const payload = { ...snap, apiKeys: [...snap.apiKeys, legacyKey] };
    await db.importDb(payload);
    const restored = await db.getApiKeyById("e3-legacy-id");
    expect(restored).toBeDefined();
    expect(restored.expiresAt).toBeNull();
    expect(await db.validateApiKey(legacyKey.key)).toBe(true);
    await db.deleteApiKey("e3-legacy-id");
  });
});
