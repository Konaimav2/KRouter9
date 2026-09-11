import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// V3: atomic per-key credit/quota enforcement (PREPAID).
// The estimate is charged before dispatch, so a request cannot consume provider
// work without budget. It is reconciled to real usage at completion.
const origDir = process.env.DATA_DIR;
let tmp;
let db;
let budget;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kr9-budget-"));
  process.env.DATA_DIR = tmp;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  budget = await import("@/lib/budget.js");
});
afterAll(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  if (origDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = origDir;
});
beforeEach(async () => {
  // Reset pending map between tests via a fresh reserve/consume on unique keys.
});

describe("budget reservation (V3 prepaid)", () => {
  it("no limit => no charge, always ok", async () => {
    const k = await db.createApiKey("b0", "m");
    const res = await budget.reserveBudget(k, { estCost: 1, estTokens: 1000, apiKey: k.key });
    expect(res.ok).toBe(true);
    const back = await db.getApiKeyById(k.id);
    expect(back.usageCost).toBe(0);
  });

  it("charges the estimate up-front and blocks once exhausted", async () => {
    const k = await db.createApiKey("b1", "m");
    await db.updateApiKey(k.id, { creditLimit: 0.05 });
    const r1 = await budget.reserveBudget(k, { estCost: 0.04, estTokens: 0, apiKey: k.key });
    expect(r1.ok).toBe(true);
    const afterReserve = await db.getApiKeyById(k.id);
    expect(afterReserve.usageCost).toBeCloseTo(0.04, 6);
    const r2 = await budget.reserveBudget(k, { estCost: 0.04, estTokens: 0, apiKey: k.key });
    expect(r2.ok).toBe(false);
    expect(r2.status).toBe(402);
  });

  it("reconciles a pending prepay to real usage (refund difference)", async () => {
    const k = await db.createApiKey("b2", "m");
    await db.updateApiKey(k.id, { creditLimit: 1 });
    const r = await budget.reserveBudget(k, { estCost: 0.5, estTokens: 0, apiKey: k.key });
    expect(r.ok).toBe(true);
    await budget.settleUsageForKey(k.key, { actualCost: 0.01, actualTokens: 0 });
    const back = await db.getApiKeyById(k.id);
    expect(back.usageCost).toBeCloseTo(0.01, 6);
  });

  it("concurrent prepays cannot overspend", async () => {
    const k = await db.createApiKey("b3", "m");
    await db.updateApiKey(k.id, { creditLimit: 0.1 });
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => budget.reserveBudget(k, { estCost: 0.04, estTokens: 0, apiKey: `${k.key}#${i}` }))
    );
    const ok = results.filter((r) => r.ok).length;
    expect(ok).toBeLessThanOrEqual(2);
    expect(ok).toBeGreaterThanOrEqual(1);
  });

  it("quota prepay blocks on token limit", async () => {
    const k = await db.createApiKey("b4", "m");
    await db.updateApiKey(k.id, { quotaLimit: 1000 });
    const r1 = await budget.reserveBudget(k, { estCost: 0, estTokens: 800, apiKey: k.key });
    expect(r1.ok).toBe(true);
    const r2 = await budget.reserveBudget(k, { estCost: 0, estTokens: 800, apiKey: k.key });
    expect(r2.ok).toBe(false);
    expect(r2.status).toBe(429);
  });

  it("treats malformed limits as unlimited (no crash)", async () => {
    const k = await db.createApiKey("b5", "m");
    await db.updateApiKey(k.id, { creditLimit: 5 });
    const row = { ...k, id: k.id, creditLimit: NaN, quotaLimit: Infinity };
    const r = await budget.reserveBudget(row, { estCost: 0.01, estTokens: 10 });
    expect(r.ok).toBe(true);
  });

  it("withKeyBudget charges a non-chat endpoint", async () => {
    const k = await db.createApiKey("b6", "m");
    await db.updateApiKey(k.id, { creditLimit: 1 });
    const resp = await budget.withKeyBudget(null, k.key, async () => "ok", { estCost: 0.02, estTokens: 0 });
    expect(resp).toBe("ok");
    const back = await db.getApiKeyById(k.id);
    expect(back.usageCost).toBeCloseTo(0.02, 6);
  });

  it("withKeyBudget rejects when budget is exhausted", async () => {
    const k = await db.createApiKey("b7", "m");
    await db.updateApiKey(k.id, { creditLimit: 0.01 });
    const resp = await budget.withKeyBudget(null, k.key, async () => "ok", { estCost: 0.05, estTokens: 0 });
    expect(resp.status).toBe(402);
  });
});
