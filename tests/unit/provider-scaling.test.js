import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// P2: provider scaling. Pagination is done in SQL and stats are a GROUP BY, so
// a provider with thousands of connections no longer parses/sorts every row.
const origDir = process.env.DATA_DIR;
let tmp;
let db;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kr9-scale-"));
  process.env.DATA_DIR = tmp;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  // Seed 300 codex connections.
  for (let i = 0; i < 300; i++) {
    await db.createProviderConnection({
      provider: "codex",
      authType: "oauth",
      name: `acct-${i}`,
      email: `a${i}@example.test`,
      priority: i,
      isActive: i % 2 === 0,
      providerSpecificData: { big: "x".repeat(200), chatgptAccountId: `acc${i}` },
    });
  }
  await db.createProviderConnection({
    provider: "groq", authType: "apikey", name: "g1", apiKey: "k", isActive: true,
  });
});
afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  if (origDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = origDir;
});

describe("provider connections scaling (P2)", () => {
  it("paginates with a SQL LIMIT and returns disjoint pages", async () => {
    const page1 = await db.getProviderConnections({ provider: "codex", limit: 10, offset: 0 });
    expect(page1.length).toBe(10);
    const page2 = await db.getProviderConnections({ provider: "codex", limit: 10, offset: 10 });
    expect(page2.length).toBe(10);
    const ids1 = new Set(page1.map((c) => c.id));
    expect(page2.some((c) => ids1.has(c.id))).toBe(false);
  });

  it("counts without loading rows", async () => {
    expect(await db.getProviderConnectionCount({ provider: "codex" })).toBe(300);
    expect(await db.getProviderConnectionCount({ provider: "codex", isActive: true })).toBe(150);
    expect(await db.getProviderConnectionCount({})).toBe(301);
  });

  it("aggregates per-provider stats via GROUP BY", async () => {
    const stats = await db.getProviderConnectionStats();
    expect(stats.codex.total).toBe(300);
    expect(stats.codex.active).toBe(150);
    expect(stats.groq.total).toBe(1);
  });

  it("returns all rows when no limit is given (compat)", async () => {
    const all = await db.getProviderConnections({ provider: "codex" });
    expect(all.length).toBe(300);
  });
});
