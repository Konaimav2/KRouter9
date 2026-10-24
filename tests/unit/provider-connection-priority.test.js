// Regression guard for the provider-connection priority convention.
//
// Bug: the DB stored 1-based priorities (reorderInTx writes `i + 1`, create uses
// `max + 1`), but the dashboard rendered `priority + 1` in ConnectionRow while
// ConnectionsCard rendered the raw value. A connection stored as priority 1 showed
// "#1" in one place and "02" in the other. Reorder handlers also sent a 0-based
// index, so the two sources disagreed about the base.
//
// Contract asserted here:
//   1. stored priority is 1-based and contiguous (1..N) after any mutation;
//   2. the row display renders the stored value as-is (never +1).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-priority-"));
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

const provider = "priority-fixture";

async function orderedIds() {
  const rows = await db.getProviderConnections({ provider });
  return rows.map((row) => row.id);
}

async function prioritiesById() {
  const rows = await db.getProviderConnections({ provider });
  return Object.fromEntries(rows.map((row) => [row.id, row.priority]));
}

const sorted = (values) => [...values].sort((a, b) => a - b);

describe("provider connection priority convention", () => {
  it("creates 1-based contiguous priorities", async () => {
    const a = await db.createProviderConnection({ provider, authType: "api_key", name: "a" });
    const b = await db.createProviderConnection({ provider, authType: "api_key", name: "b" });
    const c = await db.createProviderConnection({ provider, authType: "api_key", name: "c" });

    const priorities = await prioritiesById();
    expect(priorities[a.id]).toBe(1);
    expect(priorities[b.id]).toBe(2);
    expect(priorities[c.id]).toBe(3);
    expect(await orderedIds()).toEqual([a.id, b.id, c.id]);
  });

  it("normalizes to 1..N when the dashboard moves a row up", async () => {
    const [first, second, third] = await orderedIds();

    // The dashboard issues these as two sequential HTTP PUTs, so the second write
    // is strictly newer. reorderInTx breaks equal-priority ties by updatedAt, so
    // the test must not collapse both writes into the same millisecond.
    await db.updateProviderConnection(first, { priority: 2 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.updateProviderConnection(second, { priority: 1 });

    const priorities = await prioritiesById();
    expect(sorted(Object.values(priorities))).toEqual([1, 2, 3]);
    expect(priorities[second]).toBe(1);
    expect(priorities[first]).toBe(2);
    expect(await orderedIds()).toEqual([second, first, third]);
  });

  it("renumbers after a delete so there is never a gap", async () => {
    const [first, second, third] = await orderedIds();
    await db.deleteProviderConnection(first);

    expect(await orderedIds()).toEqual([second, third]);
    const priorities = await prioritiesById();
    expect(priorities[second]).toBe(1);
    expect(priorities[third]).toBe(2);
  });

  it("renders the stored priority without adding one", () => {
    const source = fs.readFileSync(
      new URL("../../src/app/(dashboard)/dashboard/providers/[id]/ConnectionRow.js", import.meta.url),
      "utf8",
    );
    // Guards against re-introducing the off-by-one that made priority 1 display as "02".
    expect(source).not.toMatch(/priority\s*\?\?\s*0\)\s*\+\s*1/);
    expect(source).toMatch(/connection\.priority > 0 \? connection\.priority : index \+ 1/);
  });
});
