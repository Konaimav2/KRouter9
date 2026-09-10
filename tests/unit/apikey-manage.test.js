// RED: apikey manage — rpm/tpm, whitelist/blacklist, rotate, rename
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const origDir = process.env.DATA_DIR;
let tmp;
let db;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kr9-apikey-"));
  process.env.DATA_DIR = tmp;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});
afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  if (origDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = origDir;
});

describe("apikey manage", () => {
  it("persists rpm/tpm + model policy via repo", async () => {
    const k = await db.createApiKey("manage-1", "machine-abc");
    const upd = await db.updateApiKey(k.id, {
      name: "renamed-1",
      rpmLimit: 60,
      tpmLimit: 100000,
      modelPolicy: "whitelist",
      allowedModels: JSON.stringify(["oc/model-a"]),
      blockedModels: JSON.stringify(["bad/model"]),
    });
    expect(upd.name).toBe("renamed-1");
    expect(upd.rpmLimit).toBe(60);
    expect(upd.tpmLimit).toBe(100000);
    expect(upd.modelPolicy).toBe("whitelist");
    const back = await db.getApiKeyById(k.id);
    expect(back.name).toBe("renamed-1");
    expect(back.rpmLimit).toBe(60);
    expect(back.tpmLimit).toBe(100000);
  });

  it("rotateApiKey issues new key string, keeps id", async () => {
    const k = await db.createApiKey("rot-1", "machine-abc");
    const old = k.key;
    const rot = await db.rotateApiKey(k.id);
    expect(rot.id).toBe(k.id);
    expect(rot.key).not.toBe(old);
    expect(await db.validateApiKey(old)).toBe(false);
    expect(await db.validateApiKey(rot.key)).toBe(true);
  });

  it("isModelAllowedForKey enforces whitelist/blacklist", async () => {
    const { isModelAllowedForKey } = await import("@/lib/apiKeyPolicy.js");
    expect(isModelAllowedForKey({ modelPolicy: "whitelist", allowedModels: '["a/b"]' }, "a/b")).toBe(true);
    expect(isModelAllowedForKey({ modelPolicy: "whitelist", allowedModels: '["a/b"]' }, "x/y")).toBe(false);
    expect(isModelAllowedForKey({ modelPolicy: "blacklist", blockedModels: '["x/y"]' }, "x/y")).toBe(false);
    expect(isModelAllowedForKey({ modelPolicy: "blacklist", blockedModels: '["x/y"]' }, "a/b")).toBe(true);
    expect(isModelAllowedForKey({}, "anything")).toBe(true);
  });

  it("tpm limiter blocks over-budget", async () => {
    const { checkTpmLimit, resetTpmLimits } = await import("@/lib/rateLimit.js");
    resetTpmLimits("k1");
    expect(checkTpmLimit("k1", 500, 1000).ok).toBe(true);
    expect(checkTpmLimit("k1", 600, 1000).ok).toBe(false);
  });
});
