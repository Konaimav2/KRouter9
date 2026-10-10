import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../../src/lib/db/repos/apiKeysRepo.js", import.meta.url), "utf8");
const validateSource = source.slice(source.indexOf("export async function validateApiKey"));

function validate(row) {
  const getAdapter = async () => ({ get: () => row });
  return new Function("getAdapter", `${validateSource.replace("export ", "")}; return validateApiKey;`)(getAdapter)("synthetic-key");
}

describe("temporary gateway key expiration", () => {
  it("rejects an active key after its expiry", async () => {
    expect(await validate({ isActive: 1, expiresAt: "2020-01-01T00:00:00.000Z" })).toBe(false);
  });
  it("keeps nullable legacy keys and future keys valid", async () => {
    expect(await validate({ isActive: 1, expiresAt: null })).toBe(true);
    expect(await validate({ isActive: 1, expiresAt: "2999-01-01T00:00:00.000Z" })).toBe(true);
  });
  it("fails closed for malformed expiry", async () => {
    expect(await validate({ isActive: 1, expiresAt: "not-a-date" })).toBe(false);
  });
});


describe("expiry persistence with real in-memory SQLite", () => {
  let sql;
  let repo;
  beforeEach(async () => {
    sql = new Database(":memory:");
    const { TABLES, buildCreateTableSql } = await import("../../src/lib/db/schema.js");
    sql.exec(buildCreateTableSql("apiKeys", TABLES.apiKeys));
    const adapter = {
      run: (query, params = []) => sql.prepare(query).run(...params),
      get: (query, params = []) => sql.prepare(query).get(...params),
      all: (query, params = []) => sql.prepare(query).all(...params),
      exec: query => sql.exec(query),
      transaction: fn => sql.transaction(fn)(),
    };
    vi.doMock("../../src/lib/db/driver.js", () => ({ getAdapter: async () => adapter }));
    vi.resetModules();
    repo = await import("../../src/lib/db/repos/apiKeysRepo.js");
  });
  afterEach(() => { sql.close(); vi.doUnmock("../../src/lib/db/driver.js"); vi.resetModules(); });
  it("persists future expiry, preserves it through rename and rotation, expires at exact boundary", async () => {
    const expiry = new Date(Date.now() + 3600000).toISOString();
    const key = await repo.createApiKey("Temporary", "synthetic-machine", expiry);
    expect(key.expiresAt).toBe(expiry);
    expect((await repo.getApiKeyById(key.id)).expiresAt).toBe(expiry);
    expect(await repo.validateApiKey(key.key)).toBe(true);
    await repo.updateApiKey(key.id, { name: "Renamed" });
    const rotated = await repo.rotateApiKey(key.id);
    expect(rotated.expiresAt).toBe(expiry);
    expect(await repo.validateApiKey(key.key)).toBe(false);
    sql.prepare("UPDATE apiKeys SET expiresAt = ? WHERE id = ?").run(new Date(Date.now()).toISOString(), key.id);
    expect(await repo.validateApiKey(rotated.key)).toBe(false);
  });
  it("leaves non-expiring legacy keys nullable and rejects malformed or past create expiry", async () => {
    const key = await repo.createApiKey("Legacy", "synthetic-machine");
    expect(key.expiresAt).toBeNull();
    expect(await repo.validateApiKey(key.key)).toBe(true);
    for (const expiry of ["not-a-date", "2020-01-01T00:00:00Z", 1, {}, "", "2999-01-01"]) {
      await expect(repo.createApiKey("Invalid", "synthetic-machine", expiry)).rejects.toThrow("expiresAt");
    }
    expect(await repo.getApiKeys()).toHaveLength(1);
  });
  it("migrates old rows idempotently without losing their secrets or activation", async () => {
    sql.exec("DROP TABLE apiKeys; CREATE TABLE apiKeys(id TEXT PRIMARY KEY, key TEXT, isActive INTEGER)");
    sql.prepare("INSERT INTO apiKeys VALUES(?, ?, ?)").run("legacy", "synthetic-legacy", 1);
    const { default: migration } = await import("../../src/lib/db/migrations/003-api-key-expiry.js");
    const db = { all: query => sql.prepare(query).all(), exec: query => sql.exec(query) };
    migration.up(db); migration.up(db);
    expect(migration.version).toBe(6);
    expect(sql.prepare("SELECT * FROM apiKeys").get()).toEqual({ id: "legacy", key: "synthetic-legacy", isActive: 1, expiresAt: null });
  });
});


describe("create API expiry input validation", () => {
  let POST;
  let create;
  beforeEach(async () => {
    vi.resetModules();
    create = vi.fn(async (name, machineId, expiresAt) => ({ name, machineId, expiresAt, id: "fixture-id", key: "fixture-key" }));
    vi.doMock("@/lib/localDb", () => ({ getApiKeys: async () => [], createApiKey: create, sanitizeApiKeyRow: value => value }));
    vi.doMock("@/shared/utils/machineId", () => ({ getConsistentMachineId: async () => "synthetic-machine" }));
    vi.doMock("@/lib/proxyRevealGuard.js", () => ({ hasValidDashboardSession: async () => true, REVEAL_NO_STORE_HEADERS: { "Cache-Control": "no-store" } }));
    vi.doMock("@/lib/auth/loginLimiter.js", () => ({ getClientIp: () => "127.0.0.1" }));
    vi.doMock("@/lib/revealRateLimit.js", () => ({ checkRevealRateLimit: () => ({ ok: true }) }));
    ({ POST } = await import("../../src/app/api/keys/route.js"));
  });
  afterEach(() => {
    for (const specifier of ["@/lib/localDb", "@/shared/utils/machineId", "@/lib/proxyRevealGuard.js", "@/lib/auth/loginLimiter.js", "@/lib/revealRateLimit.js"]) vi.doUnmock(specifier);
    vi.resetModules();
  });
  const request = body => new Request("http://localhost/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("rejects malformed, timezone-less and past expiry with no-store before creating", async () => {
    for (const expiry of ["not-a-date", "2020-01-01T00:00:00Z", 1, {}, "", "2999-01-01T12:00:00"]) {
      const response = await POST(request({ name: "Temp", expiresAt: expiry }));
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(create).not.toHaveBeenCalled();
  });
  it("normalizes future zoned expiry and preserves optional non-expiring creation", async () => {
    const response = await POST(request({ name: "Temp", expiresAt: "2999-01-01T12:00:00+02:00" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).expiresAt).toBe("2999-01-01T10:00:00.000Z");
    expect(create).toHaveBeenCalledWith("Temp", "synthetic-machine", "2999-01-01T10:00:00.000Z");
    expect((await POST(request({ name: "Legacy" }))).status).toBe(201);
    expect(create).toHaveBeenLastCalledWith("Legacy", "synthetic-machine", null);
  });
});
