// Today/24h aggregation must fall back to flat token columns when the tokens
// JSON blob is absent (streaming failures, error rows, older rows). Reproduced live:
// rows with NULL tokens aggregated 0 prompt/completion tokens while cost survived,
// leaving Tokens mode all-zero (user-visible as broken sort/mode).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;
let adapter;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kr9-flat-tokens-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
  const driver = await import("@/lib/db/driver.js");
  adapter = await driver.getAdapter();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("today aggregation falls back to flat token columns (F07bug)", () => {
  it("counts flat prompt/completion tokens when tokens JSON is NULL", async () => {
    const now = new Date().toISOString();
    adapter.run(
      `INSERT INTO usageHistory(timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [now, "openai", "gpt-flat", "c1", "sk-test-x", "/v1/chat/completions", 1000, 500, 0.05, 200, null]
    );
    const stats = await db.getUsageStats("today");
    const key = Object.keys(stats.byModel).find((k) => k.includes("gpt-flat"));
    expect(key).toBeTruthy();
    expect(stats.byModel[key].promptTokens).toBe(1000);
    expect(stats.byModel[key].completionTokens).toBe(500);
    expect(stats.totalPromptTokens).toBeGreaterThanOrEqual(1000);
  });
});
