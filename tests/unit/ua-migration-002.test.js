// U1/U2: migration 002 strips orphaned per-key psd.userAgent, keeps the rest.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import m002 from "../../src/lib/db/migrations/002-clear-per-key-user-agent.js";

function fakeDb(rows) {
  const updates = [];
  return {
    updates,
    all: () => rows,
    run: (sql, params) => { updates.push({ sql, params }); },
  };
}

describe("migration 002 clear-per-key-user-agent", () => {
  it("removes psd.userAgent, preserves sibling keys", () => {
    const rows = [{
      id: "c1",
      data: JSON.stringify({ providerSpecificData: { userAgent: "myapp/1.0", prefix: "oc", timeoutMs: 5000 } }),
    }];
    const db = fakeDb(rows);
    m002.up(db);
    expect(db.updates).toHaveLength(1);
    const written = JSON.parse(db.updates[0].params[0]);
    expect(written.providerSpecificData).not.toHaveProperty("userAgent");
    expect(written.providerSpecificData.prefix).toBe("oc");
    expect(written.providerSpecificData.timeoutMs).toBe(5000);
  });
  it("skips rows without psd.userAgent", () => {
    const rows = [
      { id: "c1", data: JSON.stringify({ providerSpecificData: { prefix: "oc" } }) },
      { id: "c2", data: JSON.stringify({}) },
      { id: "c3", data: "not-json{{{" },
    ];
    const db = fakeDb(rows);
    m002.up(db);
    expect(db.updates).toHaveLength(0);
  });
  it("is best-effort per row and never throws", () => {
    const db = { all: () => { throw new Error("no table"); }, run: () => {} };
    expect(() => m002.up(db)).not.toThrow();
  });
});

describe("papi replay: DB stamped 3 with an orphaned per-key UA", () => {
  // Regression: registry versions once sat BELOW historically-stamped
  // schemaVersions, so old DBs skipped pending migrations forever.
  let tempDir;
  const originalDataDir = process.env.DATA_DIR;
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kr9-mig002-"));
    process.env.DATA_DIR = tempDir;
    delete global._dbAdapter;
    vi.resetModules();
  });
  afterEach(() => {
    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  });

  it("applies 002 on a v3-stamped DB and clears the orphan", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    await import("@/lib/db/migrate.js");
    const db = await getAdapter();
    db.run(
      `INSERT INTO providerConnections(id, provider, authType, name, isActive, data, createdAt, updatedAt)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      ["c-orph", "openai-compatible-chat-x", "apikey", "K", 1,
        JSON.stringify({ providerSpecificData: { userAgent: "evil/1.0", prefix: "oc" } }),
        new Date().toISOString(), new Date().toISOString()]
    );
    db.run(`UPDATE _meta SET value = '3' WHERE key = 'schemaVersion'`);
    db.close?.();
    delete global._dbAdapter;
    vi.resetModules();

    const { getAdapter: getAdapter2 } = await import("@/lib/db/driver.js");
    const { runMigrationOnce: runAgain } = await import("@/lib/db/migrate.js");
    const db2 = await getAdapter2();
    await runAgain(db2);
    const ver = db2.get(`SELECT value FROM _meta WHERE key='schemaVersion'`);
    expect(parseInt(ver.value, 10)).toBeGreaterThan(3);
    const row = db2.get(`SELECT data FROM providerConnections WHERE id='c-orph'`);
    const psd = JSON.parse(row.data).providerSpecificData;
    expect(psd).not.toHaveProperty("userAgent");
    expect(psd.prefix).toBe("oc");
  });
});
